"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { filterSymbols } from "./filter-symbols";
import { insertSymbolAtSelection, isCompatibleTextField } from "./insert-symbol";
import { readRecentSymbols, rememberRecentSymbol } from "./recent-symbols";
import {
  SYMBOL_CATEGORY_LABELS,
  SYMBOL_CATEGORY_ORDER,
  findSymbolEntry,
  quickSymbolEntries,
  symbolsInCategory,
  type SymbolEntry,
} from "./symbol-registry";
import { useLastCompatibleField } from "./use-last-compatible-field";

export function GlobalSymbolPicker({
  fabClassName,
}: {
  /** Replaces default bottom/right positioning (e.g. to clear another FAB). */
  fabClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const panelId = useId();
  const { fieldRef, selectionRef } = useLastCompatibleField(rootRef);

  useEffect(() => {
    setRecent(readRecentSymbols());
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setStatus(null);
    }
  }, [open]);

  const pickSymbol = useCallback(
    (symbol: string) => {
      const field = fieldRef.current;
      if (field && document.contains(field) && isCompatibleTextField(field)) {
        // Restore the caret captured before the picker stole focus, then insert.
        field.focus();
        field.setSelectionRange(selectionRef.current.start, selectionRef.current.end);
        insertSymbolAtSelection(field, symbol, selectionRef.current);
        setRecent((current) => rememberRecentSymbol(symbol, current));
        setOpen(false);
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(symbol).then(
          () => {
            setStatus(`Copied ${symbol}`);
            setRecent((current) => rememberRecentSymbol(symbol, current));
          },
          () => setStatus("No text field selected"),
        );
        return;
      }
      setStatus("No text field selected");
    },
    [fieldRef, selectionRef],
  );

  const filtered = filterSymbols(query);
  const searching = query.trim().length > 0;
  const recentEntries = recent
    .map((symbol) => findSymbolEntry(symbol))
    .filter((entry): entry is SymbolEntry => entry != null);

  return (
    <div
      ref={rootRef}
      data-symbol-picker=""
      className={["fixed z-40", fabClassName ?? "bottom-6 right-6 sm:bottom-8 sm:right-8"].join(" ")}
    >
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Insert Symbol"
          aria-modal="false"
          className="absolute bottom-12 right-0 z-50 flex max-h-[min(28rem,calc(100vh-6rem))] w-[20rem] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-slate-200 bg-white p-3 text-slate-900 shadow-md"
        >
          <div className="mb-2">
            <label htmlFor={searchId} className="sr-only">
              Search symbol
            </label>
            <input
              ref={searchRef}
              id={searchId}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol..."
              autoComplete="off"
              className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-400"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {searching ? (
              <SymbolGrid
                label="Results"
                entries={filtered}
                onPick={pickSymbol}
                empty="No symbols match."
              />
            ) : (
              <>
                <SymbolGrid label="Quick" entries={quickSymbolEntries()} onPick={pickSymbol} />
                {recentEntries.length > 0 ? (
                  <SymbolGrid label="Recent" entries={recentEntries} onPick={pickSymbol} />
                ) : null}
                {SYMBOL_CATEGORY_ORDER.map((category) => (
                  <SymbolGrid
                    key={category}
                    label={SYMBOL_CATEGORY_LABELS[category]}
                    entries={symbolsInCategory(category)}
                    onPick={pickSymbol}
                  />
                ))}
              </>
            )}
          </div>

          <p className="mt-2 text-[11px] text-slate-400" aria-live="polite">
            {status ?? "Ctrl+Shift+M"}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-medium text-slate-700 shadow-md hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label="Insert Symbol"
        title="Insert Symbol"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        Ω
      </button>
    </div>
  );
}

function SymbolGrid({
  label,
  entries,
  onPick,
  empty,
}: {
  label: string;
  entries: SymbolEntry[];
  onPick: (symbol: string) => void;
  empty?: string;
}) {
  return (
    <section className="mb-2 last:mb-0">
      <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</h2>
      {entries.length === 0 ? (
        <p className="px-1 py-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {entries.map((entry) => (
            <button
              key={`${label}-${entry.symbol}`}
              type="button"
              title={entry.name}
              aria-label={entry.name}
              className="flex h-8 min-w-8 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 text-sm text-slate-800 hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              onClick={() => onPick(entry.symbol)}
            >
              {entry.symbol}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
