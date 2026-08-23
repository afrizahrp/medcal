const DOCUMENT_NUMBER_PATTERN = /^[A-Z]{3}\/\d{4}\/\d{2}\/\d{5}$/;

export function formatDocumentNumber(
  prefix: string,
  issuedAt: Date,
  sequence: number,
): string {
  if (!/^[A-Z]{3}$/.test(prefix)) {
    throw new Error(`Invalid prefix: ${prefix}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99999) {
    throw new Error(`Invalid sequence: ${sequence}`);
  }

  const yyyy = issuedAt.getUTCFullYear();
  const mm = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
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
