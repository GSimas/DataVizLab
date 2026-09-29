import { familyColors, type VizEntry } from "../lib/catalog";

/** Small schematic glyph for a visualization method, tinted by its family. */
export function MiniViz({ entry, index }: { entry: VizEntry; index: number }) {
  const color = familyColors[entry.family];
  const seed = (index % 5) + 2;
  if (["flow", "hierarchy"].includes(entry.family)) {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <path d={`M24 58 C60 ${20 + seed * 3}, 100 ${72 - seed * 4}, 154 28`} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" opacity=".38" />
        <path d="M24 30 C62 70, 112 18, 154 62" fill="none" stroke={color} strokeWidth="2" opacity=".7" />
        {["24,58", "24,30", "88,44", "154,28", "154,62"].map((coords, i) => {
          const [cx, cy] = coords.split(",").map(Number);
          return <circle key={coords} cx={cx} cy={cy} r={i === 2 ? 8 : 6} fill={i % 2 ? color : "var(--surface)"} stroke={color} strokeWidth="2" />;
        })}
      </svg>
    );
  }
  if (["pie", "donut", "sunburst", "nightingale", "radial-bar"].includes(entry.id)) {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <circle cx="90" cy="45" r="31" fill="none" stroke="var(--line-strong)" strokeWidth="16" />
        <circle cx="90" cy="45" r="31" fill="none" stroke={color} strokeWidth="16" strokeDasharray={`${80 + seed * 5} 195`} transform="rotate(-90 90 45)" />
      </svg>
    );
  }
  if (["scatter", "bubble", "beeswarm", "strip", "dot-map"].includes(entry.id) || entry.family === "geo") {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <path d="M22 70H160M22 70V14" stroke="var(--line-strong)" strokeWidth="1" />
        {[0, 1, 2, 3, 4, 5, 6].map((n) => <circle key={n} cx={38 + n * 17} cy={61 - ((n * seed * 7) % 42)} r={3 + ((n + seed) % 4)} fill={color} opacity={0.5 + n * 0.07} />)}
      </svg>
    );
  }
  if (["line", "area", "stacked-area", "density", "ridgeline", "streamgraph"].includes(entry.id) || entry.family === "time") {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <path d="M18 69 C42 65, 50 28, 74 42 S112 72, 132 34 S152 22, 164 30" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M18 69 C42 65, 50 28, 74 42 S112 72, 132 34 S152 22, 164 30 L164 74 L18 74Z" fill={color} opacity=".14" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 180 90" aria-hidden="true">
      <path d="M18 73H165" stroke="var(--line-strong)" />
      {[0, 1, 2, 3, 4, 5].map((n) => <rect key={n} x={26 + n * 23} y={65 - ((n * seed * 9) % 47)} width="11" height={8 + ((n * seed * 9) % 47)} rx="2" fill={color} opacity={0.5 + n * 0.08} />)}
    </svg>
  );
}
