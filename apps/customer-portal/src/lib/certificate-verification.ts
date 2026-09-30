/**
 * Client view of GET /certificate-verification/:token — the minimal, id-free
 * DTO the API returns to someone who scanned a certificate QR code.
 */
export type CertificateVerificationStatus = "VALID" | "EXPIRED" | "REVOKED" | "SUPERSEDED";

export interface CertificateVerification {
  number: string;
  status: CertificateVerificationStatus;
  issuedAt: string | null;
  validUntil: string | null;
  customerName: string;
  device: { name: string; brand: string | null; model: string | null };
  pdfAvailable: boolean;
}

export interface StatusPresentation {
  label: string;
  message: string;
  tone: "ok" | "warn" | "bad";
}

/** What the verification page tells the reader about each state — never just "exists". */
export function presentStatus(status: CertificateVerificationStatus): StatusPresentation {
  switch (status) {
    case "VALID":
      return { label: "Sertifikat valid", message: "Sertifikat ini terdaftar dan masih berlaku.", tone: "ok" };
    case "EXPIRED":
      return {
        label: "Sertifikat kedaluwarsa",
        message: "Sertifikat ini terdaftar, tetapi masa berlakunya telah berakhir.",
        tone: "warn",
      };
    case "REVOKED":
      return {
        label: "Sertifikat dicabut",
        message: "Sertifikat ini telah dicabut dan tidak boleh digunakan.",
        tone: "bad",
      };
    case "SUPERSEDED":
      return {
        label: "Sertifikat telah diganti",
        message: "Sertifikat ini telah digantikan oleh sertifikat yang lebih baru.",
        tone: "bad",
      };
  }
}

/** Shape check mirroring the API (32 random bytes, base64url) so obvious garbage never triggers a request. */
export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}
