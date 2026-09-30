import type { EChartsOption } from "echarts";
import { L, aggregate, plain, str, tip, number, type Ctx, type CustomApi, type CustomParams } from "./chartUtils";

/* Charts made of words: a cloud sized by frequency and a tree of the phrases that continue a word. */

type Placed = { text: string; x: number; y: number; size: number; color: number; weight: number };

/** Word cloud: words in a spiral from the centre, the more frequent the larger, without overlapping. */
export function wordCloud(ctx: Ctx): EChartsOption | null {
  const { rows, common, x, y, palette, display } = ctx;
  const { map, xValues } = aggregate(rows, x, y);
  const words = xValues.map((text) => ({ text, weight: map.get(`${text}|||_`) ?? 0 })).filter((word) => word.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 70);
  if (words.length < 3) return null;
  const max = words[0].weight;
  const min = words[words.length - 1].weight;
  const cache = new Map<string, Placed[]>();
  const layout = (w: number, h: number) => {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const box = { left: 24, right: w - 24, top: 96, bottom: h - 20 };
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const stretch = (box.right - box.left) / (box.bottom - box.top);
    const taken: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    const placed: Placed[] = [];
    const scale = Math.min(1, (box.bottom - box.top) / 340);
    words.forEach((word, index) => {
      const size = (13 + 40 * Math.sqrt((word.weight - min) / (max - min || 1))) * Math.max(0.7, scale);
      const width = word.text.length * size * 0.58;
      const height = size * 1.18;
      for (let step = 0; step < 900; step++) {
        const angle = step * 0.32;
        const radius = 2 + step * 0.85;
        const px = cx + radius * Math.cos(angle) * stretch * 0.8;
        const py = cy + radius * Math.sin(angle);
        const rect = { x0: px - width / 2 - 3, y0: py - height / 2 - 2, x1: px + width / 2 + 3, y1: py + height / 2 + 2 };
        if (rect.x0 < box.left || rect.x1 > box.right || rect.y0 < box.top || rect.y1 > box.bottom) continue;
        if (taken.some((other) => rect.x0 < other.x1 && rect.x1 > other.x0 && rect.y0 < other.y1 && rect.y1 > other.y0)) continue;
        taken.push(rect);
        placed.push({ text: word.text, x: px, y: py, size, color: index, weight: word.weight });
        return;
      }
    });
    cache.set(key, placed);
    return placed;
  };
  const fmt = plain(display);
  const draw = (params: CustomParams, api: CustomApi) => {
    const word = layout(api.getWidth(), api.getHeight()).find((item) => item.text === words[params.dataIndex].text);
    if (!word) return { type: "group", children: [] };
    return { type: "text", style: { text: word.text, x: word.x, y: word.y, fill: palette[word.color % palette.length], font: `700 ${word.size}px 'Manrope Variable', sans-serif`, textAlign: "center", textVerticalAlign: "middle" } };
  };
  return {
    ...common,
    tooltip: tip(ctx, (p) => { const word = words[(p.value as number[])[0]]; return `<b>${word.text}</b><br/>${fmt(word.weight)}`; }),
    series: [{ type: "custom", coordinateSystem: "none", renderItem: draw, data: words.map((_, i) => [i]) }],
  } as unknown as EChartsOption;
}

type Trie = { name: string; value: number; children: Map<string, Trie> };

/** Word tree: every phrase is a path of words; branches are sized by how often they occur. */
export function wordTree(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, x, y, palette, display } = ctx;
  const root: Trie = { name: config.title, value: 0, children: new Map() };
  rows.forEach((row) => {
    const tokens = str(row[x]).trim().split(/\s+/).filter(Boolean);
    const weight = number(row[y]) || 1;
    let node = root;
    tokens.forEach((token) => {
      const next = node.children.get(token) ?? { name: token, value: 0, children: new Map() };
      next.value += weight;
      node.children.set(token, next);
      node = next;
    });
    root.value += weight;
  });
  if (!root.children.size) return null;
  const start = root.children.size === 1 ? Array.from(root.children.values())[0] : root;
  const peak = Math.max(...Array.from(start.children.values()).map((child) => child.value), start.value, 1);
  const fmt = plain(display);
  type Item = { name: string; value: number; label: Record<string, unknown>; children?: Item[] };
  const convert = (node: Trie, depth: number): Item => ({
    name: node.name, value: node.value,
    label: { fontSize: 12 + 16 * Math.sqrt(node.value / peak), fontWeight: depth === 0 ? 800 : 600, color: depth === 0 ? palette[0] : c.text },
    ...(node.children.size ? { children: Array.from(node.children.values()).sort((a, b) => b.value - a.value).map((child) => convert(child, depth + 1)) } : {}),
  });
  return {
    ...common,
    tooltip: tip(ctx, (p) => `<b>${p.name}</b><br/>${fmt(Number(p.value))} ${L(display, "menções", "mentions")}`),
    series: [{
      type: "tree", emphasis: { focus: "relative" }, data: [convert(start, 0)], top: 96, bottom: 30, left: "5%", right: "22%", orient: "LR", edgeShape: "polyline", edgeForkPosition: "30%", symbol: "none", initialTreeDepth: -1, expandAndCollapse: false, roam: false,
      lineStyle: { color: c.axis, width: 1.4 }, label: { position: "right", verticalAlign: "middle", align: "left", distance: 6 }, leaves: { label: { position: "right", verticalAlign: "middle", align: "left" } },
    }],
  } as unknown as EChartsOption;
}
