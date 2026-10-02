"use client";

import { useEffect, useRef, useState } from "react";
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from "../lib/use-debounced-value";
import { buttonSecondary, fieldClass, selectClass } from "../lib/ui-classes";
import type { FilterOption } from "../lib/customer-work-orders";

/**
 * Search box that commits to the URL only after the user stops typing
 * (SEARCH_DEBOUNCE_MS, same as the management lists). Raw keystrokes stay in
 * local state; `onCommit` receives the debounced value. The clear button
 * commits immediately.
 */
export function SearchBox({
  id,
  label,
  placeholder,
  committed,
  onCommit,
}: {
  id: string;
  label: string;
  placeholder: string;
  committed: string;
  onCommit: (value: string) => void;
}) {
  const [input, setInput] = useState(committed);
  const debounced = useDebouncedValue(input, SEARCH_DEBOUNCE_MS);
  const committedRef = useRef(committed);
  committedRef.current = committed;

  useEffect(() => {
    if (debounced.trim() !== committedRef.current) onCommit(debounced.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // The URL can change without the user typing (clear-filters button, back
  // button). When the committed search no longer matches what the box holds or
  // is about to commit, follow the URL. Our own commits never trip this: by
  // then `debounced` already equals `committed`.
  useEffect(() => {
    if (committed !== debounced.trim() && committed !== input.trim()) setInput(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          placeholder={placeholder}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className={`${fieldClass} pr-12`}
        />
        {input ? (
          <button
            type="button"
            aria-label="Hapus pencarian"
            onClick={() => {
              setInput("");
              onCommit("");
            }}
            className="absolute inset-y-0 right-0 my-auto flex h-11 w-11 items-center justify-center rounded-lg text-xl text-slate-600 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T | "";
  options: ReadonlyArray<FilterOption<T>>;
  onChange: (value: T | "") => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T | "")}
        className={selectClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${buttonSecondary} mt-3`}>
      Hapus pencarian &amp; filter
    </button>
  );
}
