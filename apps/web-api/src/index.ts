import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { contactMessageCreateSchema } from "@medcal/shared";
// import { buildWhatsAppDeepLink } from "@medcal/notifications";

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
  res.json({ url: buildWhatsAppDeepLink(phone, text) });
});

app.post("/public/contact-messages", async (req, res) => {
  if (!companyId) {
    res.status(500).json({ error: "COMPANY_ID not configured" });
    return;
  }

  const parsed = contactMessageCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // TODO: verify captcha before forward

  try {
    const upstream = await fetch(`${apiUrl}/internal/contact-messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
        "x-company-id": companyId,
      },
      body: JSON.stringify(parsed.data),
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
