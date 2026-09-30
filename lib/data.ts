import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import type { Locale } from "./catalog";
import { classifyColumn, columnsOf, kindOfSpec, type ColumnSpecs } from "./columns";
import type { ProjectFile } from "./parse";
import { makeViz, uid, type Project, type Visualization } from "./projects";

/* Light data helpers used by the page. Reading files lives in lib/parse.ts and runs in the import worker
   (lib/importer.ts); the ZIP and CSV writers load only when a project is exported. */

export { classifyColumn, columnsOf };
export type { ColumnKind } from "./columns";
export type { ParsedImport, ProjectFile } from "./parse";

/** Size of exported images when no on-screen chart gives one. */
export const DEFAULT_EXPORT_SIZE = { width: 1200, height: 700 };

/** Picks sensible field mappings for freshly imported rows. */
export const suggestMappings = (rows: DataRow[], specs?: ColumnSpecs): Pick<ChartConfig, "xField" | "yField" | "seriesField" | "sizeField"> => {
  const columns = columnsOf(rows);
  const kindOf = (column: string) => (specs?.[column] ? kindOfSpec(specs[column]) : classifyColumn(rows, column));
  const numeric = columns.filter((column) => kindOf(column) === "numeric");
  const categorical = columns.filter((column) => kindOf(column) !== "numeric");
  return { xField: categorical[0] ?? columns[0] ?? "", yField: numeric[0] ?? columns[1] ?? columns[0] ?? "", seriesField: categorical[1] ?? "", sizeField: numeric[1] ?? "" };
};

/** Rebuilds the visualizations stored in an exported project (schema v1 or v2). */
export const visualizationsFrom = (file: ProjectFile, fallback: ChartConfig): Visualization[] => {
  if (file.visualizations?.length) return file.visualizations.map((viz) => ({ ...fallback, ...viz, id: uid() }));
  return [makeViz({ ...fallback, ...file.config })];
};

const csvSafe = (rows: DataRow[]) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
  const text = String(value ?? "");
  return [key, /^[=+@-]/.test(text) ? `'${text}` : value];
})));

export const slugify = (text: string, fallback = "datavizlab") =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Project archive: data, configuration and any extra files (e.g. rendered charts). */
export async function downloadProjectZip(project: Project, locale: Locale, extraFiles: Record<string, string> = {}) {
  const [{ default: JSZip }, { default: Papa }] = await Promise.all([import("jszip"), import("papaparse")]);
  const zip = new JSZip();
  Object.entries(extraFiles).forEach(([path, content]) => zip.file(path, content));
  zip.file("data.csv", Papa.unparse(csvSafe(project.rows)));
  zip.file("project.json", JSON.stringify({
    schemaVersion: 2,
    app: "DataVizLab",
    exportedAt: new Date().toISOString(),
    name: project.name,
    description: project.description,
    dataName: project.dataName,
    visualizations: project.visualizations.map((viz) => { const copy: Partial<Visualization> = { ...viz }; delete copy.id; return copy; }),
    columnTypes: project.columnTypes,
    rows: project.rows,
  }, null, 2));
  zip.file("README.txt", locale === "pt"
    ? "Projeto exportado pelo DataVizLab. Importe este ZIP em Meus projetos para reproduzir dados e visualizações. Os dados foram processados localmente."
    : "Project exported by DataVizLab. Import this ZIP in My projects to restore data and visualizations. Data was processed locally.");
  downloadBlob(await zip.generateAsync({ type: "blob" }), `${slugify(project.name, "datavizlab-project")}.zip`);
}
