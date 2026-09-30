import type { EChartsOption } from "echarts";
import { ICICLE_BOX, MEKKO_FRAME, PACK_BOX, type ContentBox } from "./chartStructure";
import type * as echarts from "./echarts";

/* Pan (drag) and zoom (mouse wheel, pinch) for the charts where moving around helps: dense networks and
   trees, hierarchies, flows, point clouds, maps and long time series. Double-click returns to the full view.
   Only the on-screen chart navigates; exports and thumbnails always show the whole chart. */

type Loose = Record<string, unknown>;
const asList = (value: unknown): Loose[] => (Array.isArray(value) ? value : value ? [value] : []) as Loose[];

/** Series types whose own ECharts roam (drag to move, wheel to zoom) is switched on. */
const NATIVE_ROAM: Record<string, Set<string>> = {
  graph: new Set(["network", "cooccurrence", "edge-bundling", "non-ribbon-chord"]),
  tree: new Set(["tree", "dendrogram", "brainstorm", "word-tree"]),
  treemap: new Set(["treemap", "icicle", "circle-packing", "marimekko"]),
  sankey: new Set(["sankey", "alluvial"]),
};

/** Charts on x/y axes: the wheel zooms the axes and dragging moves along them. */
const ZOOM_BOTH_AXES = new Set(["scatter", "bubble", "connected-scatter", "choropleth", "bubble-map", "dot-map", "flow-map", "hexbin-map", "cartogram"]);
const ZOOM_X_AXIS = new Set(["line", "area", "stacked-area", "kagi", "gantt", "timeline"]);

/** Hand-drawn charts (custom series without axes). Semantic zoom redraws them larger, so labels appear as
 *  shapes grow and text keeps its size; geometric zoom magnifies the drawing as it is. */
const SEMANTIC_ZOOM = new Map<string, ContentBox>([["circle-packing", PACK_BOX], ["icicle", ICICLE_BOX], ["marimekko", MEKKO_FRAME]]);
const GEOMETRIC_ZOOM = new Set(["word-cloud", "flowchart"]);

export type Viewport = { scale: number; x: number; y: number };
export const FULL_VIEW: Viewport = { scale: 1, x: 0, y: 0 };
const MAX_SCALE = 8;
/** The title and subtitle stay above zoomed content. */
const CONTENT_TOP = 84;

/** Whether a chart can be panned and zoomed at all. */
export const isNavigable = (chartId: string) =>
  ZOOM_BOTH_AXES.has(chartId) || ZOOM_X_AXIS.has(chartId) || SEMANTIC_ZOOM.has(chartId) || GEOMETRIC_ZOOM.has(chartId) || Object.values(NATIVE_ROAM).some((ids) => ids.has(chartId));

/** Hand-drawn charts navigated by our own handlers (the others use ECharts roam or dataZoom). */
export const customRoam = (chartId: string) => SEMANTIC_ZOOM.has(chartId) || GEOMETRIC_ZOOM.has(chartId);

type RenderItem = (params: unknown, api: Loose & { getWidth: () => number; getHeight: () => number }) => Loose | null | undefined;

/** Wraps a custom series so it draws inside the current viewport. The viewport always means "screen = scale ×
 *  full-view position + (x, y)", for both kinds of zoom, so zooming keeps the point under the pointer in place. */
function viewportRenderItem(renderItem: RenderItem, box: ContentBox | undefined, viewport: () => Viewport): RenderItem {
  return (params, api) => {
    const { scale, x, y } = viewport();
    // Always the same structure (a group holding the mark), zoomed or not: when ECharts replaces an element by
    // one of another type it copies the old transform onto it, which would leave the mark offset after a reset.
    const whole = scale === 1 && !x && !y;
    const width = api.getWidth();
    const height = api.getHeight();
    let element: Loose | null | undefined;
    let transform: { x: number; y: number; scale: number };
    if (box) {
      // Semantic: only the content area is laid out `scale` times larger (margins keep their size), so shapes grow,
      // labels appear where they now fit, and text keeps its size. Its origin is then shifted to match the viewport.
      const virtual = { ...api, getWidth: () => box.left + box.right + scale * (width - box.left - box.right), getHeight: () => box.top + box.bottom + scale * (height - box.top - box.bottom) };
      element = renderItem(params, virtual);
      transform = { x: x + (scale - 1) * box.left, y: y + (scale - 1) * box.top, scale: 1 };
    } else {
      element = renderItem(params, api);
      transform = { x, y, scale };
    }
    if (!element) return element;
    const { focus, blurScope, ...inner } = element;
    const s = transform.scale;
    return {
      type: "group", x: transform.x, y: transform.y, scaleX: s, scaleY: s,
      // Moving the view is immediate: only the content's own changes animate.
      transition: [],
      focus, blurScope,
      // Content that scrolls up goes under the title, not over it (clip coordinates are local to the group).
      // `false` removes a clip left from a zoomed view.
      clipPath: whole ? false : { type: "rect", shape: { x: -transform.x / s, y: (CONTENT_TOP - transform.y) / s, width: width / s, height: (height - CONTENT_TOP) / s } },
      children: [inner],
    };
  };
}

/** Adds navigation to the option drawn on screen. `viewport` is read at draw time. */
export function navigable(option: EChartsOption, chartId: string, viewport: () => Viewport): EChartsOption {
  const o = option as Loose;
  const series = asList(o.series).map((item) => {
    const type = String(item.type);
    if (NATIVE_ROAM[type]?.has(chartId)) return { ...item, roam: true, ...(type === "graph" || type === "sankey" ? { scaleLimit: { min: 0.4, max: MAX_SCALE } } : {}) };
    if (type === "custom" && item.coordinateSystem === "none" && customRoam(chartId) && typeof item.renderItem === "function") {
      return { ...item, renderItem: viewportRenderItem(item.renderItem as RenderItem, SEMANTIC_ZOOM.get(chartId), viewport) };
    }
    return item;
  });
  const next: Loose = { ...o, series };
  const both = ZOOM_BOTH_AXES.has(chartId);
  if ((both || ZOOM_X_AXIS.has(chartId)) && o.xAxis && !o.dataZoom) {
    const xs = asList(o.xAxis).map((_, i) => i);
    const ys = asList(o.yAxis).map((_, i) => i);
    next.dataZoom = [
      { type: "inside", xAxisIndex: xs, filterMode: "none", minSpan: 2 },
      ...(both && ys.length ? [{ type: "inside", yAxisIndex: ys, filterMode: "none", minSpan: 2 }] : []),
    ];
  }
  return next as EChartsOption;
}

type ZrEvent = { offsetX: number; offsetY: number; wheelDelta?: number; pinchScale?: number; pinchX?: number; pinchY?: number; event?: Event; stop?: () => void };
type Zr = { on: (name: string, fn: (event: ZrEvent) => void) => void; off: (name: string, fn?: (event: ZrEvent) => void) => void; setCursorStyle: (cursor: string) => void; getWidth: () => number; getHeight: () => number };

/** Mouse and touch handling for the hand-drawn charts. Returns a function that removes it. */
export function attachCustomRoam(chart: echarts.ECharts, options: { active: () => boolean; resettable: () => boolean; viewport: { current: Viewport }; redraw: () => void; reset: () => void }) {
  const zr = chart.getZr() as unknown as Zr;
  const { viewport } = options;
  const clamp = (next: Viewport): Viewport => {
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    const width = zr.getWidth();
    const height = zr.getHeight();
    return { scale, x: Math.min(0, Math.max(width * (1 - scale), next.x)), y: Math.min(0, Math.max(height * (1 - scale), next.y)) };
  };
  const zoomAt = (px: number, py: number, factor: number) => {
    const { scale, x, y } = viewport.current;
    const target = Math.min(MAX_SCALE, Math.max(1, scale * factor));
    const k = target / scale;
    if (k === 1) return;
    viewport.current = clamp({ scale: target, x: px - (px - x) * k, y: py - (py - y) * k });
    options.redraw();
  };
  let drag: { x: number; y: number } | null = null;
  const onWheel = (event: ZrEvent) => {
    if (!options.active() || !event.wheelDelta) return;
    event.event?.preventDefault();
    zoomAt(event.offsetX, event.offsetY, event.wheelDelta > 0 ? 1.18 : 1 / 1.18);
  };
  const onPinch = (event: ZrEvent) => {
    if (!options.active() || !event.pinchScale) return;
    zoomAt(event.pinchX ?? event.offsetX, event.pinchY ?? event.offsetY, event.pinchScale);
  };
  const onDown = (event: ZrEvent) => {
    if (!options.active() || viewport.current.scale === 1) return;
    drag = { x: event.offsetX, y: event.offsetY };
  };
  const onMove = (event: ZrEvent) => {
    if (!drag) return;
    const { scale, x, y } = viewport.current;
    viewport.current = clamp({ scale, x: x + event.offsetX - drag.x, y: y + event.offsetY - drag.y });
    drag = { x: event.offsetX, y: event.offsetY };
    zr.setCursorStyle("grabbing");
    options.redraw();
  };
  const onUp = () => { if (drag) { drag = null; zr.setCursorStyle("default"); } };
  const onDouble = () => { if (options.resettable()) options.reset(); };
  const handlers: Array<[string, (event: ZrEvent) => void]> = [["mousewheel", onWheel], ["pinch", onPinch], ["mousedown", onDown], ["mousemove", onMove], ["mouseup", onUp], ["globalout", onUp], ["dblclick", onDouble]];
  handlers.forEach(([name, fn]) => zr.on(name, fn));
  return () => handlers.forEach(([name, fn]) => zr.off(name, fn));
}
