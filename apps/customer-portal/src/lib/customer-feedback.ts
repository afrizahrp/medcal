/**
 * Client view of the customer-feedback API. Eligibility is decided by the
 * server on every GET and POST; nothing here is a source of truth for it.
 */
import { ApiError } from "@medcal/shared";

export interface CustomerFeedbackState {
  eligible: boolean;
  submitted: { rating: number; submittedAt: string } | null;
}

export const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;
export const FEEDBACK_COMMENT_MAX = 2000;

export function feedbackPath(workOrderId: string): string {
  return `/customer/work-orders/${encodeURIComponent(workOrderId)}/feedback`;
}

/** ★ for each point up to the rating, ☆ for the rest. */
export function ratingStars(rating: number, max = 5): string {
  const filled = Math.max(0, Math.min(max, Math.round(rating)));
  return "★".repeat(filled) + "☆".repeat(max - filled);
}

export type FeedbackSubmitErrorKind =
  | "ALREADY_SUBMITTED"
  | "NOT_ELIGIBLE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "GENERIC";

export interface FeedbackSubmitError {
  kind: FeedbackSubmitErrorKind;
  message: string;
  /** The server state may have changed, so the feedback query should be refetched. */
  refetch: boolean;
}

export function describeFeedbackSubmitError(err: unknown): FeedbackSubmitError {
  const status = err instanceof ApiError ? err.status : null;
  const code = err instanceof ApiError && typeof err.data?.code === "string" ? err.data.code : null;

  if (status === 409 && code === "FEEDBACK_ALREADY_SUBMITTED") {
    return { kind: "ALREADY_SUBMITTED", message: "Feedback untuk Work Order ini sudah dikirim.", refetch: true };
  }
  if (status === 409 && code === "FEEDBACK_NOT_ELIGIBLE") {
    return {
      kind: "NOT_ELIGIBLE",
      message: "Work Order ini belum dapat diberi feedback saat ini.",
      refetch: true,
    };
  }
  if (status === 404) {
    return { kind: "NOT_FOUND", message: "Work Order tidak ditemukan.", refetch: true };
  }
  if (status === 403) {
    return {
      kind: "FORBIDDEN",
      message: "Permintaan ditolak. Muat ulang halaman, lalu coba lagi.",
      refetch: false,
    };
  }
  if (status === 400) {
    return {
      kind: "INVALID",
      message: "Penilaian atau komentar tidak valid. Periksa isian Anda, lalu coba lagi.",
      refetch: false,
    };
  }
  return { kind: "GENERIC", message: "Feedback belum bisa dikirim. Coba lagi dalam beberapa saat.", refetch: false };
}
