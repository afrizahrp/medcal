import { describe, expect, it } from "vitest";
import { workOrderPdfFilename } from "./work-order-pdf";

describe("workOrderPdfFilename", () => {
  it("formats PKM-SPK-YYYYMMDD-sequence from the WorkOrder number and issue date", () => {
    expect(
      workOrderPdfFilename({
        number: "SPK/2026/08/00001",
        companyId: "PKM",
        issuedAt: "2026-08-27T03:00:00.000Z",
      }),
    ).toBe("PKM-SPK-20260827-00001.pdf");
  });
});
