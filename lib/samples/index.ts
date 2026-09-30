import type { ChartConfig, DataRow } from "../../components/ChartRenderer";
import { catalog, type Locale } from "../catalog";
import type { ColumnSpecs } from "../columns";
import * as analysis from "./analysis";
import * as comparison from "./comparison";
import type { Dataset, DatasetBuilder, ViewBuilder } from "./core";
import * as places from "./places";
import * as structure from "./structure";

/* ---------------------------------------------------------------------------
 * Sample projects. Every chart in the catalog has a fictional project whose data
 * suits it: a scatter plot gets two related measures, a Sankey gets weighted
 * links, a candlestick gets open/high/low/close prices. Charts that read the
 * same shape of data (bar and lollipop, pie and donut…) share a dataset.
 * ------------------------------------------------------------------------- */

const datasetBuilders: Record<string, DatasetBuilder> = { ...comparison.datasets, ...analysis.datasets, ...structure.datasets, ...places.datasets };
const viewBuilders: Record<string, ViewBuilder> = { ...comparison.views, ...analysis.views, ...structure.views, ...places.views };

export const DEFAULT_SAMPLE_CHART = "grouped-bar";

export type SampleMapping = Pick<ChartConfig, "xField" | "yField" | "seriesField" | "sizeField">;

export type Sample = {
  chartId: string;
  /** Sample data shared by several charts; equal ids mean equal rows. */
  datasetId: string;
  /** Name of the fictional project. */
  name: string;
  /** One sentence telling what the data is about. */
  story: string;
  dataName: string;
  rows: DataRow[];
  columnTypes: ColumnSpecs;
  mapping: SampleMapping;
  title: string;
  subtitle: string;
  showLabels: boolean;
};

const datasetCache = new Map<string, Dataset>();
const datasetFor = (id: string, locale: Locale) => {
  const key = `${locale}:${id}`;
  let dataset = datasetCache.get(key);
  if (!dataset) {
    dataset = datasetBuilders[id](locale);
    datasetCache.set(key, dataset);
  }
  return dataset;
};

const rowsOf = (dataset: Dataset): DataRow[] => dataset.rows.map((cells) => Object.fromEntries(dataset.cols.map((col, i) => [col.name, cells[i]])));

/** Ids of the charts that have a sample; the catalog's ids all do. */
export const sampleChartIds = () => Object.keys(viewBuilders);

export function sampleFor(chartId: string, locale: Locale): Sample {
  const id = viewBuilders[chartId] ? chartId : DEFAULT_SAMPLE_CHART;
  const view = viewBuilders[id](locale);
  const dataset = datasetFor(view.dataset, locale);
  const nameOf = (key?: string) => (key ? dataset.cols.find((col) => col.key === key)?.name ?? "" : "");
  return {
    chartId: id,
    datasetId: view.dataset,
    name: dataset.name,
    story: dataset.story,
    dataName: dataset.file,
    rows: rowsOf(dataset),
    columnTypes: Object.fromEntries(dataset.cols.map((col) => [col.name, { ...col.spec, ...(col.spec.options ? { options: [...col.spec.options] } : {}) }])),
    mapping: { xField: nameOf(view.x), yField: nameOf(view.y), seriesField: nameOf(view.s), sizeField: nameOf(view.size) },
    title: view.title,
    subtitle: view.subtitle,
    showLabels: view.labels ?? false,
  };
}

/** Chart settings that go with a sample: the chart itself plus its fields, title and labels. */
export const sampleConfig = (sample: Sample): ChartConfig => ({ chartId: sample.chartId, ...sample.mapping, title: sample.title, subtitle: sample.subtitle, showLabels: sample.showLabels, patterns: true });

const signatureCache = new Map<string, string>();
const signature = (rows: DataRow[]) => JSON.stringify(rows);

/** The dataset id when `rows` are exactly a sample's data (nothing edited or imported over it), else null. */
export function matchSample(rows: DataRow[], locale: Locale): string | null {
  if (!rows.length) return null;
  const current = signature(rows);
  for (const id of Object.keys(datasetBuilders)) {
    const key = `${locale}:${id}`;
    let expected = signatureCache.get(key);
    if (expected === undefined) {
      expected = signature(rowsOf(datasetFor(id, locale)));
      signatureCache.set(key, expected);
    }
    if (expected === current) return id;
  }
  return null;
}

/** Charts without their own sample would silently fall back to the default one; this lists them. */
export const chartsWithoutSample = () => catalog.filter((entry) => !viewBuilders[entry.id]).map((entry) => entry.id);
