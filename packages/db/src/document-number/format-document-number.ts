const DOCUMENT_NUMBER_PATTERN = /^[A-Z]{3}\/\d{4}\/\d{2}\/\d{5}$/;

/** Business timezone for numbers whose year/month must follow Jakarta-local time. */
export const BUSINESS_TIME_ZONE = "Asia/Jakarta";

/**
 * Calendar year/month of `date`. Without `timeZone` this is UTC (the historic
 * behaviour of every existing document type). With an IANA `timeZone` it is
 * the wall-clock year/month in that zone, so a Jakarta-local date boundary
 * (e.g. 2026-12-31T18:00Z = 2027-01-01 01:00 WIB) never disagrees with the
 * number printed on the document.
 */
export function getZonedYearMonth(
  date: Date,
  timeZone?: string,
): { year: number; month: number } {
  if (!timeZone) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Unable to resolve year/month for time zone: ${timeZone}`);
  }
  return { year, month };
}

export function formatDocumentNumber(
  prefix: string,
  issuedAt: Date,
  sequence: number,
  timeZone?: string,
): string {
  if (!/^[A-Z]{3}$/.test(prefix)) {
    throw new Error(`Invalid prefix: ${prefix}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99999) {
    throw new Error(`Invalid sequence: ${sequence}`);
  }

  const { year: yyyy, month } = getZonedYearMonth(issuedAt, timeZone);
  const mm = String(month).padStart(2, "0");
  const nnnnn = String(sequence).padStart(5, "0");

  return `${prefix}/${yyyy}/${mm}/${nnnnn}`;
}

export function isValidDocumentNumber(value: string): boolean {
  return DOCUMENT_NUMBER_PATTERN.test(value);
}

export function parseDocumentNumberYearMonth(value: string): {
  year: number;
  month: number;
} {
  const match = value.match(/^[A-Z]{3}\/(\d{4})\/(\d{2})\/\d{5}$/);
  if (!match) {
    throw new Error(`Invalid document number format: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}
