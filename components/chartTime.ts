import type { EChartsOption } from "echarts";
import { dateFormat } from "../lib/intl";
import { L, categoryAxis, isNumberLike, isoTime, legend, number, numericColumns, plain, str, tag, tip, valueAxis, withAlpha, type Ctx, type CustomApi, type CustomParams, type Tip } from "./chartUtils";

/* Charts where order in time is the point: flows, schedules, trajectories, cycles and prices. */

const unique = (values: string[]) => Array.from(new Set(values));
const dateLabel = (ms: number, tagName: string) => dateFormat(tagName, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(ms));

/** Streamgraph: stacked areas centered on the axis (ECharts theme river). Needs dates on the X field. */
export function stream(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, s, palette } = ctx;
  if (!s || rows.some((row) => !Number.isFinite(isoTime(row[x])))) return null;
  const genres = unique(rows.map((row) => str(row[s])));
  return {
    ...common, color: palette,
    tooltip: { ...(common.tooltip as object), trigger: "axis", axisPointer: { type: "line", lineStyle: { color: c.axis } } },
    legend: legend(ctx, true, genres),
    singleAxis: { type: "time", top: 104, bottom: 44, left: 34, right: 34, axisLabel: { color: c.muted }, axisLine: { lineStyle: { color: c.axis } }, splitLine: { show: true, lineStyle: { color: c.grid, type: "dashed" } } },
    series: [{ type: "themeRiver", emphasis: { itemStyle: { shadowBlur: 18, shadowColor: "rgba(0, 0, 0, 0.4)" } }, label: { show: false }, boundaryGap: ["6%", "6%"], data: rows.map((row) => [str(row[x]).slice(0, 10), number(row[y]), str(row[s])]) }],
  } as EChartsOption;
}

/** Gantt (tasks with start and end) and timeline (dated events, one lane per group). */
export function schedule(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, grid, x, y, s, size, palette, display } = ctx;
  const items = rows.map((row, index) => ({ index, name: str(row[x]), start: isoTime(row[y]), end: size ? isoTime(row[size]) : Number.NaN, group: s ? str(row[s]) : "" })).filter((item) => Number.isFinite(item.start));
  if (!items.length) return null;
  const tagName = tag(display);
  const gantt = config.chartId === "gantt" || Boolean(size);
  const groups = unique(items.map((item) => item.group));
  const day = 86400000;

  if (gantt) {
    const tasks = items.map((item) => ({ ...item, end: Number.isFinite(item.end) ? Math.max(item.end, item.start + day) : item.start + day }));
    const min = Math.min(...tasks.map((task) => task.start));
    const max = Math.max(...tasks.map((task) => task.end));
    const pad = (max - min) * 0.03;
    return {
      ...common, grid: { ...grid, left: 30 },
      tooltip: tip(ctx, (p) => { const v = p.value as number[]; return `<b>${tasks[v[0]].name}</b><br/>${dateLabel(v[1], tagName)} → ${dateLabel(v[2], tagName)}<br/>${Math.round((v[2] - v[1]) / day)} ${L(display, "dias", "days")}`; }),
      legend: legend(ctx, groups.length > 1 && groups[0] !== "", groups),
      xAxis: { type: "time", min: min - pad, max: max + pad, axisLabel: { color: c.muted }, axisLine: { lineStyle: { color: c.axis } }, splitLine: { show: true, lineStyle: { color: c.grid } } },
      yAxis: categoryAxis(ctx, tasks.map((task) => task.name), true, { splitLine: { show: true, lineStyle: { color: c.grid, type: "dashed" } } }),
      series: groups.map((group, gi) => ({
        name: group || config.title, type: "custom", encode: { x: [1, 2], y: 0 },
        renderItem: (_: CustomParams, api: CustomApi) => {
          const lane = api.value(0);
          const from = api.coord([api.value(1), lane]);
          const to = api.coord([api.value(2), lane]);
          const height = api.size([0, 1])[1] * 0.56;
          return { type: "rect", shape: { x: from[0], y: from[1] - height / 2, width: Math.max(4, to[0] - from[0]), height, r: 3 }, style: { fill: palette[gi % palette.length] } };
        },
        data: tasks.map((task, index) => [index, task.start, task.end]).filter((_, index) => tasks[index].group === group),
      })),
    } as EChartsOption;
  }

  const lanes = groups.length > 1 || groups[0] ? groups : [config.title || y];
  const laneOf = (item: (typeof items)[number]) => (item.group || lanes[0]);
  const min = Math.min(...items.map((item) => item.start));
  const max = Math.max(...items.map((item) => item.start));
  const pad = (max - min) * 0.06 || day * 3;
  return {
    ...common, grid: { ...grid, left: 30, bottom: 44 },
    tooltip: tip(ctx, (p) => { const v = p.value as [number, string, string]; return `<b>${v[2]}</b><br/>${dateLabel(v[0], tagName)}`; }),
    xAxis: { type: "time", min: min - pad, max: max + pad, axisLabel: { color: c.muted }, axisLine: { lineStyle: { color: c.axis } }, splitLine: { show: true, lineStyle: { color: c.grid, type: "dashed" } } },
    yAxis: categoryAxis(ctx, lanes, true, { splitLine: { show: true, lineStyle: { color: c.grid } }, boundaryGap: true }),
    series: lanes.map((lane, li) => ({
      name: lane, type: "scatter", symbolSize: 15, itemStyle: { color: palette[li % palette.length], borderColor: c.surface, borderWidth: 2 },
      label: { show: true, color: c.text, formatter: (p: Tip) => String((p.value as unknown[])[2]), position: "top", distance: 8, fontSize: 11 },
      labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
      data: items.filter((item) => laneOf(item) === lane).map((item) => [item.start, lane, item.name]),
    })),
  } as EChartsOption;
}

/** Connected scatter: two measures against each other, joined in the order of the rows (usually time). */
export function connected(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, grid, x, y, s, palette, display } = ctx;
  if (rows.length < 2 || !rows.every((row) => isNumberLike(row[x]) && isNumberLike(row[y]))) return null;
  const labelField = Object.keys(rows[0])[0];
  const groups = s ? unique(rows.map((row) => str(row[s]))) : [""];
  const fmt = plain(display);
  return {
    ...common, grid: { ...grid, bottom: 64 },
    tooltip: tip(ctx, (p) => { const v = p.value as unknown[]; return `<b>${v[2]}</b><br/>${x}: ${fmt(Number(v[0]))}<br/>${y}: ${fmt(Number(v[1]))}`; }),
    legend: legend(ctx, groups.length > 1),
    xAxis: valueAxis(ctx, { scale: true, name: x, nameLocation: "middle", nameGap: 32, nameTextStyle: { color: c.muted } }),
    yAxis: valueAxis(ctx, { scale: true, name: y, nameTextStyle: { color: c.muted } }),
    series: groups.map((group, gi) => {
      const color = palette[gi % palette.length];
      const own = rows.filter((row) => !s || str(row[s]) === group);
      const last = own.length - 1;
      return {
        name: group || config.title, type: "line", symbol: "circle", symbolSize: 9, lineStyle: { width: 2.2, color }, itemStyle: { color },
        label: { show: config.showLabels, position: "top", color: c.title, fontSize: 11, formatter: (p: Tip) => String((p.value as unknown[])[2]) },
        data: own.map((row, i) => ({ value: [number(row[x]), number(row[y]), str(row[labelField])], symbolSize: i === 0 || i === last ? 15 : 9, itemStyle: i === 0 ? { color: c.surface, borderColor: color, borderWidth: 3 } : { color }, label: { show: config.showLabels || i === 0 || i === last } })),
      };
    }),
  } as EChartsOption;
}

const SEASON_LABELS = { pt: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };

/** Spiral plot: a monthly series wound around a circle, one turn per year, coloured by value. */
export function spiral(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, display } = ctx;
  const cycle = 12;
  if (rows.length < cycle * 2) return null;
  const values = rows.map((row) => number(row[y]));
  const dated = rows.slice(0, cycle).every((row) => Number.isFinite(isoTime(row[x])));
  const labels = rows.slice(0, cycle).map((row, i) => (dated ? SEASON_LABELS[display.locale === "en" ? "en" : "pt"][new Date(isoTime(row[x])).getMonth()] : String(i + 1)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const fmt = plain(display);
  const n = rows.length;
  const geometry = (api: CustomApi, i: number) => {
    const w = api.getWidth();
    const h = api.getHeight();
    const cx = w / 2;
    const cy = h / 2 + 34;
    const outer = Math.min(w * 0.44, (h - 150) / 2);
    const inner = outer * 0.16;
    const radius = inner + ((outer - inner) * i) / (n - 1);
    const angle = ((-90 + (i * 360) / cycle) * Math.PI) / 180;
    return { cx, cy, outer, inner, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };
  const draw = (params: CustomParams, api: CustomApi) => {
    const i = params.dataIndex;
    const here = geometry(api, i);
    const children: Record<string, unknown>[] = [];
    if (i === 0) {
      for (let k = 0; k < cycle; k++) {
        const angle = ((-90 + (k * 360) / cycle) * Math.PI) / 180;
        children.push({ type: "line", shape: { x1: here.cx + here.inner * 0.6 * Math.cos(angle), y1: here.cy + here.inner * 0.6 * Math.sin(angle), x2: here.cx + here.outer * Math.cos(angle), y2: here.cy + here.outer * Math.sin(angle) }, style: { stroke: c.grid, lineWidth: 1 } });
        children.push({ type: "text", style: { text: labels[k], x: here.cx + (here.outer + 20) * Math.cos(angle), y: here.cy + (here.outer + 20) * Math.sin(angle), fill: c.muted, font: "11px sans-serif", textAlign: "center", textVerticalAlign: "middle" } });
      }
    }
    if (i > 0) {
      const before = geometry(api, i - 1);
      children.push({ type: "line", shape: { x1: before.x, y1: before.y, x2: here.x, y2: here.y }, style: { stroke: c.axis, lineWidth: 1.4 } });
    }
    children.push({ type: "circle", shape: { cx: here.x, cy: here.y, r: 4 + (8 * (values[i] - min)) / (max - min || 1) }, style: { fill: api.visual("color"), stroke: c.surface, lineWidth: 1 } });
    return { type: "group", children };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => { const v = p.value as number[]; return `${str(rows[v[0]][x])}<br/><b>${fmt(v[1])}</b>`; }),
    visualMap: { min, max, dimension: 1, seriesIndex: 0, orient: "horizontal", left: "center", bottom: 10, itemWidth: 14, itemHeight: 140, calculable: false, inRange: { color: c.sequential }, textStyle: { color: c.text } },
    series: [{ type: "custom", coordinateSystem: "none", renderItem: draw, data: values.map((value, i) => [i, value]) }],
  } as EChartsOption;
}

/** OHLC bars: a vertical range with a tick to the left for the open and to the right for the close. */
export function ohlc(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, grid, x, palette, display } = ctx;
  const fields = numericColumns(rows, [x]).slice(0, 4);
  if (fields.length < 4) return null;
  const candles = rows.map((row) => { const [open, high, low, close] = fields.map((field) => number(row[field])); return [open, close, Math.min(low, open, close), Math.max(high, open, close)]; });
  const fmt = plain(display);
  const draw = (_: CustomParams, api: CustomApi) => {
    const i = api.value(0);
    const open = api.coord([i, api.value(1)]);
    const close = api.coord([i, api.value(2)]);
    const low = api.coord([i, api.value(3)]);
    const high = api.coord([i, api.value(4)]);
    const half = Math.max(2, api.size([1, 0])[0] * 0.32);
    const color = api.value(2) >= api.value(1) ? palette[0] : palette[4];
    const style = { stroke: color, lineWidth: 1.6 };
    return { type: "group", children: [
      { type: "line", shape: { x1: high[0], y1: high[1], x2: low[0], y2: low[1] }, style },
      { type: "line", shape: { x1: open[0] - half, y1: open[1], x2: open[0], y2: open[1] }, style },
      { type: "line", shape: { x1: close[0], y1: close[1], x2: close[0] + half, y2: close[1] }, style },
    ] };
  };
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => { const v = p.value as number[]; return `<b>${p.name}</b><br/>${L(display, "Abertura", "Open")}: ${fmt(v[1])}<br/>${L(display, "Máxima", "High")}: ${fmt(v[4])}<br/>${L(display, "Mínima", "Low")}: ${fmt(v[3])}<br/>${L(display, "Fechamento", "Close")}: ${fmt(v[2])}`; }),
    xAxis: categoryAxis(ctx, rows.map((row) => str(row[x])), false, { axisLabel: { color: c.muted, hideOverlap: true } }),
    yAxis: valueAxis(ctx, { scale: true }),
    dataZoom: [{ type: "inside" }, { type: "slider", bottom: 8, height: 18, backgroundColor: "transparent", borderColor: c.line, fillerColor: withAlpha(palette[0], 0.12), handleStyle: { color: c.surface, borderColor: palette[0] }, textStyle: { color: c.muted } }],
    series: [{ type: "custom", renderItem: draw, encode: { x: 0, y: [1, 2, 3, 4] }, data: candles.map((candle, i) => [i, ...candle]) }],
  } as EChartsOption;
}

const finite = (values: number[]) => values.filter((value) => Number.isFinite(value));

/** Kagi chart: one line that only changes direction when the price reverses by 4% of its average. */
export function kagi(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, grid, y, palette, display } = ctx;
  const prices = finite(rows.map((row) => number(row[y])));
  if (prices.length < 5) return null;
  const reversal = (prices.reduce((a, b) => a + b, 0) / prices.length) * 0.04;
  type Segment = { from: number; to: number; thick: boolean };
  const segments: Segment[] = [];
  let direction = 0;
  let start = prices[0];
  let end = prices[0];
  let lastPeak = -Infinity;
  let lastTrough = Infinity;
  let thick = false;
  const close = () => {
    if (direction === 1) { if (end > lastPeak) thick = true; lastPeak = end; } else { if (end < lastTrough) thick = false; lastTrough = end; }
    segments.push({ from: start, to: end, thick });
  };
  for (let i = 1; i < prices.length; i++) {
    const price = prices[i];
    if (direction === 0) { if (price >= start + reversal) { direction = 1; end = price; } else if (price <= start - reversal) { direction = -1; end = price; } }
    else if (direction === 1) { if (price > end) end = price; else if (price <= end - reversal) { close(); start = end; end = price; direction = -1; } }
    else if (price < end) end = price;
    else if (price >= end + reversal) { close(); start = end; end = price; direction = 1; }
  }
  if (direction === 0) return null;
  close();
  const fmt = plain(display);
  const draw = (_: CustomParams, api: CustomApi) => {
    const k = api.value(0);
    const segment = segments[k];
    const top = api.coord([k, segment.to]);
    const bottom = api.coord([k, segment.from]);
    const color = segment.thick ? palette[0] : palette[4];
    const children: Record<string, unknown>[] = [{ type: "line", shape: { x1: bottom[0], y1: bottom[1], x2: top[0], y2: top[1] }, style: { stroke: color, lineWidth: segment.thick ? 5 : 2 } }];
    if (k > 0) {
      const previous = api.coord([k - 1, segment.from]);
      children.push({ type: "line", shape: { x1: previous[0], y1: previous[1], x2: bottom[0], y2: bottom[1] }, style: { stroke: color, lineWidth: 2 } });
    }
    return { type: "group", children };
  };
  return {
    ...common, grid,
    tooltip: tip(ctx, (p) => { const segment = segments[(p.value as number[])[0]]; return `${fmt(segment.from)} → <b>${fmt(segment.to)}</b>`; }),
    xAxis: { type: "value", min: -0.5, max: segments.length - 0.5, show: false },
    yAxis: valueAxis(ctx, { scale: true }),
    graphic: [{ type: "text", right: 26, bottom: 14, style: { text: L(display, "reversão = 4% do preço médio", "reversal = 4% of average price"), fill: c.muted, font: "12px 'DM Mono', monospace" } }],
    series: [{ type: "custom", renderItem: draw, encode: { x: 0, y: [1, 2] }, data: segments.map((segment, k) => [k, segment.from, segment.to]) }],
  } as unknown as EChartsOption;
}

const BOXES = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

/** Point & figure chart: columns of X while the price rises, O while it falls; a move of three boxes reverses. */
export function pointFigure(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, grid, y, palette, display } = ctx;
  const prices = finite(rows.map((row) => number(row[y])));
  if (prices.length < 5) return null;
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const box = BOXES.reduce((best, candidate) => (Math.abs(candidate - mean * 0.02) < Math.abs(best - mean * 0.02) ? candidate : best), BOXES[0]);
  const level = (price: number) => Math.floor(price / box + 1e-9);
  type Column = { direction: 1 | -1; from: number; to: number };
  const columns: Column[] = [];
  let top = level(prices[0]);
  let bottom = top;
  for (let i = 1; i < prices.length; i++) {
    const q = level(prices[i]);
    const last = columns[columns.length - 1];
    if (!last) {
      top = Math.max(top, q); bottom = Math.min(bottom, q);
      if (q >= bottom + 3) columns.push({ direction: 1, from: bottom, to: q });
      else if (q <= top - 3) columns.push({ direction: -1, from: top, to: q });
    } else if (last.direction === 1) {
      if (q > last.to) last.to = q;
      else if (q <= last.to - 3) columns.push({ direction: -1, from: last.to - 1, to: q });
    } else if (q < last.to) last.to = q;
    else if (q >= last.to + 3) columns.push({ direction: 1, from: last.to + 1, to: q });
  }
  if (!columns.length) return null;
  const levels = columns.flatMap((column) => [column.from, column.to]);
  const lo = Math.min(...levels) - 1;
  const hi = Math.max(...levels) + 2;
  // One series per column: hovering any box lights its whole column of X or O and dims the rest.
  const glyphs = columns.map((column, i) => {
    const rising = column.direction === 1;
    const bottom = Math.min(column.from, column.to);
    const top = Math.max(column.from, column.to);
    return {
      name: `${rising ? "X" : "O"} ${i + 1}`, type: "scatter", symbolSize: 16, itemStyle: { color: "transparent" }, emphasis: { focus: "series", scale: false },
      label: { show: true, position: "inside", formatter: rising ? "X" : "O", color: palette[rising ? 0 : 4], fontSize: 15, fontWeight: 800, fontFamily: "'DM Mono', monospace" },
      data: Array.from({ length: top - bottom + 1 }, (_, k) => [i, (bottom + k + 0.5) * box]),
    };
  });
  return {
    ...common, grid,
    tooltip: { show: false },
    xAxis: { type: "value", min: -0.6, max: columns.length - 0.4, show: false },
    yAxis: valueAxis(ctx, { axisLine: { show: false }, min: lo * box, max: hi * box, interval: box * Math.max(1, Math.ceil((hi - lo) / 14)), axisLabel: { color: c.muted, formatter: (v: number) => plain(display)(Math.round(v * 100) / 100) } }),
    graphic: [{ type: "text", right: 26, bottom: 14, style: { text: L(display, `caixa = ${plain(display)(box)} · reversão = 3 caixas`, `box = ${plain(display)(box)} · reversal = 3 boxes`), fill: c.muted, font: "12px 'DM Mono', monospace" } }],
    series: glyphs,
  } as unknown as EChartsOption;
}
