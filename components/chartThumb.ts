import * as echarts from "./echarts";
import type { EChartsOption } from "echarts";
import type { Locale } from "../lib/catalog";
import { sampleConfig, sampleFor } from "../lib/samples";
import { chartOption, type ChartDisplay } from "./ChartRenderer";

/* Catalog thumbnails are the real chart, drawn from that chart's own sample and stripped down to its shape:
   no title, legend, tooltip, axis names or labels. Nothing here is a hand-drawn imitation. */

export const THUMB_WIDTH = 720;
export const THUMB_HEIGHT = 400;

type Loose = Record<string, unknown>;

/** Charts whose marks are the labels themselves (X and O boxes, the words of a phrase tree). */
const KEEP_LABELS = new Set(["point-figure", "word-tree"]);
const asList = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : value ? [value as Loose] : []);
const hideLabel = (label: unknown) => ({ ...(label && typeof label === "object" ? (label as Loose) : {}), show: false });

const fontPx = (element: Loose) => Number(/(\d+(?:\.\d+)?)px/.exec(String(((element.style as Loose | undefined)?.font) ?? ""))?.[1] ?? 0);

const quietAxis = (axis: Loose): Loose => ({
  ...axis,
  name: undefined,
  axisLabel: hideLabel(axis.axisLabel),
  axisTick: { show: false },
});

function quietSeries(series: Loose, keepLabels: boolean): Loose {
  if (keepLabels) {
    const label = (series.label ?? {}) as Loose;
    return { ...series, label: { ...label, fontSize: (Number(label.fontSize) || 12) * 1.7 }, emphasis: { disabled: true } };
  }
  const next: Loose = { ...series, label: hideLabel(series.label), labelLine: { show: false }, endLabel: { show: false } };
  delete next.labelLayout;
  if (series.emphasis) next.emphasis = { disabled: true };
  if (series.markLine) next.markLine = { ...(series.markLine as Loose), label: hideLabel((series.markLine as Loose).label) };
  if (series.markPoint) next.markPoint = { ...(series.markPoint as Loose), label: hideLabel((series.markPoint as Loose).label) };
  if (Array.isArray(series.levels)) next.levels = (series.levels as Loose[]).map((level) => ({ ...level, label: hideLabel(level.label) }));
  if (series.upperLabel) next.upperLabel = { show: false };
  return next;
}

/** Keeps the geometry of an option and drops everything that reads as text. */
export function thumbnailOption(option: EChartsOption, chartId = ""): EChartsOption {
  const source = option as Loose;
  const next: Loose = { ...source, animation: false, backgroundColor: "transparent" };
  for (const key of ["title", "legend", "toolbox", "tooltip", "dataZoom", "brush", "axisPointer"]) delete next[key];
  next.title = { show: false };
  next.legend = { show: false };
  next.tooltip = { show: false };

  for (const key of ["xAxis", "yAxis", "angleAxis", "radiusAxis", "singleAxis", "parallelAxis"]) {
    if (source[key] === undefined) continue;
    const axes = asList(source[key]).map(quietAxis);
    next[key] = Array.isArray(source[key]) ? axes : axes[0];
  }
  if (source.radar) {
    const radars = asList(source.radar).map((radar) => ({ ...radar, axisName: { show: false }, axisLabel: { show: false } }));
    next.radar = Array.isArray(source.radar) ? radars : radars[0];
  }
  if (source.grid) {
    const grids = asList(source.grid).map((grid) => ({ ...grid, left: 16, right: 16, top: 16, bottom: 16, containLabel: false }));
    next.grid = Array.isArray(source.grid) ? grids : grids[0];
  }
  if (source.visualMap) {
    const maps = asList(source.visualMap).map((map) => ({ ...map, show: false }));
    next.visualMap = Array.isArray(source.visualMap) ? maps : maps[0];
  }
  if (source.calendar) {
    const calendars = asList(source.calendar).map((calendar) => ({ ...calendar, dayLabel: { show: false }, monthLabel: { show: false }, yearLabel: { show: false } }));
    next.calendar = Array.isArray(source.calendar) ? calendars : calendars[0];
  }
  if (source.parallel) {
    const parallels = asList(source.parallel).map((parallel) => ({ ...parallel, left: 24, right: 24, top: 24, bottom: 24 }));
    next.parallel = Array.isArray(source.parallel) ? parallels : parallels[0];
  }
  // Notes and keys are small text; the large text of a text-drawn chart (stem-and-leaf) is the chart itself.
  if (Array.isArray(source.graphic)) next.graphic = (source.graphic as Loose[]).filter((element) => element.type !== "text" || fontPx(element) >= 16);
  if (source.series) next.series = asList(source.series).map((series) => quietSeries(series, KEEP_LABELS.has(chartId)));
  return next as EChartsOption;
}

const cache = new Map<string, string>();

/** SVG markup (sized by CSS through its viewBox) of a chart type drawn from its own sample. */
export function chartThumbnail(chartId: string, locale: Locale, dark: boolean): string {
  const key = `${chartId}|${locale}|${dark ? "d" : "l"}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let svg = "";
  try {
    const sample = sampleFor(chartId, locale);
    const display: ChartDisplay = { dark, contrast: false, fontScale: 1, reducedMotion: true, locale };
    const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: THUMB_WIDTH, height: THUMB_HEIGHT });
    chart.setOption(thumbnailOption(chartOption(sample.rows, { ...sampleConfig(sample), patterns: false }, display), chartId));
    svg = chart.renderToSVGString().replace(/^(<svg[^>]*?)\s(?:width|height)="[^"]*"/, "$1").replace(/^(<svg[^>]*?)\s(?:width|height)="[^"]*"/, "$1");
    chart.dispose();
  } catch {
    svg = "";
  }
  cache.set(key, svg);
  return svg;
}
