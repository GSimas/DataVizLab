import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePresence } from "../../lib/motion";
import { Portal } from "./floating";

type Tip = { text: string; target: HTMLElement };

const SHOW_DELAY = 380;
const WARM_WINDOW = 400;

/**
 * One tooltip for the whole app: any element with `data-tip` gets a styled hint
 * on hover (mouse/pen) or keyboard focus, replacing the browser's native title.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { mounted, closing } = usePresence(visible);

  useEffect(() => {
    let showTimer = 0;
    let lastHidden = 0;
    let current: HTMLElement | null = null;
    const show = (target: HTMLElement) => {
      const text = target.dataset.tip;
      if (!text || target === current) return;
      current = target;
      window.clearTimeout(showTimer);
      const warm = performance.now() - lastHidden < WARM_WINDOW;
      showTimer = window.setTimeout(() => { setTip({ text, target }); setVisible(true); }, warm ? 0 : SHOW_DELAY);
    };
    const hide = () => {
      window.clearTimeout(showTimer);
      if (current) lastHidden = performance.now();
      current = null;
      setVisible(false);
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = (event.target as Element).closest<HTMLElement>("[data-tip]");
      if (target) show(target); else if (current) hide();
    };
    const onFocus = (event: FocusEvent) => {
      const target = (event.target as Element).closest?.<HTMLElement>("[data-tip]");
      if (target?.matches(":focus-visible")) show(target);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.clearTimeout(showTimer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!mounted || !el || !tip) return;
    const rect = tip.target.getBoundingClientRect();
    const margin = 8;
    const above = rect.top - el.offsetHeight - 10 > margin;
    const left = rect.left + rect.width / 2 - el.offsetWidth / 2;
    el.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - el.offsetWidth - margin))}px`;
    el.style.top = `${above ? rect.top - el.offsetHeight - 10 : rect.bottom + 10}px`;
    el.dataset.side = above ? "top" : "bottom";
  }, [mounted, tip]);

  if (!mounted || !tip) return null;
  return <Portal><div ref={ref} role="tooltip" className="tooltip" data-state={closing ? "closed" : "open"}>{tip.text}</div></Portal>;
}
