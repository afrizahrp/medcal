"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  displayToIso,
  isoToDisplay,
  maskDateInput,
  validateDisplayDate,
} from "@/lib/date-utils";

export interface DateFieldProps {
  /** Wire value: `YYYY-MM-DD`, or `""`/`null` when unset. */
  value: string | null;
  /** Emits `YYYY-MM-DD` for a complete valid date, `""` otherwise. */
  onChange: (next: string) => void;
  label?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /**
   * External error (e.g. cross-field: validFrom <= validUntil). Shown whenever
   * set, in addition to the field's own format/validity checks.
   */
  error?: string | null;
  /** Inclusive bounds as `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * The Portal's single date-entry control. Keyboard only, `dd/mm/yyyy` with an
 * input mask (auto `/`), real calendar validation (leap years, 30/31-day
 * months), and an inline error on invalid input. State and payload are always
 * `YYYY-MM-DD` strings — never `Date` objects. The calendar glyph is decorative.
 */
export function DateField({
  value,
  onChange,
  label,
  id,
  name,
  required,
  disabled,
  placeholder = "dd/mm/yyyy",
  error,
  min,
  max,
  className,
  "aria-label": ariaLabel,
}: DateFieldProps) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const errorId = `${inputId}-error`;

  const normalizedValue = value ?? "";
  const lastEmitted = React.useRef<string>(normalizedValue);
  const prevText = React.useRef<string>(isoToDisplay(normalizedValue));
  const [text, setText] = React.useState<string>(() => isoToDisplay(normalizedValue));
  const [touched, setTouched] = React.useState(false);

  // Re-sync from the outside only for changes this field did not originate
  // (form reset, async load) — never clobber what the user is mid-typing.
  React.useEffect(() => {
    if (normalizedValue !== lastEmitted.current) {
      lastEmitted.current = normalizedValue;
      const next = isoToDisplay(normalizedValue);
      prevText.current = next;
      setText(next);
    }
  }, [normalizedValue]);

  function emit(next: string) {
    lastEmitted.current = next;
    if (next !== normalizedValue) onChange(next);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const deleting = raw.length < prevText.current.length;
    const masked = maskDateInput(raw, { trailingSlash: !deleting });
    prevText.current = masked;
    setText(masked);

    const iso = displayToIso(masked);
    if (iso && !isWithinBounds(iso, min, max)) {
      emit("");
      return;
    }
    emit(iso ?? "");
  }

  const boundsError = React.useMemo(() => {
    const iso = displayToIso(text);
    if (!iso) return null;
    if (min && iso < min) return "Tanggal terlalu awal";
    if (max && iso > max) return "Tanggal melewati batas";
    return null;
  }, [text, min, max]);

  const formatError = validateDisplayDate(text, { required });
  // "required" only surfaces after a blur; format/validity errors surface as
  // soon as there is something typed that doesn't parse.
  const showFormatError = text.trim() !== "" || touched;
  const shownError =
    (showFormatError ? (formatError ?? boundsError) : null) ?? error ?? null;

  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
      ) : null}
      <div className="relative">
        <CalendarIcon
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={text}
          aria-label={ariaLabel ?? (label ? undefined : "Tanggal")}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          className={cn(
            "flex h-9 w-full rounded-md border bg-transparent pl-9 pr-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            shownError
              ? "border-red-400 focus-visible:ring-red-400"
              : "border-input focus-visible:ring-ring",
          )}
        />
      </div>
      {shownError ? (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}

function isWithinBounds(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}
