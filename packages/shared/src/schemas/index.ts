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

/**
 * Common mechanics shared by every server-paginated management list
 * (Management List canonical pattern, 2026-08-18 — see
 * docs/claude/plans/forensic-analysis-search-crispy-leaf.md). `sortBy` is
 * intentionally a plain optional string here, not validated against a
 * per-resource field enum: Zod only shapes the wire format, the *service*
 * layer is the trust boundary that whitelists it (see
 * apps/api/src/common/sort-query.ts) — mirrors the forensic report's finding
 * that server-bi-erp's sales_invoiceHd trusts `orderBy` no further than a
 * service-level allow-list either.
 */
const baseListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /leads query params (Lead Inbox, locked 2026-08-16) */
export const leadListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(leadStatusValues).optional(),
  getFrom: z
    .enum(["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"])
    .optional(),
  topicId: z.coerce.number().int().optional(),
});

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

/** Whitelisted `sortBy` values for GET /leads — see resolveSortOrder. */
export const LEAD_SORTABLE_FIELDS = ["createdAt", "name", "status"] as const;

/** PATCH /leads/:id/status body */
export const leadStatusUpdateSchema = z.object({
  status: z.enum(leadStatusValues),
});

/** PATCH /leads/:id/assign body */
export const leadAssignSchema = z.object({
  assignedToUserId: z.string().min(1).nullable(),
});

export type LeadAssignInput = z.infer<typeof leadAssignSchema>;

/**
 * GET /contact-messages query params (Contact Messages status/filter/count
 * correction, 2026-08-18). ContactMessage is the source of truth for this
 * list — `status` here is ContactStatus, never LeadStatus. Extends
 * baseListQuerySchema (search/sortBy/sortDir/page/pageSize) since both lists
 * share those mechanics, but each carries its own status enum.
 */
export const contactMessageListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(contactStatusValues).optional(),
  getFrom: z
    .enum(["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"])
    .optional(),
  topicId: z.coerce.number().int().optional(),
});

export type ContactMessageListQuery = z.infer<typeof contactMessageListQuerySchema>;

/** Whitelisted `sortBy` values for GET /contact-messages — see resolveSortOrder. */
export const CONTACT_MESSAGE_SORTABLE_FIELDS = ["createdAt", "name", "status"] as const;

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

/**
 * PATCH /chat-sessions/:id/read body (Management header notification
 * audit follow-up, 2026-08-17). `readUpTo` is the createdAt of the newest
 * message the caller actually fetched/rendered — NOT wall-clock "now" —
 * so ChatSessionsService.markRead can advance ChatSession.lastReadByAdminAt
 * to exactly what was seen, never further. Omitted body (`{}`) falls back
 * to server "now" in the service, same as the original no-body contract.
 */
export const chatSessionMarkReadSchema = z.object({
  readUpTo: z.string().datetime().optional(),
});

export type ChatSessionMarkReadInput = z.infer<typeof chatSessionMarkReadSchema>;

// =============================================================================
// Email → Lead Management (locked plan)
// =============================================================================

const emailFolderValues = ["INBOX", "SENT", "DRAFTS", "TRASH"] as const;
const emailStatusValues = ["UNREAD", "READ"] as const;

export const emailListQuerySchema = baseListQuerySchema.extend({
  folder: z.enum(emailFolderValues).optional(),
  status: z.enum(emailStatusValues).optional(),
  isStarred: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  leadId: z.string().optional(),
});

export type EmailListQuery = z.infer<typeof emailListQuerySchema>;

export const EMAIL_SORTABLE_FIELDS = ["createdAt", "sentAt", "receivedAt", "subject"] as const;

export const emailComposeSchema = z.object({
  to: z.string().email().max(255),
  cc: z.string().max(500).optional(),
  bcc: z.string().max(500).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  parentEmailId: z.string().optional(),
  contactMessageId: z.string().optional(),
  leadId: z.string().optional(),
});

export type EmailComposeInput = z.infer<typeof emailComposeSchema>;

export const emailDraftSchema = z.object({
  to: z.string().max(255).optional(),
  cc: z.string().max(500).optional(),
  bcc: z.string().max(500).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().optional(),
  parentEmailId: z.string().optional(),
  contactMessageId: z.string().optional(),
});

export type EmailDraftInput = z.infer<typeof emailDraftSchema>;

export const emailUpdateSchema = z.object({
  status: z.enum(emailStatusValues).optional(),
  isStarred: z.boolean().optional(),
  leadId: z.string().nullable().optional(),
  suggestedLeadId: z.string().nullable().optional(),
});

export type EmailUpdateInput = z.infer<typeof emailUpdateSchema>;

// =============================================================================
// Customer CRM (D05)
// =============================================================================

const customerStatusValues = ["ACTIVE", "INACTIVE"] as const;

const customerContactInputSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100).nullish(),
  phone: z.string().max(20).nullish(),
  title: z.string().max(100).nullish(),
});

/** POST /customers body */
export const customerCreateSchema = z.object({
  name: z.string().min(1).max(200),
  legalName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  mobile: z.string().max(50).optional(),
  email: z.string().email().max(100).optional(),
  contact: customerContactInputSchema.optional(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

/** GET /customers query params */
export const customerListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(customerStatusValues).optional(),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

/** Whitelisted `sortBy` values for GET /customers — see resolveSortOrder. */
export const CUSTOMER_SORTABLE_FIELDS = ["createdAt", "name", "number", "status"] as const;

/** PATCH /customers/:id body */
export const customerUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  mobile: z.string().max(50).nullable().optional(),
  email: z.string().email().max(100).nullable().optional(),
  status: z.enum(customerStatusValues).optional(),
  contact: customerContactInputSchema.optional(),
});

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

/** POST /leads/:id/convert body — optional overrides for fields Lead does not carry */
export const leadConvertSchema = z.object({
  legalName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
});

export type LeadConvertInput = z.infer<typeof leadConvertSchema>;

// =============================================================================
// CalibrationRequest (D06)
// =============================================================================

const serviceModeValues = ["ON_SITE", "SEND_TO_LAB"] as const;
const calibrationRequestStatusValues = [
  "DRAFT",
  "SUBMITTED",
  "IN_QUOTATION",
  "CANCELLED",
  "FULFILLED",
] as const;

/** Nested item input for CalibrationRequestItem */
const calibrationRequestItemInputSchema = z.object({
  deviceId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

/** POST /calibration-requests body */
export const calibrationRequestCreateSchema = z.object({
  customerId: z.string().min(1),
  leadId: z.string().min(1).optional(),
  serviceMode: z.enum(serviceModeValues),
  /** The date expected/requested by the customer for calibration service. */
  expectedDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(calibrationRequestItemInputSchema).min(1),
});

export type CalibrationRequestCreateInput = z.infer<typeof calibrationRequestCreateSchema>;

/** GET /calibration-requests query params */
export const calibrationRequestListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(calibrationRequestStatusValues).optional(),
  customerId: z.string().optional(),
});

export type CalibrationRequestListQuery = z.infer<typeof calibrationRequestListQuerySchema>;

/** Whitelisted `sortBy` values for GET /calibration-requests — see resolveSortOrder. */
export const CALIBRATION_REQUEST_SORTABLE_FIELDS = [
  "createdAt",
  "number",
  "status",
] as const;

/** PATCH /calibration-requests/:id body (only allowed while DRAFT) */
export const calibrationRequestUpdateSchema = z.object({
  customerId: z.string().min(1).optional(),
  leadId: z.string().min(1).nullable().optional(),
  serviceMode: z.enum(serviceModeValues).optional(),
  /** The date expected/requested by the customer for calibration service. */
  expectedDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(calibrationRequestItemInputSchema).min(1).optional(),
});

export type CalibrationRequestUpdateInput = z.infer<typeof calibrationRequestUpdateSchema>;

// =============================================================================
// UOM (Unit of Measurement) Master Data
// =============================================================================

const uomCategoryValues = [
  "PRESSURE",
  "TEMPERATURE",
  "RATE",
  "FLOW",
  "PERCENTAGE",
  "LENGTH",
  "MASS",
  "VOLUME",
  "TIME",
  "ELECTRICAL",
  "OTHER",
] as const;

export type UomCategory = (typeof uomCategoryValues)[number];

/** POST /uoms body */
export const uomCreateSchema = z.object({
  code: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(20),
  category: z.enum(uomCategoryValues),
});

export type UomCreateInput = z.infer<typeof uomCreateSchema>;

/** GET /uoms query params */
export const uomListQuerySchema = baseListQuerySchema.extend({
  category: z.enum(uomCategoryValues).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type UomListQuery = z.infer<typeof uomListQuerySchema>;

/** Whitelisted `sortBy` values for GET /uoms — see resolveSortOrder. */
export const UOM_SORTABLE_FIELDS = ["createdAt", "code", "name", "category"] as const;

/** PATCH /uoms/:id body */
export const uomUpdateSchema = z.object({
  code: z.string().min(1).max(20).toUpperCase().optional(),
  name: z.string().min(1).max(100).optional(),
  symbol: z.string().min(1).max(20).optional(),
  category: z.enum(uomCategoryValues).optional(),
  isActive: z.boolean().optional(),
});

export type UomUpdateInput = z.infer<typeof uomUpdateSchema>;

// =============================================================================
// DeviceCategory & DeviceType Master Data
// =============================================================================

const optionalDescription = z.string().max(500).optional();

/** POST /device-categories body */
export const deviceCategoryCreateSchema = z.object({
  code: z.string().min(1).max(64).toUpperCase(),
  name: z.string().min(1).max(150),
  description: optionalDescription,
});

export type DeviceCategoryCreateInput = z.infer<typeof deviceCategoryCreateSchema>;

/** GET /device-categories query params */
export const deviceCategoryListQuerySchema = baseListQuerySchema.extend({
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type DeviceCategoryListQuery = z.infer<typeof deviceCategoryListQuerySchema>;

/** Whitelisted `sortBy` values for GET /device-categories — see resolveSortOrder. */
export const DEVICE_CATEGORY_SORTABLE_FIELDS = ["createdAt", "code", "name"] as const;

/** PATCH /device-categories/:id body */
export const deviceCategoryUpdateSchema = z.object({
  code: z.string().min(1).max(64).toUpperCase().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type DeviceCategoryUpdateInput = z.infer<typeof deviceCategoryUpdateSchema>;

/** POST /device-types body */
export const deviceTypeCreateSchema = z.object({
  categoryId: z.string().min(1),
  code: z.string().min(1).max(64).toUpperCase(),
  name: z.string().min(1).max(150),
  description: optionalDescription,
});

export type DeviceTypeCreateInput = z.infer<typeof deviceTypeCreateSchema>;

/** GET /device-types query params */
export const deviceTypeListQuerySchema = baseListQuerySchema.extend({
  categoryId: z.string().min(1).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type DeviceTypeListQuery = z.infer<typeof deviceTypeListQuerySchema>;

/** Whitelisted `sortBy` values for GET /device-types — see resolveSortOrder. */
export const DEVICE_TYPE_SORTABLE_FIELDS = ["createdAt", "code", "name"] as const;

/** PATCH /device-types/:id body */
export const deviceTypeUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  code: z.string().min(1).max(64).toUpperCase().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type DeviceTypeUpdateInput = z.infer<typeof deviceTypeUpdateSchema>;

// =============================================================================
// DeviceModel Master Data
// =============================================================================

/** POST /device-models body */
export const deviceModelCreateSchema = z.object({
  deviceTypeId: z.string().min(1),
  manufacturer: z.string().trim().min(1).max(150),
  model: z.string().trim().min(1).max(150),
  description: optionalDescription,
});

export type DeviceModelCreateInput = z.infer<typeof deviceModelCreateSchema>;

/** GET /device-models query params */
export const deviceModelListQuerySchema = baseListQuerySchema.extend({
  deviceTypeId: z.string().min(1).optional(),
});

export type DeviceModelListQuery = z.infer<typeof deviceModelListQuerySchema>;

/** Whitelisted `sortBy` values for GET /device-models — see resolveSortOrder. */
export const DEVICE_MODEL_SORTABLE_FIELDS = ["createdAt", "manufacturer", "model"] as const;

/** PATCH /device-models/:id body */
export const deviceModelUpdateSchema = z.object({
  deviceTypeId: z.string().min(1).optional(),
  manufacturer: z.string().trim().min(1).max(150).optional(),
  model: z.string().trim().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
});

export type DeviceModelUpdateInput = z.infer<typeof deviceModelUpdateSchema>;

// =============================================================================
// DeviceCapability + DeviceCapabilityItem Master Data
// =============================================================================

/** POST /device-capabilities body */
export const deviceCapabilityCreateSchema = z.object({
  code: z.string().min(1).max(64).toUpperCase(),
  name: z.string().min(1).max(150),
  description: optionalDescription,
});

export type DeviceCapabilityCreateInput = z.infer<typeof deviceCapabilityCreateSchema>;

/** GET /device-capabilities query params */
export const deviceCapabilityListQuerySchema = baseListQuerySchema;

export type DeviceCapabilityListQuery = z.infer<typeof deviceCapabilityListQuerySchema>;

/** Whitelisted `sortBy` values for GET /device-capabilities — see resolveSortOrder. */
export const DEVICE_CAPABILITY_SORTABLE_FIELDS = ["createdAt", "code", "name"] as const;

/** PATCH /device-capabilities/:id body */
export const deviceCapabilityUpdateSchema = z.object({
  code: z.string().min(1).max(64).toUpperCase().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
});

export type DeviceCapabilityUpdateInput = z.infer<typeof deviceCapabilityUpdateSchema>;

/** POST /device-capabilities/:id/items body */
export const deviceCapabilityItemCreateSchema = z.object({
  code: z.string().min(1).max(64).toUpperCase(),
  name: z.string().min(1).max(150),
  description: optionalDescription,
});

export type DeviceCapabilityItemCreateInput = z.infer<typeof deviceCapabilityItemCreateSchema>;

/** PATCH /device-capabilities/:id/items/:itemId body */
export const deviceCapabilityItemUpdateSchema = z.object({
  code: z.string().min(1).max(64).toUpperCase().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
});

export type DeviceCapabilityItemUpdateInput = z.infer<typeof deviceCapabilityItemUpdateSchema>;

// =============================================================================
// DeviceCalibrationParameter Master Data
// =============================================================================

/** POST /device-calibration-parameters body */
export const deviceCalibrationParameterCreateSchema = z.object({
  deviceTypeId: z.string().min(1),
  capabilityItemId: z.string().min(1),
  code: z.string().min(1).max(64).toUpperCase(),
  name: z.string().min(1).max(150),
  description: optionalDescription,
  uomId: z.string().min(1),
});

export type DeviceCalibrationParameterCreateInput = z.infer<
  typeof deviceCalibrationParameterCreateSchema
>;

/** GET /device-calibration-parameters query params */
export const deviceCalibrationParameterListQuerySchema = baseListQuerySchema.extend({
  deviceTypeId: z.string().min(1).optional(),
  capabilityId: z.string().min(1).optional(),
  capabilityItemId: z.string().min(1).optional(),
  uomId: z.string().min(1).optional(),
});

export type DeviceCalibrationParameterListQuery = z.infer<
  typeof deviceCalibrationParameterListQuerySchema
>;

/** Whitelisted `sortBy` values for GET /device-calibration-parameters — see resolveSortOrder. */
export const DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS = ["createdAt", "code", "name"] as const;

/** PATCH /device-calibration-parameters/:id body */
export const deviceCalibrationParameterUpdateSchema = z.object({
  deviceTypeId: z.string().min(1).optional(),
  capabilityItemId: z.string().min(1).optional(),
  code: z.string().min(1).max(64).toUpperCase().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  uomId: z.string().min(1).optional(),
});

export type DeviceCalibrationParameterUpdateInput = z.infer<
  typeof deviceCalibrationParameterUpdateSchema
>;
