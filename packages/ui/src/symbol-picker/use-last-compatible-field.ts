import { useEffect, useRef, type RefObject } from "react";
import { isCompatibleTextField, type TextField } from "./insert-symbol";

export interface FieldSelection {
  start: number;
  end: number;
}

/**
 * Clicking the picker FAB blurs the active input before the click handler runs.
 * Track the last compatible field (and its caret) continuously, excluding the picker itself.
 */
export function useLastCompatibleField(pickerRootRef: RefObject<HTMLElement | null>) {
  const fieldRef = useRef<TextField | null>(null);
  const selectionRef = useRef<FieldSelection>({ start: 0, end: 0 });

  useEffect(() => {
    function isInsidePicker(node: EventTarget | null): boolean {
      return Boolean(
        pickerRootRef.current && node instanceof Node && pickerRootRef.current.contains(node),
      );
    }

    function capture(el: TextField) {
      fieldRef.current = el;
      selectionRef.current = {
        start: el.selectionStart ?? el.value.length,
        end: el.selectionEnd ?? el.value.length,
      };
    }

    function onFocusIn(event: FocusEvent) {
      if (isInsidePicker(event.target)) return;
      if (isCompatibleTextField(event.target)) capture(event.target);
    }

    function onSelectionMaybeChanged() {
      const active = document.activeElement;
      if (isInsidePicker(active)) return;
      if (isCompatibleTextField(active)) capture(active);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("selectionchange", onSelectionMaybeChanged);
    document.addEventListener("keyup", onSelectionMaybeChanged);
    document.addEventListener("mouseup", onSelectionMaybeChanged);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("selectionchange", onSelectionMaybeChanged);
      document.removeEventListener("keyup", onSelectionMaybeChanged);
      document.removeEventListener("mouseup", onSelectionMaybeChanged);
    };
  }, [pickerRootRef]);

  return { fieldRef, selectionRef };
}
