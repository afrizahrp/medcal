import { renderSpkPdf } from "./work-order-pdf-spk";
import { renderWolPdf } from "./work-order-pdf-wol";
import type { WorkOrderPdfInput, WorkOrderPdfResult, WorkOrderPdfSource } from "./work-order-pdf-shared";

export { workOrderPdfFilename } from "./work-order-pdf-shared";
export type { WorkOrderPdfSource, WorkOrderPdfResult } from "./work-order-pdf-shared";

/**
 * Renders the Work Order document for `workOrder`, choosing the form from the
 * service mode that already determined the document identity:
 *
 *   ON_SITE      -> "Surat Perintah Kerja" (SPK)  — renderSpkPdf
 *   SEND_TO_LAB  -> "Formulir Work Order" (WOL)    — renderWolPdf
 *
 * The service mode is authoritative here; the prefix of `workOrder.number`
 * (SPK/… vs WOL/…) is never re-parsed to infer the document type.
 */
export function renderWorkOrderPdf(input: WorkOrderPdfInput): Promise<WorkOrderPdfResult> {
  return input.workOrder.serviceMode === "ON_SITE" ? renderSpkPdf(input) : renderWolPdf(input);
}
