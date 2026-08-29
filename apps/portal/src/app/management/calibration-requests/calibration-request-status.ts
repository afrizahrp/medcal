export type CalibrationRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_QUOTATION"
  | "CANCELLED"
  | "FULFILLED";

/** User-facing Portal labels. Underlying API/DB values stay on CalibrationRequestStatus. */
export const STATUS_LABELS: Record<CalibrationRequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_QUOTATION: "In Progress",
  CANCELLED: "Cancelled",
  FULFILLED: "Fulfilled",
};

export const STATUS_OPTIONS: CalibrationRequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "IN_QUOTATION",
  "CANCELLED",
  "FULFILLED",
];
