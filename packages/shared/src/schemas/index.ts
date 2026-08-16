import { z } from "zod";

/** Public edge → Nest ContactMessage create payload (thin validation) */
export const contactMessageCreateSchema = z.object({
  getFrom: z.enum([
    "CONTACTFORM",
    "WHATSAPP",
    "CHAT_AI",
    "CHAT_PERSON",
    "EMAIL",
  ]),
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  phone: z.string().max(20).optional(),
  organizationName: z.string().max(100).optional(),
  subject: z.string().max(150).optional(),
  message: z.string().min(1),
  topicId: z.number().int().optional(),
  utmJson: z.record(z.string()).optional(),
});

export type ContactMessageCreateInput = z.infer<
  typeof contactMessageCreateSchema
>;

const leadStatusValues = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "REJECTED",
  "CONVERTED",
] as const;

const contactStatusValues = ["PENDING", "READ", "REPLIED", "CLOSED"] as const;

/** GET /leads query params (Lead Inbox, locked 2026-08-16) */
export const leadListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(leadStatusValues).optional(),
  getFrom: z
    .enum(["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"])
    .optional(),
  topicId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

/** PATCH /leads/:id/status body */
export const leadStatusUpdateSchema = z.object({
  status: z.enum(leadStatusValues),
});

/** PATCH /contact-messages/:id/status body */
export const contactMessageStatusUpdateSchema = z.object({
  status: z.enum(contactStatusValues),
});

/**
 * PATCH /contact-messages/:id/lead body — staff resolution of a Needs Review
 * item (POSSIBLE MATCH). Exactly two actions: attach to an existing Lead, or
 * create a new Lead. No merge/generic matching API (Lead Inbox corrective
 * patch, locked 2026-08-16).
 */
export const contactMessageLeadResolutionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ATTACH"), leadId: z.string().min(1) }),
  z.object({ action: z.literal("CREATE_NEW") }),
]);

export type ContactMessageLeadResolution = z.infer<typeof contactMessageLeadResolutionSchema>;

/**
 * Web Chat ChatSession creation payload (Web Chat correction audit, locked
 * 2026-08-16) — exactly name/email/first message. No phone, no
 * organizationName, no topicId: Web Chat is a deliberately low-commitment
 * fallback channel, distinct from the Contact Form's field set on purpose,
 * not an oversight. Same 2000-char message cap as `chatMessageCreateSchema`
 * below — the first message is also a ChatMessage, not a separate limit.
 */
export const chatSessionCreateSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  message: z.string().min(1).max(2000),
});

export type ChatSessionCreateInput = z.infer<typeof chatSessionCreateSchema>;

const chatSenderTypeValues = ["VISITOR", "ADMIN"] as const;

/**
 * A subsequent ChatMessage in an existing ChatSession (the first message is
 * created as part of chatSessionCreateSchema's flow, not through this
 * schema). `clientMessageId` is optional but, when supplied, is the
 * duplicate-submission guard (enforced by ChatMessage's DB-level
 * `@@unique([sessionId, clientMessageId])`, not just here).
 */
export const chatMessageCreateSchema = z.object({
  senderType: z.enum(chatSenderTypeValues),
  body: z.string().min(1).max(2000),
  clientMessageId: z.string().min(1).max(100).optional(),
});

export type ChatMessageCreateInput = z.infer<typeof chatMessageCreateSchema>;
