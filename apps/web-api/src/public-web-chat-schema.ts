import { z } from "zod";

/**
 * What the BROWSER may send for the public Web Chat bubble — same trust
 * boundary as publicContactFormSchema (getFrom/companyId never accepted
 * here; getFrom is hardcoded to "CHAT_PERSON" server-side after parsing,
 * see index.ts). Web Chat is a deliberately low-commitment fallback channel
 * (Lead Inbox design review, second pass, 2026-08-16): unlike the Contact
 * Form, it never asks for phone or organizationName, and topicId is
 * omitted — these are not optional-but-absent, they are intentionally not
 * part of this schema at all.
 */
export const publicWebChatSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  message: z.string().min(1).max(2000),
  captchaToken: z.string().min(1),
});

export type PublicWebChatInput = z.infer<typeof publicWebChatSchema>;
