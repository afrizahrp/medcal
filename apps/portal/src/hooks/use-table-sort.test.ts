import { describe, expect, it } from "vitest";
import { resolveNextSort } from "./use-table-sort";

const DEFAULT_FIELD = "createdAt";
const DEFAULT_DIR = "desc" as const;

describe("resolveNextSort", () => {
  it("sorts a newly clicked column ascending", () => {
    expect(
      resolveNextSort({ sortBy: "createdAt", sortDir: "desc" }, "name", DEFAULT_FIELD, DEFAULT_DIR),
    ).toEqual({ sortBy: "name", sortDir: "asc", isDefault: false });
  });

  it("flips asc → desc when the active column is clicked again", () => {
    expect(
      resolveNextSort({ sortBy: "name", sortDir: "asc" }, "name", DEFAULT_FIELD, DEFAULT_DIR),
    ).toEqual({ sortBy: "name", sortDir: "desc", isDefault: false });
  });

  it("flips desc → asc on a third click", () => {
    expect(
      resolveNextSort({ sortBy: "name", sortDir: "desc" }, "name", DEFAULT_FIELD, DEFAULT_DIR),
    ).toMatchObject({ sortBy: "name", sortDir: "asc" });
  });

  it("marks the module default (field + dir) so the caller can clear the URL", () => {
    // active = name asc; clicking createdAt → asc first, not default yet
    expect(
      resolveNextSort({ sortBy: "name", sortDir: "asc" }, "createdAt", DEFAULT_FIELD, DEFAULT_DIR)
        .isDefault,
    ).toBe(false);
    // active = createdAt asc; clicking it again → createdAt desc == default
    expect(
      resolveNextSort(
        { sortBy: "createdAt", sortDir: "asc" },
        "createdAt",
        DEFAULT_FIELD,
        DEFAULT_DIR,
      ),
    ).toEqual({ sortBy: "createdAt", sortDir: "desc", isDefault: true });
  });
});
