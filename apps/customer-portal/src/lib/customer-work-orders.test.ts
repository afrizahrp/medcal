import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CERTIFICATE_FILTER_VALUES,
  CUSTOMER_JOB_STATUS_VALUES,
  CUSTOMER_PROGRESS_FILTER_VALUES,
  CUSTOMER_WORK_ORDER_STATUS_VALUES,
} from "@medcal/shared";
import {
  CERTIFICATE_OPTIONS,
  JOB_STATUS_OPTIONS,
  PROGRESS_OPTIONS,
  UNNAMED_DEVICE_LABEL,
  WORK_ORDER_STATUS_OPTIONS,
  certificateAvailabilityLabel,
  certificateCountLabel,
  formatUnitLabel,
  groupCertificateLabel,
  groupStatusSummary,
  groupUnitLabel,
  hasActiveFilters,
  jobListPath,
  jobStatusLabel,
  parsePage,
  unitGroupListPath,
  pickFilterValue,
  unitDetailLines,
  unitTitle,
  workOrderListPath,
  workOrderStatusLabel,
} from "./customer-work-orders";

describe("customer-facing labels", () => {
  it("never surfaces the internal calibration-job enum", () => {
    expect(jobStatusLabel("NOT_STARTED")).toBe("Belum dimulai");
    expect(jobStatusLabel("IN_PROGRESS")).toBe("Dalam proses");
    expect(jobStatusLabel("COMPLETED")).toBe("Selesai");
    const labels = [jobStatusLabel("NOT_STARTED"), jobStatusLabel("IN_PROGRESS"), jobStatusLabel("COMPLETED")];
    expect(labels.join(" ")).not.toMatch(/PENDING|SUBMITTED|REWORK|ACCEPTED/);
  });

  it("labels a cancelled work order as historical, not hidden", () => {
    expect(workOrderStatusLabel("CANCELLED")).toBe("Dibatalkan");
    expect(workOrderStatusLabel("NOT_STARTED")).toBe("Belum dimulai");
    expect(workOrderStatusLabel("COMPLETED")).toBe("Selesai");
  });

  it("keeps certificate availability separate from job completion", () => {
    expect(certificateAvailabilityLabel("UNAVAILABLE")).toBe("Belum tersedia");
    expect(certificateAvailabilityLabel("AVAILABLE")).toBe("Tersedia");
    expect(certificateAvailabilityLabel("ISSUED_WITHOUT_PDF")).toBe("Terbit, PDF belum tersedia");
  });

  it("formats certificate counts and unit labels", () => {
    expect(certificateCountLabel(0)).toBe("Belum ada sertifikat");
    expect(certificateCountLabel(1)).toBe("1 sertifikat tersedia");
    expect(certificateCountLabel(42)).toBe("42 sertifikat tersedia");
  });

  it("labels a unit by its position within its own line, not as a unique number", () => {
    expect(formatUnitLabel(1, 8)).toBe("Unit 1 dari 8");
    expect(formatUnitLabel(42, 94)).toBe("Unit 42 dari 94");
    expect(formatUnitLabel(3, 2)).toBe("Unit 3 dari 3");
  });
});

describe("unit identity presentation", () => {
  it("shows the device name, falling back to a neutral label", () => {
    expect(unitTitle({ name: "Pompa Infus", brand: null, model: null, serialNumber: null })).toBe("Pompa Infus");
    expect(unitTitle({ name: null, brand: null, model: null, serialNumber: null })).toBe(UNNAMED_DEVICE_LABEL);
  });

  it("lists brand, model and serial number as separate lines, in that order", () => {
    expect(
      unitDetailLines({ name: "Defibrillator", brand: "MINDRAY", model: "BeneHeart D3", serialNumber: "SN-1" }),
    ).toEqual(["MINDRAY", "BeneHeart D3", "No. seri: SN-1"]);
  });

  it("leaves out whatever is unknown, with no placeholder text", () => {
    const base = { name: "x" };
    expect(unitDetailLines({ ...base, brand: "MINDRAY", model: null, serialNumber: "SN-1" })).toEqual([
      "MINDRAY",
      "No. seri: SN-1",
    ]);
    expect(unitDetailLines({ ...base, brand: null, model: "D3", serialNumber: null })).toEqual(["D3"]);
    expect(unitDetailLines({ ...base, brand: null, model: null, serialNumber: null })).toEqual([]);
    expect(unitDetailLines({ ...base, brand: "", model: "  ", serialNumber: "" }).join(" ")).not.toMatch(/-|Merek|Model:/);
  });
});

describe("filter options", () => {
  it("offer exactly the values the API accepts, plus an empty 'all' choice", () => {
    const values = (options: Array<{ value: string }>) => options.map((option) => option.value).filter(Boolean);
    expect(values(WORK_ORDER_STATUS_OPTIONS)).toEqual([...CUSTOMER_WORK_ORDER_STATUS_VALUES]);
    expect(values(JOB_STATUS_OPTIONS)).toEqual([...CUSTOMER_JOB_STATUS_VALUES]);
    expect(values(PROGRESS_OPTIONS)).toEqual([...CUSTOMER_PROGRESS_FILTER_VALUES]);
    expect(values(CERTIFICATE_OPTIONS)).toEqual([...CUSTOMER_CERTIFICATE_FILTER_VALUES]);
    for (const options of [WORK_ORDER_STATUS_OPTIONS, JOB_STATUS_OPTIONS, PROGRESS_OPTIONS, CERTIFICATE_OPTIONS]) {
      expect(options[0]).toMatchObject({ value: "" });
    }
  });

  it("does not offer a 'no certificate' choice while revoked/superseded presentation is undecided", () => {
    expect(CERTIFICATE_OPTIONS.map((option) => option.value)).toEqual(["", "AVAILABLE"]);
  });

  it("ignores URL values that are not allowed", () => {
    expect(pickFilterValue("IN_PROGRESS", CUSTOMER_WORK_ORDER_STATUS_VALUES)).toBe("IN_PROGRESS");
    expect(pickFilterValue("PLANNED", CUSTOMER_WORK_ORDER_STATUS_VALUES)).toBe("");
    expect(pickFilterValue(undefined, CUSTOMER_WORK_ORDER_STATUS_VALUES)).toBe("");
  });

  it("falls back to page 1 for a bad page", () => {
    expect(parsePage("3")).toBe(3);
    for (const bad of [undefined, "", "0", "-2", "1.5", "abc"]) expect(parsePage(bad)).toBe(1);
  });
});

describe("request paths", () => {
  const empty = { search: "", status: "", progress: "", certificate: "", page: 1 } as const;

  it("sends nothing for an unfiltered first page", () => {
    expect(workOrderListPath(empty)).toBe("/customer/work-orders");
    expect(jobListPath("wo 1", { search: "", status: "", certificate: "", page: 1 })).toBe(
      "/customer/work-orders/wo%201/jobs",
    );
  });

  it("sends search, every filter and the page together, trimming the search", () => {
    const path = workOrderListPath({
      search: "  pompa infus ",
      status: "IN_PROGRESS",
      progress: "PARTIALLY_COMPLETED",
      certificate: "AVAILABLE",
      page: 3,
    });
    const url = new URL(path, "http://x");
    expect(url.pathname).toBe("/customer/work-orders");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "pompa infus",
      status: "IN_PROGRESS",
      progress: "PARTIALLY_COMPLETED",
      certificate: "AVAILABLE",
      page: "3",
    });
  });

  it("never puts a customer id in a request", () => {
    const all = workOrderListPath({ ...empty, search: "x", status: "COMPLETED", page: 2 });
    expect(all).not.toMatch(/customer(Id)?=/i);
    expect(jobListPath("wo", { search: "x", status: "COMPLETED", certificate: "AVAILABLE", page: 2 })).not.toMatch(
      /customerId/i,
    );
  });

  it("reports whether any filter is active", () => {
    expect(hasActiveFilters(empty)).toBe(false);
    expect(hasActiveFilters({ ...empty, search: "  " })).toBe(false);
    expect(hasActiveFilters({ ...empty, search: "x" })).toBe(true);
    expect(hasActiveFilters({ ...empty, progress: "ALL_COMPLETED" })).toBe(true);
  });
});

describe("unit group header", () => {
  it("counts the units in the group", () => {
    expect(groupUnitLabel(94)).toBe("94 unit");
    expect(groupUnitLabel(2)).toBe("2 unit");
  });

  it("summarises customer-facing progress and leaves out zero counts", () => {
    expect(groupStatusSummary({ completed: 42, inProgress: 35, notStarted: 17 })).toBe(
      "42 selesai · 35 dalam proses · 17 belum dimulai",
    );
    expect(groupStatusSummary({ completed: 0, inProgress: 3, notStarted: 0 })).toBe("3 dalam proses");
    expect(groupStatusSummary({ completed: 4, inProgress: 0, notStarted: 0 })).toBe("4 selesai");
    expect(groupStatusSummary({ completed: 0, inProgress: 0, notStarted: 0 })).toBe("");
    const text = groupStatusSummary({ completed: 1, inProgress: 1, notStarted: 1 });
    expect(text).not.toMatch(/PENDING|SUBMITTED|REWORK|ACCEPTED|NOT_STARTED/);
  });

  it("mentions certificates only when some can be opened, never a placeholder", () => {
    expect(groupCertificateLabel(1)).toBe("1 sertifikat tersedia");
    expect(groupCertificateLabel(3)).toBe("3 sertifikat tersedia");
    expect(groupCertificateLabel(0)).toBeNull();
  });
});

describe("unit group request paths", () => {
  const filters = { search: " pompa ", status: "COMPLETED", certificate: "AVAILABLE", page: 2 } as const;

  it("sends the same search and filters to the group list as to the unit list", () => {
    const url = new URL(unitGroupListPath("wo 1", filters), "http://x");
    expect(url.pathname).toBe("/customer/work-orders/wo%201/unit-groups");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "pompa",
      status: "COMPLETED",
      certificate: "AVAILABLE",
      page: "2",
    });
    expect(unitGroupListPath("wo", { search: "", status: "", certificate: "", page: 1 })).toBe(
      "/customer/work-orders/wo/unit-groups",
    );
  });

  it("loads a group's units by its opaque key, with the filters still applied", () => {
    const url = new URL(jobListPath("wo", { ...filters, group: "AbC_123-xyz", page: 1 }), "http://x");
    expect(url.pathname).toBe("/customer/work-orders/wo/jobs");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "pompa",
      status: "COMPLETED",
      certificate: "AVAILABLE",
      group: "AbC_123-xyz",
    });
  });

  it("never sends a customer id or an order-line id", () => {
    const path = unitGroupListPath("wo", filters) + jobListPath("wo", { ...filters, group: "k" });
    expect(path).not.toMatch(/customerId|purchaseOrderItem/i);
  });
});
