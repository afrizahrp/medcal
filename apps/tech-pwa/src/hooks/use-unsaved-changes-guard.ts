"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialGuardState,
  onCancel as reduceCancel,
  onConfirmLeave as reduceConfirmLeave,
  onPopState as reducePopState,
  onRequestHome as reduceRequestHome,
  type GuardEffect,
  type GuardState,
} from "./unsaved-changes-guard-logic";

export interface UnsavedChangesGuard {
  /** True while the "unsaved changes will be lost" confirmation should render. */
  confirmOpen: boolean;
  /** Stay on the current screen ("Batal") — no navigation happens. */
  cancel: () => void;
  /** Discard the guard and let the pending back-navigation complete ("Keluar"). */
  confirmLeave: () => void;
  /**
   * Call from the screen's `onHome` handler instead of navigating directly.
   * Clean state: `navigateHome` runs immediately, unchanged from today.
   * Dirty state: opens the same confirm dialog; `navigateHome` runs only if
   * the technician confirms via `confirmLeave` (Keluar).
   */
  requestHome: (navigateHome: () => void) => void;
}

/**
 * Adds a single confirmation step in front of back-navigation — the Tech-PWA
 * header back button AND a hardware/edge-swipe back gesture — while `isDirty`
 * is true. Extracted from the identity-correction wizard's proven popstate
 * trap (`identity-correction/layout.tsx`'s `guardArmed` + `ExitConfirmDialog`),
 * generalized for screens whose "unsaved" status changes over time (typed but
 * not yet saved local drafts) rather than being permanently armed for the
 * whole screen's lifetime.
 *
 * Both trigger sources are covered by ONE `popstate` listener: Tech-PWA's
 * `AppHeader` calls `router.back()` when a screen doesn't supply a custom
 * `onBack`, and Next's `router.back()` is a thin wrapper over
 * `window.history.back()`, which fires the same native `popstate` event a
 * hardware back gesture would. That is what prevents the double-dialog risk
 * called out for this guard: there is exactly one decision point per user
 * gesture, not two independent listeners racing each other. See
 * `unsaved-changes-guard-logic.ts` for the (unit-tested) decision table this
 * hook is a thin, DOM-touching wrapper around.
 *
 * Pass `enabled: false` to fully disable the guard (no listener attached, no
 * history entry pushed) — used where a wrapper page conditionally delegates
 * its entire render to a child component that owns its own guard instance,
 * to avoid two guards arming on the same screen at once.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  options?: { enabled?: boolean },
): UnsavedChangesGuard {
  const enabled = options?.enabled ?? true;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const stateRef = useRef<GuardState>(initialGuardState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Set on every requestHome() call so a later confirmLeave() (trigger:
  // "home") knows which navigation to run. Only ever invoked for a dialog
  // that requestHome itself opened, so there is no stale-callback risk.
  const navigateHomeRef = useRef<(() => void) | null>(null);

  const applyTransition = useCallback((next: GuardState, effect: GuardEffect) => {
    stateRef.current = next;
    setConfirmOpen(next.confirmOpen);
    if (effect === "back") {
      window.history.back();
    } else if (effect === "pushState") {
      window.history.pushState(null, "", window.location.href);
    } else if (effect === "navigateHome") {
      navigateHomeRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    // Arm: one duplicate history entry so the first back-navigation attempt
    // is interceptable instead of leaving immediately.
    window.history.pushState(null, "", window.location.href);

    function handlePopState() {
      const { state, effect } = reducePopState(stateRef.current, isDirtyRef.current);
      applyTransition(state, effect);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [enabled, applyTransition]);

  const cancel = useCallback(() => {
    applyTransition(reduceCancel(stateRef.current), "none");
  }, [applyTransition]);

  const confirmLeave = useCallback(() => {
    const { state, effect } = reduceConfirmLeave(stateRef.current);
    applyTransition(state, effect);
  }, [applyTransition]);

  const requestHome = useCallback(
    (navigateHome: () => void) => {
      navigateHomeRef.current = navigateHome;
      const { state, effect } = reduceRequestHome(stateRef.current, isDirtyRef.current);
      applyTransition(state, effect);
    },
    [applyTransition],
  );

  return { confirmOpen, cancel, confirmLeave, requestHome };
}
