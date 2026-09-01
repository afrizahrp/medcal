import type { DocumentType } from "@prisma/client";

/** Fixed prefix mapping — not configurable per company. */
export const DOCUMENT_TYPE_PREFIX: Record<DocumentType, string> = {
  CUSTOMER: "CUS",
  CALIBRATION_REQUEST: "CRQ",
  QUOTATION: "QUO",
  PURCHASE_ORDER: "PUR",
  WORK_ORDER: "SPK",
  WORK_ORDER_SEND_TO_LAB: "WOL",
  INVOICE: "INV",
  CERTIFICATE: "CER",
  CREDIT_NOTE: "CRN",
};

export function resolveDocumentPrefix(documentType: DocumentType): string {
  const prefix = DOCUMENT_TYPE_PREFIX[documentType];
  if (!prefix) {
    throw new Error(`Unsupported document type: ${documentType}`);
  }
  return prefix;
}
