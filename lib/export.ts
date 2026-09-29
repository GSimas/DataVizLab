import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { chartOption, chartSurface, type ChartDisplay } from "../components/ChartRenderer";
import type { Locale } from "./catalog";
import { downloadBlob, downloadProjectZip, slugify } from "./data";
import type { Project, Visualization } from "./projects";

export type ExportFormat = "svg" | "jpg" | "png" | "project";

/** How an export should look; independent of the on-screen theme. */
export type ExportLook = { dark: boolean; contrast: boolean; fontScale: number; width: number; height: number };

export const DEFAULT_EXPORT_SIZE = { width: 1200, height: 700 };

const fileBase = (project: Project, viz: Visualization) => `${slugify(project.name, "projeto")}-${slugify(viz.title || viz.chartId, "grafico")}`;

const staticOption = (project: Project, viz: Visualization, look: ExportLook, background: string): EChartsOption => {
  const display: ChartDisplay = { dark: look.dark, contrast: look.contrast, fontScale: look.fontScale, reducedMotion: true };
  return { ...chartOption(project.rows, viz, display), animation: false, backgroundColor: background };
};

/** True vector output: rendered with ECharts' SVG renderer (server-side mode, no DOM). */
export function renderSvg(project: Project, viz: Visualization, look: ExportLook, withBackground = true) {
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: look.width, height: look.height });
  chart.setOption(staticOption(project, viz, look, withBackground ? chartSurface(look.dark, look.contrast) : "transparent"));
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

/** Raster output through an off-screen canvas chart, so page fonts are used. */
export function renderRaster(project: Project, viz: Visualization, look: ExportLook, type: "png" | "jpeg", transparent: boolean, pixelRatio = 2) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${look.width}px;height:${look.height}px;pointer-events:none;`;
  document.body.appendChild(host);
  try {
    const chart = echarts.init(host, undefined, { renderer: "canvas", width: look.width, height: look.height });
    const background = transparent ? "transparent" : chartSurface(look.dark, look.contrast);
    chart.setOption(staticOption(project, viz, look, background));
    const url = chart.getDataURL({ type, pixelRatio, backgroundColor: background });
    chart.dispose();
    return url;
  } finally {
    host.remove();
  }
}

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

/** Downloads one visualization or the whole project. */
export async function runExport(format: ExportFormat, project: Project, viz: Visualization, look: ExportLook, locale: Locale) {
  if (format === "svg") {
    downloadBlob(new Blob([renderSvg(project, viz, look)], { type: "image/svg+xml" }), `${fileBase(project, viz)}.svg`);
  } else if (format === "jpg") {
    downloadBlob(await dataUrlToBlob(renderRaster(project, viz, look, "jpeg", false)), `${fileBase(project, viz)}.jpg`);
  } else if (format === "png") {
    downloadBlob(await dataUrlToBlob(renderRaster(project, viz, look, "png", true)), `${fileBase(project, viz)}.png`);
  } else {
    await exportProjectArchive(project, locale, look);
  }
}

/** Project ZIP with data, configuration and an SVG of every visualization. */
export async function exportProjectArchive(project: Project, locale: Locale, look: ExportLook) {
  const charts: Record<string, string> = {};
  if (project.rows.length) {
    project.visualizations.forEach((viz, index) => {
      charts[`charts/${String(index + 1).padStart(2, "0")}-${slugify(viz.title || viz.chartId, "grafico")}.svg`] = renderSvg(project, viz, look);
    });
  }
  await downloadProjectZip(project, locale, charts);
}
