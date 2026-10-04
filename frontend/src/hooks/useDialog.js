import { useEffect, useRef } from "react";

// Keep keyboard navigation inside the topmost dialog and return focus on close.
const dialogs = [];
export default function useDialog(onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const previous = document.activeElement;
    dialogs.push(panel);
    const focusable = () =>
      [
        ...panel.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select,a[href],[tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
    requestAnimationFrame(() =>
      (
        panel.querySelector('input:not([type="file"])') ||
        focusable()[0] ||
        panel
      ).focus(),
    );
    const onKey = (e) => {
      if (dialogs.at(-1) !== panel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current?.();
      }
      if (e.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (!first) {
        e.preventDefault();
        panel.focus();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      dialogs.splice(dialogs.indexOf(panel), 1);
      document.removeEventListener("keydown", onKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
