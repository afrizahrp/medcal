import { describe, expect, it } from "vitest";
import { purchaseOrderPdfFilename } from "./purchase-order-pdf";

describe("purchaseOrderPdfFilename", () => {
  it("formats PKM-PUR-YYYYMMDD-sequence from the PO number and issue date", () => {
    expect(
      purchaseOrderPdfFilename({
        number: "PUR/2026/08/00001",
        companyId: "PKM",
        issuedAt: "2026-08-27T03:00:00.000Z",
      }),
    ).toBe("PKM-PUR-20260827-00001.pdf");
  });
});
