/**
 * Confirmation copy for the two irreversible-in-effect job actions (UX-01):
 * Submit for Review ("Kirim hasil ke Manajer Teknis") and Complete Job
 * ("Selesai"). Kept as plain data — not JSX — so the wording can be unit
 * tested without rendering, and so `job-detail-ui.tsx` / `measurements/page.tsx`
 * consume one shared source of truth for the message instead of duplicating
 * copy at each call site.
 *
 * This module only carries display copy. It does not gate the actions —
 * `canSubmitForReview` / `canCompleteJob` / the disabled-reason logic in
 * `page.tsx` remain the sole source of truth for whether the action is even
 * available; this confirmation is shown only after that gate already allowed
 * the tap.
 */

export interface JobActionConfirmationCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

export const SUBMIT_FOR_REVIEW_CONFIRMATION: JobActionConfirmationCopy = {
  title: "Kirim hasil ke Manajer Teknis?",
  message:
    "Hasil kalibrasi pada attempt saat ini akan dikirim untuk ditinjau oleh Manajer Teknis. " +
    "Setelah dikirim, attempt ini akan terkunci dan tidak dapat diubah lagi. " +
    "Pastikan semua data sudah benar sebelum melanjutkan.",
  confirmLabel: "Kirim",
};

export const COMPLETE_JOB_CONFIRMATION: JobActionConfirmationCopy = {
  title: "Selesaikan job ini?",
  message:
    "Job ini akan diselesaikan (finalisasi). " +
    "Pastikan seluruh pekerjaan yang diperlukan sudah lengkap sebelum melanjutkan.",
  confirmLabel: "Selesai",
};
