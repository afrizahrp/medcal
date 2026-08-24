import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import { formatCustomerApiError } from "./customer-form-utils";

describe("formatCustomerApiError", () => {
  it("maps duplicate email code", () => {
    const err = new ApiError(409, "Conflict", { code: "DUPLICATE_CUSTOMER_EMAIL" });
    expect(formatCustomerApiError(err)).toContain("Email kontak");
  });

  it("maps duplicate tax id code", () => {
    const err = new ApiError(409, "Conflict", { code: "DUPLICATE_CUSTOMER_TAX_ID" });
    expect(formatCustomerApiError(err)).toContain("Tax ID");
  });

  it("maps lead already converted code", () => {
    const err = new ApiError(409, "Conflict", { code: "LEAD_ALREADY_CONVERTED" });
    expect(formatCustomerApiError(err)).toContain("dikonversi");
  });
});
