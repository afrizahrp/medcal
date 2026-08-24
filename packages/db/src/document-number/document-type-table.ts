import type { DocumentType } from "@prisma/client";

/** Tables that store a business `number` allocated by DocumentNumberService. */
export const DOCUMENT_TYPE_NUMBER_TABLE: Partial<Record<DocumentType, string>> = {
  CUSTOMER: "Customer",
  CALIBRATION_REQUEST: "CalibrationRequest",
  QUOTATION: "Quotation",
};

export function resolveDocumentNumberTable(documentType: DocumentType): string | undefined {
  return DOCUMENT_TYPE_NUMBER_TABLE[documentType];
}
