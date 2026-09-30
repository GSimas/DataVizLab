import type { EChartsOption } from "echarts";
import { L, aggregate, categoryAxis, plain, tip, withAlpha, type Ctx, type CustomApi, type CustomParams } from "./chartUtils";

/* Parts of a whole made countable: icon arrays, unit grids and set overlaps. */

const PERSON = "path://M12 1.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM6 22v-8a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v8z";
const UNITS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** Pictogram: one icon stands for a fixed number of units, repeated along each category. */
export function pictogram(ctx: Ctx): EChartsOption {
  const { rows, c, common, grid, x, y, palette, display } = ctx;
  const { map, xValues } = aggregate(rows, x, y);
  const values = xValues.map((cat) => map.get(`${cat}|||_`) ?? 0);
  const peak = Math.max(...values, 1);
  const unit = UNITS.find((candidate) => peak / candidate <= 20) ?? Math.ceil(peak / 20);
  const counts = values.map((value) => Math.round(value / unit));
  const fmt = plain(display);
  return {
    ...common, grid: { ...grid, left: 30 },
    tooltip: tip(ctx, (p) => { const i = xValues.indexOf(String((p.value as unknown[])[1])); return `${xValues[i]}<br/><b>${fmt(values[i])}</b>`; }),
    xAxis: { type: "value", show: false, min: -0.6, max: Math.max(...counts) + 2 },
    yAxis: categoryAxis(ctx, xValues, true, { axisLine: { show: false }, axisLabel: { color: c.text, fontSize: 13 } }),
    graphic: [{ type: "text", right: 26, bottom: 16, style: { text: L(display, `1 ícone = ${unit}`, `1 icon = ${unit}`), fill: c.muted, font: "12px 'DM Mono', monospace" } }],
    series: [
      ...xValues.map((cat, i) => ({ name: cat, type: "scatter", symbol: PERSON, symbolSize: [19, 27], itemStyle: { color: palette[i % palette.length] }, data: Array.from({ length: counts[i] }, (_, k) => [k, cat]) })),
      { name: "values", type: "scatter", silent: true, symbolSize: 1, itemStyle: { color: "transparent" }, tooltip: { show: false }, label: { show: true, position: "right", distance: 20, color: c.title, fontWeight: 700, formatter: (p: { value: unknown[] }) => fmt(Number(p.value[2])) }, data: xValues.map((cat, i) => [counts[i] - 0.5, cat, values[i]]) },
    ],
  } as EChartsOption;
}

/** Waffle chart: a 10 × 10 grid of squares, each one percent of the whole. */
export function waffle(ctx: Ctx): EChartsOption {
  const { rows, c, common, x, y, palette, display } = ctx;
  const { map, xValues } = aggregate(rows, x, y);
  const values = xValues.map((cat) => Math.max(0, map.get(`${cat}|||_`) ?? 0));
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const raw = values.map((value) => (value / total) * 100);
  const cells = raw.map(Math.floor);
  let spare = 100 - cells.reduce((a, b) => a + b, 0);
  raw.map((value, i) => ({ i, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest).forEach(({ i }) => { if (spare-- > 0) cells[i] += 1; });
  let cursor = 0;
  const ranges = cells.map((count) => { const start = cursor; cursor += count; return [start, cursor]; });
  const draw = (index: number) => (_: CustomParams, api: CustomApi) => {
    const k = api.value(0);
    const top = 112;
    const side = Math.min(api.getWidth() - 80, api.getHeight() - top - 34);
    const cell = side / 10;
    const left = (api.getWidth() - side) / 2;
    return { type: "rect", shape: { x: left + (k % 10) * cell + 2, y: top + (9 - Math.floor(k / 10)) * cell + 2, width: cell - 4, height: cell - 4, r: 3 }, style: { fill: palette[index % palette.length] } };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => `${p.marker} ${p.seriesName}`),
    legend: { top: 58, textStyle: { color: c.text }, data: xValues.map((cat, i) => `${cat} · ${cells[i]}%`) },
    series: xValues.map((cat, i) => ({ name: `${cat} · ${cells[i]}%`, type: "custom", coordinateSystem: "none", renderItem: draw(i), itemStyle: { color: palette[i % palette.length] }, data: Array.from({ length: ranges[i][1] - ranges[i][0] }, (_, k) => [ranges[i][0] + k]) })),
    graphic: [{ type: "text", right: 26, bottom: 14, style: { text: L(display, "cada quadrado = 1%", "each square = 1%"), fill: c.muted, font: "12px 'DM Mono', monospace" } }],
  } as EChartsOption;
}

/** Columns whose every filled cell is true or false. */
const flagColumns = (rows: Ctx["rows"]) => Array.from(new Set(rows.slice(0, 50).flatMap((row) => Object.keys(row)))).filter((column) => {
  const filled = rows.map((row) => row[column]).filter((value) => value !== null && value !== "" && value !== undefined);
  return filled.length > 0 && filled.every((value) => typeof value === "boolean");
});

/** Venn diagram of two or three sets, with the size of every region. */
export function venn(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, palette, display } = ctx;
  const sets = flagColumns(rows).slice(0, 3);
  if (sets.length < 2) return null;
  const counts = new Map<number, number>();
  rows.forEach((row) => { const mask = sets.reduce((sum, name, i) => sum + (row[name] === true ? 1 << i : 0), 0); counts.set(mask, (counts.get(mask) ?? 0) + 1); });
  const inSet = (i: number) => rows.filter((row) => row[sets[i]] === true).length;
  const layout = (api: CustomApi) => {
    const w = api.getWidth();
    const h = api.getHeight();
    const three = sets.length === 3;
    const r = three ? Math.min(w / 4.4, (h - 132) / 3.1) : Math.min(w / 4.6, (h - 140) / 2.2);
    const cx = w / 2;
    const cy = three ? 118 + r * 1.15 : 112 + (h - 130) / 2 - 10;
    const d = r * 0.62;
    const centres = three ? [[cx - d * 0.9, cy - d * 0.55], [cx + d * 0.9, cy - d * 0.55], [cx, cy + d * 0.95]] : [[cx - d * 0.8, cy], [cx + d * 0.8, cy]];
    // Where the count of each region is written (mask → position).
    const spots: Record<number, number[]> = three
      ? { 1: [centres[0][0] - r * 0.42, centres[0][1] - r * 0.12], 2: [centres[1][0] + r * 0.42, centres[1][1] - r * 0.12], 4: [cx, centres[2][1] + r * 0.5], 3: [cx, centres[0][1] - r * 0.42], 5: [(centres[0][0] + centres[2][0]) / 2 - r * 0.3, (centres[0][1] + centres[2][1]) / 2 + r * 0.12], 6: [(centres[1][0] + centres[2][0]) / 2 + r * 0.3, (centres[1][1] + centres[2][1]) / 2 + r * 0.12], 7: [cx, cy - d * 0.02] }
      : { 1: [centres[0][0] - r * 0.4, cy], 2: [centres[1][0] + r * 0.4, cy], 3: [cx, cy] };
    const labels: Array<[number, number]> = three
      ? [[centres[0][0] - r * 0.7, centres[0][1] - r - 16], [centres[1][0] + r * 0.7, centres[1][1] - r - 16], [cx, centres[2][1] + r + 18]]
      : [[centres[0][0], cy - r - 18], [centres[1][0], cy - r - 18]];
    return { r, centres, spots, labels };
  };
  // Each set is its own item, so hovering a circle lights that set and dims the others; the counts sit in a
  // separate series that never dims, so the numbers stay readable.
  const drawSet = (params: CustomParams, api: CustomApi) => {
    const { r, centres, labels } = layout(api);
    const i = params.dataIndex;
    const color = palette[i % palette.length];
    return {
      type: "group", focus: "self", blurScope: "series",
      children: [
        { type: "circle", shape: { cx: centres[i][0], cy: centres[i][1], r }, style: { fill: withAlpha(color, 0.34), stroke: color, lineWidth: 2 }, emphasis: { style: { fill: withAlpha(color, 0.58), lineWidth: 3 } } },
        { type: "text", style: { text: `${sets[i]} · ${inSet(i)}`, x: labels[i][0], y: labels[i][1], fill: c.text, font: "600 13px sans-serif", textAlign: "center", textVerticalAlign: "middle" } },
      ],
    };
  };
  const drawCounts = (_: CustomParams, api: CustomApi) => {
    const { spots } = layout(api);
    return { type: "group", children: Object.entries(spots).map(([mask, [px, py]]) => ({ type: "text", style: { text: String(counts.get(Number(mask)) ?? 0), x: px, y: py, fill: c.title, font: "700 20px sans-serif", textAlign: "center", textVerticalAlign: "middle" } })) };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => { const i = (p.value as number[])[0]; return `<b>${sets[i]}</b><br/>${inSet(i)} ${L(display, "clientes", "customers")}`; }),
    graphic: [{ type: "text", right: 26, bottom: 14, style: { text: `${L(display, "clientes", "customers")}: ${rows.length}`, fill: c.muted, font: "12px 'DM Mono', monospace" } }],
    series: [
      { name: "sets", type: "custom", coordinateSystem: "none", renderItem: drawSet, data: sets.map((_, i) => [i]) },
      { name: "counts", type: "custom", coordinateSystem: "none", silent: true, z: 3, renderItem: drawCounts, data: [[0]] },
    ],
  } as unknown as EChartsOption;
}

/** UpSet plot: bars for the size of each combination of sets, and a dot matrix saying which sets it is. */
export function upset(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, palette, display } = ctx;
  const sets = flagColumns(rows).slice(0, 6);
  if (sets.length < 2) return null;
  const tally = new Map<number, number>();
  rows.forEach((row) => { const mask = sets.reduce((sum, name, i) => sum + (row[name] === true ? 1 << i : 0), 0); if (mask) tally.set(mask, (tally.get(mask) ?? 0) + 1); });
  const combos = Array.from(tally.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 14);
  const names = combos.map(([mask]) => String(mask));
  const bits = (mask: number) => sets.map((_, i) => (mask & (1 << i) ? i : -1)).filter((i) => i >= 0);
  const fmt = plain(display);
  const dots = combos.flatMap(([mask], k) => bits(mask).map((i) => [String(mask), sets[i], k]));
  const empty = combos.flatMap(([mask]) => sets.filter((_, i) => !(mask & (1 << i))).map((name) => [String(mask), name]));
  return {
    ...common,
    tooltip: tip(ctx, (p) => {
      const mask = Number(p.name || (p.value as unknown[])[0]);
      return `${bits(mask).map((i) => sets[i]).join(" + ")}<br/><b>${fmt(tally.get(mask) ?? 0)}</b> ${L(display, "candidatos", "candidates")}`;
    }),
    grid: [{ left: 96, right: 28, top: 92, height: "38%" }, { left: 96, right: 28, top: "60%", bottom: 34 }],
    xAxis: [{ type: "category", gridIndex: 0, data: names, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: c.axis } } }, { type: "category", gridIndex: 1, data: names, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } }],
    yAxis: [{ type: "value", gridIndex: 0, splitLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.muted } }, { type: "category", gridIndex: 1, data: sets, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.text } }],
    series: [
      { type: "bar", xAxisIndex: 0, yAxisIndex: 0, barWidth: "56%", itemStyle: { color: palette[0], borderRadius: [4, 4, 0, 0] }, label: { show: config.showLabels, position: "top", color: c.title }, data: combos.map(([, count]) => count) },
      { type: "scatter", xAxisIndex: 1, yAxisIndex: 1, symbolSize: 12, silent: true, itemStyle: { color: c.grid }, tooltip: { show: false }, data: empty },
      { type: "scatter", xAxisIndex: 1, yAxisIndex: 1, symbolSize: 13, z: 4, itemStyle: { color: palette[0] }, tooltip: { show: false }, data: dots.map(([mask, name]) => [mask, name]) },
      { type: "custom", xAxisIndex: 1, yAxisIndex: 1, silent: true, z: 3, tooltip: { show: false }, encode: { x: 0, y: [1, 2] }, data: combos.map(([mask], k) => { const active = bits(mask); return [k, Math.min(...active), Math.max(...active)]; }),
        renderItem: (_: CustomParams, api: CustomApi) => {
          const k = api.value(0);
          const top = api.coord([k, api.value(1)]);
          const bottom = api.coord([k, api.value(2)]);
          return { type: "line", shape: { x1: top[0], y1: top[1], x2: bottom[0], y2: bottom[1] }, style: { stroke: palette[0], lineWidth: 3 } };
        } },
    ],
  } as unknown as EChartsOption;
}

