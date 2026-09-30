import type { EChartsOption } from "echarts";
import { L, isNumberLike, legend, number, numericColumns, plain, str, tip, type Ctx, type CustomApi, type CustomParams, type Tip } from "./chartUtils";

/* Maps without a base map: places are drawn at their longitude/latitude on a graticule. */

type Point = { lon: number; lat: number; value: number; name: string; group: string };
type Frame = { lonMin: number; lonMax: number; latMin: number; latMax: number };

const unique = (values: string[]) => Array.from(new Set(values));

const frameOf = (points: Array<{ lon: number; lat: number }>, extra = 0): Frame => {
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const lonPad = Math.max((Math.max(...lons) - Math.min(...lons)) * 0.12, 0.05) + extra;
  const latPad = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.12, 0.05) + extra;
  return { lonMin: Math.min(...lons) - lonPad, lonMax: Math.max(...lons) + lonPad, latMin: Math.min(...lats) - latPad, latMax: Math.max(...lats) + latPad };
};

const degrees = (span: number) => (v: number) => `${Math.round(v * (span < 4 ? 100 : 10)) / (span < 4 ? 100 : 10)}°`;

function axes(ctx: Ctx, frame: Frame) {
  const { c, display } = ctx;
  const style = (name: string, min: number, max: number) => ({ type: "value", name, min, max, nameLocation: "middle", nameGap: 32, nameTextStyle: { color: c.muted }, splitLine: { show: true, lineStyle: { color: c.grid, type: "dashed" } }, axisLine: ctx.axisLine, axisLabel: { color: c.muted, formatter: degrees(max - min) } });
  return { xAxis: style(L(display, "Longitude", "Longitude"), frame.lonMin, frame.lonMax), yAxis: { ...style(L(display, "Latitude", "Latitude"), frame.latMin, frame.latMax), nameLocation: "end", nameGap: 12 } };
}

/** Routes between places, each line as thick as its volume. Needs two longitude and two latitude columns. */
function flowMap(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, grid, size, palette, display } = ctx;
  const lons = numericColumns(rows).filter((field) => /lon|lng/i.test(field));
  const lats = numericColumns(rows).filter((field) => /lat/i.test(field));
  if (lons.length < 2 || lats.length < 2) return null;
  const names = Object.keys(rows[0]).filter((field) => !isNumberLike(rows[0][field]));
  const [fromName, toName] = [names[0], names[1] ?? names[0]];
  const routes = rows.map((row) => ({ from: str(row[fromName]), to: str(row[toName]), a: [number(row[lons[0]]), number(row[lats[0]])], b: [number(row[lons[1]]), number(row[lats[1]])], value: size ? number(row[size]) : 1 }));
  const nodes = new Map<string, number[]>();
  routes.forEach((route) => { nodes.set(route.from, route.a); nodes.set(route.to, route.b); });
  const frame = frameOf(Array.from(nodes.values()).map(([lon, lat]) => ({ lon, lat })));
  const peak = Math.max(...routes.map((route) => route.value), 1);
  const fmt = plain(display);
  return {
    ...common, grid: { ...grid, bottom: 52 },
    tooltip: tip(ctx, (p) => (p.seriesName === "routes" ? `${p.name}<br/><b>${fmt(Number(p.value))}</b>` : `<b>${p.name}</b>`)),
    ...axes(ctx, frame),
    series: [
      { name: "routes", type: "lines", coordinateSystem: "cartesian2d", symbol: ["none", "arrow"], symbolSize: 9, lineStyle: { color: palette[0], opacity: 0.6, curveness: 0.2 }, emphasis: { lineStyle: { opacity: 1 } },
        data: routes.map((route) => ({ name: `${route.from} → ${route.to}`, value: route.value, coords: [route.a, route.b], lineStyle: { width: 1.5 + 7 * (route.value / peak) } })) },
      { name: "places", type: "scatter", z: 4, symbolSize: 11, itemStyle: { color: palette[3], borderColor: c.surface, borderWidth: 2 }, label: { show: config.showLabels, position: "right", color: c.title, fontSize: 11, textBorderColor: c.surface, textBorderWidth: 3, formatter: (p: Tip) => p.name }, labelLayout: { hideOverlap: true },
        data: Array.from(nodes.entries()).map(([name, [lon, lat]]) => ({ name, value: [lon, lat] })) },
    ],
  } as unknown as EChartsOption;
}

/** Hexagonal bins over the points, coloured by how many fall in each. */
function hexbin(ctx: Ctx, points: Point[]): EChartsOption {
  const { c, common, grid, display } = ctx;
  const base = frameOf(points);
  const radius = Math.max(base.lonMax - base.lonMin, base.latMax - base.latMin) / 18;
  const bins = new Map<string, { x: number; y: number; count: number }>();
  points.forEach((point) => {
    const q = ((Math.sqrt(3) / 3) * (point.lon - base.lonMin) - (point.lat - base.latMin) / 3) / radius;
    const r = ((2 / 3) * (point.lat - base.latMin)) / radius;
    let rx = Math.round(q); let rz = Math.round(r); const ry = Math.round(-q - r);
    const dx = Math.abs(rx - q); const dy = Math.abs(ry - (-q - r)); const dz = Math.abs(rz - r);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    const key = `${rx},${rz}`;
    const bin = bins.get(key) ?? { x: base.lonMin + radius * Math.sqrt(3) * (rx + rz / 2), y: base.latMin + radius * 1.5 * rz, count: 0 };
    bin.count += 1;
    bins.set(key, bin);
  });
  const cells = Array.from(bins.values());
  const peak = Math.max(...cells.map((cell) => cell.count), 1);
  const frame = frameOf([...cells.map((cell) => ({ lon: cell.x, lat: cell.y })), { lon: base.lonMin, lat: base.latMin }, { lon: base.lonMax, lat: base.latMax }], radius);
  const draw = (_: CustomParams, api: CustomApi) => {
    const cx = api.value(0);
    const cy = api.value(1);
    const corners = Array.from({ length: 6 }, (__, i) => api.coord([cx + radius * Math.cos((Math.PI / 3) * i + Math.PI / 6), cy + radius * Math.sin((Math.PI / 3) * i + Math.PI / 6)]));
    return { type: "polygon", shape: { points: corners }, style: { fill: api.visual("color"), stroke: c.surface, lineWidth: 1 } };
  };
  return {
    ...common, grid: { ...grid, bottom: 84 },
    tooltip: tip(ctx, (p) => `<b>${plain(display)(Number((p.value as number[])[2]))}</b> ${L(display, "ocorrências", "incidents")}`),
    ...axes(ctx, frame),
    visualMap: { min: 1, max: peak, dimension: 2, seriesIndex: 0, calculable: true, orient: "horizontal", left: "center", bottom: 10, inRange: { color: c.sequential }, textStyle: { color: c.text } },
    series: [{ type: "custom", renderItem: draw, encode: { x: 0, y: 1 }, data: cells.map((cell) => [cell.x, cell.y, cell.count]) }],
  } as unknown as EChartsOption;
}

export function geo(ctx: Ctx): EChartsOption | null {
  const { rows, config, c, common, grid, x, y, s, size, palette, display } = ctx;
  if (config.chartId === "flow-map") { const flow = flowMap(ctx); if (flow) return flow; }
  const points: Point[] = rows.filter((row) => isNumberLike(row[x]) && isNumberLike(row[y])).map((row) => ({ lon: number(row[x]), lat: number(row[y]), value: size ? number(row[size]) : 0, name: str(row[s || x]), group: s ? str(row[s]) : "" }));
  if (!points.length) return null;
  if (config.chartId === "hexbin-map") return hexbin(ctx, points);
  const frame = frameOf(points);
  const fmt = plain(display);
  const peak = Math.max(...points.map((p) => p.value), 1);
  const floor = Math.min(...points.map((p) => p.value));
  const label = { show: true, color: c.title, fontSize: 11, textBorderColor: c.surface, textBorderWidth: 3, formatter: (p: Tip) => String((p.value as unknown[])[3]) };
  const base = { ...common, grid: { ...grid, bottom: 84 }, ...axes(ctx, frame) };
  const tooltipFor = tip(ctx, (p) => { const v = p.value as unknown[]; return `<b>${v[3]}</b>${size ? `<br/>${size}: ${fmt(Number(v[2]))}` : ""}`; });
  const rowsOf = (list: Point[]) => list.map((p) => [p.lon, p.lat, p.value, p.name]);

  if (config.chartId === "choropleth") {
    return { ...base, tooltip: tooltipFor,
      visualMap: { min: floor, max: peak, dimension: 2, seriesIndex: 0, calculable: true, orient: "horizontal", left: "center", bottom: 10, inRange: { color: c.sequential }, textStyle: { color: c.text } },
      series: [{ type: "scatter", symbol: "roundRect", symbolSize: 52, label, labelLayout: { hideOverlap: true }, data: rowsOf(points) }] } as unknown as EChartsOption;
  }
  if (config.chartId === "cartogram" || config.chartId === "bubble-map") {
    const square = config.chartId === "cartogram";
    return { ...base, tooltip: tooltipFor,
      series: [{ type: "scatter", symbol: square ? "rect" : "circle", symbolSize: (v: number[]) => 10 + 62 * Math.sqrt(Math.max(v[2], 0) / peak), itemStyle: { color: square ? palette[1] : palette[3], opacity: 0.72, borderColor: c.surface, borderWidth: 1.5 }, label, labelLayout: { hideOverlap: true }, data: rowsOf(points) }] } as unknown as EChartsOption;
  }
  // dot map: one series per group so each material or category has its own colour
  const groups = unique(points.map((p) => p.group));
  return { ...base, tooltip: tip(ctx, (p) => { const v = p.value as unknown[]; return `<b>${p.seriesName || v[3]}</b><br/>${fmt(Number(v[1]))}°, ${fmt(Number(v[0]))}°`; }),
    legend: legend(ctx, groups.length > 1 && groups[0] !== "", groups),
    series: groups.map((group, gi) => ({ name: group || config.title, type: "scatter", symbolSize: 11, itemStyle: { color: palette[gi % palette.length], opacity: 0.85, borderColor: c.surface, borderWidth: 1.5 }, data: rowsOf(points.filter((p) => p.group === group)) })) } as unknown as EChartsOption;
}
