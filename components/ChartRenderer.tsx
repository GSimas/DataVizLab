"use client";

import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { getEntry, type Locale } from "../lib/catalog";

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
export type ChartDisplay = { dark: boolean; contrast: boolean; fontScale: number; reducedMotion: boolean };

const chartTheme = (dark: boolean, contrast = false) => {
  const theme = baseTheme(dark);
  if (!contrast) return theme;
  return dark
    ? { ...theme, title: "#ffffff", text: "#f0eee6", muted: "#c3cbc7", axis: "#7d8b85", grid: "#34443d", line: "#8a9690" }
    : { ...theme, title: "#000000", text: "#07110f", muted: "#26332e", axis: "#6b7772", grid: "#c3c0b4", line: "#4d5b56" };
};

const SANS = "'Manrope Variable', Manrope, Arial, sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";

const number = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const str = (value: unknown) => String(value ?? "—");

const aggregate = (rows: DataRow[], x: string, y: string, series = "") => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = `${str(row[x])}|||${series ? str(row[series]) : "_"}`;
    map.set(key, (map.get(key) ?? 0) + number(row[y]));
  });
  const xValues = Array.from(new Set(rows.map((row) => str(row[x]))));
  const seriesValues = series ? Array.from(new Set(rows.map((row) => str(row[series])))) : ["Value"];
  return { map, xValues, seriesValues };
};

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
  aria: { enabled: true, decal: { show: config.patterns } },
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
      return { ...common, grid, xAxis: { type: "value", splitLine, axisLabel: { color: c.muted } }, yAxis: { type: "category", data: xValues, axisLabel: { color: c.muted }, axisLine, axisTick: { show: false } }, series: barSeries.map((item) => ({ ...item, label: { ...item.label, position: "right" } })) };
    }
    if (config.chartId === "normalized-bar") {
      const totals = xValues.map((category) => seriesValues.reduce((sum, seriesName) => sum + (map.get(`${category}|||${seriesName}`) ?? 0), 0));
      const normalized = barSeries.map((item) => ({ ...item, data: item.data.map((value, i) => totals[i] ? Math.round((Number(value) / totals[i]) * 1000) / 10 : 0) }));
      return { ...cartesian, yAxis: { ...(cartesian.yAxis as object), max: 100, axisLabel: { formatter: "{value}%", color: c.muted } }, series: normalized };
    }
    return { ...cartesian, series: barSeries };
  }

  if (["lollipop", "dot-plot", "dumbbell", "span", "bullet"].includes(config.chartId)) {
    return {
      ...common,
      grid,
      xAxis: { type: "value", splitLine, axisLabel: { color: c.muted } },
      yAxis: { type: "category", data: xValues, axisLine, axisLabel: { color: c.muted } },
      series: [{ type: "bar", data: xValues.map((category) => map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0), barWidth: config.chartId === "lollipop" ? 2 : 12, itemStyle: { color: palette[0], borderRadius: 4 }, label: { show: config.showLabels, position: "right" }, markPoint: config.chartId === "lollipop" ? { symbolSize: 13, data: xValues.map((category, index) => ({ name: category, coord: [map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0, index] })) } : undefined }],
    };
  }

  if (["line", "area", "stacked-area", "slope", "connected-scatter", "kagi"].includes(config.chartId)) {
    return {
      ...cartesian,
      tooltip: { ...(common.tooltip as object), trigger: "axis" },
      series: seriesValues.map((seriesName, index) => ({
        name: seriesName,
        type: "line",
        smooth: config.chartId === "area",
        symbolSize: 7,
        data: xValues.map((category) => map.get(`${category}|||${s ? seriesName : "_"}`) ?? 0),
        areaStyle: ["area", "stacked-area"].includes(config.chartId) ? { opacity: config.chartId === "area" ? 0.24 : 0.64 } : undefined,
        stack: config.chartId === "stacked-area" ? "total" : undefined,
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
    return { ...common, grid, legend: { show: seriesValues.length > 1, top: 55 }, xAxis: { type: "value", splitLine, axisLabel: { color: c.muted } }, yAxis: { type: "value", splitLine, axisLabel: { color: c.muted } }, series: grouped };
  }

  if (["pie", "donut", "nightingale", "waffle", "pictogram"].includes(config.chartId)) {
    const data = xValues.map((category) => ({ name: category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 }));
    return {
      ...common,
      legend: { type: "scroll", bottom: 8, textStyle: { color: c.text } },
      series: [{ name: config.title, type: "pie", radius: config.chartId === "donut" ? ["42%", "68%"] : ["0%", "68%"], center: ["50%", "53%"], roseType: config.chartId === "nightingale" ? "area" : undefined, data, label: { show: config.showLabels, formatter: "{b}\n{d}%" }, itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 } }],
    };
  }

  if (config.chartId === "radar") {
    const numericFields = Object.keys(rows[0] ?? {}).filter((field) => rows.some((row) => Number.isFinite(number(row[field])))).slice(0, 7);
    const maxes = numericFields.map((field) => Math.max(...rows.map((row) => number(row[field])), 1));
    return { ...common, legend: { top: 58 }, radar: { center: ["50%", "58%"], radius: "62%", indicator: numericFields.map((field, i) => ({ name: field, max: maxes[i] * 1.1 })), splitArea: { areaStyle: { color: [c.surface, c.surface2] } }, axisName: { color: c.text } }, series: [{ type: "radar", data: rows.slice(0, 4).map((row, i) => ({ name: str(row[x]) || `Item ${i + 1}`, value: numericFields.map((field) => number(row[field])), areaStyle: { opacity: 0.12 } })) }] };
  }

  if (["heatmap", "correlogram"].includes(config.chartId)) {
    const yCats = s ? seriesValues : Array.from(new Set(rows.map((row) => str(row[y]))));
    const values = rows.map((row) => [xValues.indexOf(str(row[x])), yCats.indexOf(s ? str(row[s]) : str(row[y])), size ? number(row[size]) : number(row[y])]);
    const max = Math.max(...values.map((item) => number(item[2])), 1);
    return { ...common, grid, xAxis: { type: "category", data: xValues, splitArea: { show: true }, axisLabel: { color: c.muted } }, yAxis: { type: "category", data: yCats, splitArea: { show: true }, axisLabel: { color: c.muted } }, visualMap: { min: 0, max, calculable: true, orient: "horizontal", left: "center", bottom: 4, inRange: { color: c.sequential }, textStyle: { color: c.text } }, series: [{ type: "heatmap", data: values, label: { show: config.showLabels } }] };
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
    return { ...common, series: [{ type: "sankey", top: 88, bottom: 30, left: 25, right: 25, nodeAlign: "justify", data: nodes, links, emphasis: { focus: "adjacency" }, lineStyle: { color: "gradient", curveness: 0.52, opacity: 0.45 }, label: { color: c.text } }] };
  }

  if (["network", "arc", "chord", "non-ribbon-chord", "edge-bundling", "flowchart", "cooccurrence", "tree", "dendrogram", "brainstorm"].includes(config.chartId)) {
    const sourceField = x;
    const targetField = s || y;
    const nodeNames = Array.from(new Set(rows.flatMap((row) => [str(row[sourceField]), str(row[targetField])])));
    return { ...common, series: [{ type: "graph", top: 76, bottom: 20, layout: config.chartId === "chord" || config.chartId === "non-ribbon-chord" ? "circular" : "force", circular: { rotateLabel: true }, force: { repulsion: 220, edgeLength: [45, 110], gravity: 0.08 }, roam: true, draggable: true, label: { show: true, position: "right", color: c.text }, data: nodeNames.map((name, i) => ({ name, symbolSize: 16 + (i % 5) * 3, itemStyle: { color: palette[i % palette.length] } })), links: rows.map((row) => ({ source: str(row[sourceField]), target: str(row[targetField]), value: size ? number(row[size]) : 1 })), lineStyle: { color: "source", curveness: config.chartId === "arc" ? 0.42 : 0.12, opacity: 0.55 }, emphasis: { focus: "adjacency" } }] };
  }

  if (["candlestick", "ohlc", "point-figure"].includes(config.chartId)) {
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

/** Full ECharts option for a visualization, as drawn on screen (also used by exports). */
export const chartOption = (rows: DataRow[], config: ChartConfig, display: ChartDisplay) => scaleText(buildOption(rows, config, display), display.fontScale);

/** Surface color behind charts for a given theme (used for exports with a background). */
export const chartSurface = (dark: boolean, contrast = false) => chartTheme(dark, contrast).surface;

type Props = { rows: DataRow[]; config: ChartConfig; display: ChartDisplay; locale: Locale; className?: string };

export const ChartRenderer = forwardRef<ChartRendererHandle, Props>(function ChartRenderer({ rows, config, display, locale, className }, ref) {
  const { dark } = display;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const option = useMemo(() => chartOption(rows, config, display), [rows, config, display]);
  const optionRef = useRef(option);
  optionRef.current = option;
  const description = useMemo(() => {
    const entry = getEntry(config.chartId);
    const categories = new Set(rows.map((row) => str(row[config.xField]))).size;
    return locale === "pt"
      ? `${config.title || entry.name.pt}. ${entry.what.pt} A visualização usa ${rows.length} observações e ${categories} categorias no campo ${config.xField}. ${entry.avoid.pt}`
      : `${config.title || entry.name.en}. ${entry.what.en} The visualization uses ${rows.length} observations and ${categories} categories in ${config.xField}. ${entry.avoid.en}`;
  }, [config, locale, rows]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, dark ? "dark" : undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(optionRef.current, { notMerge: true });
    // Resizing inside the observer callback re-triggers it within the same frame.
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => chart.resize()); });
    observer.observe(containerRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); chart.dispose(); chartRef.current = null; };
  }, [dark]);

  useEffect(() => { chartRef.current?.setOption(option, { notMerge: true }); }, [option]);

  useImperativeHandle(ref, () => ({
    getSize: () => ({ width: containerRef.current?.clientWidth || 1200, height: containerRef.current?.clientHeight || 700 }),
    getDescription: () => description,
  }), [description]);

  return <div ref={containerRef} className={className ?? "chart-canvas"} role="img" aria-label={description} />;
});
