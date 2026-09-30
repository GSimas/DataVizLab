import type { EChartsOption } from "echarts";
import { L, legend, number, numericColumns, plain, str, tip, withAlpha, type Ctx, type CustomApi, type CustomParams } from "./chartUtils";

/* Structure charts: trees, links, flows and hierarchies drawn from parent–child or source–target tables. */

const unique = (values: string[]) => Array.from(new Set(values));

/** Chord diagram: nodes around a circle joined by ribbons as wide as the flow between them. */
export function chord(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, s, size, palette, display } = ctx;
  if (!s) return null;
  const weight = size || y;
  const names = unique(rows.flatMap((row) => [str(row[x]), str(row[s])]));
  const links = rows.map((row) => ({ source: str(row[x]), target: str(row[s]), value: Math.max(0, number(row[weight])) })).filter((link) => link.source !== link.target && link.value > 0);
  const fmt = plain(display);
  return {
    ...common,
    tooltip: tip(ctx, (p) => (p.data && (p.data as unknown as { source?: string }).source ? `${(p.data as unknown as { source: string }).source} → ${(p.data as unknown as { target: string }).target}<br/><b>${fmt(Number(p.value))}</b>` : `<b>${p.name}</b>`)),
    series: [{
      type: "chord", clockwise: true, startAngle: 90, padAngle: 3, center: ["50%", "56%"], radius: ["58%", "63%"],
      data: names.map((name, i) => ({ name, itemStyle: { color: palette[i % palette.length] } })), links,
      lineStyle: { color: "source", opacity: 0.5 }, label: { color: c.text, fontSize: 12 }, emphasis: { focus: "adjacency" },
    }],
  } as unknown as EChartsOption;
}

type TreeNode = { name: string; children?: TreeNode[] };

/** Tree, dendrogram and idea map: parent (X) → child (series field) edges become a tree layout. */
export function tree(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, x, s, palette } = ctx;
  if (!s) return null;
  const kids = new Map<string, string[]>();
  const isChild = new Set<string>();
  rows.forEach((row) => {
    const parent = str(row[x]);
    const child = str(row[s]);
    if (parent === child) return;
    kids.set(parent, [...(kids.get(parent) ?? []), child]);
    isChild.add(child);
  });
  const roots = Array.from(kids.keys()).filter((name) => !isChild.has(name));
  const seen = new Set<string>();
  const build = (name: string): TreeNode => {
    seen.add(name);
    const children = (kids.get(name) ?? []).filter((child) => !seen.has(child)).map(build);
    return children.length ? { name, children } : { name };
  };
  const data = roots.length === 1 ? build(roots[0]) : { name: config.title, children: roots.map(build) };
  const radial = config.chartId === "brainstorm";
  const dendrogram = config.chartId === "dendrogram";
  return {
    ...common,
    tooltip: { show: false },
    series: [{
      type: "tree", data: [data], top: 96, bottom: 28, left: radial ? "14%" : "16%", right: radial ? "14%" : "22%", layout: radial ? "radial" : "orthogonal", orient: "LR",
      edgeShape: dendrogram ? "polyline" : "curve", edgeForkPosition: "50%", symbolSize: radial ? 9 : 10, initialTreeDepth: -1, expandAndCollapse: false, roam: false,
      itemStyle: { color: palette[0], borderColor: c.surface, borderWidth: 2 }, lineStyle: { color: c.axis, width: 1.4, curveness: 0.5 },
      label: radial ? { color: c.text, fontSize: 12, position: "right", distance: 6, rotate: 0 } : { position: "left", verticalAlign: "middle", align: "right", color: c.text, fontSize: 12, distance: 8 },
      leaves: { label: radial ? { color: c.text, fontSize: 12, position: "right", distance: 6, rotate: 0 } : { position: "right", verticalAlign: "middle", align: "left", color: c.text, fontSize: 12, distance: 8 } },
      emphasis: { focus: "descendant" },
    }],
  } as unknown as EChartsOption;
}

/** Arc diagram: nodes in reading order on a line, each link an arch above it. */
export function arc(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, s, size, palette, display } = ctx;
  if (!s) return null;
  const weight = size || y;
  const names = unique(rows.flatMap((row) => [str(row[x]), str(row[s])]));
  const index = new Map(names.map((name, i) => [name, i]));
  const links = rows.map((row) => ({ a: index.get(str(row[x])) ?? 0, b: index.get(str(row[s])) ?? 0, value: weight ? number(row[weight]) || 1 : 1, from: str(row[x]), to: str(row[s]) })).filter((link) => link.a !== link.b);
  const peak = Math.max(...links.map((link) => link.value), 1);
  const degree = names.map((_, i) => links.reduce((sum, link) => sum + (link.a === i || link.b === i ? link.value : 0), 0));
  const maxDegree = Math.max(...degree, 1);
  const fmt = plain(display);
  const draw = (params: CustomParams, api: CustomApi) => {
    const link = links[params.dataIndex];
    const from = api.coord([link.a, 0]);
    const to = api.coord([link.b, 0]);
    const span = Math.abs(to[0] - from[0]);
    const lift = Math.min(span * 0.62, Math.max(24, from[1] - 40));
    return { type: "bezierCurve", shape: { x1: from[0], y1: from[1], x2: to[0], y2: to[1], cpx1: from[0], cpy1: from[1] - lift, cpx2: to[0], cpy2: to[1] - lift }, style: { fill: "none", stroke: palette[link.a % palette.length], lineWidth: 1 + (link.value / peak) * 5, opacity: 0.5 } };
  };
  return {
    ...common, grid: { left: 40, right: 40, top: 96, bottom: 74 },
    tooltip: tip(ctx, (p) => {
      const value = p.value as number[];
      if (p.seriesName === "arcs") return `${links[value[0]].from} → ${links[value[0]].to}<br/><b>${fmt(links[value[0]].value)}</b>`;
      return `<b>${p.name}</b>`;
    }),
    xAxis: { type: "category", data: names, boundaryGap: true, axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false }, axisLabel: { color: c.text, interval: 0, rotate: names.length > 8 ? 35 : 0, margin: 14 } },
    yAxis: { type: "value", min: 0, max: 1, show: false },
    series: [
      { name: "arcs", type: "custom", renderItem: draw, encode: { x: 0 }, data: links.map((link, i) => [i, link.a]) },
      { name: "nodes", type: "scatter", z: 4, symbolSize: (_: unknown, p: { dataIndex: number }) => 9 + (degree[p.dataIndex] / maxDegree) * 12, itemStyle: { color: (p: { dataIndex: number }) => palette[p.dataIndex % palette.length], borderColor: c.surface, borderWidth: 2 }, data: names.map((name) => [name, 0]) },
    ],
  } as unknown as EChartsOption;
}

/** Parallel coordinates: one axis per numeric column, one line per row, coloured by the series field. */
export function parallel(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, s, palette, display } = ctx;
  const fields = numericColumns(rows, [x, s]).slice(0, 8);
  if (fields.length < 3) return null;
  const groups = s ? unique(rows.map((row) => str(row[s]))) : [""];
  const fmt = plain(display);
  return {
    ...common,
    tooltip: tip(ctx, (p) => `<b>${p.name}</b><br/>${fields.map((field, i) => `${field}: ${fmt(Number((p.value as number[])[i]))}`).join("<br/>")}`),
    legend: legend(ctx, groups.length > 1 && groups[0] !== "", groups),
    parallel: { left: 64, right: 96, top: 112, bottom: 44, parallelAxisDefault: { type: "value", nameLocation: "end", nameGap: 18, nameTextStyle: { color: c.text, fontSize: 11 }, axisLine: { lineStyle: { color: c.axis } }, axisTick: { lineStyle: { color: c.axis } }, axisLabel: { color: c.muted, fontSize: 10 } } },
    parallelAxis: fields.map((field, dim) => ({ dim, name: field })),
    series: groups.map((group, gi) => ({
      name: group || "all", type: "parallel", lineStyle: { width: 1.8, opacity: 0.7, color: palette[gi % palette.length] }, emphasis: { lineStyle: { width: 3.4, opacity: 1 } },
      data: rows.filter((row) => !s || str(row[s]) === group).map((row) => ({ name: str(row[x]), value: fields.map((field) => number(row[field])) })),
    })),
  } as unknown as EChartsOption;
}

type Cell = { name: string; level: number; x0: number; x1: number; value: number; color: number };

/** Where the hand-drawn hierarchy charts draw inside the canvas (outside it: title, axis notes). Pan and zoom
 *  (chartNavigation.ts) enlarge only this area, so the point under the pointer stays put. */
export type ContentBox = { left: number; right: number; top: number; bottom: number };
export const ICICLE_BOX: ContentBox = { left: 30, right: 30, top: 104, bottom: 30 };
export const PACK_BOX: ContentBox = { left: 30, right: 30, top: 96, bottom: 24 };
export const MEKKO_FRAME: ContentBox = { left: 56, right: 24, top: 118, bottom: 58 };

/** Icicle: the hierarchy as stacked bands, each as wide as its share of the parent. */
export function icicle(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, s, palette, display } = ctx;
  if (!s) return null;
  const groups = new Map<string, Map<string, number>>();
  rows.forEach((row) => {
    const children = groups.get(str(row[x])) ?? new Map<string, number>();
    children.set(str(row[s]), (children.get(str(row[s])) ?? 0) + number(row[y]));
    groups.set(str(row[x]), children);
  });
  const total = Array.from(groups.values()).reduce((sum, children) => sum + Array.from(children.values()).reduce((a, b) => a + b, 0), 0) || 1;
  const cells: Cell[] = [{ name: L(display, "Total", "Total"), level: 0, x0: 0, x1: 1, value: total, color: -1 }];
  let cursor = 0;
  Array.from(groups.entries()).forEach(([name, children], i) => {
    const sum = Array.from(children.values()).reduce((a, b) => a + b, 0);
    cells.push({ name, level: 1, x0: cursor / total, x1: (cursor + sum) / total, value: sum, color: i });
    let inner = cursor;
    children.forEach((value, child) => { cells.push({ name: child, level: 2, x0: inner / total, x1: (inner + value) / total, value, color: i }); inner += value; });
    cursor += sum;
  });
  const fmt = plain(display);
  const draw = (params: CustomParams, api: CustomApi) => {
    const cell = cells[params.dataIndex];
    const { left, top } = ICICLE_BOX;
    const width = api.getWidth() - left - ICICLE_BOX.right;
    const rowHeight = (api.getHeight() - top - ICICLE_BOX.bottom) / 3;
    const w = Math.max(1, (cell.x1 - cell.x0) * width - 3);
    const color = cell.color < 0 ? c.axis : withAlpha(palette[cell.color % palette.length], cell.level === 1 ? 1 : 0.72);
    return {
      type: "rect", shape: { x: left + cell.x0 * width + 1.5, y: top + cell.level * rowHeight + 1.5, width: w, height: rowHeight - 3, r: 2 }, style: { fill: color },
      textContent: { style: { text: w > 46 ? `${cell.name}\n${fmt(cell.value)}` : "", fill: "#fff", fontSize: 12, overflow: "truncate", width: w - 10, lineHeight: 16 } }, textConfig: { position: "inside" },
    };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => { const cell = cells[(p.value as number[])[0]]; return `${cell.name}<br/><b>${fmt(cell.value)}</b> · ${Math.round((cell.value / total) * 100)}%`; }),
    series: [{ type: "custom", coordinateSystem: "none", renderItem: draw, data: cells.map((_, i) => [i]) }],
  } as unknown as EChartsOption;
}

/** Places circles of the given radii without overlap, closest to the middle first. */
function packCircles(radii: number[], gap: number) {
  const order = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a]);
  const placed: Array<{ i: number; x: number; y: number; r: number }> = [];
  order.forEach((i, k) => {
    const r = radii[i] + gap;
    if (k === 0) { placed.push({ i, x: 0, y: 0, r }); return; }
    const free = (px: number, py: number) => placed.every((other) => Math.hypot(px - other.x, py - other.y) >= other.r + r - 0.001);
    for (let ring = 0; ring < 400; ring++) {
      const dist = ring * r * 0.25;
      const steps = Math.max(12, Math.ceil(dist / (r * 0.25)));
      let found: { x: number; y: number } | null = null;
      for (let step = 0; step < steps && !found; step++) {
        const angle = (2 * Math.PI * step) / steps + ring;
        if (free(dist * Math.cos(angle), dist * Math.sin(angle))) found = { x: dist * Math.cos(angle), y: dist * Math.sin(angle) };
      }
      if (found) { placed.push({ i, ...found, r }); return; }
    }
    placed.push({ i, x: 0, y: 0, r });
  });
  const enclosing = Math.max(...placed.map((p) => Math.hypot(p.x, p.y) + p.r));
  const byIndex = new Array<{ x: number; y: number }>(radii.length);
  placed.forEach((p) => { byIndex[p.i] = { x: p.x, y: p.y }; });
  return { positions: byIndex, radius: enclosing };
}

/** Circle packing: circles inside circles, area proportional to value. */
export function circlePacking(ctx: Ctx): EChartsOption | null {
  const { rows, common, x, y, s, palette, c, display } = ctx;
  if (!s) return null;
  const groups = new Map<string, Map<string, number>>();
  rows.forEach((row) => {
    const children = groups.get(str(row[x])) ?? new Map<string, number>();
    children.set(str(row[s]), (children.get(str(row[s])) ?? 0) + number(row[y]));
    groups.set(str(row[x]), children);
  });
  const parents = Array.from(groups.entries()).map(([name, children]) => {
    const entries = Array.from(children.entries());
    const radii = entries.map(([, value]) => Math.sqrt(Math.max(value, 0)));
    const local = packCircles(radii, 0.8);
    return { name, entries, radii, local, radius: local.radius + 1.5, total: entries.reduce((sum, [, value]) => sum + value, 0) };
  });
  const top = packCircles(parents.map((parent) => parent.radius), 2);
  const circles = parents.flatMap((parent, pi) => {
    const centre = top.positions[pi];
    return [
      { name: parent.name, value: parent.total, x: centre.x, y: centre.y, r: parent.radius, level: 1, color: pi },
      ...parent.entries.map(([name, value], k) => ({ name, value, x: centre.x + parent.local.positions[k].x, y: centre.y + parent.local.positions[k].y, r: parent.radii[k], level: 2, color: pi })),
    ];
  });
  const fmt = plain(display);
  const draw = (params: CustomParams, api: CustomApi) => {
    const circle = circles[params.dataIndex];
    const box = PACK_BOX;
    const w = api.getWidth() - box.left - box.right;
    const h = api.getHeight() - box.top - box.bottom;
    const scale = Math.min(w, h) / 2 / top.radius;
    const cx = box.left + w / 2 + circle.x * scale;
    const cy = box.top + h / 2 + circle.y * scale;
    const color = palette[circle.color % palette.length];
    const r = circle.r * scale;
    return {
      type: "circle", shape: { cx, cy, r }, style: circle.level === 1 ? { fill: withAlpha(color, 0.13), stroke: withAlpha(color, 0.7), lineWidth: 1.5 } : { fill: withAlpha(color, 0.82), stroke: c.surface, lineWidth: 1 },
      textContent: { style: { text: circle.level === 2 && r > 20 ? circle.name : "", fill: "#fff", fontSize: 11, width: r * 1.7, overflow: "truncate", align: "center" } }, textConfig: { position: "inside" },
    };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => { const circle = circles[(p.value as number[])[0]]; return `${circle.name}<br/><b>${fmt(circle.value)}</b>`; }),
    series: [{ type: "custom", coordinateSystem: "none", renderItem: draw, data: circles.map((_, i) => [i]) }],
  } as unknown as EChartsOption;
}

/** Marimekko: column width follows the segment total, stacked heights follow each brand's share. */
export function marimekko(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, y, s, palette, display } = ctx;
  if (!s) return null;
  const segments = unique(rows.map((row) => str(row[x])));
  const brands = unique(rows.map((row) => str(row[s])));
  const value = (segment: string, brand: string) => rows.filter((row) => str(row[x]) === segment && str(row[s]) === brand).reduce((sum, row) => sum + number(row[y]), 0);
  const totals = segments.map((segment) => brands.reduce((sum, brand) => sum + value(segment, brand), 0));
  const grand = totals.reduce((a, b) => a + b, 0) || 1;
  const fmt = plain(display);
  const frame = MEKKO_FRAME;
  const draw = (brandIndex: number) => (params: CustomParams, api: CustomApi) => {
    const k = api.value(0);
    const plotW = api.getWidth() - frame.left - frame.right;
    const plotH = api.getHeight() - frame.top - frame.bottom;
    const before = totals.slice(0, k).reduce((a, b) => a + b, 0);
    const colX = frame.left + (before / grand) * plotW;
    const colW = (totals[k] / grand) * plotW;
    const below = brands.slice(0, brandIndex).reduce((sum, brand) => sum + value(segments[k], brand), 0);
    const part = value(segments[k], brands[brandIndex]);
    const share = totals[k] ? part / totals[k] : 0;
    const yTop = frame.top + plotH * (1 - (below + part) / (totals[k] || 1));
    const children: Record<string, unknown>[] = [{
      type: "rect", shape: { x: colX + 1.5, y: yTop + 1.5, width: Math.max(1, colW - 3), height: Math.max(1, plotH * share - 3) }, style: { fill: palette[brandIndex % palette.length] },
      textContent: { style: { text: colW > 60 && plotH * share > 34 ? `${brands[brandIndex]}\n${Math.round(share * 100)}%` : "", fill: "#fff", fontSize: 11, lineHeight: 15, overflow: "truncate", width: colW - 10 } }, textConfig: { position: "inside" },
    }];
    if (brandIndex === 0 && params.dataIndex >= 0) {
      children.push({ type: "text", style: { text: segments[k], x: colX + colW / 2, y: frame.top + plotH + 16, fill: c.text, font: "600 12px sans-serif", textAlign: "center", textVerticalAlign: "middle" } });
      children.push({ type: "text", style: { text: `${Math.round((totals[k] / grand) * 100)}%`, x: colX + colW / 2, y: frame.top - 12, fill: c.muted, font: "11px sans-serif", textAlign: "center", textVerticalAlign: "middle" } });
      if (k === 0) [0, 25, 50, 75, 100].forEach((tick) => children.push({ type: "text", style: { text: `${tick}%`, x: frame.left - 8, y: frame.top + plotH * (1 - tick / 100), fill: c.muted, font: "11px sans-serif", textAlign: "right", textVerticalAlign: "middle" } }));
    }
    return { type: "group", children };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => { const k = (p.value as number[])[0]; const bi = brands.indexOf(p.seriesName); return `<b>${segments[k]}</b> · ${p.seriesName}<br/>${fmt(value(segments[k], brands[bi]))} (${Math.round((value(segments[k], brands[bi]) / (totals[k] || 1)) * 100)}%)`; }),
    legend: legend(ctx, true, brands),
    series: brands.map((brand, bi) => ({ name: brand, type: "custom", coordinateSystem: "none", renderItem: draw(bi), itemStyle: { color: palette[bi % palette.length] }, data: segments.map((_, k) => [k]) })),
  } as unknown as EChartsOption;
}

/** Flowchart: steps in columns by distance from the start, decisions as diamonds, arrows (with labels) between them. */
export function flowchart(ctx: Ctx): EChartsOption | null {
  const { rows, c, common, x, s, size, palette } = ctx;
  if (!s) return null;
  const names = unique(rows.flatMap((row) => [str(row[x]), str(row[s])]));
  const out = new Map<string, string[]>();
  rows.forEach((row) => out.set(str(row[x]), [...(out.get(str(row[x])) ?? []), str(row[s])]));
  const incoming = new Set(rows.map((row) => str(row[s])));
  const level = new Map<string, number>();
  const visit = (name: string, depth: number, trail: Set<string>) => {
    if (trail.has(name)) return;
    level.set(name, Math.max(level.get(name) ?? 0, depth));
    (out.get(name) ?? []).forEach((next) => visit(next, depth + 1, new Set([...trail, name])));
  };
  names.filter((name) => !incoming.has(name)).forEach((name) => visit(name, 0, new Set()));
  names.forEach((name) => { if (!level.has(name)) level.set(name, 0); });
  const lanes = new Map<number, string[]>();
  names.forEach((name) => lanes.set(level.get(name) ?? 0, [...(lanes.get(level.get(name) ?? 0) ?? []), name]));
  const columns = Math.max(...level.values()) + 1;
  const tallest = Math.max(...Array.from(lanes.values()).map((lane) => lane.length));
  const decision = new Set(names.filter((name) => (out.get(name) ?? []).length > 1));
  const edges = rows.map((row) => ({ from: str(row[x]), to: str(row[s]), label: size && row[size] !== "" && row[size] != null ? str(row[size]) : "" }));
  const frame = { left: 40, right: 40, top: 104, bottom: 30 };
  const draw = (_: CustomParams, api: CustomApi) => {
    const kind = api.value(0);
    const index = api.value(1);
    const w = api.getWidth();
    const h = api.getHeight();
    const colW = (w - frame.left - frame.right) / columns;
    const rowH = Math.min(104, (h - frame.top - frame.bottom) / tallest);
    const nodeW = Math.min(158, colW * 0.74);
    const at = (name: string) => {
      const lane = lanes.get(level.get(name) ?? 0) ?? [name];
      return { cx: frame.left + colW * ((level.get(name) ?? 0) + 0.5), cy: frame.top + (h - frame.top - frame.bottom) / 2 + (lane.indexOf(name) - (lane.length - 1) / 2) * rowH };
    };
    if (kind === 0) {
      const edge = edges[index];
      const a = at(edge.from);
      const b = at(edge.to);
      const x1 = a.cx + nodeW / 2;
      const x2 = b.cx - nodeW / 2;
      const mid = (x1 + x2) / 2;
      const children: Record<string, unknown>[] = [
        { type: "bezierCurve", shape: { x1, y1: a.cy, x2: x2 - 8, y2: b.cy, cpx1: mid, cpy1: a.cy, cpx2: mid, cpy2: b.cy }, style: { fill: "none", stroke: c.axis, lineWidth: 1.8 } },
        { type: "polygon", shape: { points: [[x2, b.cy], [x2 - 10, b.cy - 5.5], [x2 - 10, b.cy + 5.5]] }, style: { fill: c.axis } },
      ];
      if (edge.label) children.push({ type: "text", style: { text: edge.label, x: mid, y: (a.cy + b.cy) / 2, fill: c.text, font: "600 11px sans-serif", textAlign: "center", textVerticalAlign: "middle", backgroundColor: c.surface, padding: [2, 6] } });
      return { type: "group", children };
    }
    const name = names[index];
    const { cx, cy } = at(name);
    const isDecision = decision.has(name);
    const fill = isDecision ? palette[2] : (level.get(name) ?? 0) === 0 ? palette[3] : (out.get(name) ?? []).length === 0 ? palette[5] : palette[0];
    const text = { style: { text: name, fill: "#fff", fontSize: nodeW < 104 ? 10.5 : 12, fontWeight: 600, width: nodeW - 12, overflow: "break", lineHeight: 14, align: "center" } };
    if (isDecision) {
      const half = 40;
      return { type: "polygon", shape: { points: [[cx, cy - half], [cx + nodeW / 2, cy], [cx, cy + half], [cx - nodeW / 2, cy]] }, style: { fill }, textContent: text, textConfig: { position: "inside" } };
    }
    return { type: "rect", shape: { x: cx - nodeW / 2, y: cy - 23, width: nodeW, height: 46, r: 9 }, style: { fill }, textContent: text, textConfig: { position: "inside" } };
  };
  return {
    ...common,
    tooltip: { show: false },
    series: [{ type: "custom", coordinateSystem: "none", renderItem: draw, data: [...edges.map((_, i) => [0, i]), ...names.map((_, i) => [1, i])] }],
  } as unknown as EChartsOption;
}
