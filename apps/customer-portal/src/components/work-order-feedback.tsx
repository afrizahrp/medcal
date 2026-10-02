"use client";

import { useId, useState } from "react";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_RATINGS,
  describeFeedbackSubmitError,
  ratingStars,
  type FeedbackSubmitError,
} from "../lib/customer-feedback";
import { isUnauthorizedError } from "../lib/customer-query";
import { expireSession } from "../lib/session";
import { useSubmitWorkOrderFeedback, useWorkOrderFeedback } from "../lib/use-customer-queries";
import { buttonPrimary, buttonSecondary, textareaClass } from "../lib/ui-classes";

const cardClass = "rounded-lg border border-slate-200 bg-white p-4";

/**
 * Optional feedback on a finished Work Order, shown inline under its header.
 * Whether it may be shown or submitted is decided by the server. "Nanti saja"
 * only hides the card for this visit; nothing is stored, so it can come back
 * on the next visit while the Work Order is still eligible.
 */
export function WorkOrderFeedback({ workOrderId }: { workOrderId: string }) {
  const query = useWorkOrderFeedback(workOrderId);
  const submit = useSubmitWorkOrderFeedback(workOrderId);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [ratingMissing, setRatingMissing] = useState(false);
  const [error, setError] = useState<FeedbackSubmitError | null>(null);
  const ids = { label: useId(), comment: useId(), error: useId() };

  // The feedback is optional: while it loads, or if it cannot load, the page shows nothing extra.
  const state = query.data;
  if (!state) return null;

  if (state.submitted) {
    return (
      <section aria-label="Feedback" className={cardClass}>
        <p className="font-semibold text-slate-900">Terima kasih atas feedback Anda.</p>
        <p className="mt-1 text-sm text-slate-700">
          Penilaian Anda: <span aria-hidden="true">{ratingStars(state.submitted.rating)}</span>
          <span className="sr-only">{state.submitted.rating} dari 5</span>
        </p>
      </section>
    );
  }

  if (!state.eligible) {
    // The server said no after the card was shown (e.g. the certificate is no longer available).
    return error?.kind === "NOT_ELIGIBLE" ? (
      <p role="alert" className={cardClass}>
        {error.message}
      </p>
    ) : null;
  }
  if (dismissed) return null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submit.isPending) return;
    if (rating === null) {
      setRatingMissing(true);
      return;
    }
    setRatingMissing(false);
    setError(null);
    submit.mutate(
      { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onError: (err) => {
          if (isUnauthorizedError(err)) {
            void expireSession();
            return;
          }
          setError(describeFeedbackSubmitError(err));
        },
      },
    );
  }

  const problem = ratingMissing ? "Pilih penilaian 1 sampai 5 bintang." : (error?.message ?? null);

  return (
    <section aria-labelledby={ids.label} className={cardClass}>
      <form onSubmit={onSubmit} noValidate>
        <h2 id={ids.label} className="font-semibold text-slate-900">
          Bagaimana pengalaman Anda dengan layanan ini?
        </h2>

        {/* All five values get the same treatment; the selected state is a filled star plus the "n dari 5" text, never colour alone. */}
        <div role="radiogroup" aria-labelledby={ids.label} className="mt-3 flex flex-wrap gap-2">
          {FEEDBACK_RATINGS.map((value) => {
            const filled = rating !== null && value <= rating;
            return (
              <label key={value} className="relative">
                <input
                  type="radio"
                  name={`rating-${ids.label}`}
                  value={value}
                  checked={rating === value}
                  onChange={() => {
                    setRating(value);
                    setRatingMissing(false);
                  }}
                  aria-label={`${value} dari 5`}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-xl text-slate-800 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 ${
                    rating === value ? "border-2 border-slate-800 bg-slate-100" : "border-slate-300 bg-white"
                  }`}
                >
                  <span className="mr-1 text-sm font-medium">{value}</span>
                  {filled ? "★" : "☆"}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-sm text-slate-600" aria-live="polite">
          {rating === null ? "Belum dipilih" : `Penilaian: ${rating} dari 5`}
        </p>

        <label htmlFor={ids.comment} className="mt-4 block text-sm font-medium text-slate-900">
          Ceritakan pengalaman Anda (opsional)
        </label>
        <textarea
          id={ids.comment}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={FEEDBACK_COMMENT_MAX}
          rows={4}
          aria-describedby={problem ? ids.error : undefined}
          className={textareaClass}
        />

        {problem ? (
          <p id={ids.error} role="alert" className="mt-3 text-sm text-red-700">
            {problem}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" disabled={submit.isPending} className={buttonPrimary}>
            {submit.isPending ? "Mengirim…" : "Kirim feedback"}
          </button>
          <button type="button" onClick={() => setDismissed(true)} className={buttonSecondary}>
            Nanti saja
          </button>
        </div>
      </form>
    </section>
  );
}
