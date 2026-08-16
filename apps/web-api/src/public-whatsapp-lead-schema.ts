import { z } from "zod";

/**
 * What the BROWSER may send for the WhatsApp identity dialog. Unlike the
 * Contact Form (phone/organizationName optional), all four identity fields
 * are required here — the dialog collects exactly these and nothing else.
 * No `message` field: the WhatsApp flow always uses the fixed, server-side
 * WHATSAPP_DEFAULT_MESSAGE (see index.ts) — a client-supplied message is
 * never accepted as authoritative. getFrom/companyId never travel through
 * this boundary at all (getFrom is hardcoded to "WHATSAPP" server-side).
 */
export const publicWhatsappLeadSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  phone: z.string().min(1).max(20),
  organizationName: z.string().min(1).max(100),
  captchaToken: z.string().min(1),
});

export type PublicWhatsappLeadInput = z.infer<typeof publicWhatsappLeadSchema>;
