export type TextField = HTMLInputElement | HTMLTextAreaElement;

const SKIP_INPUT_TYPES = new Set([
  "number",
  "email",
  "search",
  "password",
  "checkbox",
  "radio",
  "file",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "color",
  "range",
  "hidden",
  "button",
  "submit",
  "reset",
  "image",
  "tel",
  "url",
]);

export function isCompatibleInputType(type: string | undefined): boolean {
  const t = (type || "text").toLowerCase();
  if (SKIP_INPUT_TYPES.has(t)) return false;
  return t === "text";
}

export function isCompatibleTextField(el: EventTarget | null): el is TextField {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly && !el.closest("[data-symbol-picker]");
  }
  if (el instanceof HTMLInputElement) {
    return (
      isCompatibleInputType(el.type) &&
      !el.disabled &&
      !el.readOnly &&
      !el.closest("[data-symbol-picker]")
    );
  }
  return false;
}

export function applySymbolInsert(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  symbol: string,
  maxLength?: number,
): { nextValue: string; caret: number } {
  const start = clampIndex(Math.min(selectionStart, selectionEnd), value.length);
  const end = clampIndex(Math.max(selectionStart, selectionEnd), value.length);
  let insert = symbol;
  if (maxLength != null && maxLength > 0) {
    const room = maxLength - (value.length - (end - start));
    if (room <= 0) {
      return { nextValue: value, caret: end };
    }
    if (insert.length > room) insert = insert.slice(0, room);
  }
  return {
    nextValue: value.slice(0, start) + insert + value.slice(end),
    caret: start + insert.length,
  };
}

export function insertSymbolAtSelection(
  el: TextField,
  symbol: string,
  selection?: { start: number; end: number },
): boolean {
  const start = selection?.start ?? el.selectionStart ?? el.value.length;
  const end = selection?.end ?? el.selectionEnd ?? el.value.length;
  const limit = el.maxLength > 0 ? el.maxLength : undefined;
  const { nextValue, caret } = applySymbolInsert(el.value, start, end, symbol, limit);
  if (nextValue === el.value) return false;

  // Use the native prototype setter so React's value tracker still sees a change
  // when the following `input` event fires (required for controlled fields).
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, nextValue);
  } else {
    el.value = nextValue;
  }

  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: symbol,
    }),
  );

  el.focus();
  el.setSelectionRange(caret, caret);
  return true;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.round(index), length));
}
