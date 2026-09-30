import type { EChartsOption } from "echarts";
import { L, categoryAxis, groupValues, kde, number, plain, quantile, tip, valueAxis, withAlpha, type Ctx, type CustomApi, type CustomParams, type Tip } from "./chartUtils";

/* Distribution charts that show every observation or its estimated shape. */

const MONO = "'DM Mono', ui-monospace, monospace";

/** Fixed pseudo-random number in [0, 1) for the i-th point, so a chart looks the same every time it is drawn. */
const hash = (i: number) => { const t = Math.sin((i + 1) * 12.9898) * 43758.5453; return t - Math.floor(t); };

/** Sideways offsets (in category widths) that keep dots from touching, by placing them in ascending order of value. */
function swarmOffsets(values: number[], range: number) {
  const pxPerValue = 330 / (range || 1);
  const pxPerBand = 220;
  const diameter = 10.5;
  const step = (diameter * 0.55) / pxPerBand;
  const placed: Array<{ x: number; y: number }> = [];
  const offsets = new Array<number>(values.length).fill(0);
  values.map((_, i) => i).sort((a, b) => values[a] - values[b]).forEach((i) => {
    for (let k = 0; k < 80; k++) {
      const x = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      if (placed.every((p) => Math.hypot((p.x - x) * pxPerBand, (p.y - values[i]) * pxPerValue) >= diameter)) { placed.push({ x, y: values[i] }); offsets[i] = x; return; }
    }
  });
  return offsets;
}

/** Strip plot and beeswarm: each observation is a dot, spread sideways inside its group. */
export function strip(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, grid, x, y, palette, display } = ctx;
  const groups = groupValues(rows, x, y);
  const names = Array.from(groups.keys());
  const swarm = config.chartId === "beeswarm";
  const all = Array.from(groups.values()).flat();
  const range = Math.max(...all) - Math.min(...all);
  const fmt = plain(display);
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => `${(p.value as unknown[])[2]}<br/><b>${fmt(Number((p.value as unknown[])[1]))}</b>`),
    // The dots live on a hidden numeric axis that lines up with the category axis, so they can sit between the categories.
    xAxis: [categoryAxis(ctx, names), { type: "value", min: -0.5, max: names.length - 0.5, show: false }],
    yAxis: valueAxis(ctx, { scale: true, axisLine: { show: false } }),
    series: names.map((name, i) => {
      const values = groups.get(name) ?? [];
      const offsets = swarm ? swarmOffsets(values, range) : values.map((_, k) => (hash(i * 1000 + k) - 0.5) * 0.5);
      return {
        name, type: "scatter", xAxisIndex: 1, symbolSize: 9, itemStyle: { color: palette[i % palette.length], opacity: 0.88, borderColor: c.surface, borderWidth: 1 },
        data: values.map((value, k) => [i + offsets[k], value, name]),
      };
    }),
  } as EChartsOption;
}

/** Two-sided 95% critical value of Student's t for small samples. */
const tCritical = (n: number) => (n < 2 ? 0 : [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086][n - 2] ?? 1.98);

/** Mean of each group with its 95% confidence interval as error bars. */
export function errorBars(ctx: Ctx): EChartsOption {
  const { rows, config, c, common, grid, x, y, palette, display } = ctx;
  const groups = groupValues(rows, x, y);
  const names = Array.from(groups.keys());
  const fmt = plain(display);
  const stats = names.map((name) => {
    const values = groups.get(name) ?? [];
    const n = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / (n || 1);
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, n - 1));
    const margin = tCritical(n) * (sd / Math.sqrt(n || 1));
    return { name, n, mean, low: mean - margin, high: mean + margin };
  });
  const whisker = (params: CustomParams, api: CustomApi) => {
    const i = params.dataIndex;
    const top = api.coord([i, api.value(2)]);
    const bottom = api.coord([i, api.value(1)]);
    const half = api.size([1, 0])[0] * 0.09;
    const style = { stroke: c.title, lineWidth: 2 };
    return {
      type: "group",
      children: [
        { type: "line", shape: { x1: top[0] - half, y1: top[1], x2: top[0] + half, y2: top[1] }, style },
        { type: "line", shape: { x1: top[0], y1: top[1], x2: bottom[0], y2: bottom[1] }, style },
        { type: "line", shape: { x1: bottom[0] - half, y1: bottom[1], x2: bottom[0] + half, y2: bottom[1] }, style },
      ],
    };
  };
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => {
      const stat = stats.find((item) => item.name === p.name);
      return stat ? `<b>${stat.name}</b> · n = ${stat.n}<br/>${L(display, "Média", "Mean")}: <b>${fmt(stat.mean)}</b><br/>IC 95%: ${fmt(stat.low)} – ${fmt(stat.high)}` : p.name;
    }),
    xAxis: categoryAxis(ctx, names),
    yAxis: valueAxis(ctx),
    series: [
      { name: config.title || y, type: "bar", barWidth: "46%", itemStyle: { color: withAlpha(palette[0], 0.5), borderColor: palette[0], borderWidth: 1.5, borderRadius: [4, 4, 0, 0] }, label: { show: config.showLabels, position: "insideBottom", color: c.title, formatter: (p: Tip) => fmt(Number(p.value)) }, data: stats.map((stat) => stat.mean) },
      { name: "ci", type: "custom", z: 6, silent: true, renderItem: whisker, encode: { x: 0, y: [1, 2] }, tooltip: { show: false }, data: stats.map((stat, i) => [i, stat.low, stat.high]) },
    ],
  } as EChartsOption;
}

const steps = (lo: number, hi: number, count: number) => Array.from({ length: count }, (_, i) => lo + ((hi - lo) * i) / (count - 1));

/** Violin plot: mirrored density per group, with the median and the interquartile range inside. */
export function violin(ctx: Ctx): EChartsOption {
  const { rows, c, common, grid, x, y, palette, display } = ctx;
  const groups = groupValues(rows, x, y);
  const names = Array.from(groups.keys());
  const all = Array.from(groups.values()).flat();
  const span = Math.max(...all) - Math.min(...all) || 1;
  const lo = Math.min(...all) - span * 0.06;
  const hi = Math.max(...all) + span * 0.06;
  const points = steps(lo, hi, 64);
  const fmt = plain(display);
  const shapes = names.map((name) => {
    const values = [...(groups.get(name) ?? [])].sort((a, b) => a - b);
    const density = kde(values, points);
    const peak = Math.max(...density) || 1;
    return { name, width: density.map((d) => d / peak), q1: quantile(values, 0.25), median: quantile(values, 0.5), q3: quantile(values, 0.75), n: values.length };
  });
  const draw = (params: CustomParams, api: CustomApi) => {
    const i = params.dataIndex;
    const shape = shapes[i];
    const color = palette[i % palette.length];
    const half = api.size([1, 0])[0] * 0.42;
    const center = api.coord([i, lo])[0];
    const left = points.map((value, k) => [center - shape.width[k] * half, api.coord([i, value])[1]]);
    const right = points.map((value, k) => [center + shape.width[k] * half, api.coord([i, value])[1]]).reverse();
    const yQ1 = api.coord([i, shape.q1])[1];
    const yQ3 = api.coord([i, shape.q3])[1];
    const yMedian = api.coord([i, shape.median])[1];
    return {
      type: "group",
      children: [
        { type: "polygon", shape: { points: [...left, ...right] }, style: { fill: withAlpha(color, 0.38), stroke: color, lineWidth: 1.6 } },
        { type: "rect", shape: { x: center - 4, y: yQ3, width: 8, height: Math.max(2, yQ1 - yQ3) }, style: { fill: c.title, opacity: 0.85 } },
        { type: "circle", shape: { cx: center, cy: yMedian, r: 3.6 }, style: { fill: c.surface, stroke: c.title, lineWidth: 1.5 } },
      ],
    };
  };
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => {
      const shape = shapes[p.data ? Number((p.value as unknown[])[0]) : 0];
      return shape ? `<b>${shape.name}</b> · n = ${shape.n}<br/>${L(display, "Mediana", "Median")}: <b>${fmt(shape.median)}</b><br/>Q1–Q3: ${fmt(shape.q1)} – ${fmt(shape.q3)}` : "";
    }),
    xAxis: categoryAxis(ctx, names),
    yAxis: valueAxis(ctx, { min: lo, max: hi, axisLabel: { color: c.muted, formatter: (v: number) => fmt(Math.round(v * 10) / 10) } }),
    series: [{ type: "custom", renderItem: draw, encode: { x: 0, y: [1, 2] }, data: names.map((_, i) => [i, lo, hi]) }],
  } as EChartsOption;
}

/** Ridgeline plot: one density per group, stacked with a slight overlap on a shared scale. */
export function ridgeline(ctx: Ctx): EChartsOption {
  const { rows, c, common, grid, x, y, palette, display } = ctx;
  const groups = groupValues(rows, x, y);
  const names = Array.from(groups.keys());
  const all = Array.from(groups.values()).flat();
  const span = Math.max(...all) - Math.min(...all) || 1;
  const lo = Math.min(...all) - span * 0.12;
  const hi = Math.max(...all) + span * 0.12;
  const points = steps(lo, hi, 90);
  const densities = names.map((name) => kde(groups.get(name) ?? [], points));
  const peak = Math.max(...densities.flat()) || 1;
  const fmt = plain(display);
  const draw = (params: CustomParams, api: CustomApi) => {
    const i = params.dataIndex;
    const color = palette[i % palette.length];
    const band = api.size([0, 1])[1];
    const baseline = api.coord([lo, i])[1] + band * 0.32;
    const path = points.map((value, k) => [api.coord([value, i])[0], baseline - (densities[i][k] / peak) * band * 1.9]);
    const start = api.coord([lo, i])[0];
    const end = api.coord([hi, i])[0];
    return {
      type: "group",
      children: [
        { type: "polygon", shape: { points: [[start, baseline], ...path, [end, baseline]] }, style: { fill: withAlpha(color, 0.55), stroke: color, lineWidth: 1.8 } },
        { type: "line", shape: { x1: start, y1: baseline, x2: end, y2: baseline }, style: { stroke: withAlpha(color, 0.5), lineWidth: 1 } },
      ],
    };
  };
  return {
    ...common, grid,
    tooltip: { show: false },
    xAxis: valueAxis(ctx, { min: lo, max: hi, axisLabel: { color: c.muted, formatter: (v: number) => fmt(Math.round(v * 10) / 10) } }),
    yAxis: categoryAxis(ctx, names, true, { splitLine: { show: false } }),
    series: [{ type: "custom", renderItem: draw, encode: { x: [1, 2], y: 0 }, data: names.map((_, i) => [i, lo, hi]) }],
  } as EChartsOption;
}

/** Stem-and-leaf plot: the values themselves, tens on the left and units to the right. */
export function stemLeaf(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, display } = ctx;
  const values = rows.map((row) => Math.round(number(row[y || x]))).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (values.length < 3) return null;
  const first = Math.floor(values[0] / 10);
  const last = Math.floor(values[values.length - 1] / 10);
  if (last - first > 24) return null;
  const width = String(last).length;
  const lines = Array.from({ length: last - first + 1 }, (_, k) => {
    const stem = first + k;
    const leaves = values.filter((value) => Math.floor(value / 10) === stem).map((value) => value % 10).join("  ");
    return `${String(stem).padStart(width)} │ ${leaves}`;
  });
  const example = values.find((value) => value % 10 !== 0) ?? values[0];
  const counts = lines.map((_, k) => values.filter((value) => Math.floor(value / 10) === first + k).length);
  // One item per stem, so hovering a row lights it and dims the others; the block is left-aligned on a monospace grid.
  const widest = Math.max(...lines.map((line) => line.length));
  const draw = (params: CustomParams, api: CustomApi) => {
    const style = { text: lines[params.dataIndex], x: (api.getWidth() - widest * 10.8) / 2, y: 108 + params.dataIndex * 30, font: `600 18px ${MONO}`, fill: c.title };
    return { type: "text", style, emphasis: { style: { ...style, fill: ctx.palette[0] } } };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => { const k = (p.value as number[])[0]; return `${first + k}0–${first + k}9<br/><b>${counts[k]}</b> ${L(display, "valores", "values")}`; }),
    graphic: [
      { type: "text", left: "center", bottom: 26, style: { text: `${L(display, "Chave", "Key")}: ${Math.floor(example / 10)} │ ${example % 10} = ${example}   ·   n = ${values.length}`, font: `12px ${MONO}`, fill: c.muted } },
    ],
    series: [{ type: "custom", coordinateSystem: "none", renderItem: draw, data: lines.map((_, k) => [k]) }],
  } as unknown as EChartsOption;
}

