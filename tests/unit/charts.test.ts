import assert from "node:assert/strict";
import test from "node:test";
import * as echarts from "../../components/echarts";
import { chartOption, chartSurface, rowSeries, type ChartDisplay } from "../../components/ChartRenderer";
import { chartThumbnail } from "../../components/chartThumb";
import { catalog, type Locale } from "../../lib/catalog";
import { sampleConfig, sampleFor } from "../../lib/samples";

/* Every chart draws its own sample: no builder throws, every option has something to show, and the SVG has content. */

const render = (id: string, locale: Locale, dark: boolean) => {
  const sample = sampleFor(id, locale);
  const display: ChartDisplay = { dark, contrast: false, fontScale: 1, reducedMotion: true, locale };
  const option = { ...chartOption(sample.rows, sampleConfig(sample), display), animation: false, backgroundColor: chartSurface(dark, false) };
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: 900, height: 520 });
  chart.setOption(option);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return { option, svg };
};

test("every chart type renders its sample in both languages and both themes", () => {
  for (const locale of ["pt", "en"] as Locale[]) {
    for (const dark of [true, false]) {
      for (const entry of catalog) {
        const { option, svg } = render(entry.id, locale, dark);
        const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
        const drawsSomething = series.length > 0 || Array.isArray((option as { graphic?: unknown }).graphic);
        assert.ok(drawsSomething, `${entry.id}/${locale}: has series or graphics`);
        assert.ok(svg.length > 2500, `${entry.id}/${locale}: svg has content (${svg.length} bytes)`);
        assert.ok(/<(path|rect|circle|text|polygon)\b/.test(svg), `${entry.id}/${locale}: svg has drawn elements`);
      }
    }
  }
});

test("every catalog thumbnail is its own chart, drawn without title, legend or axis text", () => {
  const seen = new Set<string>();
  for (const entry of catalog) {
    const svg = chartThumbnail(entry.id, "pt", true);
    assert.ok(svg.startsWith("<svg") && !/^<svg[^>]*\swidth=/.test(svg), `${entry.id}: sizable svg`);
    assert.ok(/<(path|rect|circle|polygon|text)\b/.test(svg), `${entry.id}: draws something`);
    assert.ok(!seen.has(svg), `${entry.id}: differs from every other thumbnail`);
    seen.add(svg);
  }
  const bars = chartThumbnail("stacked-bar", "pt", true);
  assert.ok(!/<text\b/.test(bars), "a bar chart thumbnail carries no text");
});

test("hovering any chart lights the mark under the pointer and dims the rest", () => {
  type Series = { type: string; silent?: boolean; emphasis?: { focus?: string; disabled?: boolean }; renderItem?: (params: unknown, api: unknown) => { focus?: string } | null };
  const api = { getWidth: () => 900, getHeight: () => 520, coord: (value: number[]) => value, size: () => [10, 10], value: (i: number) => i, style: () => ({}), visual: () => "#000", font: () => "12px sans-serif", barLayout: () => [], currentSeriesIndices: () => [0] };
  for (const entry of catalog) {
    const series = render(entry.id, "pt", true).option.series as Series[];
    const interactive = series.filter((item) => !item.silent);
    assert.ok(interactive.length, `${entry.id}: has something to hover`);
    for (const item of interactive) {
      assert.ok(item.emphasis?.focus && item.emphasis.focus !== "none" && !item.emphasis.disabled, `${entry.id}: ${item.type} series dims the rest on hover`);
      if (item.type === "custom" && item.renderItem) {
        let element: { focus?: string } | null = null;
        try { element = item.renderItem({ dataIndex: 0, seriesIndex: 0, dataIndexInside: 0, coordSys: {} }, api); } catch { continue; }
        if (element) assert.ok(element.focus, `${entry.id}: custom marks carry the focus`);
      }
    }
  }
  const dumbbell = sampleFor("dumbbell", "pt");
  const option = chartOption(dumbbell.rows, sampleConfig(dumbbell), { dark: true, contrast: false, fontScale: 1, reducedMotion: true, locale: "pt" });
  assert.ok(rowSeries(option, "dumbbell").length >= 3, "a dumbbell lights its bar and both dots together");
  assert.deepEqual(rowSeries(option, "bar"), [], "a plain bar chart has no linked rows");
});

test("charts speak the viewer's language", () => {
  const pt = render("pareto", "pt", true).svg;
  const en = render("pareto", "en", true).svg;
  assert.match(pt, /acumulado/i);
  assert.match(en, /cumulative/i);
  assert.match(render("waterfall", "en", true).svg, /Increase/);
  assert.match(render("waterfall", "pt", true).svg, /Aumento/);
});

test("specialized builders read the fields they are given", () => {
  const boxplot = render("boxplot", "pt", true).option.series as Array<{ type: string; data: unknown[] }>;
  assert.equal(boxplot[0].type, "boxplot");
  assert.equal(boxplot[0].data.length, 5, "one box per department");
  const pyramid = render("population-pyramid", "pt", true).option.series as Array<{ data: number[] }>;
  assert.ok(pyramid[0].data.every((value) => value <= 0) && pyramid[1].data.every((value) => value >= 0), "two sides of a central axis");
  const pareto = render("pareto", "pt", true).option.series as Array<{ type: string; data: number[] }>;
  assert.equal(pareto[1].type, "line");
  assert.ok(Math.abs(pareto[1].data[pareto[1].data.length - 1] - 100) < 0.11, "cumulative share ends at 100%");
});
