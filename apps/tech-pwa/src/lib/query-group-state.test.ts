import { describe, expect, it } from "vitest";
import { combineQueryGroupState } from "./query-group-state";

describe("combineQueryGroupState", () => {
  it("is not pending and not errored when every query in the group is settled and clean", () => {
    const state = combineQueryGroupState([
      { isPending: false, isError: false },
      { isPending: false, isError: false },
    ]);
    expect(state).toEqual({ isPending: false, isError: false, firstErrorIndex: null });
  });

  it("is pending if any single query in the group is still pending", () => {
    const state = combineQueryGroupState([
      { isPending: false, isError: false },
      { isPending: true, isError: false },
    ]);
    expect(state.isPending).toBe(true);
  });

  it("surfaces an error and its index when one query in the group has errored", () => {
    const state = combineQueryGroupState([
      { isPending: false, isError: false },
      { isPending: false, isError: true },
    ]);
    expect(state.isError).toBe(true);
    expect(state.firstErrorIndex).toBe(1);
  });

  it("never hides an error behind pending — both are reported independently", () => {
    // A second query in the group is still refetching while the first has
    // already failed once; the group must not silently drop the error.
    const state = combineQueryGroupState([
      { isPending: false, isError: true },
      { isPending: true, isError: false },
    ]);
    expect(state.isPending).toBe(true);
    expect(state.isError).toBe(true);
    expect(state.firstErrorIndex).toBe(0);
  });

  it("reports the first errored query's index, not the last, when several have failed", () => {
    const state = combineQueryGroupState([
      { isPending: false, isError: false },
      { isPending: false, isError: true },
      { isPending: false, isError: true },
    ]);
    expect(state.firstErrorIndex).toBe(1);
  });

  it("treats an empty group as clean", () => {
    expect(combineQueryGroupState([])).toEqual({
      isPending: false,
      isError: false,
      firstErrorIndex: null,
    });
  });
});
