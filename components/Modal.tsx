import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { DURATION, motionMs } from "../lib/motion";
import { Portal } from "./ui/floating";

type Props = {
  onClose: () => void;
  labelledBy: string;
  closeLabel: string;
  className?: string;
  /** Pass a function to receive `close`, which plays the exit animation before `onClose`. */
  children: ReactNode | ((close: () => void) => ReactNode);
};

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Modal({ onClose, labelledBy, closeLabel, className = "", children }: Props) {
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Closing plays the exit animation first; the parent unmounts us afterwards.
  const close = useCallback(() => setClosing(true), []);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => onCloseRef.current(), motionMs(DURATION.base));
    return () => window.clearTimeout(timer);
  }, [closing]);

  // Focus management: move focus in, trap Tab, lock page scroll, restore focus on exit.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) (dialog.querySelector<HTMLElement>("[autofocus]") ?? dialog.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [close]);

  const state = closing ? "closed" : "open";
  return (
    <Portal>
      <div className="modal-backdrop" data-state={state} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <section ref={dialogRef} className={`modal ${className}`} data-state={state} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
          <button className="modal-close" type="button" onClick={close} aria-label={closeLabel} data-tip={closeLabel}><X size={18} /></button>
          {typeof children === "function" ? children(close) : children}
        </section>
      </div>
    </Portal>
  );
}
