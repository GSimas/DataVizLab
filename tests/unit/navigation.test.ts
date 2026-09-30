import assert from "node:assert/strict";
import test from "node:test";
import { chartOption } from "../../components/ChartRenderer";
import { FULL_VIEW, isNavigable, navigable, type Viewport } from "../../components/chartNavigation";
import { catalog } from "../../lib/catalog";
import { sampleConfig, sampleFor } from "../../lib/samples";

/* Pan and zoom on screen, and transitions for hand-drawn marks. */

type Series = { type: string; roam?: boolean; coordinateSystem?: string; renderItem?: (params: unknown, api: unknown) => Record<string, unknown> | null };
const display = { dark: true, contrast: false, fontScale: 1, reducedMotion: false, locale: "pt" as const };
const optionFor = (id: string, viewport: Viewport = FULL_VIEW) => {
  const sample = sampleFor(id, "pt");
  return navigable(chartOption(sample.rows, sampleConfig(sample), display), id, () => viewport) as { series: Series[]; dataZoom?: Array<{ type: string; xAxisIndex?: number[]; yAxisIndex?: number[] }> };
};
const api = (width = 900, height = 520) => ({ getWidth: () => width, getHeight: () => height, coord: (v: number[]) => v, size: () => [10, 10], value: (i: number) => i, style: () => ({}), visual: () => "#000", font: () => "12px sans-serif" });

test("charts where moving around helps can be panned and zoomed; small ones stay still", () => {
  for (const id of ["network", "tree", "treemap", "sankey", "scatter", "line", "choropleth", "circle-packing", "icicle", "word-cloud"]) assert.ok(isNavigable(id), id);
  for (const id of ["bar", "pie", "venn", "funnel", "waffle", "radar"]) assert.ok(!isNavigable(id), id);
  assert.equal(optionFor("network").series[0].roam, true, "networks use ECharts roam");
  assert.equal(optionFor("sankey").series[0].roam, true, "sankey uses ECharts roam");
  const scatter = optionFor("scatter").dataZoom ?? [];
  assert.deepEqual(scatter.map((zoom) => zoom.type), ["inside", "inside"], "a point cloud zooms both axes with the wheel");
  const line = optionFor("line").dataZoom ?? [];
  assert.equal(line.length, 1, "a time series zooms along x only");
  assert.equal(optionFor("bar").dataZoom, undefined, "a bar chart does not capture the wheel");
});

test("hand-drawn charts draw inside the viewport: semantic zoom lays out a larger canvas, the title stays clear", () => {
  const whole = optionFor("circle-packing").series[0];
  const full = whole.renderItem!({ dataIndex: 3 }, api()) as { type: string; x: number; y: number; scaleX: number; clipPath: unknown; children: Array<{ type: string; shape: { cx: number; cy: number; r: number } }> };
  assert.deepEqual([full.type, full.x, full.y, full.scaleX, full.clipPath], ["group", 0, 0, 1, false], "the full view is a neutral group (same structure as when zoomed)");
  const plain = full.children[0];
  assert.equal(plain.type, "circle");

  const zoomed = optionFor("circle-packing", { scale: 2, x: -300, y: -200 }).series[0];
  const group = zoomed.renderItem!({ dataIndex: 3 }, api()) as { type: string; x: number; y: number; scaleX: number; transition: unknown[]; clipPath: { shape: { y: number } }; children: Array<{ shape: { cx: number; cy: number; r: number } }> };
  const circle = group.children[0].shape;
  assert.equal(group.type, "group");
  assert.equal(group.scaleX, 1, "semantic zoom does not magnify text");
  assert.ok(Math.abs(circle.r - plain.shape.r * 2) < 0.01, "the circle is laid out twice as large");
  // Same mapping as a geometric zoom: screen = 2 × full-view position + (−300, −200). This is what keeps the
  // point under the pointer in place while zooming.
  assert.ok(Math.abs(group.x + circle.cx - (2 * plain.shape.cx - 300)) < 0.01, "x maps exactly");
  assert.ok(Math.abs(group.y + circle.cy - (2 * plain.shape.cy - 200)) < 0.01, "y maps exactly");
  assert.deepEqual(group.transition, [], "moving the view is immediate");
  assert.ok(group.clipPath.shape.y > 84, "content that scrolls up is clipped below the title");

  const cloud = optionFor("word-cloud", { scale: 2, x: -100, y: -50 }).series[0];
  const words = cloud.renderItem!({ dataIndex: 0 }, api()) as { scaleX: number };
  assert.equal(words.scaleX, 2, "the word cloud is magnified as it is (a larger canvas would rearrange the words)");
});

test("hand-drawn marks animate shape, style and position when parameters change, and fade in when new", () => {
  for (const entry of catalog) {
    const sample = sampleFor(entry.id, "pt");
    const series = (chartOption(sample.rows, sampleConfig(sample), display) as { series: Series[] }).series;
    for (const item of series.filter((s) => s.type === "custom" && s.renderItem)) {
      let element: Record<string, unknown> | null = null;
      try { element = item.renderItem!({ dataIndex: 0, seriesIndex: 0, dataIndexInside: 0, coordSys: {} }, api()); } catch { continue; }
      if (!element) continue;
      const mark = element.type === "group" && Array.isArray(element.children) && element.children.length ? (element.children[0] as Record<string, unknown>) : element;
      assert.ok(Array.isArray(mark.transition) && (mark.transition as string[]).includes("shape") && (mark.transition as string[]).includes("style"), `${entry.id}: custom marks transition shape and style`);
      if (mark.type !== "group") assert.ok(mark.enterFrom, `${entry.id}: new marks fade in`);
      assert.equal(mark.leaveTo, undefined, `${entry.id}: no leave transition (it throws in ECharts 6.1)`);
    }
  }
});
