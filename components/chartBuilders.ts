import type { EChartsOption } from "echarts";
import { geo } from "./chartGeo";
import { errorBars, ridgeline, stemLeaf, strip, violin } from "./chartDistribution";
import { pictogram, upset, venn, waffle } from "./chartParts";
import { arc, chord, circlePacking, flowchart, icicle, marimekko, parallel, tree } from "./chartStructure";
import { connected, kagi, ohlc, pointFigure, schedule, spiral, stream } from "./chartTime";
import { wordCloud, wordTree } from "./chartText";
import { L, aggregate, categoryAxis, cell, compact, isoTime, legend, number, numericColumns, plain, quantile, str, tip, tipAxis, valueAxis, withAlpha, type Ctx, type Tip } from "./chartUtils";

/* ---------------------------------------------------------------------------
 * Chart builders that go beyond "one series per group": each turns the table into
 * the ECharts option that draws the chart it is named after. A builder returns null
 * when the mapped fields cannot form that chart, and the renderer falls back to a
 * plain version.
 * ------------------------------------------------------------------------- */

/** Dot plot: one dot per category and series on a shared scale. */
function dotPlot(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, grid, x, y, s, palette, display } = ctx;
  const { map, xValues, seriesValues } = aggregate(rows, x, y, s);
  const fmt = plain(display);
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => `${p.name}<br/>${p.marker} ${p.seriesName}: <b>${fmt(Number((p.value as unknown[])[0]))}</b>`),
    legend: legend(ctx, seriesValues.length > 1),
    xAxis: valueAxis(ctx),
    yAxis: categoryAxis(ctx, xValues, true, { splitLine: { show: true, lineStyle: { color: c.grid, type: "dashed" } } }),
    series: seriesValues.map((name, i) => ({
      name: s ? name : config.title, type: "scatter", symbolSize: 14, itemStyle: { color: palette[i % palette.length], borderColor: c.surface, borderWidth: 2 },
      label: { show: config.showLabels, position: "right", color: c.title, formatter: (p: Tip) => fmt(Number((p.value as unknown[])[0])) },
      data: xValues.map((cat) => [cell(map, cat, name, Boolean(s)), cat]),
    })),
  } as EChartsOption;
}

/** Dumbbell (dots joined by a line) and span chart (floating bar from minimum to maximum). */
function range(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, grid, x, y, s, palette, display } = ctx;
  const dumbbell = config.chartId === "dumbbell";
  const { map, xValues, seriesValues } = aggregate(rows, x, y, s);
  const valuesOf = (cat: string) => seriesValues.map((name) => cell(map, cat, name, Boolean(s)));
  const lows = xValues.map((cat) => Math.min(...valuesOf(cat)));
  const highs = xValues.map((cat) => Math.max(...valuesOf(cat)));
  const lo = Math.min(...lows);
  const hi = Math.max(...highs);
  const pad = (hi - lo || 1) * 0.15;
  const min = lo >= 0 ? Math.max(0, Math.floor(lo - pad)) : Math.floor(lo - pad);
  const max = Math.ceil(hi + pad);
  const fmt = plain(display);
  const thickness = dumbbell ? 3 : 18;
  const ends = (position: "left" | "right", values: number[]) => ({
    type: "scatter", silent: true, symbolSize: 1, itemStyle: { color: "transparent" }, tooltip: { show: false },
    label: { show: true, position, color: c.title, formatter: (p: Tip) => fmt(Number((p.value as unknown[])[0])) },
    data: values.map((value, i) => [value, xValues[i]]),
  });
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => (p.data?.low !== undefined ? `${p.name}<br/>${fmt(p.data.low)} – ${fmt(p.data.high)}` : `${(p.value as unknown[])[1]}<br/>${p.marker} ${p.seriesName}: <b>${fmt(Number((p.value as unknown[])[0]))}</b>`)),
    legend: legend(ctx, dumbbell && seriesValues.length > 1, seriesValues),
    xAxis: valueAxis(ctx, { min, max }),
    yAxis: categoryAxis(ctx, xValues, true),
    series: [
      { type: "bar", stack: "range", silent: true, barWidth: thickness, itemStyle: { color: "transparent" }, tooltip: { show: false }, data: lows },
      { type: "bar", stack: "range", name: "range", barWidth: thickness, itemStyle: { color: dumbbell ? c.axis : withAlpha(palette[0], 0.85), borderRadius: 999 }, data: highs.map((high, i) => ({ value: high - lows[i], low: lows[i], high })) },
      ...(dumbbell
        ? seriesValues.map((name, k) => ({
          name: s ? name : config.title, type: "scatter", symbolSize: 15, z: 4, itemStyle: { color: palette[k % palette.length], borderColor: c.surface, borderWidth: 2 },
          label: { show: config.showLabels, position: "top", color: c.title, formatter: (p: Tip) => fmt(Number((p.value as unknown[])[0])) },
          data: xValues.map((cat) => [valuesOf(cat)[k], cat]),
        }))
        : config.showLabels ? [ends("left", lows), ends("right", highs)] : []),
    ],
  } as EChartsOption;
}

/** Bullet graph: performance bar over qualitative bands, with a mark for the target (size field). */
function bullet(ctx: Ctx): EChartsOption {
  const { rows, c, common, grid, x, y, size, palette, display } = ctx;
  const measure = aggregate(rows, x, y);
  const target = size ? aggregate(rows, x, size) : null;
  const cats = measure.xValues;
  const value = (cat: string) => measure.map.get(`${cat}|||_`) ?? 0;
  const goal = (cat: string) => target?.map.get(`${cat}|||_`);
  const top = Math.max(...cats.map((cat) => Math.max(value(cat), goal(cat) ?? 0)), 1);
  const max = Math.ceil(top * 1.05);
  const fmt = plain(display);
  const band = (share: number, alpha: number) => ({ type: "bar", stack: "band", silent: true, barWidth: 26, barGap: "-100%", itemStyle: { color: withAlpha(c.muted, alpha) }, tooltip: { show: false }, data: cats.map(() => max * share) });
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => {
      const cat = (p.name || String((p.value as unknown[])[1])) as string;
      return `${cat}<br/>${L(display, "Realizado", "Actual")}: <b>${fmt(value(cat))}</b>${goal(cat) !== undefined ? `<br/>${L(display, "Meta", "Target")}: <b>${fmt(goal(cat) as number)}</b>` : ""}`;
    }),
    xAxis: valueAxis(ctx, { min: 0, max }),
    yAxis: categoryAxis(ctx, cats, true),
    series: [
      band(0.6, 0.5), band(0.25, 0.32), band(0.15, 0.18),
      { name: "value", type: "bar", barWidth: 10, barGap: "-100%", z: 3, itemStyle: { color: palette[0], borderRadius: 2 }, label: { show: ctx.config.showLabels, position: "right", color: c.title, formatter: (p: Tip) => fmt(Number(p.value)) }, data: cats.map(value) },
      ...(target ? [{ name: "target", type: "scatter", z: 5, symbol: "rect", symbolSize: [3, 30], itemStyle: { color: c.title }, data: cats.map((cat) => [goal(cat) ?? 0, cat]) }] : []),
    ],
  } as EChartsOption;
}

/** Pareto: categories ranked by size, with the cumulative share on a second axis. */
function pareto(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, grid, x, y, palette, display } = ctx;
  const { map, xValues } = aggregate(rows, x, y);
  const ranked = xValues.map((cat) => ({ cat, value: map.get(`${cat}|||_`) ?? 0 })).sort((a, b) => b.value - a.value);
  const total = ranked.reduce((sum, item) => sum + item.value, 0) || 1;
  let running = 0;
  const cumulative = ranked.map((item) => { running += item.value; return Math.round((running / total) * 1000) / 10; });
  const name = config.title || y;
  const share = L(display, "% acumulado", "Cumulative %");
  return {
    ...common, grid: { ...grid, right: 58 },
    tooltip: tipAxis(ctx, (list) => `${list[0].name}<br/>${list.map((p) => `${p.marker} ${p.seriesName}: <b>${p.seriesName === share ? `${p.value}%` : plain(ctx.display)(Number(p.value))}</b>`).join("<br/>")}`),
    legend: legend(ctx, true),
    xAxis: categoryAxis(ctx, ranked.map((item) => item.cat), false, { axisLabel: { color: c.muted, interval: 0, width: 84, overflow: "break" } }),
    yAxis: [valueAxis(ctx), valueAxis(ctx, { min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: c.muted, formatter: "{value}%" } })],
    series: [
      { name, type: "bar", barWidth: "58%", itemStyle: { color: palette[0], borderRadius: [4, 4, 0, 0] }, label: { show: config.showLabels, position: "top", color: c.title }, data: ranked.map((item) => item.value) },
      { name: share, type: "line", yAxisIndex: 1, symbol: "circle", symbolSize: 8, lineStyle: { width: 2.5, color: palette[2] }, itemStyle: { color: palette[2] }, label: { show: config.showLabels, position: "top", color: c.title, formatter: "{c}%" },
        markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: c.axis }, label: { formatter: "80%", color: c.muted }, data: [{ yAxis: 80 }] }, data: cumulative },
    ],
  } as EChartsOption;
}

/** Waterfall: running total built from changes; rows whose series says "total" are drawn from zero. */
function waterfall(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, grid, x, y, s, palette, display } = ctx;
  const isTotal = (label: string) => /total|saldo|balance|subtotal/i.test(label);
  const fmt = compact(display);
  let running = 0;
  const steps = rows.map((row, index) => {
    const label = str(row[x]);
    const value = number(row[y]);
    if (s && isTotal(str(row[s]))) {
      const end = index === 0 ? value : running;
      running = end;
      return { label, delta: end, start: 0, end, kind: "total" as const };
    }
    const start = running;
    running += value;
    return { label, delta: value, start, end: running, kind: value >= 0 ? ("up" as const) : ("down" as const) };
  });
  const kinds = [["up", L(display, "Aumento", "Increase"), palette[0]], ["down", L(display, "Redução", "Decrease"), palette[4]], ["total", "Total", palette[5]]] as const;
  const present = kinds.filter(([kind]) => steps.some((step) => step.kind === kind));
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => `${p.name}<br/>${p.marker} ${p.seriesName}: <b>${p.data?.delta !== undefined ? plain(display)(p.data.delta) : ""}</b>`),
    legend: legend(ctx, true, present.map(([, name]) => name)),
    xAxis: categoryAxis(ctx, steps.map((step) => step.label), false, { axisLabel: { color: c.muted, interval: 0, width: 84, overflow: "break" } }),
    yAxis: valueAxis(ctx, { axisLabel: { color: c.muted, formatter: (v: number) => fmt(v) } }),
    series: [
      { type: "bar", stack: "bridge", silent: true, itemStyle: { color: "transparent" }, tooltip: { show: false }, data: steps.map((step) => Math.min(step.start, step.end)) },
      ...present.map(([kind, name, color]) => ({
        name, type: "bar", stack: "bridge", barWidth: "58%", itemStyle: { color, borderRadius: 3 },
        label: { show: config.showLabels, position: "top", color: c.title, formatter: (p: Tip) => (kind === "total" ? fmt(p.data.delta) : `${p.data.delta >= 0 ? "+" : "−"}${fmt(Math.abs(p.data.delta))}`) },
        data: steps.map((step) => (step.kind === kind ? { value: Math.abs(step.end - step.start), delta: step.delta } : null)),
      })),
    ],
  } as EChartsOption;
}

/** Butterfly chart and population pyramid: two series on opposite sides of a central axis. */
function mirrored(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, grid, x, y, s, palette, display } = ctx;
  if (!s) return null;
  const { map, xValues, seriesValues } = aggregate(rows, x, y, s);
  if (seriesValues.length < 2) return null;
  const sides = seriesValues.slice(0, 2);
  const value = (cat: string, name: string) => map.get(`${cat}|||${name}`) ?? 0;
  const peak = Math.ceil(Math.max(...xValues.flatMap((cat) => sides.map((name) => value(cat, name))), 1) * 1.08);
  const fmt = plain(display);
  const pyramid = config.chartId === "population-pyramid";
  return {
    ...common, grid,
    tooltip: tipAxis(ctx, (list) => `${list[0].name}<br/>${list.map((p) => `${p.marker} ${p.seriesName}: <b>${fmt(Math.abs(Number(p.value)))}</b>`).join("<br/>")}`),
    legend: legend(ctx, true),
    xAxis: valueAxis(ctx, { min: -peak, max: peak, axisLabel: { color: c.muted, formatter: (v: number) => fmt(Math.abs(v)) } }),
    yAxis: categoryAxis(ctx, xValues, !pyramid, { axisLine: { onZero: false, lineStyle: { color: c.axis } } }),
    series: sides.map((name, i) => ({
      name, type: "bar", stack: "mirror", barWidth: "64%",
      itemStyle: { color: palette[i], borderRadius: i === 0 ? [3, 0, 0, 3] : [0, 3, 3, 0] },
      label: { show: config.showLabels, position: i === 0 ? "insideLeft" : "insideRight", color: "#fff", formatter: (p: Tip) => fmt(Math.abs(Number(p.value))) },
      data: xValues.map((cat) => (i === 0 ? -1 : 1) * value(cat, name)),
    })),
  } as EChartsOption;
}

/** Box plot per group, with Tukey whiskers (1.5 × IQR) and the points beyond them. */
function boxplot(ctx: Ctx): EChartsOption {
  const { rows, c, common, grid, x, y, palette, display } = ctx;
  const groups = new Map<string, number[]>();
  rows.forEach((row) => { const key = str(row[x]); const list = groups.get(key) ?? []; list.push(number(row[y])); groups.set(key, list); });
  const names = Array.from(groups.keys());
  const fmt = plain(display);
  const stats = names.map((name) => {
    const sorted = [...(groups.get(name) ?? [])].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25); const median = quantile(sorted, 0.5); const q3 = quantile(sorted, 0.75);
    const fence = 1.5 * (q3 - q1);
    const inside = sorted.filter((value) => value >= q1 - fence && value <= q3 + fence);
    return { name, low: inside[0] ?? sorted[0], q1, median, q3, high: inside[inside.length - 1] ?? sorted[sorted.length - 1], outliers: sorted.filter((value) => value < q1 - fence || value > q3 + fence), n: sorted.length };
  });
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => {
      if (p.seriesName === "outliers") return `${(p.value as unknown[])[0]}<br/>${L(display, "Fora da faixa", "Outlier")}: <b>${fmt(Number((p.value as unknown[])[1]))}</b>`;
      const stat = stats.find((item) => item.name === p.name);
      if (!stat) return p.name;
      return [`<b>${stat.name}</b> · n = ${stat.n}`, `${L(display, "Máximo", "Maximum")}: ${fmt(stat.high)}`, `Q3: ${fmt(stat.q3)}`, `${L(display, "Mediana", "Median")}: <b>${fmt(stat.median)}</b>`, `Q1: ${fmt(stat.q1)}`, `${L(display, "Mínimo", "Minimum")}: ${fmt(stat.low)}`].join("<br/>");
    }),
    xAxis: categoryAxis(ctx, names),
    yAxis: valueAxis(ctx, { scale: true }),
    series: [
      { name: "box", type: "boxplot", boxWidth: [14, 56], itemStyle: { color: withAlpha(palette[0], 0.28), borderColor: palette[0], borderWidth: 2 }, emphasis: { itemStyle: { color: withAlpha(palette[0], 0.45) } }, data: stats.map((stat) => [stat.low, stat.q1, stat.median, stat.q3, stat.high]) },
      { name: "outliers", type: "scatter", symbolSize: 8, itemStyle: { color: palette[4], borderColor: c.surface, borderWidth: 1 }, data: stats.flatMap((stat) => stat.outliers.map((value) => [stat.name, value])) },
    ],
  } as EChartsOption;
}

const MONTH_NAMES = { pt: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };

/** Calendar heat map: one cell per day, coloured by the value. */
function calendar(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, display } = ctx;
  const points = rows.map((row) => [str(row[x]).slice(0, 10), number(row[y])] as [string, number]).filter(([day]) => Number.isFinite(isoTime(day))).sort((a, b) => a[0].localeCompare(b[0]));
  if (!points.length) return null;
  const max = Math.max(...points.map((point) => point[1]), 1);
  const en = display.locale === "en";
  return {
    ...common,
    tooltip: tip(ctx, (p) => `${(p.value as unknown[])[0]}<br/><b>${plain(display)(Number((p.value as unknown[])[1]))}</b>`),
    visualMap: { min: 0, max, type: "continuous", orient: "horizontal", left: "center", bottom: 10, itemWidth: 14, itemHeight: 140, inRange: { color: c.sequential }, textStyle: { color: c.text } },
    calendar: {
      top: 100, left: 58, right: 28, bottom: 64, cellSize: "auto", range: [points[0][0], points[points.length - 1][0]],
      itemStyle: { color: c.surface2, borderColor: c.surface, borderWidth: 3 }, splitLine: { show: true, lineStyle: { color: c.axis, width: 1 } }, yearLabel: { show: false },
      monthLabel: { color: c.muted, nameMap: MONTH_NAMES[en ? "en" : "pt"] }, dayLabel: { color: c.muted, firstDay: 1, nameMap: en ? ["S", "M", "T", "W", "T", "F", "S"] : ["D", "S", "T", "Q", "Q", "S", "S"] },
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: points }],
  } as EChartsOption;
}

/** Radial bar chart: one bar per category, growing outward around a circle. */
function radialBar(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, x, y, palette, display } = ctx;
  const { map, xValues } = aggregate(rows, x, y);
  const fmt = plain(display);
  return {
    ...common,
    tooltip: tip(ctx, (p) => `${p.name}<br/><b>${fmt(Number(p.value))}</b>`),
    polar: { center: ["50%", "56%"], radius: ["14%", "70%"] },
    angleAxis: { type: "category", data: xValues, startAngle: 90, axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.muted }, axisTick: { show: false } },
    radiusAxis: { type: "value", axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: c.grid } } },
    series: [{ type: "bar", coordinateSystem: "polar", roundCap: true, itemStyle: { color: palette[0] }, label: { show: config.showLabels, position: "middle", color: "#fff", formatter: (p: Tip) => fmt(Number(p.value)) }, data: xValues.map((cat) => map.get(`${cat}|||_`) ?? 0) }],
  } as EChartsOption;
}

/** Heat map and correlogram: one coloured cell per pair (x category, series category). */
function heat(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, grid, x, y, s, size, palette, display } = ctx;
  const correlogram = config.chartId === "correlogram";
  const { xValues } = aggregate(rows, x, y, s);
  const yCats = s ? Array.from(new Set(rows.map((row) => str(row[s])))) : Array.from(new Set(rows.map((row) => str(row[y]))));
  const values = rows.map((row) => [xValues.indexOf(str(row[x])), yCats.indexOf(s ? str(row[s]) : str(row[y])), size ? number(row[size]) : number(row[y])]);
  const max = Math.max(...values.map((item) => number(item[2])), 1);
  const fmt = plain(display);
  return {
    ...common, grid: { ...grid, bottom: 84 },
    tooltip: tip(ctx, (p) => { const v = p.value as number[]; return `${yCats[v[1]]} × ${xValues[v[0]]}<br/><b>${fmt(v[2])}</b>`; }),
    xAxis: { type: "category", data: xValues, splitArea: { show: true }, axisLabel: { color: c.muted, interval: 0 } },
    yAxis: { type: "category", inverse: true, data: yCats, splitArea: { show: true }, axisLabel: { color: c.muted } },
    visualMap: correlogram
      ? { min: -1, max: 1, calculable: true, orient: "horizontal", left: "center", bottom: 4, inRange: { color: [palette[5], c.surface2, palette[2]] }, textStyle: { color: c.text } }
      : { min: 0, max, calculable: true, orient: "horizontal", left: "center", bottom: 4, inRange: { color: c.sequential }, textStyle: { color: c.text } },
    series: [{ type: "heatmap", data: values, label: { show: correlogram || config.showLabels, color: c.title, fontSize: 11, formatter: (p: Tip) => fmt((p.value as number[])[2]) }, itemStyle: { borderColor: c.surface, borderWidth: 2 } }],
  } as EChartsOption;
}

/** Treemap, sunburst and friends: when a series field is mapped, it becomes the second level of the hierarchy. */
function hierarchy(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, x, y, s, palette, display } = ctx;
  if (!s) return null;
  const groups = new Map<string, Map<string, number>>();
  rows.forEach((row) => {
    const parent = str(row[x]);
    const children = groups.get(parent) ?? new Map<string, number>();
    children.set(str(row[s]), (children.get(str(row[s])) ?? 0) + number(row[y]));
    groups.set(parent, children);
  });
  const data = Array.from(groups.entries()).map(([name, children], i) => ({
    name, itemStyle: { color: palette[i % palette.length] },
    children: Array.from(children.entries()).map(([child, value]) => ({ name: child, value, itemStyle: { color: withAlpha(palette[i % palette.length], 0.72) } })),
  }));
  const fmt = plain(display);
  if (config.chartId === "sunburst") {
    return {
      ...common,
      tooltip: tip(ctx, (p) => `${p.name}<br/><b>${fmt(Number(p.value))}</b>`),
      series: [{ type: "sunburst", center: ["50%", "56%"], radius: ["8%", "74%"], sort: undefined, data, label: { color: "#fff", rotate: "radial", minAngle: 6 }, itemStyle: { borderColor: c.surface, borderWidth: 2 },
        levels: [{}, { r0: "8%", r: "36%", label: { rotate: "tangential", fontWeight: 600 } }, { r0: "38%", r: "74%", label: { align: "right", position: "outside", padding: 2, silent: false, color: c.text }, itemStyle: { borderWidth: 1 } }] }],
    } as EChartsOption;
  }
  return {
    ...common,
    tooltip: tip(ctx, (p) => `${p.name}<br/><b>${fmt(Number(p.value))}</b>`),
    series: [{ type: "treemap", top: 84, bottom: 20, left: 20, right: 20, roam: false, nodeClick: false, breadcrumb: { show: false }, squareRatio: 1.2,
      upperLabel: { show: true, height: 24, color: "#fff", fontWeight: 700 }, label: { show: true, color: "#fff", formatter: "{b}\n{c}" },
      levels: [{ itemStyle: { borderColor: c.surface, borderWidth: 3, gapWidth: 3 } }, { itemStyle: { borderColor: c.surface, borderWidth: 1, gapWidth: 1 } }], data }],
  } as EChartsOption;
}

/** Radar: the first four rows against up to seven numeric columns. */
function radar(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, s, display } = ctx;
  const fields = numericColumns(rows, [x, s]).slice(0, 7);
  if (fields.length < 3) return null;
  const maxes = fields.map((field) => Math.max(...rows.map((row) => number(row[field])), 1));
  return {
    ...common,
    tooltip: tip(ctx, (p) => `<b>${p.name}</b><br/>${fields.map((field, i) => `${field}: ${plain(display)(Number((p.value as unknown as number[])[i]))}`).join("<br/>")}`),
    legend: { top: 58, textStyle: { color: c.text } },
    radar: { center: ["50%", "58%"], radius: "62%", indicator: fields.map((field, i) => ({ name: field, max: maxes[i] * 1.1 })), splitArea: { areaStyle: { color: [c.surface, c.surface2] } }, axisName: { color: c.text } },
    series: [{ type: "radar", data: rows.slice(0, 4).map((row, i) => ({ name: str(row[x]) || `Item ${i + 1}`, value: fields.map((field) => number(row[field])), areaStyle: { opacity: 0.12 } })) }],
  } as EChartsOption;
}

export function buildSpecial(ctx: Ctx): EChartsOption | null {
  switch (ctx.config.chartId) {
    case "dot-plot": return dotPlot(ctx);
    case "dumbbell": case "span": return range(ctx);
    case "bullet": return bullet(ctx);
    case "pareto": return pareto(ctx);
    case "waterfall": return waterfall(ctx);
    case "butterfly": case "population-pyramid": return mirrored(ctx);
    case "boxplot": return boxplot(ctx);
    case "calendar": return calendar(ctx);
    case "radial-bar": return radialBar(ctx);
    case "heatmap": case "correlogram": return heat(ctx);
    case "treemap": case "sunburst": return hierarchy(ctx);
    case "circle-packing": return circlePacking(ctx) ?? hierarchy(ctx);
    case "icicle": return icicle(ctx) ?? hierarchy(ctx);
    case "marimekko": return marimekko(ctx) ?? hierarchy(ctx);
    case "radar": return radar(ctx);
    case "strip": case "beeswarm": return strip(ctx);
    case "error-bars": return errorBars(ctx);
    case "violin": return violin(ctx);
    case "ridgeline": return ridgeline(ctx);
    case "stem-leaf": return stemLeaf(ctx);
    case "streamgraph": return stream(ctx);
    case "gantt": case "timeline": return schedule(ctx);
    case "connected-scatter": return connected(ctx);
    case "spiral": return spiral(ctx);
    case "ohlc": return ohlc(ctx);
    case "kagi": return kagi(ctx);
    case "point-figure": return pointFigure(ctx);
    case "word-cloud": return wordCloud(ctx);
    case "word-tree": return wordTree(ctx);
    case "chord": return chord(ctx);
    case "tree": case "dendrogram": case "brainstorm": return tree(ctx);
    case "arc": return arc(ctx);
    case "parallel": return parallel(ctx);
    case "flowchart": return flowchart(ctx);
    case "pictogram": return pictogram(ctx);
    case "waffle": return waffle(ctx);
    case "venn": return venn(ctx);
    case "upset": return upset(ctx);
    case "choropleth": case "bubble-map": case "cartogram": case "dot-map": case "hexbin-map": case "flow-map": return geo(ctx);
    default: return null;
  }
}
