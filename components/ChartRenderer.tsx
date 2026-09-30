"use client";

import * as echarts from "./echarts";
import type { EChartsOption } from "echarts";
import { forwardRef, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { getEntry, type Locale } from "../lib/catalog";
import { buildSpecial } from "./chartBuilders";
import { attachCustomRoam, customRoam, FULL_VIEW, isNavigable, navigable, type Viewport } from "./chartNavigation";
import { aggregate, number, str, type ChartTheme } from "./chartUtils";

export type DataRow = Record<string, string | number | boolean | null>;

export type ChartConfig = {
  chartId: string;
  xField: string;
  yField: string;
  seriesField: string;
  sizeField: string;
  title: string;
  subtitle: string;
  showLabels: boolean;
  patterns: boolean;
};

export type ChartRendererHandle = {
  /** Current on-screen size, so exports keep the proportions the user sees. */
  getSize: () => { width: number; height: number };
  getDescription: () => string;
};

// Scientata-aligned categorical palettes, validated for lightness band, chroma,
// CVD separation and contrast against each mode's chart surface.
const baseTheme = (dark: boolean) => dark
  ? { palette: ["#61a82d", "#8a66d9", "#c8800d", "#04a19b", "#cb473d", "#418ad1", "#c34e97", "#9d9631"], sequential: ["#16281f", "#2f5a24", "#5f9a2a", "#b8ff4a"], surface: "#0c1a16", surface2: "#10211c", title: "#f0eee6", text: "#c3cbc7", muted: "#8a9690", axis: "#34443d", grid: "#1a2a24", tooltip: "#0c1a16", line: "#2c3b35" }
  : { palette: ["#478809", "#6d47b8", "#be7100", "#008b9e", "#c5372f", "#2769b7", "#a82571", "#8c8300"], sequential: ["#eef1e2", "#bcd88f", "#6a9f2b", "#2f5f0c"], surface: "#f7f5ee", surface2: "#efece3", title: "#07110f", text: "#34423c", muted: "#6b7772", axis: "#c9c6bb", grid: "#e4e1d7", tooltip: "#ffffff", line: "#d6d3c8" };
/** Canvas text cannot read CSS, so the viewer's display preferences arrive as props. */
export type ChartDisplay = { dark: boolean; contrast: boolean; fontScale: number; reducedMotion: boolean; locale?: Locale };

const chartTheme = (dark: boolean, contrast = false): ChartTheme => {
  const theme = baseTheme(dark);
  if (!contrast) return theme;
  return dark
    ? { ...theme, title: "#ffffff", text: "#f0eee6", muted: "#c3cbc7", axis: "#7d8b85", grid: "#34443d", line: "#8a9690" }
    : { ...theme, title: "#000000", text: "#07110f", muted: "#26332e", axis: "#6b7772", grid: "#c3c0b4", line: "#4d5b56" };
};

const SANS = "'Manrope Variable', Manrope, Arial, sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";

const base = (config: ChartConfig, display: ChartDisplay): EChartsOption => { const { dark } = display; const c = chartTheme(dark, display.contrast); return {
  backgroundColor: "transparent",
  animation: !display.reducedMotion,
  animationDuration: 650,
  animationDurationUpdate: 480,
  animationEasing: "cubicOut",
  animationEasingUpdate: "cubicInOut",
  color: c.palette,
  textStyle: { fontFamily: SANS, color: c.text },
  title: {
    text: config.title,
    subtext: config.subtitle,
    left: 18,
    top: 12,
    textStyle: { color: c.title, fontSize: 18, fontWeight: 600 },
    subtextStyle: { color: c.muted, fontSize: 11, fontFamily: MONO },
  },
  // Tooltip drawn in the DataVizLab style (square, hairline border, soft shadow).
  tooltip: {
    trigger: "item",
    confine: true,
    backgroundColor: c.tooltip,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 0,
    padding: [8, 12],
    textStyle: { color: c.title, fontFamily: SANS, fontSize: 12 },
    extraCssText: `box-shadow: 0 14px 34px rgba(0, 0, 0, ${dark ? 0.42 : 0.12}); border-radius: 0;`,
    transitionDuration: display.reducedMotion ? 0 : 0.2,
    axisPointer: { lineStyle: { color: c.axis, type: "dashed" }, crossStyle: { color: c.axis }, shadowStyle: { color: dark ? "rgba(184, 255, 74, 0.05)" : "rgba(37, 113, 95, 0.06)" } },
  },
  // The container carries a localized description (ChartRenderer); ECharts would replace it with its own, in English.
  aria: { enabled: true, label: { enabled: false }, decal: { show: config.patterns } },
}; };

function buildOption(rows: DataRow[], config: ChartConfig, display: ChartDisplay): EChartsOption {
  const { dark } = display;
  const entry = getEntry(config.chartId);
  const common = base(config, display);
  const c = chartTheme(dark, display.contrast);
  const palette = c.palette;
  const x = config.xField;
  const y = config.yField;
  const s = config.seriesField;
  const size = config.sizeField;
  const grid = { left: 58, right: 26, top: 88, bottom: 54, containLabel: true };
  const axisLine = { lineStyle: { color: c.axis } };
  const splitLine = { lineStyle: { color: c.grid } };
  const special = buildSpecial({ rows, config, display, common, c, palette, grid, axisLine, splitLine, x, y, s, size });
  if (special) return special;
  const { map, xValues, seriesValues } = aggregate(rows, x, y, s);
  const barSeries = seriesValues.map((seriesName, index) => ({
    name: s ? seriesName : config.title || entry.name.en,
    type: "bar" as const,
    data: xValues.map((category) => map.get(`${category}|||${s ? seriesName : "_"}`) ?? 0),
    stack: ["stacked-bar", "normalized-bar", "stacked-area"].includes(config.chartId) ? "total" : undefined,
    label: { show: config.showLabels, position: "top" as const, color: c.title },
    itemStyle: { borderRadius: [4, 4, 1, 1] },
    emphasis: { focus: "series" as const },
    color: palette[index % palette.length],
  }));
  const cartesian = {
    ...common,
    grid,
    legend: { show: seriesValues.length > 1, top: 55, textStyle: { color: c.text } },
    xAxis: { type: "category" as const, data: xValues, axisLine, axisLabel: { color: c.muted, hideOverlap: true }, axisTick: { show: false } },
    yAxis: { type: "value" as const, axisLine: { show: false }, axisLabel: { color: c.muted }, splitLine },
  };

  if (["bar", "column", "grouped-bar", "stacked-bar", "normalized-bar", "pareto", "butterfly"].includes(config.chartId)) {
    if (config.chartId === "bar") {
      return { ...common, grid, xAxis: { type: "value", splitLine, axisLabel: { color: c.muted } }, yAxis: { type: "category", inverse: true, data: xValues, axisLabel: { color: c.muted }, axisLine, axisTick: { show: false } }, series: barSeries.map((item) => ({ ...item, label: { ...item.label, position: "right" } })) };
    }
    if (config.chartId === "normalized-bar") {
      const totals = xValues.map((category) => seriesValues.reduce((sum, seriesName) => sum + (map.get(`${category}|||${seriesName}`) ?? 0), 0));
      const normalized = barSeries.map((item) => ({ ...item, data: item.data.map((value, i) => totals[i] ? Math.round((Number(value) / totals[i]) * 1000) / 10 : 0) }));
      return { ...cartesian, yAxis: { ...(cartesian.yAxis as object), max: 100, axisLabel: { formatter: "{value}%", color: c.muted } }, series: normalized };
    }
    return { ...cartesian, series: barSeries };
  }

  if (["lollipop", "dot-plot", "dumbbell", "span", "bullet"].includes(config.chartId)) {
    const values = xValues.map((category) => map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0);
    const name = s ? seriesValues[0] : config.title || entry.name.en;
    return {
      ...common,
      grid,
      xAxis: { type: "value", splitLine, axisLabel: { color: c.muted } },
      yAxis: { type: "category", inverse: true, data: xValues, axisLine, axisLabel: { color: c.muted } },
      // Stem and head are two series linked by category, so hovering either lights the whole lollipop.
      series: [
        { name, type: "bar", data: values, barWidth: 2, itemStyle: { color: palette[0] } },
        { name, type: "scatter", z: 3, symbolSize: 14, itemStyle: { color: palette[0], borderColor: c.surface, borderWidth: 2 }, label: { show: config.showLabels, position: "right", color: c.title, formatter: (p: { value: unknown }) => String((p.value as unknown[])[0]) }, data: values.map((value, i) => [value, xValues[i]]) },
      ],
    };
  }

  if (["line", "area", "stacked-area", "streamgraph", "slope", "connected-scatter", "kagi", "point-figure"].includes(config.chartId)) {
    return {
      ...cartesian,
      tooltip: { ...(common.tooltip as object), trigger: "axis" },
      series: seriesValues.map((seriesName, index) => ({
        name: seriesName,
        type: "line",
        smooth: config.chartId === "area",
        symbolSize: 7,
        data: xValues.map((category) => map.get(`${category}|||${s ? seriesName : "_"}`) ?? 0),
        areaStyle: ["area", "stacked-area", "streamgraph"].includes(config.chartId) ? { opacity: config.chartId === "area" ? 0.24 : 0.64 } : undefined,
        stack: ["stacked-area", "streamgraph"].includes(config.chartId) ? "total" : undefined,
        label: { show: config.showLabels },
        color: palette[index % palette.length],
      })),
    };
  }

  if (["scatter", "bubble", "strip", "beeswarm"].includes(config.chartId)) {
    const grouped = seriesValues.map((seriesName, seriesIndex) => ({
      name: seriesName,
      type: "scatter" as const,
      symbolSize: (value: number[]) => config.chartId === "bubble" ? Math.max(8, Math.sqrt(Math.abs(value[2] ?? 20)) * 3.5) : 10,
      data: rows.filter((row) => !s || str(row[s]) === seriesName).map((row, index) => [number(row[x]), number(row[y]), size ? number(row[size]) : 20, str(row[x]), index]),
      itemStyle: { color: palette[seriesIndex % palette.length], opacity: 0.78 },
      label: { show: config.showLabels, formatter: "{@[3]}" },
    }));
    return { ...common, grid, legend: { show: seriesValues.length > 1, top: 55 }, xAxis: { type: "value", scale: true, splitLine, axisLabel: { color: c.muted } }, yAxis: { type: "value", scale: true, splitLine, axisLabel: { color: c.muted } }, series: grouped };
  }

  if (["pie", "donut", "nightingale", "waffle", "pictogram"].includes(config.chartId)) {
    const data = xValues.map((category) => ({ name: category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 }));
    return {
      ...common,
      legend: { type: "scroll", bottom: 8, textStyle: { color: c.text } },
      series: [{ name: config.title, type: "pie", radius: config.chartId === "donut" ? ["42%", "68%"] : ["0%", "68%"], center: ["50%", "53%"], roseType: config.chartId === "nightingale" ? "area" : undefined, data, label: { show: config.showLabels, formatter: "{b}\n{d}%" }, itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 } }],
    };
  }

  if (["histogram", "density", "violin", "boxplot", "ridgeline", "stem-leaf", "population-pyramid", "error-bars"].includes(config.chartId)) {
    const values = rows.map((row) => number(row[y || x])).filter(Number.isFinite);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const bins = Math.max(5, Math.min(14, Math.ceil(Math.sqrt(values.length))));
    const width = (max - min || 1) / bins;
    const counts = Array.from({ length: bins }, () => 0);
    values.forEach((value) => { counts[Math.min(bins - 1, Math.floor((value - min) / width))] += 1; });
    return { ...common, grid, xAxis: { type: "category", data: counts.map((_, i) => `${(min + i * width).toFixed(1)}–${(min + (i + 1) * width).toFixed(1)}`), axisLabel: { rotate: 32, color: c.muted }, axisLine }, yAxis: { type: "value", splitLine, axisLabel: { color: c.muted } }, series: [{ type: config.chartId === "density" || config.chartId === "ridgeline" ? "line" : "bar", data: counts, smooth: true, areaStyle: config.chartId === "density" || config.chartId === "violin" ? { opacity: 0.25 } : undefined, itemStyle: { color: palette[4], borderRadius: [4, 4, 0, 0] }, label: { show: config.showLabels } }] };
  }

  if (["funnel"].includes(config.chartId)) {
    return { ...common, series: [{ type: "funnel", top: 85, bottom: 30, left: "12%", width: "76%", sort: "descending", gap: 3, data: xValues.map((category) => ({ name: category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 })), label: { show: true, formatter: "{b}: {c}" }, itemStyle: { borderColor: c.surface, borderWidth: 2 } }] };
  }

  if (["treemap", "sunburst", "circle-packing", "icicle", "marimekko"].includes(config.chartId)) {
    const data = xValues.map((category) => ({ name: category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 }));
    if (config.chartId === "sunburst") return { ...common, series: [{ type: "sunburst", center: ["50%", "56%"], radius: ["12%", "70%"], data, label: { rotate: "radial" }, itemStyle: { borderColor: c.surface, borderWidth: 2 } }] };
    return { ...common, series: [{ type: "treemap", top: 82, bottom: 20, left: 20, right: 20, roam: false, breadcrumb: { show: false }, label: { show: true, formatter: "{b}\n{c}" }, data, itemStyle: { borderColor: c.surface, borderWidth: 3, gapWidth: 2 } }] };
  }

  if (["sankey", "alluvial"].includes(config.chartId)) {
    const sourceField = x;
    const targetField = s || y;
    const valueField = size || (s ? y : "");
    const nodes = Array.from(new Set(rows.flatMap((row) => [str(row[sourceField]), str(row[targetField])]))).map((name) => ({ name }));
    const links = rows.map((row) => ({ source: str(row[sourceField]), target: str(row[targetField]), value: valueField ? Math.max(1, number(row[valueField])) : 1 }));
    return { ...common, series: [{ type: "sankey", top: 92, bottom: 30, left: 30, right: 130, nodeAlign: "justify", data: nodes, links, emphasis: { focus: "adjacency" }, lineStyle: { color: "gradient", curveness: 0.52, opacity: 0.45 }, label: { color: c.text } }] };
  }

  if (["network", "arc", "chord", "non-ribbon-chord", "edge-bundling", "flowchart", "cooccurrence", "tree", "dendrogram", "brainstorm"].includes(config.chartId)) {
    const sourceField = x;
    const targetField = s || y;
    const nodeNames = Array.from(new Set(rows.flatMap((row) => [str(row[sourceField]), str(row[targetField])])));
    const weight = (row: DataRow) => (size ? Math.max(0, number(row[size])) || 1 : 1);
    const peak = Math.max(...rows.map(weight), 1);
    const degree = new Map<string, number>();
    rows.forEach((row) => { [str(row[sourceField]), str(row[targetField])].forEach((name) => degree.set(name, (degree.get(name) ?? 0) + weight(row))); });
    const topDegree = Math.max(...degree.values(), 1);
    const circular = ["chord", "non-ribbon-chord", "edge-bundling"].includes(config.chartId);
    return { ...common, series: [{ type: "graph", top: 96, bottom: 34, left: 70, right: 70, layout: circular ? "circular" : "force", circular: { rotateLabel: true }, force: { initLayout: "circular", repulsion: 110 + 4 * nodeNames.length, edgeLength: [34, 96], gravity: 0.22, layoutAnimation: false }, roam: true, draggable: true, label: { show: true, position: "right", color: c.text, fontSize: 12 }, data: nodeNames.map((name, i) => ({ name, symbolSize: 12 + 24 * Math.sqrt((degree.get(name) ?? 0) / topDegree), itemStyle: { color: palette[i % palette.length] } })), links: rows.map((row) => ({ source: str(row[sourceField]), target: str(row[targetField]), value: weight(row), lineStyle: { width: 1 + 5 * (weight(row) / peak) } })), lineStyle: { color: "source", curveness: circular ? 0.3 : 0.12, opacity: 0.55 }, emphasis: { focus: "adjacency" } }] };
  }

  if (["candlestick", "ohlc"].includes(config.chartId)) {
    const numericFields = Object.keys(rows[0] ?? {}).filter((field) => rows.some((row) => number(row[field]) !== 0)).filter((field) => field !== x).slice(0, 4);
    const candles = rows.map((row) => {
      const vals = numericFields.map((field) => number(row[field]));
      const open = vals[0] ?? number(row[y]); const close = vals[3] ?? vals[1] ?? open; const low = Math.min(...vals, open, close); const high = Math.max(...vals, open, close);
      return [open, close, low, high];
    });
    return { ...common, grid, xAxis: { type: "category", data: rows.map((row) => str(row[x])), axisLine, axisLabel: { color: c.muted } }, yAxis: { scale: true, splitLine, axisLabel: { color: c.muted } }, dataZoom: [{ type: "inside" }, { type: "slider", bottom: 8, height: 18, backgroundColor: "transparent", borderColor: c.line, fillerColor: dark ? "rgba(184, 255, 74, 0.08)" : "rgba(37, 113, 95, 0.08)", handleStyle: { color: c.surface, borderColor: palette[0] }, moveHandleStyle: { color: c.axis }, dataBackground: { lineStyle: { color: c.axis }, areaStyle: { color: c.grid } }, selectedDataBackground: { lineStyle: { color: palette[0] }, areaStyle: { color: c.grid } }, textStyle: { color: c.muted } }], series: [{ type: "candlestick", data: candles, itemStyle: { color: palette[0], color0: palette[4], borderColor: palette[0], borderColor0: palette[4] } }] };
  }

  if (["choropleth", "bubble-map", "dot-map", "flow-map", "hexbin-map", "cartogram"].includes(config.chartId)) {
    return { ...common, grid, xAxis: { type: "value", name: "Longitude", min: -180, max: 180, splitLine, axisLabel: { color: c.muted } }, yAxis: { type: "value", name: "Latitude", min: -90, max: 90, splitLine, axisLabel: { color: c.muted } }, graphic: [{ type: "text", left: "center", bottom: 18, style: { text: "Local coordinate view · add GeoJSON for territorial geometry", fill: c.muted, fontSize: 10 } }], series: [{ type: "scatter", data: rows.map((row) => [number(row[x]), number(row[y]), size ? number(row[size]) : 18, str(row[s || x])]), symbolSize: (value: number[]) => Math.max(7, Math.sqrt(Math.abs(value[2])) * 2.5), itemStyle: { color: palette[3], opacity: 0.72 }, label: { show: config.showLabels, formatter: "{@[3]}" } }] };
  }

  if (["word-cloud", "term-frequency", "word-tree"].includes(config.chartId)) {
    const ranked = xValues.map((category) => ({ category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 })).sort((a, b) => b.value - a.value).slice(0, 25);
    return { ...common, grid, xAxis: { type: "value", splitLine, axisLabel: { color: c.muted } }, yAxis: { type: "category", inverse: true, data: ranked.map((item) => item.category), axisLabel: { color: c.muted }, axisLine }, series: [{ type: "bar", data: ranked.map((item) => item.value), itemStyle: { color: palette[0], borderRadius: [0, 5, 5, 0] }, label: { show: true, position: "right" } }] };
  }

  return { ...cartesian, series: barSeries };
}

type Loose = Record<string, unknown>;
const asList = (value: unknown): Loose[] => (Array.isArray(value) ? value : value ? [value] : []) as Loose[];

/** Applies the viewer's text size to every text layer ECharts draws. */
function scaleText(option: EChartsOption, scale: number): EChartsOption {
  if (scale === 1) return option;
  const size = (px: number) => Math.round(px * scale * 10) / 10;
  const o = option as Loose;
  const withSize = (style: unknown, px: number) => ({ ...(style as Loose), fontSize: size(px) });
  const axes = (key: string) => asList(o[key]).map((axis) => ({ ...axis, axisLabel: withSize(axis.axisLabel, 12), nameTextStyle: withSize(axis.nameTextStyle, 12) }));
  const title = o.title as Loose | undefined;
  return {
    ...o,
    textStyle: withSize(o.textStyle, 12),
    title: title ? { ...title, textStyle: withSize(title.textStyle, 18), subtextStyle: withSize(title.subtextStyle, 11) } : title,
    tooltip: o.tooltip ? { ...(o.tooltip as Loose), textStyle: withSize((o.tooltip as Loose).textStyle, 12) } : o.tooltip,
    legend: o.legend ? { ...(o.legend as Loose), textStyle: withSize((o.legend as Loose).textStyle, 12) } : o.legend,
    xAxis: o.xAxis ? axes("xAxis") : o.xAxis,
    yAxis: o.yAxis ? axes("yAxis") : o.yAxis,
    series: asList(o.series).map((item) => ({ ...item, label: withSize(item.label, 12) })),
  } as EChartsOption;
}

/** What stays lit when a mark is hovered, per series type; everything else fades. */
const HOVER_FOCUS: Record<string, string> = {
  bar: "self", pictorialBar: "self", scatter: "self", effectScatter: "self", pie: "self", funnel: "self", heatmap: "self", boxplot: "self",
  candlestick: "self", custom: "self", radar: "self", themeRiver: "self", lines: "self", parallel: "self", line: "series",
  treemap: "descendant", sunburst: "ancestor", tree: "descendant", graph: "adjacency", sankey: "adjacency", chord: "adjacency",
};

/** Hover emphasis for every chart: the mark under the pointer stays lit and the rest of the chart dims. */
function withHoverFocus(option: EChartsOption): EChartsOption {
  const o = option as Loose;
  const series = asList(o.series);
  // A series is the unit of focus only when there are several to tell apart; a lone series focuses on the hovered mark.
  const drawn = series.filter((item) => !item.silent && item.tooltip !== false);
  return {
    ...o,
    series: series.map((item) => {
      const emphasis = (item.emphasis ?? {}) as Loose;
      if (emphasis.disabled || item.silent) return item;
      let focus = (emphasis.focus as string | undefined) ?? HOVER_FOCUS[String(item.type)];
      if (!focus) return item;
      if (focus === "series" && drawn.length < 2) focus = "self";
      const blur = (item.blur ?? {}) as Loose;
      // Custom series read focus from each element that renderItem returns, not from the series.
      const renderItem = item.renderItem as ((...args: unknown[]) => Loose | null | undefined) | undefined;
      const focused = renderItem && {
        renderItem: (...args: unknown[]) => {
          const element = renderItem(...args);
          return element && element.focus === undefined ? { ...element, focus } : element;
        },
      };
      return {
        ...item,
        ...focused,
        emphasis: { ...emphasis, focus },
        blur: { ...blur, itemStyle: { opacity: 0.18, ...(blur.itemStyle as Loose) }, lineStyle: { opacity: 0.14, ...(blur.lineStyle as Loose) }, areaStyle: { opacity: 0.08, ...(blur.areaStyle as Loose) }, label: { opacity: 0.25, ...(blur.label as Loose) } },
      };
    }),
  } as EChartsOption;
}

/** Hand-drawn (custom) marks transition like native ones when parameters change: ECharts animates only
 *  their x/y by default, so shapes, colors and sizes jumped. Marks that appear fade in. */
function withTransitions(option: EChartsOption): EChartsOption {
  // Transform properties only transition when the mark declares them: ECharts starts a transition from the
  // previous element, and a property with no target value would stay where the previous element had it.
  const TRANSFORM = ["x", "y", "scaleX", "scaleY", "rotation", "originX", "originY"];
  const animate = (element: Loose): Loose => {
    const children = Array.isArray(element.children) ? { children: (element.children as Loose[]).map(animate) } : {};
    const transition = ["shape", "style", ...TRANSFORM.filter((key) => element[key] != null)];
    // New marks fade in. (No `leaveTo`: in ECharts 6.1 a leave transition on removed data items throws.)
    const fades = element.type !== "group" && !element.enterFrom ? { enterFrom: { style: { opacity: 0 } } } : {};
    return { transition, ...fades, ...element, ...children };
  };
  const o = option as Loose;
  return {
    ...o,
    series: asList(o.series).map((item) => {
      const renderItem = item.renderItem as ((...args: unknown[]) => Loose | null | undefined) | undefined;
      if (item.type !== "custom" || !renderItem) return item;
      return { ...item, renderItem: (...args: unknown[]) => { const element = renderItem(...args); return element ? animate(element) : element; } };
    }),
  } as EChartsOption;
}

/** Charts whose ECharts series redraw without an update transition (sankey, heatmap): a short cross-fade
 *  marks the change instead of a hard cut. */
const FADE_ON_UPDATE = new Set(["sankey", "alluvial", "heatmap", "correlogram", "calendar"]);

/** Charts that draw one category with several series (a dumbbell's bar and dots, a bullet's bar and target). */
const ROW_CHARTS = new Set(["lollipop", "dot-plot", "dumbbell", "span", "bullet", "error-bars", "butterfly", "population-pyramid", "pareto"]);

/** Series that together draw each category row of a chart; hovering any of them lights the whole row. */
export function rowSeries(option: EChartsOption, chartId: string): number[] {
  if (!ROW_CHARTS.has(chartId)) return [];
  const indices = asList((option as Loose).series).flatMap((item, i) => (item.silent || (item.emphasis as Loose | undefined)?.disabled ? [] : [i]));
  return indices.length > 1 ? indices : [];
}

/** Wires row hovering on a chart; `rows` is read on every event so the chart can change type. */
export function linkRows(chart: echarts.ECharts, rows: () => number[]) {
  chart.on("mouseover", (params) => {
    const indices = rows();
    if (!indices.includes(params.seriesIndex ?? -1) || params.dataIndex == null) return;
    chart.dispatchAction({ type: "highlight", seriesIndex: indices, dataIndex: params.dataIndex });
  });
  chart.on("mouseout", () => {
    const indices = rows();
    if (indices.length) chart.dispatchAction({ type: "downplay", seriesIndex: indices });
  });
}

type Pinned = { key: string; seriesIndex: number | number[]; dataIndex: number; dataType?: string };

/** Clicking a mark keeps its hover highlight on (the rest stays dimmed) while the pointer moves elsewhere;
 *  clicking it again, or clicking an empty part of the chart, lets go. A drag (panning) is not a click. */
export function pinOnClick(chart: echarts.ECharts, rows: () => number[]) {
  const zr = chart.getZr();
  let pinned: Pinned | null = null;
  let down: [number, number] | null = null;
  let dragged = false;
  const allSeries = () => ((chart.getOption().series as unknown[] | undefined) ?? []).map((_, i) => i);
  const apply = () => {
    if (!pinned || chart.isDisposed()) return;
    chart.dispatchAction({ type: "downplay", seriesIndex: allSeries() });
    chart.dispatchAction({ type: "highlight", seriesIndex: pinned.seriesIndex, dataIndex: pinned.dataIndex, ...(pinned.dataType ? { dataType: pinned.dataType } : {}) });
  };
  const clear = () => {
    if (!pinned) return;
    pinned = null;
    if (!chart.isDisposed()) chart.dispatchAction({ type: "downplay", seriesIndex: allSeries() });
  };
  zr.on("mousedown", (event) => { down = [event.offsetX, event.offsetY]; dragged = false; });
  zr.on("mousemove", (event) => { if (down && Math.hypot(event.offsetX - down[0], event.offsetY - down[1]) > 4) dragged = true; });
  chart.on("click", (params) => {
    // A sunburst already uses the click to zoom into the clicked branch.
    if (dragged || params.componentType !== "series" || params.seriesType === "sunburst" || params.dataIndex == null || params.seriesIndex == null) return;
    const linked = rows();
    const row = linked.includes(params.seriesIndex);
    // In charts drawn as rows (a dumbbell's bar and dots), any mark of the row pins or releases the whole row.
    const key = row ? `row:${params.dataIndex}` : `${params.seriesIndex}:${params.dataType ?? ""}:${params.dataIndex}`;
    if (pinned?.key === key) { clear(); return; }
    pinned = { key, seriesIndex: row ? linked : params.seriesIndex, dataIndex: params.dataIndex, dataType: params.dataType };
    apply();
  });
  zr.on("click", (event) => { if (!event.target && !dragged) clear(); });
  // Hovering other marks runs ECharts' own highlight; the pin is put back right after, before the next paint.
  // (A pie slice under the pointer still lights up while hovered: ECharts keeps hover emphasis on the element the
  // pointer is on. The pin comes back whole as soon as the pointer leaves it.)
  const keep = () => { if (pinned) queueMicrotask(apply); };
  chart.on("mouseover", keep);
  chart.on("mouseout", keep);
  zr.on("globalout", keep);
  return { clear, reapply: apply };
}

/** Full ECharts option for a visualization, as drawn on screen (also used by exports). */
export const chartOption = (rows: DataRow[], config: ChartConfig, display: ChartDisplay) => scaleText(withHoverFocus(withTransitions(buildOption(rows, config, display))), display.fontScale);

/** Surface color behind charts for a given theme (used for exports with a background). */
export const chartSurface = (dark: boolean, contrast = false) => chartTheme(dark, contrast).surface;

type Props = { rows: DataRow[]; config: ChartConfig; display: ChartDisplay; locale: Locale; className?: string };

const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

export const ChartRenderer = forwardRef<ChartRendererHandle, Props>(function ChartRenderer({ rows, config, display, locale, className }, ref) {
  const { dark } = display;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // Typing in the table re-renders at once with the previous chart; the new option is computed right after,
  // at lower priority, so a keystroke never waits for the chart (large tables included).
  const chartRows = useDeferredValue(rows);
  const chartConfig = useDeferredValue(config);
  // Pan and zoom state of hand-drawn charts; the others keep theirs inside ECharts.
  const viewportRef = useRef<Viewport>(FULL_VIEW);
  const option = useMemo(() => navigable(chartOption(chartRows, chartConfig, display), chartConfig.chartId, () => viewportRef.current), [chartRows, chartConfig, display]);
  const optionRef = useRef(option);
  optionRef.current = option;
  const configRef = useRef(chartConfig);
  configRef.current = chartConfig;
  const motionRef = useRef(!display.reducedMotion);
  motionRef.current = !display.reducedMotion;
  const drawnChartRef = useRef(chartConfig.chartId);
  const pinRef = useRef<ReturnType<typeof pinOnClick> | null>(null);
  // ECharts draws outside React's render (in effects and animation frames), where an error boundary cannot see
  // a failure. It is caught there and rethrown here, so the chart's boundary shows its fallback (e.g. a sankey
  // whose chosen fields form a cycle) instead of leaving a broken canvas.
  const [failure, setFailure] = useState<Error | null>(null);
  if (failure) throw failure;

  const description = useMemo(() => {
    const entry = getEntry(config.chartId);
    const categories = new Set(rows.map((row) => str(row[config.xField]))).size;
    return locale === "pt"
      ? `${config.title || entry.name.pt}. ${entry.what.pt} A visualização usa ${rows.length} observações e ${categories} categorias no campo ${config.xField}. ${entry.avoid.pt}`
      : `${config.title || entry.name.en}. ${entry.what.en} The visualization uses ${rows.length} observations and ${categories} categories in ${config.xField}. ${entry.avoid.en}`;
  }, [config, locale, rows]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    let chart: echarts.ECharts | null = null;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    // After a click, React runs effects before the browser paints. Drawing the chart after that first paint lets
    // the page answer the click at once; the chart appears on the next frame. requestAnimationFrame runs just
    // before the paint, and the timeout queued from it runs just after.
    let start = 0;
    let detachRoam = () => {};
    let redrawFrame = 0;
    const draw = () => {
      const drawn = echarts.init(host, dark ? "dark" : undefined, { renderer: "canvas" });
      chart = drawn;
      chartRef.current = drawn;
      drawnChartRef.current = configRef.current.chartId;
      try { drawn.setOption(optionRef.current, { notMerge: true }); } catch (error) { setFailure(asError(error)); return; }
      linkRows(drawn, () => rowSeries(optionRef.current, configRef.current.chartId));
      pinRef.current = pinOnClick(drawn, () => rowSeries(optionRef.current, configRef.current.chartId));
      detachRoam = attachCustomRoam(drawn, {
        active: () => customRoam(configRef.current.chartId),
        resettable: () => isNavigable(configRef.current.chartId),
        viewport: viewportRef,
        // Moving the view redraws once per frame, without transitions (only the content's own changes animate).
        redraw: () => {
          cancelAnimationFrame(redrawFrame);
          redrawFrame = requestAnimationFrame(() => {
            const series = (optionRef.current as { series?: unknown[] }).series ?? [];
            try { drawn.setOption({ animationDurationUpdate: 0, series: series.map(() => ({})) }); } catch (error) { setFailure(asError(error)); return; }
            // A pinned highlight survives the redraw of a moving view.
            pinRef.current?.reapply();
          });
        },
        // Back to the whole chart, animated from wherever the view was.
        reset: () => {
          viewportRef.current = FULL_VIEW;
          // The hover highlight is undone first: the redraw replaces the element under the pointer, after which
          // ECharts can no longer lift the dimming it applied to the rest of the chart.
          const seriesIndex = ((optionRef.current as { series?: unknown[] }).series ?? []).map((_, i) => i);
          pinRef.current?.clear();
          drawn.dispatchAction({ type: "downplay", seriesIndex });
          try { drawn.setOption(optionRef.current, { notMerge: true }); } catch (error) { setFailure(asError(error)); }
        },
      });
      // Resizing inside the observer callback re-triggers it within the same frame.
      observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => chart?.resize()); });
      observer.observe(host);
    };
    const beforePaint = requestAnimationFrame(() => { start = window.setTimeout(draw, 0); });
    return () => {
      // Everything the chart holds (canvas, listeners, animation frames, observer) is released when it goes away.
      cancelAnimationFrame(beforePaint);
      window.clearTimeout(start);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(redrawFrame);
      detachRoam();
      observer?.disconnect();
      chart?.dispose();
      chartRef.current = null;
      pinRef.current = null;
    };
  }, [dark]);

  // Several changes within one frame (a burst of keystrokes) are drawn once, with the latest option.
  // Parameter and data changes transition from the previous state (ECharts matches series and marks);
  // a new chart type starts from the whole view.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const chart = chartRef.current;
      if (!chart) return;
      const chartId = configRef.current.chartId;
      const sameChart = drawnChartRef.current === chartId;
      if (!sameChart) { viewportRef.current = FULL_VIEW; drawnChartRef.current = chartId; }
      // Lift any hover dimming before the redraw replaces the hovered element (see reset above).
      // A pinned highlight is let go: after new data or parameters, the pinned mark may not be the same one.
      pinRef.current?.clear();
      chart.dispatchAction({ type: "downplay", seriesIndex: ((chart.getOption().series as unknown[] | undefined) ?? []).map((_, i) => i) });
      try { chart.setOption(option, { notMerge: true }); } catch (error) { setFailure(asError(error)); return; }
      if (sameChart && FADE_ON_UPDATE.has(chartId) && motionRef.current) {
        containerRef.current?.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 320, easing: "cubic-bezier(.2, .8, .2, 1)" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [option]);

  useImperativeHandle(ref, () => ({
    getSize: () => ({ width: containerRef.current?.clientWidth || 1200, height: containerRef.current?.clientHeight || 700 }),
    getDescription: () => description,
  }), [description]);

  return <div ref={containerRef} className={className ?? "chart-canvas"} role="img" aria-label={description} />;
});
