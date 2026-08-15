import { z } from "zod";

/**
 * What the BROWSER may send for the public Contact Form — deliberately
 * narrower than @medcal/shared's contactMessageCreateSchema (the internal
 * Nest-facing contract). getFrom/companyId are never accepted here: getFrom
 * is hardcoded to "CONTACTFORM" server-side after parsing (see index.ts),
 * companyId never travels through this boundary at all. topicId is required
 * for this form specifically (the Contact Form always shows a topic select).
 */
export const publicContactFormSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  phone: z.string().max(20).optional(),
  organizationName: z.string().max(100).optional(),
  subject: z.string().max(150).optional(),
  message: z.string().min(1).max(5000),
  topicId: z.number().int(),
  captchaToken: z.string().min(1),
  utmJson: z.record(z.string()).optional(),
});

export type PublicContactFormInput = z.infer<typeof publicContactFormSchema>;
