/**
 * Pure decision logic behind `useUnsavedChangesGuard` (see `use-unsaved-changes-guard.ts`),
 * kept framework/DOM-free so it can be unit tested under Tech-PWA's existing
 * Vitest config (`environment: "node"`, no jsdom/RTL installed).
 *
 * Model: the hook arms a screen by pushing one duplicate history entry for the
 * current URL. Because of that duplicate, ANY back-navigation — the Tech-PWA
 * header back button (which calls `router.back()`, itself a thin wrapper over
 * `window.history.back()`) or a hardware/edge-swipe back gesture — first
 * "consumes" the duplicate before it can reach the previous screen. That
 * consumption fires one `popstate` event, which is this module's single
 * decision point:
 *
 *  - not dirty  → silently continue one more step back (`effect: "back"`,
 *    `pendingSkip` becomes 1) so the net result is exactly what plain
 *    `router.back()` would have done — no dialog, no behavior change.
 *  - dirty      → re-arm (push another duplicate) and open the confirm
 *    dialog (`effect: "pushState"`).
 *
 * Because both trigger sources fire the same native `popstate` event exactly
 * once per user gesture, there is only ever one decision per gesture — the
 * dialog cannot be shown twice for a single back action.
 *
 * The "Beranda" header button is a *separate* trigger: `AppHeader`'s default
 * handler does a full-page `window.location.assign("/jobs")`, which never
 * fires `popstate` and never touches history — it's an unload, not a
 * navigation this guard can intercept after the fact. So `onRequestHome` is a
 * second, independent decision point, called directly from the screen's
 * `onHome` handler *before* any navigation happens, not from a history
 * listener. `trigger` records which of the two decision points opened the
 * dialog, so `onConfirmLeave` knows whether finishing "Keluar" means
 * completing a `popstate`-driven back (two programmatic hops, as before) or
 * simply invoking the caller-supplied home navigation once.
 */

export interface GuardState {
  /** Remaining programmatic `history.back()` calls still in flight. */
  pendingSkip: number;
  confirmOpen: boolean;
  /** Which decision point opened the dialog currently open (or last open). */
  trigger: "back" | "home" | null;
}

export const initialGuardState: GuardState = { pendingSkip: 0, confirmOpen: false, trigger: null };

export type GuardEffect = "back" | "pushState" | "navigateHome" | "none";

export interface GuardTransition {
  state: GuardState;
  effect: GuardEffect;
}

/** Call on every `popstate` event while the guard is armed. */
export function onPopState(state: GuardState, isDirty: boolean): GuardTransition {
  if (state.pendingSkip > 0) {
    const pendingSkip = state.pendingSkip - 1;
    return {
      state: { ...state, pendingSkip },
      effect: pendingSkip > 0 ? "back" : "none",
    };
  }
  if (!isDirty) {
    return { state: { ...state, pendingSkip: 1 }, effect: "back" };
  }
  return { state: { ...state, confirmOpen: true, trigger: "back" }, effect: "pushState" };
}

/**
 * Call when the Beranda button is tapped while the guard is armed. Clean
 * state is a no-op for the guard (`effect: "navigateHome"` fires immediately,
 * matching today's behavior exactly); dirty state opens the same confirm
 * dialog without touching history, since nothing has navigated yet.
 */
export function onRequestHome(state: GuardState, isDirty: boolean): GuardTransition {
  if (!isDirty) {
    return { state, effect: "navigateHome" };
  }
  return { state: { ...state, confirmOpen: true, trigger: "home" }, effect: "none" };
}

/** "Batal" / Stay — close the dialog, no navigation. */
export function onCancel(state: GuardState): GuardState {
  return { ...state, confirmOpen: false, trigger: null };
}

/**
 * "Keluar" / Leave — close the dialog and finish leaving.
 *
 * - Opened by `onRequestHome` (`trigger: "home"`): no history was touched to
 *   open the dialog, so finishing is just invoking the home navigation once
 *   (`effect: "navigateHome"`) — the hook calls back into the same callback
 *   `onRequestHome` was given.
 * - Opened by `onPopState` (`trigger: "back"`, the default): two programmatic
 *   hops are needed, as before — one to undo the re-armed duplicate pushed
 *   when this dialog opened, one to actually reach the previous screen.
 */
export function onConfirmLeave(state: GuardState): GuardTransition {
  if (state.trigger === "home") {
    return { state: { ...state, confirmOpen: false, trigger: null }, effect: "navigateHome" };
  }
  return {
    state: { ...state, confirmOpen: false, trigger: null, pendingSkip: state.pendingSkip + 2 },
    effect: "back",
  };
}
