import type { Locale } from "../catalog";
import type { ColumnSpec } from "../columns";

/* ---------------------------------------------------------------------------
 * Building blocks of the sample library. A dataset is a small fictional project
 * (a table plus the story behind it); a view says which columns feed which chart
 * field. Datasets are written once and shared by the charts they suit.
 * ------------------------------------------------------------------------- */

export type Cell = string | number | boolean | null;
export type Col = { key: string; name: string; spec: ColumnSpec };
export type Dataset = { file: string; name: string; story: string; cols: Col[]; rows: Cell[][] };
export type View = { dataset: string; x: string; y?: string; s?: string; size?: string; title: string; subtitle: string; labels?: boolean };
export type DatasetBuilder = (l: Locale) => Dataset;
export type ViewBuilder = (l: Locale) => View;

/** Picks the text for the current language. */
export const P = (l: Locale, pt: string, en: string) => (l === "pt" ? pt : en);

/* Column shorthands: key (used by views), header, and a type. */
export const text = (key: string, name: string): Col => ({ key, name, spec: { type: "text" } });
export const cat = (key: string, name: string, options?: string[]): Col => ({ key, name, spec: { type: "category", ...(options ? { options } : {}) } });
export const num = (key: string, name: string): Col => ({ key, name, spec: { type: "number" } });
export const int = (key: string, name: string): Col => ({ key, name, spec: { type: "integer" } });
export const money = (key: string, name: string, currency = "BRL"): Col => ({ key, name, spec: { type: "currency", currency } });
export const pct = (key: string, name: string): Col => ({ key, name, spec: { type: "percent" } });
export const date = (key: string, name: string): Col => ({ key, name, spec: { type: "date" } });
export const flag = (key: string, name: string): Col => ({ key, name, spec: { type: "boolean" } });

/** Builds a view; the subtitle always ends by saying the data is fictional. */
export const view = (l: Locale, dataset: string, fields: { x: string; y?: string; s?: string; size?: string }, title: [string, string], subtitle: [string, string], labels?: boolean): View => ({
  dataset,
  ...fields,
  title: P(l, title[0], title[1]),
  subtitle: `${P(l, subtitle[0], subtitle[1])} · ${P(l, "dados fictícios", "fictional data")}`,
  ...(labels === undefined ? {} : { labels }),
});

/* Deterministic pseudo-random numbers: the same sample every time, in every browser. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws (Box–Muller) from a uniform generator. */
export const gaussian = (rand: () => number) => () => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

export const round = (value: number, digits = 0) => { const k = 10 ** digits; return Math.round(value * k) / k; };
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const MONTHS: Record<Locale, string[]> = {
  pt: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** First day of the n-th month after `year`-`month` as an ISO date. */
export const monthStart = (year: number, month: number, offset: number) => {
  const d = new Date(year, month - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export const datasetOf = (file: string, name: string, story: string, cols: Col[], rows: Cell[][]): Dataset => ({ file, name, story, cols, rows });
