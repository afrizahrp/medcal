import { describe, expect, it } from "vitest";
import {
  initialGuardState,
  onCancel,
  onConfirmLeave,
  onPopState,
  onRequestHome,
  type GuardState,
} from "./unsaved-changes-guard-logic";

/** Simulates the popstate chain that a single `window.history.back()` call
 * triggers: the caller "wins" a `back` effect by re-invoking `onPopState`
 * for each resulting event, exactly like the real hook's listener would. */
function drainBackChain(state: GuardState, isDirty: boolean): GuardState {
  let current = state;
  // Guard against runaway loops in a failing implementation.
  for (let i = 0; i < 10; i += 1) {
    const { state: next, effect } = onPopState(current, isDirty);
    current = next;
    if (effect !== "back") return current;
  }
  throw new Error("drainBackChain did not settle — possible infinite loop");
}

describe("unsaved-changes-guard-logic", () => {
  it("no unsaved changes: a single back gesture settles with the dialog never opened", () => {
    const first = onPopState(initialGuardState, false);
    expect(first.effect).toBe("back");
    expect(first.state.confirmOpen).toBe(false);

    const settled = drainBackChain(initialGuardState, false);
    expect(settled.confirmOpen).toBe(false);
    expect(settled.pendingSkip).toBe(0);
  });

  it("unsaved changes: the first back gesture blocks and opens the dialog exactly once", () => {
    const result = onPopState(initialGuardState, true);
    expect(result.effect).toBe("pushState");
    expect(result.state.confirmOpen).toBe(true);
    expect(result.state.pendingSkip).toBe(0);
  });

  it("cancel (Batal) closes the dialog without any navigation effect", () => {
    const blocked = onPopState(initialGuardState, true).state;
    const cancelled = onCancel(blocked);
    expect(cancelled.confirmOpen).toBe(false);
    expect(cancelled.pendingSkip).toBe(0);
  });

  it("confirm (Keluar) closes the dialog and fully unwinds to the previous screen", () => {
    const blocked = onPopState(initialGuardState, true).state;
    const { state: afterConfirm, effect } = onConfirmLeave(blocked);
    expect(effect).toBe("back");
    expect(afterConfirm.confirmOpen).toBe(false);

    const settled = drainBackChain(afterConfirm, true);
    expect(settled.pendingSkip).toBe(0);
    // The dialog must not reopen while the guard's own programmatic hops
    // (triggered by the user's own confirm) are still draining.
    expect(settled.confirmOpen).toBe(false);
  });

  it("a re-armed dialog (after cancel) still blocks the next attempt, not a stale allow", () => {
    const blockedOnce = onPopState(initialGuardState, true).state;
    const afterCancel = onCancel(blockedOnce);
    const blockedAgain = onPopState(afterCancel, true);
    expect(blockedAgain.effect).toBe("pushState");
    expect(blockedAgain.state.confirmOpen).toBe(true);
  });

  it("becoming clean after a save means the very next attempt is not blocked", () => {
    // Dirty -> blocked -> cancel (dialog closed, screen unchanged) -> user
    // saves (isDirty becomes false) -> next back attempt must pass through.
    const blocked = onPopState(initialGuardState, true).state;
    const afterCancel = onCancel(blocked);
    const settled = drainBackChain(afterCancel, false);
    expect(settled.confirmOpen).toBe(false);
    expect(settled.pendingSkip).toBe(0);
  });

  it("a single user gesture never produces more than one confirmOpen transition", () => {
    // Only the FIRST onPopState call for a gesture may flip confirmOpen; any
    // programmatic continuation from that same gesture (pendingSkip > 0)
    // must never re-evaluate isDirty / reopen the dialog.
    let state = initialGuardState;
    let opens = 0;
    for (let i = 0; i < 5; i += 1) {
      const { state: next, effect } = onPopState(state, true);
      if (next.confirmOpen && !state.confirmOpen) opens += 1;
      state = next;
      if (effect !== "back") break;
    }
    expect(opens).toBe(1);
  });

  describe("onRequestHome (Beranda)", () => {
    it("no unsaved changes: navigates home immediately, no dialog", () => {
      const result = onRequestHome(initialGuardState, false);
      expect(result.effect).toBe("navigateHome");
      expect(result.state.confirmOpen).toBe(false);
    });

    it("unsaved changes: opens the confirm dialog without touching history", () => {
      const result = onRequestHome(initialGuardState, true);
      expect(result.effect).toBe("none");
      expect(result.state.confirmOpen).toBe(true);
    });

    it("Batal after Beranda: closes the dialog, no navigation effect", () => {
      const opened = onRequestHome(initialGuardState, true).state;
      const cancelled = onCancel(opened);
      expect(cancelled.confirmOpen).toBe(false);
    });

    it("Keluar after Beranda: closes the dialog and navigates home exactly once, with no history side effect", () => {
      const opened = onRequestHome(initialGuardState, true).state;
      const { state: afterConfirm, effect } = onConfirmLeave(opened);
      expect(effect).toBe("navigateHome");
      expect(afterConfirm.confirmOpen).toBe(false);
      // Beranda never pushed a duplicate history entry, so confirming it
      // must not schedule any back-navigation hops either.
      expect(afterConfirm.pendingSkip).toBe(0);
    });

    it("does not cross-contaminate with a Back-triggered dialog: confirming Back still unwinds history, not home", () => {
      const blockedByBack = onPopState(initialGuardState, true).state;
      const { effect } = onConfirmLeave(blockedByBack);
      expect(effect).toBe("back");
    });

    it("re-requesting Beranda after Batal still blocks while dirty", () => {
      const opened = onRequestHome(initialGuardState, true).state;
      const cancelled = onCancel(opened);
      const reopened = onRequestHome(cancelled, true);
      expect(reopened.effect).toBe("none");
      expect(reopened.state.confirmOpen).toBe(true);
    });

    it("becoming clean after a save means the next Beranda tap is not blocked", () => {
      const opened = onRequestHome(initialGuardState, true).state;
      const cancelled = onCancel(opened);
      const result = onRequestHome(cancelled, false);
      expect(result.effect).toBe("navigateHome");
      expect(result.state.confirmOpen).toBe(false);
    });
  });
});
