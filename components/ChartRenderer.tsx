"use client";

import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { familyColors, getEntry, type Locale } from "../lib/catalog";

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
  exportImage: (type: "png" | "svg") => void;
  getDescription: () => string;
};

const palette = ["#356bff", "#f2aa25", "#e85d3f", "#00a88f", "#9c68ff", "#cf4f83", "#3e8fc5", "#75833d"];
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

const base = (config: ChartConfig, dark: boolean): EChartsOption => ({
  backgroundColor: "transparent",
  animationDuration: 650,
  animationEasing: "cubicOut",
  color: palette,
  textStyle: { fontFamily: "Arial, sans-serif", color: dark ? "#dce4f5" : "#25304a" },
  title: {
    text: config.title,
    subtext: config.subtitle,
    left: 18,
    top: 12,
    textStyle: { color: dark ? "#f4f7ff" : "#12192b", fontSize: 18, fontWeight: 650 },
    subtextStyle: { color: dark ? "#98a4bf" : "#69738a", fontSize: 11 },
  },
  tooltip: { trigger: "item", confine: true, backgroundColor: dark ? "#11192c" : "#ffffff", borderColor: dark ? "#35415b" : "#dfe4ef", textStyle: { color: dark ? "#ffffff" : "#12192b" } },
  aria: { enabled: true, decal: { show: config.patterns } },
});

function buildOption(rows: DataRow[], config: ChartConfig, dark: boolean): EChartsOption {
  const entry = getEntry(config.chartId);
  const common = base(config, dark);
  const x = config.xField;
  const y = config.yField;
  const s = config.seriesField;
  const size = config.sizeField;
  const grid = { left: 58, right: 26, top: 88, bottom: 54, containLabel: true };
  const axisLine = { lineStyle: { color: dark ? "#46526c" : "#cfd6e6" } };
  const splitLine = { lineStyle: { color: dark ? "#25304a" : "#e8ebf2" } };
  const { map, xValues, seriesValues } = aggregate(rows, x, y, s);
  const barSeries = seriesValues.map((seriesName, index) => ({
    name: s ? seriesName : config.title || entry.name.en,
    type: "bar" as const,
    data: xValues.map((category) => map.get(`${category}|||${s ? seriesName : "_"}`) ?? 0),
    stack: ["stacked-bar", "normalized-bar", "stacked-area"].includes(config.chartId) ? "total" : undefined,
    label: { show: config.showLabels, position: "top" as const, color: dark ? "#eaf0ff" : "#17213a" },
    itemStyle: { borderRadius: [4, 4, 1, 1] },
    emphasis: { focus: "series" as const },
    color: palette[index % palette.length],
  }));
  const cartesian = {
    ...common,
    grid,
    legend: { show: seriesValues.length > 1, top: 55, textStyle: { color: dark ? "#c4cce0" : "#4e5870" } },
    xAxis: { type: "category" as const, data: xValues, axisLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b", hideOverlap: true }, axisTick: { show: false } },
    yAxis: { type: "value" as const, axisLine: { show: false }, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" }, splitLine },
  };

  if (["bar", "column", "grouped-bar", "stacked-bar", "normalized-bar", "pareto", "butterfly"].includes(config.chartId)) {
    if (config.chartId === "bar") {
      return { ...common, grid, xAxis: { type: "value", splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, yAxis: { type: "category", data: xValues, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" }, axisLine, axisTick: { show: false } }, series: barSeries.map((item) => ({ ...item, label: { ...item.label, position: "right" } })) };
    }
    if (config.chartId === "normalized-bar") {
      const totals = xValues.map((category) => seriesValues.reduce((sum, seriesName) => sum + (map.get(`${category}|||${seriesName}`) ?? 0), 0));
      const normalized = barSeries.map((item) => ({ ...item, data: item.data.map((value, i) => totals[i] ? Math.round((Number(value) / totals[i]) * 1000) / 10 : 0) }));
      return { ...cartesian, yAxis: { ...(cartesian.yAxis as object), max: 100, axisLabel: { formatter: "{value}%", color: dark ? "#aeb8cf" : "#5d667b" } }, series: normalized };
    }
    return { ...cartesian, series: barSeries };
  }

  if (["lollipop", "dot-plot", "dumbbell", "span", "bullet"].includes(config.chartId)) {
    return {
      ...common,
      grid,
      xAxis: { type: "value", splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } },
      yAxis: { type: "category", data: xValues, axisLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } },
      series: [{ type: "bar", data: xValues.map((category) => map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0), barWidth: config.chartId === "lollipop" ? 2 : 12, itemStyle: { color: "#356bff", borderRadius: 4 }, label: { show: config.showLabels, position: "right" }, markPoint: config.chartId === "lollipop" ? { symbolSize: 13, data: xValues.map((category, index) => ({ name: category, coord: [map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0, index] })) } : undefined }],
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
    return { ...common, grid, legend: { show: seriesValues.length > 1, top: 55 }, xAxis: { type: "value", splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, yAxis: { type: "value", splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, series: grouped };
  }

  if (["pie", "donut", "nightingale", "waffle", "pictogram"].includes(config.chartId)) {
    const data = xValues.map((category) => ({ name: category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 }));
    return {
      ...common,
      legend: { type: "scroll", bottom: 8, textStyle: { color: dark ? "#c4cce0" : "#4e5870" } },
      series: [{ name: config.title, type: "pie", radius: config.chartId === "donut" ? ["42%", "68%"] : ["0%", "68%"], center: ["50%", "53%"], roseType: config.chartId === "nightingale" ? "area" : undefined, data, label: { show: config.showLabels, formatter: "{b}\n{d}%" }, itemStyle: { borderColor: dark ? "#111827" : "#ffffff", borderWidth: 2, borderRadius: 3 } }],
    };
  }

  if (config.chartId === "radar") {
    const numericFields = Object.keys(rows[0] ?? {}).filter((field) => rows.some((row) => Number.isFinite(number(row[field])))).slice(0, 7);
    const maxes = numericFields.map((field) => Math.max(...rows.map((row) => number(row[field])), 1));
    return { ...common, legend: { top: 58 }, radar: { center: ["50%", "58%"], radius: "62%", indicator: numericFields.map((field, i) => ({ name: field, max: maxes[i] * 1.1 })), splitArea: { areaStyle: { color: dark ? ["#141d31", "#101827"] : ["#f7f9fd", "#eef2f9"] } }, axisName: { color: dark ? "#cbd4e8" : "#4b566e" } }, series: [{ type: "radar", data: rows.slice(0, 4).map((row, i) => ({ name: str(row[x]) || `Item ${i + 1}`, value: numericFields.map((field) => number(row[field])), areaStyle: { opacity: 0.12 } })) }] };
  }

  if (["heatmap", "correlogram"].includes(config.chartId)) {
    const yCats = s ? seriesValues : Array.from(new Set(rows.map((row) => str(row[y]))));
    const values = rows.map((row) => [xValues.indexOf(str(row[x])), yCats.indexOf(s ? str(row[s]) : str(row[y])), size ? number(row[size]) : number(row[y])]);
    const max = Math.max(...values.map((item) => number(item[2])), 1);
    return { ...common, grid, xAxis: { type: "category", data: xValues, splitArea: { show: true }, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, yAxis: { type: "category", data: yCats, splitArea: { show: true }, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, visualMap: { min: 0, max, calculable: true, orient: "horizontal", left: "center", bottom: 4, inRange: { color: ["#e8efff", "#8fb2ff", "#356bff", "#102d83"] }, textStyle: { color: dark ? "#dce4f5" : "#25304a" } }, series: [{ type: "heatmap", data: values, label: { show: config.showLabels } }] };
  }

  if (["histogram", "density", "violin", "boxplot", "ridgeline", "stem-leaf", "population-pyramid", "error-bars"].includes(config.chartId)) {
    const values = rows.map((row) => number(row[y || x])).filter(Number.isFinite);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const bins = Math.max(5, Math.min(14, Math.ceil(Math.sqrt(values.length))));
    const width = (max - min || 1) / bins;
    const counts = Array.from({ length: bins }, () => 0);
    values.forEach((value) => { counts[Math.min(bins - 1, Math.floor((value - min) / width))] += 1; });
    return { ...common, grid, xAxis: { type: "category", data: counts.map((_, i) => `${(min + i * width).toFixed(1)}–${(min + (i + 1) * width).toFixed(1)}`), axisLabel: { rotate: 32, color: dark ? "#aeb8cf" : "#5d667b" }, axisLine }, yAxis: { type: "value", splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, series: [{ type: config.chartId === "density" || config.chartId === "ridgeline" ? "line" : "bar", data: counts, smooth: true, areaStyle: config.chartId === "density" || config.chartId === "violin" ? { opacity: 0.25 } : undefined, itemStyle: { color: familyColors.distribution, borderRadius: [4, 4, 0, 0] }, label: { show: config.showLabels } }] };
  }

  if (["funnel"].includes(config.chartId)) {
    return { ...common, series: [{ type: "funnel", top: 85, bottom: 30, left: "12%", width: "76%", sort: "descending", gap: 3, data: xValues.map((category) => ({ name: category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 })), label: { show: true, formatter: "{b}: {c}" }, itemStyle: { borderColor: dark ? "#111827" : "#fff", borderWidth: 2 } }] };
  }

  if (["treemap", "sunburst", "circle-packing", "icicle", "marimekko"].includes(config.chartId)) {
    const data = xValues.map((category) => ({ name: category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 }));
    if (config.chartId === "sunburst") return { ...common, series: [{ type: "sunburst", center: ["50%", "56%"], radius: ["12%", "70%"], data, label: { rotate: "radial" }, itemStyle: { borderColor: dark ? "#111827" : "#fff", borderWidth: 2 } }] };
    return { ...common, series: [{ type: "treemap", top: 82, bottom: 20, left: 20, right: 20, roam: false, breadcrumb: { show: false }, label: { show: true, formatter: "{b}\n{c}" }, data, itemStyle: { borderColor: dark ? "#111827" : "#fff", borderWidth: 3, gapWidth: 2 } }] };
  }

  if (["sankey", "alluvial"].includes(config.chartId)) {
    const sourceField = x;
    const targetField = s || y;
    const valueField = size || (s ? y : "");
    const nodes = Array.from(new Set(rows.flatMap((row) => [str(row[sourceField]), str(row[targetField])]))).map((name) => ({ name }));
    const links = rows.map((row) => ({ source: str(row[sourceField]), target: str(row[targetField]), value: valueField ? Math.max(1, number(row[valueField])) : 1 }));
    return { ...common, series: [{ type: "sankey", top: 88, bottom: 30, left: 25, right: 25, nodeAlign: "justify", data: nodes, links, emphasis: { focus: "adjacency" }, lineStyle: { color: "gradient", curveness: 0.52, opacity: 0.45 }, label: { color: dark ? "#dce4f5" : "#25304a" } }] };
  }

  if (["network", "arc", "chord", "non-ribbon-chord", "edge-bundling", "flowchart", "cooccurrence", "tree", "dendrogram", "brainstorm"].includes(config.chartId)) {
    const sourceField = x;
    const targetField = s || y;
    const nodeNames = Array.from(new Set(rows.flatMap((row) => [str(row[sourceField]), str(row[targetField])])));
    return { ...common, series: [{ type: "graph", top: 76, bottom: 20, layout: config.chartId === "chord" || config.chartId === "non-ribbon-chord" ? "circular" : "force", circular: { rotateLabel: true }, force: { repulsion: 220, edgeLength: [45, 110], gravity: 0.08 }, roam: true, draggable: true, label: { show: true, position: "right", color: dark ? "#dce4f5" : "#25304a" }, data: nodeNames.map((name, i) => ({ name, symbolSize: 16 + (i % 5) * 3, itemStyle: { color: palette[i % palette.length] } })), links: rows.map((row) => ({ source: str(row[sourceField]), target: str(row[targetField]), value: size ? number(row[size]) : 1 })), lineStyle: { color: "source", curveness: config.chartId === "arc" ? 0.42 : 0.12, opacity: 0.55 }, emphasis: { focus: "adjacency" } }] };
  }

  if (["candlestick", "ohlc", "point-figure"].includes(config.chartId)) {
    const numericFields = Object.keys(rows[0] ?? {}).filter((field) => rows.some((row) => number(row[field]) !== 0)).filter((field) => field !== x).slice(0, 4);
    const candles = rows.map((row) => {
      const vals = numericFields.map((field) => number(row[field]));
      const open = vals[0] ?? number(row[y]); const close = vals[3] ?? vals[1] ?? open; const low = Math.min(...vals, open, close); const high = Math.max(...vals, open, close);
      return [open, close, low, high];
    });
    return { ...common, grid, xAxis: { type: "category", data: rows.map((row) => str(row[x])), axisLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, yAxis: { scale: true, splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, dataZoom: [{ type: "inside" }, { type: "slider", bottom: 8, height: 18 }], series: [{ type: "candlestick", data: candles, itemStyle: { color: "#00a88f", color0: "#e85d3f", borderColor: "#00a88f", borderColor0: "#e85d3f" } }] };
  }

  if (["choropleth", "bubble-map", "dot-map", "flow-map", "hexbin-map", "cartogram"].includes(config.chartId)) {
    return { ...common, grid, xAxis: { type: "value", name: "Longitude", min: -180, max: 180, splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, yAxis: { type: "value", name: "Latitude", min: -90, max: 90, splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, graphic: [{ type: "text", left: "center", bottom: 18, style: { text: "Local coordinate view · add GeoJSON for territorial geometry", fill: dark ? "#7f8ba5" : "#7b8498", fontSize: 10 } }], series: [{ type: "scatter", data: rows.map((row) => [number(row[x]), number(row[y]), size ? number(row[size]) : 18, str(row[s || x])]), symbolSize: (value: number[]) => Math.max(7, Math.sqrt(Math.abs(value[2])) * 2.5), itemStyle: { color: familyColors.geo, opacity: 0.72 }, label: { show: config.showLabels, formatter: "{@[3]}" } }] };
  }

  if (["word-cloud", "term-frequency", "word-tree"].includes(config.chartId)) {
    const ranked = xValues.map((category) => ({ category, value: map.get(`${category}|||${s ? seriesValues[0] : "_"}`) ?? 0 })).sort((a, b) => b.value - a.value).slice(0, 25);
    return { ...common, grid, xAxis: { type: "value", splitLine, axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" } }, yAxis: { type: "category", inverse: true, data: ranked.map((item) => item.category), axisLabel: { color: dark ? "#aeb8cf" : "#5d667b" }, axisLine }, series: [{ type: "bar", data: ranked.map((item) => item.value), itemStyle: { color: familyColors.text, borderRadius: [0, 5, 5, 0] }, label: { show: true, position: "right" } }] };
  }

  return { ...cartesian, series: barSeries };
}

type Props = { rows: DataRow[]; config: ChartConfig; dark: boolean; locale: Locale; className?: string };

export const ChartRenderer = forwardRef<ChartRendererHandle, Props>(function ChartRenderer({ rows, config, dark, locale, className }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const option = useMemo(() => buildOption(rows, config, dark), [rows, config, dark]);
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
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); chart.dispose(); chartRef.current = null; };
  }, [dark]);

  useEffect(() => { chartRef.current?.setOption(option, { notMerge: true }); }, [option]);

  useImperativeHandle(ref, () => ({
    exportImage: (type) => {
      const chart = chartRef.current;
      if (!chart) return;
      const url = chart.getDataURL({ type: type === "svg" ? "svg" : "png", pixelRatio: type === "png" ? 3 : 1, backgroundColor: dark ? "#101727" : "#fbfcff" });
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `datavizlab-${config.chartId}.${type}`;
      anchor.click();
    },
    getDescription: () => description,
  }), [config.chartId, dark, description]);

  return <div ref={containerRef} className={className ?? "chart-canvas"} role="img" aria-label={description} />;
});
