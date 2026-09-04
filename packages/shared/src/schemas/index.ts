import { z } from "zod";

/** Public edge → Nest ContactMessage create payload (thin validation) */
export const contactMessageCreateSchema = z.object({
  getFrom: z.enum(["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"]),
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  phone: z.string().max(20).optional(),
  organizationName: z.string().max(100).optional(),
  subject: z.string().max(150).optional(),
  message: z.string().min(1),
  topicId: z.number().int().optional(),
  utmJson: z.record(z.string()).optional(),
});

export type ContactMessageCreateInput = z.infer<typeof contactMessageCreateSchema>;

const leadStatusValues = ["NEW", "CONTACTED", "QUALIFIED", "REJECTED", "CONVERTED"] as const;

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
  getFrom: z.enum(["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"]).optional(),
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
  getFrom: z.enum(["CONTACTFORM", "WHATSAPP", "CHAT_AI", "CHAT_PERSON", "EMAIL"]).optional(),
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
  quotationId: z.string().min(1).optional(),
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

/**
 * Provenance of a Requisition line's customer-declared AKD/AKL/NIE
 * (Nomor Izin Edar). Declaration only — never technical verification.
 */
export const akdAklDeclarationValues = [
  "NOT_PROVIDED",
  "CUSTOMER_DECLARED_NONE",
  "CUSTOMER_PROVIDED",
] as const;

export type AkdAklDeclaration = (typeof akdAklDeclarationValues)[number];

/** Nested item input for CalibrationRequestItem */
const calibrationRequestItemInputSchema = z
  .object({
    deviceTypeId: z.string().min(1),
    /** Customer's original terminology for the equipment. Optional. */
    customerDeviceName: z.string().trim().max(200).optional(),
    /** Customer-provided equipment model, if available. Optional. */
    model: z.string().trim().max(120).optional(),
    /**
     * Customer-provided device/inventory identifier. Free text, intentionally
     * optional — a missing customer Device ID is a valid business state and must
     * be stored as NULL, never a placeholder. NOT the CalibrationJob Device.id.
     */
    deviceId: z.string().trim().max(120).optional(),
    /**
     * Aggregate quantity for this line — how many units of the device.
     * Positive integer; defaults to 1 server-side. Manual "+ Requisition" entry
     * omits it (one row per device). Excel import passes the spreadsheet Qty
     * here and the row is persisted as a single item — never split into N rows.
     */
    qty: z.number().int().positive().optional(),
    /**
     * Customer-declared AKD/AKL/NIE (Nomor Izin Edar). Free text, verbatim,
     * intentionally optional — the customer often does not know it at Requisition
     * stage. A declaration only, NOT technical verification. Empty string is
     * coerced to undefined; use `akdAklDeclaration` to record an explicit "none".
     */
    akdAkl: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => (v ? v : undefined)),
    /** Provenance of `akdAkl`. Defaults to NOT_PROVIDED server-side. */
    akdAklDeclaration: z.enum(akdAklDeclarationValues).optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((item, ctx) => {
    // Basic, non-regulatory consistency check for a customer-declared value.
    if (item.akdAklDeclaration === "CUSTOMER_PROVIDED" && !item.akdAkl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["akdAkl"],
        message: "AKD/AKL/NIE wajib diisi ketika status = CUSTOMER_PROVIDED",
      });
    }
    if (item.akdAkl && item.akdAklDeclaration && item.akdAklDeclaration !== "CUSTOMER_PROVIDED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["akdAklDeclaration"],
        message: "AKD/AKL/NIE hanya boleh diisi ketika status = CUSTOMER_PROVIDED",
      });
    }
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
export const CALIBRATION_REQUEST_SORTABLE_FIELDS = ["createdAt", "number", "status"] as const;

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
// Quotation (CalibrationRequest → Quotation)
// =============================================================================

const quotationSourceValues = ["PORTAL", "PHONE", "WHATSAPP", "OTHER"] as const;
const quotationStatusValues = [
  "DRAFT",
  "SENT",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

const quotationDecimalSchema = z.coerce.number().finite();

const quotationItemInputSchema = z.object({
  requestItemId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  tariffId: z.string().min(1).optional(),
  description: z.string().min(1).max(500),
  qty: z.coerce.number().int().positive().optional(),
  unitPrice: quotationDecimalSchema.nonnegative(),
  discountAmount: quotationDecimalSchema.nonnegative().optional(),
});

/**
 * Per-line input accepted at CREATE time only. The server is the sole authority
 * for `qty` (copied from CalibrationRequestItem.qty) and `unitPrice` (resolved
 * from the Price List) — the client may only tweak the description and an
 * optional line discount. Manual unit-price edits happen afterwards on the
 * DRAFT quotation via PATCH.
 */
const quotationCreateItemSchema = z.object({
  requestItemId: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  discountAmount: quotationDecimalSchema.nonnegative().optional(),
});

/**
 * POST /quotations body — customerId is derived from the CalibrationRequest.
 * `items` is optional: when omitted the server generates one line per
 * CalibrationRequestItem with default description + zero discount. When
 * provided it must still cover the full requisition scope (see
 * assertFullScopeItems).
 */
export const quotationCreateSchema = z.object({
  requestId: z.string().min(1),
  source: z.enum(quotationSourceValues).optional(),
  validUntil: z.coerce.date().optional(),
  taxCode: z.string().min(1).max(50),
  headerDiscountAmount: quotationDecimalSchema.nonnegative().optional(),
  items: z.array(quotationCreateItemSchema).min(1).optional(),
});

export type QuotationCreateInput = z.infer<typeof quotationCreateSchema>;

/**
 * POST /quotations/preview body — read-only. Returns the same Price List tariff
 * the server would snapshot at create time (see buildGeneratedRows), so the
 * New Quotation screen can show the resolved unit price before the quotation
 * exists. Never persists anything.
 */
export const quotationPreviewSchema = z.object({
  requestId: z.string().min(1),
});

export type QuotationPreviewInput = z.infer<typeof quotationPreviewSchema>;

/** GET /quotations query params */
export const quotationListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(quotationStatusValues).optional(),
  customerId: z.string().optional(),
  requestId: z.string().optional(),
});

export type QuotationListQuery = z.infer<typeof quotationListQuerySchema>;

/** Whitelisted `sortBy` values for GET /quotations — see resolveSortOrder. */
export const QUOTATION_SORTABLE_FIELDS = ["createdAt", "number", "status"] as const;

/** PATCH /quotations/:id body (only allowed while DRAFT) */
export const quotationUpdateSchema = z.object({
  source: z.enum(quotationSourceValues).optional(),
  validUntil: z.coerce.date().nullable().optional(),
  taxCode: z.string().min(1).max(50).optional(),
  headerDiscountAmount: quotationDecimalSchema.nonnegative().optional(),
  items: z.array(quotationItemInputSchema).min(1).optional(),
});

export type QuotationUpdateInput = z.infer<typeof quotationUpdateSchema>;

// =============================================================================
// PurchaseOrder (APPROVED Quotation → PurchaseOrder)
// =============================================================================

const purchaseOrderStatusValues = ["DRAFT", "APPROVED", "CANCELLED"] as const;

/** POST /purchase-orders body — commercial values are snapshotted from Quotation. */
export const purchaseOrderCreateSchema = z.object({
  quotationId: z.string().min(1),
  customerPoNumber: z.string().trim().min(1).max(100),
  customerPoDate: z.coerce.date(),
  notes: z.string().max(2000).nullable().optional(),
});

export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

/** GET /purchase-orders query params */
export const purchaseOrderListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(purchaseOrderStatusValues).optional(),
  customerId: z.string().optional(),
  quotationId: z.string().optional(),
});

export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;

/** Whitelisted `sortBy` values for GET /purchase-orders — see resolveSortOrder. */
export const PURCHASE_ORDER_SORTABLE_FIELDS = ["createdAt", "number", "status"] as const;

/** PATCH /purchase-orders/:id body (only allowed while DRAFT) */
export const purchaseOrderUpdateSchema = z.object({
  customerPoNumber: z.string().trim().min(1).max(100).optional(),
  customerPoDate: z.coerce.date().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;

// =============================================================================
// WorkOrder (APPROVED PurchaseOrder → WorkOrder)
// =============================================================================

const workOrderStatusValues = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

const assignmentRoleValues = ["LEAD", "ASSIST"] as const;

const workOrderNullableString = z.string().max(2000).nullable().optional();
const workOrderNullableCoord = z.coerce.number().finite().nullable().optional();
const workOrderNullableDate = z.coerce.date().nullable().optional();

/**
 * One reference-equipment unit selected for an ON_SITE work order
 * ("Equipment yang akan dibawa"). `equipmentTypeId` is the type the row is
 * selected to satisfy — the server verifies it matches the Equipment's own type.
 */
export const workOrderEquipmentItemSchema = z.object({
  equipmentId: z.string().min(1),
  equipmentTypeId: z.string().min(1),
  notes: z.string().max(2000).nullable().optional(),
});

export type WorkOrderEquipmentItemInput = z.infer<typeof workOrderEquipmentItemSchema>;

/** PUT /work-orders/:id/equipment body — full-set replace, order is significant. */
export const workOrderEquipmentReplaceSchema = z.object({
  equipment: z.array(workOrderEquipmentItemSchema).max(200),
});

export type WorkOrderEquipmentReplaceInput = z.infer<typeof workOrderEquipmentReplaceSchema>;

/**
 * PATCH /work-orders/:id/equipment/order body — reorder only. `equipmentIds`
 * must be the FULL set of equipment currently attached to the work order, in the
 * new operational order. Never adds, removes, or reassigns equipment.
 */
export const workOrderEquipmentOrderSchema = z.object({
  equipmentIds: z.array(z.string().min(1)).min(1).max(200),
});

export type WorkOrderEquipmentOrderInput = z.infer<typeof workOrderEquipmentOrderSchema>;

/** GET /work-orders/equipment-proposal query — pre-create proposal from a PO. */
export const workOrderEquipmentProposalQuerySchema = z.object({
  purchaseOrderId: z.string().min(1),
});

export type WorkOrderEquipmentProposalQuery = z.infer<typeof workOrderEquipmentProposalQuerySchema>;

/** POST /work-orders body — source/commercial values are derived from the PO. */
export const workOrderCreateSchema = z.object({
  purchaseOrderId: z.string().min(1),
  addressText: workOrderNullableString,
  geoLat: workOrderNullableCoord,
  geoLng: workOrderNullableCoord,
  locationNotes: workOrderNullableString,
  scheduledStart: workOrderNullableDate,
  scheduledEnd: workOrderNullableDate,
  /**
   * ON_SITE only: the initial reference-equipment selection. Optional — the
   * list can also be built later on the work-order detail page. Ignored (must
   * be empty) for SEND_TO_LAB work orders.
   */
  equipment: z.array(workOrderEquipmentItemSchema).max(200).optional(),
});

export type WorkOrderCreateInput = z.infer<typeof workOrderCreateSchema>;

/** GET /work-orders query params */
export const workOrderListQuerySchema = baseListQuerySchema.extend({
  status: z.enum(workOrderStatusValues).optional(),
  customerId: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  quotationId: z.string().optional(),
});

export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;

/** Whitelisted `sortBy` values for GET /work-orders — see resolveSortOrder. */
export const WORK_ORDER_SORTABLE_FIELDS = ["createdAt", "number", "status"] as const;

/**
 * PATCH /work-orders/:id body (only allowed while non-terminal).
 * `serviceMode` is intentionally NOT editable here — it determines the Work Order
 * document identity (SPK vs WOL) and is immutable after create.
 */
export const workOrderUpdateSchema = z.object({
  addressText: workOrderNullableString,
  geoLat: workOrderNullableCoord,
  geoLng: workOrderNullableCoord,
  locationNotes: workOrderNullableString,
  scheduledStart: workOrderNullableDate,
  scheduledEnd: workOrderNullableDate,
});

export type WorkOrderUpdateInput = z.infer<typeof workOrderUpdateSchema>;

/** POST /work-orders/:id/assign body */
export const workOrderAssignSchema = z.object({
  technicians: z
    .array(
      z.object({
        technicianUserId: z.string().min(1),
        roleOnJob: z.enum(assignmentRoleValues).optional(),
      }),
    )
    .min(1),
});

export type WorkOrderAssignInput = z.infer<typeof workOrderAssignSchema>;

// =============================================================================
// Calibration Job — AKD/AKL/NIE identity gate
// =============================================================================
// Per-CalibrationJob (per physical device) regulatory-declaration gate. A
// technician escalates a job whose AKD/AKL/NIE is missing/unacceptable; a
// TECHNICIAN_MANAGER then APPROVEs or REJECTs that specific device. Decided
// per job so one blocked device never blocks its WorkOrder siblings.

/** POST /calibration-jobs/:id/escalate-identity body */
export const calibrationJobEscalateIdentitySchema = z.object({
  // What the technician physically read off the device (may be blank — "I
  // looked and there is nothing"). Persisted to
  // CalibrationJob.technicianObservedAkdAkl.
  technicianObservedAkdAkl: z.string().trim().max(120).nullable().optional(),
  // Free-text escalation context. v1 limitation: stored in
  // CalibrationJob.akdAklDecisionNote and overwritten by the manager's
  // decision note (no dedicated escalation-note column yet).
  reason: z.string().trim().max(2000).optional(),
});

export type CalibrationJobEscalateIdentityInput = z.infer<
  typeof calibrationJobEscalateIdentitySchema
>;

const akdAklDecisionValues = ["APPROVE", "REJECT"] as const;

/** POST /calibration-jobs/:id/identity-decision body (TECHNICIAN_MANAGER only) */
export const calibrationJobIdentityDecisionSchema = z
  .object({
    decision: z.enum(akdAklDecisionValues),
    akdAklDecisionNote: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.decision === "REJECT" && !val.akdAklDecisionNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["akdAklDecisionNote"],
        message: "A decision note is required when rejecting",
      });
    }
  });

export type CalibrationJobIdentityDecisionInput = z.infer<
  typeof calibrationJobIdentityDecisionSchema
>;

// -----------------------------------------------------------------------------
// Calibration Job — physical device assignment
// -----------------------------------------------------------------------------
// Once a technician has physically identified the device on-site, the job's
// (until now NULL) deviceId is bound — either to an existing Device master row
// or to one registered on the spot. One RBAC action (calibrationJob:assignDevice)
// covers both. Re-assignment once set is disallowed here (deferred to the
// Identity Correction workflow).

/** POST /calibration-jobs/:id/assign-device body */
export const calibrationJobAssignDeviceSchema = z.object({
  deviceId: z.string().min(1),
});

export type CalibrationJobAssignDeviceInput = z.infer<typeof calibrationJobAssignDeviceSchema>;

// -----------------------------------------------------------------------------
// Calibration Job — Portal management list
// -----------------------------------------------------------------------------

export const CALIBRATION_JOB_STATUS_VALUES = [
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "REWORK",
  "ACCEPTED_BY_QA",
] as const;

export const AKD_AKL_APPROVAL_STATUS_VALUES = [
  "NOT_REQUIRED",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;

/** GET /calibration-jobs query params */
export const calibrationJobListQuerySchema = baseListQuerySchema.extend({
  workOrderId: z.string().optional(),
  akdAklApprovalStatus: z.enum(AKD_AKL_APPROVAL_STATUS_VALUES).optional(),
  status: z.enum(CALIBRATION_JOB_STATUS_VALUES).optional(),
});

export type CalibrationJobListQuery = z.infer<typeof calibrationJobListQuerySchema>;

/** Whitelisted `sortBy` values for GET /calibration-jobs — see resolveSortOrder. */
export const CALIBRATION_JOB_SORTABLE_FIELDS = [
  "createdAt",
  "unitOrdinal",
  "akdAklApprovalStatus",
  "status",
] as const;

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
// Tax Master Data (company-scoped)
// =============================================================================

/** POST /taxes body — taxRate is a fraction (0.11 = 11%). */
export const taxCreateSchema = z.object({
  taxCode: z.string().min(1).max(20).toUpperCase(),
  description: z.string().min(1).max(200),
  taxRate: z.number().finite().min(0).max(1),
  isExclude: z.boolean().optional(),
});

export type TaxCreateInput = z.infer<typeof taxCreateSchema>;

/** GET /taxes query params */
export const taxListQuerySchema = baseListQuerySchema.extend({
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type TaxListQuery = z.infer<typeof taxListQuerySchema>;

/** Whitelisted `sortBy` values for GET /taxes — see resolveSortOrder. */
export const TAX_SORTABLE_FIELDS = ["createdAt", "taxCode", "description", "taxRate"] as const;

/** PATCH /taxes/:id body */
export const taxUpdateSchema = z.object({
  taxCode: z.string().min(1).max(20).toUpperCase().optional(),
  description: z.string().min(1).max(200).optional(),
  taxRate: z.number().finite().min(0).max(1).optional(),
  isExclude: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type TaxUpdateInput = z.infer<typeof taxUpdateSchema>;

// =============================================================================
// Price List / Tariff Master Data (company-scoped, DeviceType-keyed)
// =============================================================================

/** Money as a plain non-negative number on the wire; persisted as Decimal(18,2). */
const priceDecimalSchema = z.coerce.number().finite();

/** POST /price-list-items body. */
export const priceListItemCreateSchema = z.object({
  deviceTypeId: z.string().min(1),
  unitPrice: priceDecimalSchema.positive(),
  currency: z.string().min(1).max(8).optional(),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type PriceListItemCreateInput = z.infer<typeof priceListItemCreateSchema>;

/** GET /price-list-items query params */
export const priceListItemListQuerySchema = baseListQuerySchema.extend({
  deviceTypeId: z.string().optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type PriceListItemListQuery = z.infer<typeof priceListItemListQuerySchema>;

/** GET /price-list-items/resolve query params — the applicable tariff on a date. */
export const priceListItemResolveQuerySchema = z.object({
  deviceTypeId: z.string().min(1),
  date: z.coerce.date().optional(),
});

export type PriceListItemResolveQuery = z.infer<typeof priceListItemResolveQuerySchema>;

/** Whitelisted `sortBy` values for GET /price-list-items — see resolveSortOrder. */
export const PRICE_LIST_ITEM_SORTABLE_FIELDS = [
  "createdAt",
  "effectiveFrom",
  "unitPrice",
  // Relational: mapped to `deviceType.name` in the service (see resolveSortOrder).
  "deviceName",
] as const;

/** PATCH /price-list-items/:id body. */
export const priceListItemUpdateSchema = z.object({
  unitPrice: priceDecimalSchema.positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveUntil: z.coerce.date().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type PriceListItemUpdateInput = z.infer<typeof priceListItemUpdateSchema>;

// =============================================================================
// DeviceCategory & DeviceType Master Data
// =============================================================================

const optionalDescription = z.string().max(500).optional();

/**
 * POST /device-categories body. `code` is not accepted — it is a system-issued,
 * immutable business identifier (DVCAT-001) allocated by MasterCodeService.
 */
export const deviceCategoryCreateSchema = z.object({
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

/** PATCH /device-categories/:id body. `code` is immutable and cannot be changed. */
export const deviceCategoryUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type DeviceCategoryUpdateInput = z.infer<typeof deviceCategoryUpdateSchema>;

/**
 * POST /device-types body. `code` is not accepted — system-issued, immutable
 * business identifier (DVTP-001).
 */
export const deviceTypeCreateSchema = z.object({
  categoryId: z.string().min(1),
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

/** PATCH /device-types/:id body. `code` is immutable and cannot be changed. */
export const deviceTypeUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
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
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
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
  isActive: z.boolean().optional(),
});

export type DeviceModelUpdateInput = z.infer<typeof deviceModelUpdateSchema>;

// =============================================================================
// DeviceCapability + DeviceCapabilityItem Master Data
// =============================================================================

/**
 * POST /device-capabilities body. `code` is not accepted — system-issued,
 * immutable business identifier (DVCAP-001).
 */
export const deviceCapabilityCreateSchema = z.object({
  name: z.string().min(1).max(150),
  description: optionalDescription,
});

export type DeviceCapabilityCreateInput = z.infer<typeof deviceCapabilityCreateSchema>;

/** GET /device-capabilities query params */
export const deviceCapabilityListQuerySchema = baseListQuerySchema.extend({
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type DeviceCapabilityListQuery = z.infer<typeof deviceCapabilityListQuerySchema>;

/** Whitelisted `sortBy` values for GET /device-capabilities — see resolveSortOrder. */
export const DEVICE_CAPABILITY_SORTABLE_FIELDS = ["createdAt", "code", "name"] as const;

/** PATCH /device-capabilities/:id body. `code` is immutable and cannot be changed. */
export const deviceCapabilityUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type DeviceCapabilityUpdateInput = z.infer<typeof deviceCapabilityUpdateSchema>;

/**
 * POST /device-capabilities/:id/items body. DeviceCapabilityItem is an internal
 * taxonomy leaf with no business identity — it has no `code`; `name` is unique
 * within its capability.
 */
export const deviceCapabilityItemCreateSchema = z.object({
  name: z.string().min(1).max(150),
  description: optionalDescription,
});

export type DeviceCapabilityItemCreateInput = z.infer<typeof deviceCapabilityItemCreateSchema>;

/** GET /device-capabilities/:id/items query params */
export const deviceCapabilityItemListQuerySchema = z.object({
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type DeviceCapabilityItemListQuery = z.infer<typeof deviceCapabilityItemListQuerySchema>;

/** PATCH /device-capabilities/:id/items/:itemId body */
export const deviceCapabilityItemUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type DeviceCapabilityItemUpdateInput = z.infer<typeof deviceCapabilityItemUpdateSchema>;

// =============================================================================
// DeviceCalibrationParameter Master Data
// =============================================================================

/** POST /device-calibration-parameters body */
const optionalFiniteNumber = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === "" || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return Number(trimmed);
  }
  return value;
}, z.number().finite().nullable().optional());

function refineToleranceBounds(
  data: { toleranceMin?: number | null; toleranceMax?: number | null },
  ctx: z.RefinementCtx,
) {
  if (
    data.toleranceMin != null &&
    data.toleranceMax != null &&
    data.toleranceMin > data.toleranceMax
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "toleranceMin must be less than or equal to toleranceMax",
      path: ["toleranceMin"],
    });
  }
}

/**
 * Digits after the decimal point for a parameter's measured calibration result.
 * Only meaningful for valueType = NUMBER; `""`/`null` coerce to `null`. Bounded 0..10
 * (matches the DB CHECK constraint).
 */
const optionalDecimalPlaces = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === "" || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return Number(trimmed);
  }
  return value;
}, z.number().int().min(0).max(10).nullable().optional());

// `code` is not accepted — system-issued, immutable business identifier (DCP-0001).
export const deviceCalibrationParameterCreateSchema = z
  .object({
    deviceTypeId: z.string().min(1),
    capabilityItemId: z.string().min(1),
    name: z.string().min(1).max(150),
    description: optionalDescription,
    uomId: z.string().min(1),
    toleranceMin: optionalFiniteNumber,
    toleranceMax: optionalFiniteNumber,
    toleranceNote: z.string().max(500).nullable().optional(),
    decimalPlaces: optionalDecimalPlaces,
  })
  .superRefine(refineToleranceBounds);

export type DeviceCalibrationParameterCreateInput = z.infer<
  typeof deviceCalibrationParameterCreateSchema
>;

/** GET /device-calibration-parameters query params */
export const deviceCalibrationParameterListQuerySchema = baseListQuerySchema.extend({
  deviceTypeId: z.string().min(1).optional(),
  capabilityId: z.string().min(1).optional(),
  capabilityItemId: z.string().min(1).optional(),
  uomId: z.string().min(1).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type DeviceCalibrationParameterListQuery = z.infer<
  typeof deviceCalibrationParameterListQuerySchema
>;

/** Whitelisted `sortBy` values for GET /device-calibration-parameters — see resolveSortOrder. */
export const DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS = ["createdAt", "code", "name"] as const;

/** PATCH /device-calibration-parameters/:id body */
export const deviceCalibrationParameterUpdateSchema = z
  .object({
    deviceTypeId: z.string().min(1).optional(),
    capabilityItemId: z.string().min(1).optional(),
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(500).nullable().optional(),
    uomId: z.string().min(1).optional(),
    toleranceMin: optionalFiniteNumber,
    toleranceMax: optionalFiniteNumber,
    toleranceNote: z.string().max(500).nullable().optional(),
    decimalPlaces: optionalDecimalPlaces,
    isActive: z.boolean().optional(),
  })
  .superRefine(refineToleranceBounds);

export type DeviceCalibrationParameterUpdateInput = z.infer<
  typeof deviceCalibrationParameterUpdateSchema
>;

/**
 * GET /device-calibration-parameters/grouped query params — parameters grouped by
 * Device Type for the simplified browse UI. Reuses the standard MEDCAL list
 * conventions (`search`, `page`, `pageSize`); pagination is applied at the
 * Device-Type (parent) level so a Device Type and all its parameters stay on one
 * page. `sortBy`/`sortDir` are not used here (fixed device-type-name order).
 */
export const deviceCalibrationParameterGroupedQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type DeviceCalibrationParameterGroupedQuery = z.infer<
  typeof deviceCalibrationParameterGroupedQuerySchema
>;

/**
 * PATCH /device-calibration-parameters/device-types/:deviceTypeId/capability-order
 * body. `capabilityIds` is the FULL ordered list of the capabilities currently
 * attached to the device type — the server rejects any set mismatch.
 */
export const deviceCalibrationParameterCapabilityOrderSchema = z.object({
  capabilityIds: z.array(z.string().min(1)).min(1),
});

export type DeviceCalibrationParameterCapabilityOrderInput = z.infer<
  typeof deviceCalibrationParameterCapabilityOrderSchema
>;

/**
 * PATCH /device-calibration-parameters/device-types/:deviceTypeId/capabilities/:capabilityId/parameter-order
 * body. `parameterIds` is the FULL ordered list of the parameters in that
 * (deviceType, capability) scope — the server rejects any set mismatch.
 */
export const deviceCalibrationParameterParameterOrderSchema = z.object({
  parameterIds: z.array(z.string().min(1)).min(1),
});

export type DeviceCalibrationParameterParameterOrderInput = z.infer<
  typeof deviceCalibrationParameterParameterOrderSchema
>;

// =============================================================================
// EquipmentType + DeviceTypeEquipmentRequirement Master Data
// (Phase 1 — "Required Equipment". No physical Equipment instance layer.)
// =============================================================================

/**
 * POST /equipment-types body. `code` is not accepted — system-issued, immutable
 * business identifier (EQTP-001).
 */
export const equipmentTypeCreateSchema = z.object({
  name: z.string().min(1).max(150),
  description: optionalDescription,
  category: z.string().trim().max(100).optional(),
});

export type EquipmentTypeCreateInput = z.infer<typeof equipmentTypeCreateSchema>;

/** GET /equipment-types query params */
export const equipmentTypeListQuerySchema = baseListQuerySchema.extend({
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type EquipmentTypeListQuery = z.infer<typeof equipmentTypeListQuerySchema>;

/** Whitelisted `sortBy` values for GET /equipment-types — see resolveSortOrder. */
export const EQUIPMENT_TYPE_SORTABLE_FIELDS = ["createdAt", "code", "name"] as const;

/** PATCH /equipment-types/:id body. `code` is immutable and cannot be changed. */
export const equipmentTypeUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type EquipmentTypeUpdateInput = z.infer<typeof equipmentTypeUpdateSchema>;

/** POST /device-type-equipment-requirements body */
export const deviceTypeEquipmentRequirementCreateSchema = z.object({
  deviceTypeId: z.string().min(1),
  equipmentTypeId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

export type DeviceTypeEquipmentRequirementCreateInput = z.infer<
  typeof deviceTypeEquipmentRequirementCreateSchema
>;

/** PATCH /device-type-equipment-requirements/:id body — notes only. */
export const deviceTypeEquipmentRequirementUpdateSchema = z.object({
  notes: z.string().trim().max(500).nullable().optional(),
});

export type DeviceTypeEquipmentRequirementUpdateInput = z.infer<
  typeof deviceTypeEquipmentRequirementUpdateSchema
>;

/**
 * GET /device-type-equipment-requirements/grouped query params — requirements
 * grouped by Device Type for the expandable browse UI. Same MEDCAL conventions
 * as the calibration-parameter grouped endpoint: pagination is applied at the
 * Device-Type (parent) level so a Device Type and all its requirements stay on
 * one page.
 */
export const deviceTypeEquipmentRequirementGroupedQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type DeviceTypeEquipmentRequirementGroupedQuery = z.infer<
  typeof deviceTypeEquipmentRequirementGroupedQuerySchema
>;

/**
 * PATCH /device-type-equipment-requirements/device-types/:deviceTypeId/requirement-order
 * body. `requirementIds` is the FULL ordered list of the equipment requirements
 * currently attached to that device type — the server rejects any set mismatch
 * (unknown id, missing id, id from another device type, or a duplicate) and
 * persists the whole ordering in one transaction.
 */
export const deviceTypeEquipmentRequirementReorderSchema = z.object({
  requirementIds: z.array(z.string().min(1)).min(1),
});

export type DeviceTypeEquipmentRequirementReorderInput = z.infer<
  typeof deviceTypeEquipmentRequirementReorderSchema
>;

// =============================================================================
// Equipment — physical reference-equipment unit (Phase 2A, company-scoped)
// =============================================================================

const optionalEquipmentText = z.string().trim().max(150).optional();

/**
 * POST /equipment body. `code` is not accepted — it is a system-issued,
 * immutable asset identifier (EQU-000001) allocated by MasterCodeService.
 */
export const equipmentCreateSchema = z.object({
  equipmentTypeId: z.string().min(1),
  brand: optionalEquipmentText,
  model: optionalEquipmentText,
  serialNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type EquipmentCreateInput = z.infer<typeof equipmentCreateSchema>;

/** GET /equipment query params */
export const equipmentListQuerySchema = baseListQuerySchema.extend({
  equipmentTypeId: z.string().min(1).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type EquipmentListQuery = z.infer<typeof equipmentListQuerySchema>;

/** Whitelisted `sortBy` values for GET /equipment — see resolveSortOrder. */
export const EQUIPMENT_SORTABLE_FIELDS = ["createdAt", "code"] as const;

/** PATCH /equipment/:id body. `code` is immutable and cannot be changed. */
export const equipmentUpdateSchema = z.object({
  equipmentTypeId: z.string().min(1).optional(),
  brand: z.string().trim().max(150).nullable().optional(),
  model: z.string().trim().max(150).nullable().optional(),
  serialNumber: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type EquipmentUpdateInput = z.infer<typeof equipmentUpdateSchema>;

// =============================================================================
// EquipmentCalibrationRecord (Phase 2B — calibration evidence per Equipment unit)
// =============================================================================

export const EQUIPMENT_CALIBRATION_RECORD_STATUSES = ["DRAFT", "CONFIRMED"] as const;

const optionalCalibrationText = z.string().trim().max(500).optional();
const optionalCalibrationTextNullable = z.string().trim().max(500).nullable().optional();

/** POST /equipment/:equipmentId/calibration-records body */
export const equipmentCalibrationRecordCreateSchema = z
  .object({
    calibrationDate: z.coerce.date(),
    validFrom: z.coerce.date().nullable().optional(),
    validUntil: z.coerce.date(),
    certificateNumber: z.string().trim().max(120).optional(),
    provider: z.string().trim().max(200).optional(),
    // Lab outcome. Free text on purpose — a controlled vocabulary is an open
    // business decision (see implementation_report_equipment_phase2b.md).
    result: z.string().trim().max(120).optional(),
    remarks: optionalCalibrationText,
    // MEDCAL's acceptance decision — distinct from `result`, never auto-derived.
    acceptedForUse: z.boolean().optional(),
    acceptanceNotes: optionalCalibrationText,
  })
  .superRefine((data, ctx) => {
    const from = data.validFrom ?? data.calibrationDate;
    if (from > data.validUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "validFrom (or calibrationDate) must be on or before validUntil",
        path: ["validUntil"],
      });
    }
  });

export type EquipmentCalibrationRecordCreateInput = z.infer<
  typeof equipmentCalibrationRecordCreateSchema
>;

/** PATCH /equipment-calibration-records/:id body. `status` DRAFT→CONFIRMED only. */
export const equipmentCalibrationRecordUpdateSchema = z.object({
  calibrationDate: z.coerce.date().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().optional(),
  certificateNumber: z.string().trim().max(120).nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  result: z.string().trim().max(120).nullable().optional(),
  remarks: optionalCalibrationTextNullable,
  acceptedForUse: z.boolean().optional(),
  acceptanceNotes: optionalCalibrationTextNullable,
  status: z.enum(EQUIPMENT_CALIBRATION_RECORD_STATUSES).optional(),
});

export type EquipmentCalibrationRecordUpdateInput = z.infer<
  typeof equipmentCalibrationRecordUpdateSchema
>;

// =============================================================================
// Device (physical asset, company-scoped)
// =============================================================================

const deviceStatusValues = ["ACTIVE", "INACTIVE"] as const;

const optionalDeviceText = z.string().trim().max(150).optional();
const optionalDeviceTextNullable = z.string().trim().max(150).nullable().optional();

/** POST /devices body */
export const deviceCreateSchema = z.object({
  customerId: z.string().min(1),
  deviceTypeId: z.string().min(1),
  brand: optionalDeviceText,
  model: optionalDeviceText,
  serialNumber: z.string().trim().max(100).optional(),
  category: optionalDeviceText,
  locationText: z.string().trim().max(200).optional(),
  status: z.enum(deviceStatusValues).optional(),
});

export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;

/** GET /devices query params */
export const deviceListQuerySchema = baseListQuerySchema.extend({
  deviceTypeId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  status: z.enum(deviceStatusValues).optional(),
});

export type DeviceListQuery = z.infer<typeof deviceListQuerySchema>;

/** Whitelisted `sortBy` values for GET /devices — see resolveSortOrder. */
export const DEVICE_SORTABLE_FIELDS = [
  "createdAt",
  "brand",
  "model",
  "serialNumber",
  "status",
] as const;

/** PATCH /devices/:id body — deviceTypeId remains required when supplied (never null). */
export const deviceUpdateSchema = z.object({
  customerId: z.string().min(1).optional(),
  deviceTypeId: z.string().min(1).optional(),
  brand: optionalDeviceTextNullable,
  model: optionalDeviceTextNullable,
  serialNumber: z.string().trim().max(100).nullable().optional(),
  category: optionalDeviceTextNullable,
  locationText: z.string().trim().max(200).nullable().optional(),
  status: z.enum(deviceStatusValues).optional(),
});

export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;

// =============================================================================
// DeviceTypeAlias Master Data (Phase 2 — Excel Import + Alias)
// =============================================================================

/** POST /device-type-aliases body */
export const deviceTypeAliasCreateSchema = z.object({
  deviceTypeId: z.string().min(1),
  alias: z.string().trim().min(1).max(150),
  isActive: z.boolean().optional(),
});

export type DeviceTypeAliasCreateInput = z.infer<typeof deviceTypeAliasCreateSchema>;

/** GET /device-type-aliases query params */
export const deviceTypeAliasListQuerySchema = baseListQuerySchema.extend({
  deviceTypeId: z.string().min(1).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type DeviceTypeAliasListQuery = z.infer<typeof deviceTypeAliasListQuerySchema>;

/** GET /device-type-aliases/grouped query params — collapsible view grouped by Device Type. */
export const deviceTypeAliasGroupedQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type DeviceTypeAliasGroupedQuery = z.infer<typeof deviceTypeAliasGroupedQuerySchema>;

/** Whitelisted `sortBy` values for GET /device-type-aliases — see resolveSortOrder. */
export const DEVICE_TYPE_ALIAS_SORTABLE_FIELDS = ["createdAt", "alias"] as const;

/** PATCH /device-type-aliases/:id body */
export const deviceTypeAliasUpdateSchema = z.object({
  deviceTypeId: z.string().min(1).optional(),
  alias: z.string().trim().min(1).max(150).optional(),
  isActive: z.boolean().optional(),
});

export type DeviceTypeAliasUpdateInput = z.infer<typeof deviceTypeAliasUpdateSchema>;

// =============================================================================
// CalibrationRequest — Excel Import (Phase 2)
// =============================================================================

/**
 * Match method surfaced in the Preview DTO only. NOT persisted (D6/D32).
 * EXACT_NAME  — normalized customer term equals a DeviceType.name
 * ALIAS       — normalized customer term equals an active DeviceTypeAlias
 * FUZZY       — no exact hit; suggestions offered, user must confirm (D10/D34)
 * UNMATCHED   — no hit and no suggestion; user must map
 * USER        — deviceTypeId assigned by the user in the preview UI
 */
export const calibrationRequestImportMatchMethodValues = [
  "EXACT_NAME",
  "ALIAS",
  "FUZZY",
  "UNMATCHED",
  "USER",
] as const;
export type CalibrationRequestImportMatchMethod =
  (typeof calibrationRequestImportMatchMethodValues)[number];

export interface CalibrationRequestImportSuggestion {
  deviceTypeId: string;
  deviceTypeName: string;
  deviceTypeCode: string;
  /** Why it was suggested — e.g. "alias: Tensimeter Digital" or "name similarity". */
  via: string;
}

export interface CalibrationRequestImportPreviewRow {
  /** 1-based row number in the source sheet (header = row 1, first data row = 2). */
  rowNumber: number;
  customerDeviceName: string;
  model: string | null;
  deviceId: string | null;
  qty: number | null;
  /**
   * Customer-declared AKD/AKL/NIE (Nomor Izin Edar), verbatim. NULL when the
   * cell is empty. Optional and independent of qty — a customer may declare a
   * number even for an aggregate (qty > 1) row. Not the verified
   * per-physical-device value.
   */
  akdAkl: string | null;
  match: {
    deviceTypeId: string | null;
    deviceTypeName: string | null;
    deviceTypeCode: string | null;
    method: CalibrationRequestImportMatchMethod | null;
  };
  suggestions: CalibrationRequestImportSuggestion[];
  /** Non-blocking advisories for this row (informational). */
  warnings: string[];
  /** Blocking — Confirm is refused until every row is error-free. */
  errors: string[];
}

export interface CalibrationRequestImportPreviewResponse {
  rows: CalibrationRequestImportPreviewRow[];
  summary: {
    /** Number of spreadsheet rows = number of CalibrationRequestItems Confirm creates (1:1). */
    sourceRows: number;
    /** Sum of qty across error-free rows — total physical units requested. */
    totalUnits: number;
    matched: number;
    unmatched: number;
    rowsWithWarnings: number;
    rowsWithErrors: number;
  };
}

/** One fully-resolved row the client sends back to Confirm. */
export const calibrationRequestImportConfirmRowSchema = z.object({
  customerDeviceName: z.string().trim().min(1).max(200),
  model: z.string().trim().max(120).optional(),
  deviceId: z.string().trim().max(120).optional(),
  qty: z.number().int().positive(),
  /**
   * Customer-declared AKD/AKL/NIE. Optional, independent of qty.
   * Empty → NOT_PROVIDED; present → CUSTOMER_PROVIDED (derived server-side).
   */
  akdAkl: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  deviceTypeId: z.string().min(1),
});

export type CalibrationRequestImportConfirmRow = z.infer<
  typeof calibrationRequestImportConfirmRowSchema
>;

/** POST /calibration-requests/import/confirm body */
export const calibrationRequestImportConfirmSchema = z.object({
  customerId: z.string().min(1),
  leadId: z.string().min(1).optional(),
  serviceMode: z.enum(serviceModeValues),
  expectedDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  /** One row = one CalibrationRequestItem; each row's qty is stored as-is. */
  rows: z.array(calibrationRequestImportConfirmRowSchema).min(1),
});

export type CalibrationRequestImportConfirmInput = z.infer<
  typeof calibrationRequestImportConfirmSchema
>;
