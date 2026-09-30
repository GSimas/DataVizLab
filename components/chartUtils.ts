import type { EChartsOption } from "echarts";
import type { Locale } from "../lib/catalog";
import type { ChartConfig, ChartDisplay, DataRow } from "./ChartRenderer";

/* Shared helpers for turning table rows into chart options. */

export type ChartTheme = {
  palette: string[]; sequential: string[]; surface: string; surface2: string; title: string; text: string; muted: string; axis: string; grid: string; tooltip: string; line: string;
};

/** Everything a chart builder needs; assembled once by the renderer. */
export type Ctx = {
  rows: DataRow[];
  config: ChartConfig;
  display: ChartDisplay;
  /** Title, tooltip and accessibility defaults shared by every chart. */
  common: EChartsOption;
  c: ChartTheme;
  palette: string[];
  grid: Record<string, unknown>;
  axisLine: { lineStyle: { color: string } };
  splitLine: { lineStyle: { color: string } };
  /** Column names chosen in the mapping panel. */
  x: string;
  y: string;
  s: string;
  size: string;
};

export const number = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const str = (value: unknown) => String(value ?? "—");

export const aggregate = (rows: DataRow[], x: string, y: string, series = "") => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = `${str(row[x])}|||${series ? str(row[series]) : "_"}`;
    map.set(key, (map.get(key) ?? 0) + number(row[y]));
  });
  const xValues = Array.from(new Set(rows.map((row) => str(row[x]))));
  const seriesValues = series ? Array.from(new Set(rows.map((row) => str(row[series])))) : ["Value"];
  return { map, xValues, seriesValues };
};

/** Text in the viewer's language (charts draw their own words: legends, tooltips). */
export const L = (display: ChartDisplay, pt: string, en: string) => (display.locale === "en" ? en : pt);
export const tag = (display: ChartDisplay) => (display.locale === "en" ? "en-US" : "pt-BR");
export const localeOf = (display: ChartDisplay): Locale => (display.locale === "en" ? "en" : "pt");

export const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

export const isNumberLike = (value: unknown) => (typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && /^\s*-?\d+([.,]\d+)?\s*$/.test(value));

/** Columns whose every filled cell is a number, in table order. */
export function numericColumns(rows: DataRow[], exclude: string[] = []) {
  const columns = Array.from(new Set(rows.slice(0, 50).flatMap((row) => Object.keys(row)))).filter((column) => !exclude.includes(column));
  return columns.filter((column) => {
    const filled = rows.map((row) => row[column]).filter((value) => value !== null && value !== "" && value !== undefined);
    return filled.length > 0 && filled.every(isNumberLike);
  });
}

/** Local midnight of an ISO date (2024-03-15) in ms, or NaN. */
export const isoTime = (value: unknown) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? new Date(+match[1], +match[2] - 1, +match[3]).getTime() : Number.NaN;
};

/** `#rrggbb` with an alpha channel. */
export const withAlpha = (hex: string, alpha: number) => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((ch) => ch + ch).join("") : value;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

export const compact = (display: ChartDisplay) => {
  const formatter = new Intl.NumberFormat(tag(display), { notation: "compact", maximumFractionDigits: 1 });
  return (value: number) => formatter.format(value);
};

export const plain = (display: ChartDisplay) => {
  const formatter = new Intl.NumberFormat(tag(display), { maximumFractionDigits: 2 });
  return (value: number) => formatter.format(value);
};

/** Minimal shape of the `api` object ECharts hands to custom series. */
export type CustomApi = {
  value: (dim: number) => number;
  coord: (value: number[]) => number[];
  size: (value: number[]) => number[];
  style: (extra?: Record<string, unknown>) => Record<string, unknown>;
  getWidth: () => number;
  getHeight: () => number;
  visual: (name: string) => string;
};
export type CustomParams = { dataIndex: number; seriesIndex: number };

/* Small pieces of option that most builders share. */
export type Tip = { name: string; value: unknown; marker: string; seriesName: string; data: Record<string, number> };
export const tip = (ctx: Ctx, formatter: (params: Tip) => string) => ({ ...(ctx.common.tooltip as object), trigger: "item", formatter });
export const tipAxis = (ctx: Ctx, formatter: (params: Tip[]) => string) => ({ ...(ctx.common.tooltip as object), trigger: "axis", formatter });
export const categoryAxis = (ctx: Ctx, data: string[], inverse = false, extra: Record<string, unknown> = {}) => ({ type: "category", inverse, data, axisLine: ctx.axisLine, axisTick: { show: false }, axisLabel: { color: ctx.c.muted }, ...extra });
export const valueAxis = (ctx: Ctx, extra: Record<string, unknown> = {}) => ({ type: "value", splitLine: ctx.splitLine, axisLabel: { color: ctx.c.muted }, ...extra });
export const legend = (ctx: Ctx, show: boolean, data?: string[]) => ({ show, top: 55, ...(data ? { data } : {}), textStyle: { color: ctx.c.text } });
export const cell = (map: Map<string, number>, cat: string, name: string, keyed: boolean) => map.get(`${cat}|||${keyed ? name : "_"}`) ?? 0;


/** Gaussian kernel density estimate of `values` at `points` (Silverman bandwidth). */
export function kde(values: number[], points: number[]) {
  const n = values.length;
  if (!n) return points.map(() => 0);
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, n - 1)) || 1;
  const h = 1.06 * sd * n ** -0.2;
  return points.map((point) => values.reduce((sum, value) => sum + Math.exp(-0.5 * ((point - value) / h) ** 2), 0) / (n * h * Math.sqrt(2 * Math.PI)));
}

/** Rows grouped by a column, in order of first appearance. */
export function groupValues(rows: DataRow[], group: string, value: string) {
  const groups = new Map<string, number[]>();
  rows.forEach((row) => { const key = str(row[group]); const list = groups.get(key) ?? []; list.push(number(row[value])); groups.set(key, list); });
  return groups;
}
