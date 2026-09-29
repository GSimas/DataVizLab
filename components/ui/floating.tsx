import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Renders floating layers at the end of <body>, outside clipping/transformed ancestors. */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

type Placement = "bottom-start" | "bottom-end";
type Options = { placement?: Placement; offset?: number; matchWidth?: boolean; maxHeight?: number };

/**
 * Pins a fixed-position floating element to its anchor, flipping above when
 * there is no room below. Returns the ref for the floating element; styles are
 * written directly, so scrolling never re-renders.
 */
export function useAnchoredPosition<T extends HTMLElement>(anchor: RefObject<HTMLElement | null>, active: boolean, { placement = "bottom-start", offset = 6, matchWidth = false, maxHeight = 320 }: Options = {}) {
  const floating = useRef<T>(null);
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      const target = anchor.current;
      const el = floating.current;
      if (!target || !el) return;
      const rect = target.getBoundingClientRect();
      const margin = 8;
      const below = window.innerHeight - rect.bottom - offset - margin;
      const above = rect.top - offset - margin;
      const flip = below < Math.min(maxHeight, 220) && above > below;
      el.style.position = "fixed";
      el.style.maxHeight = `${Math.max(140, Math.min(maxHeight, flip ? above : below))}px`;
      el.style.top = flip ? "" : `${rect.bottom + offset}px`;
      el.style.bottom = flip ? `${window.innerHeight - rect.top + offset}px` : "";
      if (matchWidth) el.style.minWidth = `${rect.width}px`;
      const width = el.offsetWidth;
      const left = placement === "bottom-end" ? rect.right - width : rect.left;
      el.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`;
      el.dataset.side = flip ? "top" : "bottom";
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [active, anchor, placement, offset, matchWidth, maxHeight]);
  return floating;
}

/** Calls `onOutside` for pointer presses outside every given element. */
export function useOutsidePress(refs: Array<RefObject<HTMLElement | null>>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onOutside();
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [refs, active, onOutside]);
}
