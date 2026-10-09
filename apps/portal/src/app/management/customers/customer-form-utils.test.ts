import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  buildCreatePayload,
  buildUpdatePayload,
  formatCustomerApiError,
} from "./customer-form-utils";

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

const baseForm = {
  name: " Acme ",
  legalName: "",
  taxId: "",
  address: "",
  phone: "",
  mobile: "",
  email: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  contactTitle: "",
};

describe("customer pricing mode payloads", () => {
  it("create carries the chosen pricing mode (STANDARD by default in the form)", () => {
    expect(buildCreatePayload({ ...baseForm, pricingMode: "STANDARD" })).toMatchObject({
      name: "Acme",
      pricingMode: "STANDARD",
    });
    expect(buildCreatePayload({ ...baseForm, pricingMode: "MANUAL" }).pricingMode).toBe("MANUAL");
  });

  it("update carries the pricing mode so it can be switched either way", () => {
    expect(
      buildUpdatePayload({ ...baseForm, status: "ACTIVE", pricingMode: "MANUAL" }).pricingMode,
    ).toBe("MANUAL");
    expect(
      buildUpdatePayload({ ...baseForm, status: "ACTIVE", pricingMode: "STANDARD" }).pricingMode,
    ).toBe("STANDARD");
  });
});
