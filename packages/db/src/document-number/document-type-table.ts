import type { DocumentType } from "@prisma/client";

/** Tables that store a business `number` allocated by DocumentNumberService. */
export const DOCUMENT_TYPE_NUMBER_TABLE: Record<DocumentType, string> = {
  CUSTOMER: "Customer",
  CALIBRATION_REQUEST: "CalibrationRequest",
  QUOTATION: "Quotation",
  PURCHASE_ORDER: "PurchaseOrder",
  WORK_ORDER: "WorkOrder",
  WORK_ORDER_SEND_TO_LAB: "WorkOrder",
  EQUIPMENT_DELIVERY_NOTE: "EquipmentDeliveryNote",
  INVOICE: "Invoice",
  CERTIFICATE: "Certificate",
  CREDIT_NOTE: "CreditNote",
  IDENTITY_CORRECTION_BA: "IdentityCorrection",
  KONTROL_ALAT: "KontrolAlat",
};

export function resolveDocumentNumberTable(documentType: DocumentType): string | undefined {
  return DOCUMENT_TYPE_NUMBER_TABLE[documentType];
}
