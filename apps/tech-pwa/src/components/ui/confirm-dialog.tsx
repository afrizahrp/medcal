"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  /** Defaults to "Batal" — the safe/stay action, matching existing app copy. */
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Red confirm button for actions that lock/finalize something (Submit, Complete). */
  destructive?: boolean;
  /** Disables the confirm button and swaps its label while the action is in flight. */
  confirmPending?: boolean;
  confirmPendingLabel?: string;
}

/**
 * Shared confirm/cancel modal, extracted from the identity-correction
 * wizard's `ExitConfirmDialog` — the one confirmation dialog that previously
 * existed in Tech-PWA — so it can be reused for the unsaved-changes guard and
 * for irreversible job actions (Submit for Review, Complete Job) instead of
 * each screen hand-rolling its own overlay.
 *
 * Adds focus management the original dialog did not have: focus moves into
 * the dialog (onto Cancel, the safe default) when it opens, Tab/Shift+Tab is
 * trapped between Cancel and Confirm while it is open, Escape triggers
 * Cancel, and focus is restored to whatever triggered the dialog on close.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  cancelLabel = "Batal",
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = false,
  confirmPending = false,
  confirmPendingLabel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
    >
      <div ref={dialogRef} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{message}</div>
        <div className="mt-5 flex flex-col gap-2">
          <Button ref={cancelRef} variant="secondary" fullWidth onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            fullWidth
            disabled={confirmPending}
            onClick={onConfirm}
            className={destructive ? "bg-red-600 active:bg-red-700 disabled:bg-slate-300" : undefined}
          >
            {confirmPending ? (confirmPendingLabel ?? "Memproses…") : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
