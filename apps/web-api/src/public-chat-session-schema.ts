import { z } from "zod";

/**
 * What the BROWSER may send to create a new Web Chat ChatSession (distinct
 * from publicWebChatSchema's one-shot /public/web-chat, which only creates a
 * ContactMessage) — same field set as chatSessionCreateSchema in
 * @medcal/shared, plus the CAPTCHA token this edge layer strips before
 * forwarding. getFrom/companyId are never accepted here — CHAT_PERSON and
 * this deployment's COMPANY_ID are always server-derived, downstream.
 */
export const publicChatSessionSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  message: z.string().min(1).max(2000),
  captchaToken: z.string().min(1),
});

export type PublicChatSessionInput = z.infer<typeof publicChatSessionSchema>;
