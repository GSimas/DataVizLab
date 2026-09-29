import { useEffect, useRef } from "react";
import { motionReduced } from "../lib/motion";

/**
 * App-wide animated backdrop (grid, orbits, glow) in the Scientata style.
 * A light pointer parallax is written to CSS variables, never to React state.
 */
export function Ambient({ view }: { view: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (motionReduced() || event.pointerType === "touch") return;
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        ref.current?.style.setProperty("--mx", x.toFixed(3));
        ref.current?.style.setProperty("--my", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", onMove); };
  }, []);

  return (
    <div ref={ref} className="ambient" data-view={view} aria-hidden="true">
      <span className="ambient-grid" />
      <span className="ambient-glow" />
      <span className="orbit orbit-a" />
      <span className="orbit orbit-b" />
      <span className="orbit orbit-c" />
      <span className="ambient-spark spark-1" />
      <span className="ambient-spark spark-2" />
      <span className="ambient-spark spark-3" />
    </div>
  );
}
