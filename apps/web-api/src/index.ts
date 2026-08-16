import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { whatsapp } from "@medcal/notifications";
import { CHAT_SESSION_TOKEN_COOKIE, signChatSessionToken, WHATSAPP_DEFAULT_MESSAGE } from "@medcal/shared";
import { publicChatSessionSchema } from "./public-chat-session-schema";
import { publicContactFormSchema } from "./public-contact-form-schema";
import { publicWebChatSchema } from "./public-web-chat-schema";
import { publicWhatsappLeadSchema } from "./public-whatsapp-lead-schema";
import { verifyRecaptcha } from "./recaptcha";

/**
 * Public edge only — captcha/rate-limit/forward.
 * Business persistence happens in Nest (@medcal/api).
 */
const app = express();
const port = Number(process.env.WEB_API_PORT ?? 3002);
const apiUrl = process.env.API_URL ?? "http://localhost:3001";
const companyId = process.env.COMPANY_ID;
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";
const chatSessionTokenSecret = process.env.CHAT_SESSION_TOKEN_SECRET ?? "";
const chatSessionTokenTtlMs = Number(process.env.CHAT_SESSION_TOKEN_TTL_MS ?? "2592000000");
// Same domain topology as Better Auth's crossSubDomainCookies (packages/auth/src/index.ts):
// unset for localhost dev (host-scoped cookie), ".kalibrasimedika.co.id" in production so
// the cookie set here (on the web-api/public-site origin) is still sent on the WSS
// handshake to api.kalibrasimedika.co.id.
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const isProd = process.env.NODE_ENV === "production";

function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Credentialed CORS (cookie-setting response) MUST NOT use the wildcard
// `cors()` the other routes use — an explicit origin allowlist +
// credentials:true is required, scoped to only this route so the existing
// (non-credentialed) public routes are left untouched.
// "||" not "??" — CHAT_WIDGET_ORIGINS is commonly present-but-empty in dev
// .env files (documented default ""), which "??" would treat as "set" and
// never fall through to TRUSTED_ORIGINS, silently blocking every browser
// request. An empty string must be treated the same as unset.
const chatSessionCors = cors({
  origin: parseOrigins(process.env.CHAT_WIDGET_ORIGINS || process.env.TRUSTED_ORIGINS),
  credentials: true,
});

app.use(helmet());
app.use((req, res, next) => {
  // /public/chat-sessions has its own credentialed, explicit-origin CORS
  // (chatSessionCors, applied directly on that route below) — the wildcard
  // cors() middleware must not handle ITS preflight: express's cors()
  // terminates OPTIONS requests itself (before any route-level middleware
  // runs), and a wildcard-origin preflight response has no
  // Access-Control-Allow-Credentials header, which makes browsers reject
  // the actual credentialed POST outright. Every other route is untouched.
  if (req.path === "/public/chat-sessions") {
    next();
    return;
  }
  cors()(req, res, next);
});
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// Dedicated, endpoint-specific limiter for the public Contact Form create
// route — not a generic API-wide limiter. Threshold/window are configuration,
// not a hardcoded guess.
const contactFormLimiter = rateLimit({
  windowMs: Number(process.env.CONTACT_FORM_RATE_LIMIT_WINDOW_MS ?? "60000"),
  limit: Number(process.env.CONTACT_FORM_RATE_LIMIT_MAX ?? "5"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please try again shortly." },
});

// A separate limiter instance/counter from contactFormLimiter — Web Chat and
// Contact Form traffic must not share a quota, or one channel's abuse could
// exhaust the other's allowance (design review §13.5).
const webChatLimiter = rateLimit({
  windowMs: Number(process.env.WEB_CHAT_RATE_LIMIT_WINDOW_MS ?? "60000"),
  limit: Number(process.env.WEB_CHAT_RATE_LIMIT_MAX ?? "5"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please try again shortly." },
});

// Dedicated limiter for real-time ChatSession creation (Phase 2) — its own
// quota, independent from both contactFormLimiter and webChatLimiter (the
// one-shot /public/web-chat route above), per the same "channels don't
// share a quota" principle.
const chatSessionLimiter = rateLimit({
  windowMs: Number(process.env.CHAT_SESSION_RATE_LIMIT_WINDOW_MS ?? "60000"),
  limit: Number(process.env.CHAT_SESSION_RATE_LIMIT_MAX ?? "5"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please try again shortly." },
});

// Dedicated limiter for the WhatsApp identity dialog's ContactMessage
// creation — its own quota, independent from contactFormLimiter/
// webChatLimiter/chatSessionLimiter, per the same "channels don't share a
// quota" principle already established for every other public route.
const whatsappLeadLimiter = rateLimit({
  windowMs: Number(process.env.WHATSAPP_LEAD_RATE_LIMIT_WINDOW_MS ?? "60000"),
  limit: Number(process.env.WHATSAPP_LEAD_RATE_LIMIT_MAX ?? "5"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please try again shortly." },
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "web-api" });
});

app.get("/public/whatsapp-link", (req, res) => {
  const phone = String(req.query.phone ?? "");
  const text = String(req.query.text ?? "Halo, saya ingin info kalibrasi.");
  if (!phone) {
    res.status(400).json({ error: "phone required" });
    return;
  }
  res.json({ url: whatsapp.buildWhatsAppDeepLink(phone, text) });
});

app.get("/public/contact-topics", async (_req, res) => {
  try {
    const upstream = await fetch(`${apiUrl}/contact-topics`);
    const body = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(body);
  } catch (err) {
    res.status(502).json({
      error: "Failed to reach business API",
      detail: err instanceof Error ? err.message : "unknown",
    });
  }
});

app.post("/public/contact-messages", contactFormLimiter, async (req, res) => {
  if (!companyId) {
    res.status(500).json({ error: "COMPANY_ID not configured" });
    return;
  }

  const parsed = publicContactFormSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { captchaToken, ...formData } = parsed.data;
  const captchaOk = await verifyRecaptcha(captchaToken, "contact_submit");
  if (!captchaOk) {
    res.status(400).json({ error: "CAPTCHA verification failed" });
    return;
  }

  try {
    // getFrom is always server-assigned for this endpoint — the browser
    // never gets to choose the message source.
    const upstream = await fetch(`${apiUrl}/internal/contact-messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ ...formData, getFrom: "CONTACTFORM" }),
    });

    const body = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(body);
  } catch (err) {
    res.status(502).json({
      error: "Failed to reach business API",
      detail: err instanceof Error ? err.message : "unknown",
    });
  }
});

app.post("/public/web-chat", webChatLimiter, async (req, res) => {
  if (!companyId) {
    res.status(500).json({ error: "COMPANY_ID not configured" });
    return;
  }

  const parsed = publicWebChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { captchaToken, ...formData } = parsed.data;
  const captchaOk = await verifyRecaptcha(captchaToken, "webchat_submit");
  if (!captchaOk) {
    res.status(400).json({ error: "CAPTCHA verification failed" });
    return;
  }

  try {
    // getFrom is always server-assigned for this endpoint — the browser
    // never gets to choose the message source. Placed after the spread so
    // it always wins even if a stray key were present in formData.
    const upstream = await fetch(`${apiUrl}/internal/contact-messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ ...formData, getFrom: "CHAT_PERSON" }),
    });

    const body = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(body);
  } catch (err) {
    res.status(502).json({
      error: "Failed to reach business API",
      detail: err instanceof Error ? err.message : "unknown",
    });
  }
});

app.post("/public/whatsapp-lead", whatsappLeadLimiter, async (req, res) => {
  if (!companyId) {
    res.status(500).json({ error: "COMPANY_ID not configured" });
    return;
  }

  const parsed = publicWhatsappLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { captchaToken, ...formData } = parsed.data;
  const captchaOk = await verifyRecaptcha(captchaToken, "whatsapp_lead_submit");
  if (!captchaOk) {
    res.status(400).json({ error: "CAPTCHA verification failed" });
    return;
  }

  try {
    // getFrom is always server-assigned — the browser never supplies it or
    // a message body. The WhatsApp flow always uses the same fixed
    // greeting as both the ContactMessage.message and the wa.me pre-fill
    // text (WHATSAPP_DEFAULT_MESSAGE, @medcal/shared) — a client-supplied
    // message is never accepted as authoritative.
    const upstream = await fetch(`${apiUrl}/internal/contact-messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ ...formData, getFrom: "WHATSAPP", message: WHATSAPP_DEFAULT_MESSAGE }),
    });

    const body = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(body);
  } catch (err) {
    res.status(502).json({
      error: "Failed to reach business API",
      detail: err instanceof Error ? err.message : "unknown",
    });
  }
});

app.options("/public/chat-sessions", chatSessionCors);
app.post("/public/chat-sessions", chatSessionCors, chatSessionLimiter, async (req, res) => {
  if (!companyId) {
    res.status(500).json({ error: "COMPANY_ID not configured" });
    return;
  }
  if (!chatSessionTokenSecret) {
    res.status(500).json({ error: "CHAT_SESSION_TOKEN_SECRET not configured" });
    return;
  }

  const parsed = publicChatSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { captchaToken, ...formData } = parsed.data;
  const captchaOk = await verifyRecaptcha(captchaToken, "chat_session_create");
  if (!captchaOk) {
    res.status(400).json({ error: "CAPTCHA verification failed" });
    return;
  }

  try {
    // Calls the existing internal endpoint (POST internal/chat-sessions,
    // Phase 1) via the same InternalServiceGuard trust boundary as every
    // other public->internal forward — no client-supplied companyId/getFrom,
    // CHAT_PERSON and COMPANY_ID are assigned server-side downstream.
    const upstream = await fetch(`${apiUrl}/internal/chat-sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(formData),
    });

    const body = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok) {
      res.status(upstream.status).json(body);
      return;
    }

    const sessionId = typeof body.id === "string" ? body.id : undefined;
    if (sessionId) {
      // The ONLY visitor credential. ChatSession.id is returned in the JSON
      // body for the widget's own bookkeeping, but it authorizes nothing by
      // itself — only this signed, HttpOnly cookie does (verified at the
      // Socket.IO handshake in apps/api). Never returned in the JSON body.
      const token = signChatSessionToken(sessionId, chatSessionTokenSecret, chatSessionTokenTtlMs);
      res.cookie(CHAT_SESSION_TOKEN_COOKIE, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        domain: cookieDomain,
        path: "/",
        maxAge: chatSessionTokenTtlMs,
      });
    }

    res.status(upstream.status).json({ id: sessionId });
  } catch (err) {
    res.status(502).json({
      error: "Failed to reach business API",
      detail: err instanceof Error ? err.message : "unknown",
    });
  }
});

app.listen(port, () => {
  console.log(`[web-api] listening on :${port}`);
});
