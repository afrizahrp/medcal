import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { whatsapp } from "@medcal/notifications";
import { publicContactFormSchema } from "./public-contact-form-schema";
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

app.use(helmet());
app.use(cors());
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

app.listen(port, () => {
  console.log(`[web-api] listening on :${port}`);
});
