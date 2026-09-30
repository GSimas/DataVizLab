import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/** Motion tokens, mirrored by the --dur-* custom properties in globals.css. */
export const DURATION = { fast: 140, base: 220, slow: 360 } as const;

export const motionReduced = () =>
  typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced";

/** A duration in ms that collapses to 0 when the viewer asked for reduced motion. */
export const motionMs = (ms: number) => (motionReduced() ? 0 : ms);

type ViewTransitionLike = { ready: Promise<void>; updateCallbackDone: Promise<void>; finished: Promise<void> };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransitionLike };

/**
 * Runs a state update inside a View Transition so the old and new UI cross-fade.
 * `kind` lets CSS pick the choreography (see ::view-transition rules).
 * Falls back to a plain update without support or with reduced motion.
 */
export function withViewTransition(update: () => void, kind: "page" | "theme" | "locale" | "font" = "page", zoom = 1) {
  const doc = document as TransitionDocument;
  // The guided tour animates its own spotlight; a page snapshot would ghost it.
  if (!doc.startViewTransition || motionReduced() || document.documentElement.dataset.tour === "on") { update(); return; }
  const root = document.documentElement;
  root.dataset.vt = kind;
  // Text-size swaps grow or shrink the outgoing page towards the new size while the new one settles in.
  root.style.setProperty("--vt-zoom", String(zoom));
  const transition = doc.startViewTransition(() => flushSync(update));
  // A skipped or timed-out transition (e.g. a throttled background tab) rejects
  // these promises; the DOM update itself still happens, so they are safe to ignore.
  const ignore = () => undefined;
  transition.ready.catch(ignore);
  transition.updateCallbackDone.catch(ignore);
  const cleanup = () => { if (root.dataset.vt === kind) { delete root.dataset.vt; root.style.removeProperty("--vt-zoom"); } };
  transition.finished.then(cleanup, cleanup);
}

/**
 * Keeps an element mounted while its exit animation plays.
 * `closing` is true between `open` turning false and the unmount.
 */
export function usePresence(open: boolean, exitMs: number = DURATION.fast) {
  const [mounted, setMounted] = useState(open);
  // Mount synchronously on open (derived state), unmount after the exit animation.
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), motionMs(exitMs));
    return () => window.clearTimeout(timer);
  }, [open, mounted, exitMs]);
  return { mounted: mounted || open, closing: mounted && !open };
}
