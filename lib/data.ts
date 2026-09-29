import Papa from "papaparse";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import type { Locale } from "./catalog";
import { makeViz, uid, type Project, type Visualization } from "./projects";

export type ColumnKind = "numeric" | "categorical" | "temporal";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ROWS = 50000;

export const normalizeRows = (input: unknown[]): DataRow[] => input
  .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
  .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim() || "Campo", value == null ? null : typeof value === "number" || typeof value === "boolean" ? value : String(value).trim()])))
  .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

export const columnsOf = (rows: DataRow[]) => Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

export const classifyColumn = (rows: DataRow[], column: string): ColumnKind => {
  const values = rows.map((row) => row[column]).filter((value) => value !== null && value !== "").slice(0, 200);
  if (!values.length) return "categorical";
  const numeric = values.filter((value) => typeof value === "number" || /^[-+]?\d[\d.,\s]*$/.test(String(value))).length;
  if (numeric / values.length > 0.78) return "numeric";
  const temporal = values.filter((value) => /^\d{4}([-/]\d{1,2}([-/]\d{1,2})?)?$/.test(String(value)) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(String(value))).length;
  if (temporal / values.length > 0.7) return "temporal";
  return "categorical";
};

/** Picks sensible field mappings for freshly imported rows. */
export const suggestMappings = (rows: DataRow[]): Pick<ChartConfig, "xField" | "yField" | "seriesField" | "sizeField"> => {
  const columns = columnsOf(rows);
  const numeric = columns.filter((column) => classifyColumn(rows, column) === "numeric");
  const categorical = columns.filter((column) => classifyColumn(rows, column) !== "numeric");
  return { xField: categorical[0] ?? columns[0] ?? "", yField: numeric[0] ?? columns[1] ?? columns[0] ?? "", seriesField: categorical[1] ?? "", sizeField: numeric[1] ?? "" };
};

export const parseDelimited = (text: string): DataRow[] =>
  normalizeRows(Papa.parse<Record<string, unknown>>(text, { header: true, dynamicTyping: true, skipEmptyLines: "greedy" }).data);

type ProjectFile = { name?: string; description?: string; dataName?: string; rows?: unknown[]; config?: Partial<ChartConfig>; visualizations?: Partial<Visualization>[] };

export type ParsedImport = { rows: DataRow[]; dataName: string; project?: ProjectFile };

/** Reads a local file entirely in the browser. Nothing is uploaded. */
export async function parseFile(file: File): Promise<ParsedImport> {
  if (file.size > MAX_FILE_BYTES) throw new Error("too-large");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "json" || extension === "zip") {
    let text: string;
    if (extension === "zip") {
      const archive = await JSZip.loadAsync(await file.arrayBuffer());
      const projectFile = archive.file("project.json");
      if (!projectFile) throw new Error("project.json missing");
      text = await projectFile.async("string");
    } else {
      text = await file.text();
    }
    const parsed = JSON.parse(text) as ProjectFile | unknown[];
    if (Array.isArray(parsed)) return { rows: normalizeRows(parsed).slice(0, MAX_ROWS), dataName: file.name };
    if (!parsed.rows?.length) throw new Error("invalid project");
    return { rows: normalizeRows(parsed.rows).slice(0, MAX_ROWS), dataName: parsed.dataName || file.name, project: parsed };
  }
  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    return { rows: parseDelimited(await file.text()).slice(0, MAX_ROWS), dataName: file.name };
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  return { rows: normalizeRows(data).slice(0, MAX_ROWS), dataName: `${file.name} · ${workbook.SheetNames[0]}` };
}

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
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;

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
    rows: project.rows,
  }, null, 2));
  zip.file("README.txt", locale === "pt"
    ? "Projeto exportado pelo DataVizLab. Importe este ZIP em Meus projetos para reproduzir dados e visualizações. Os dados foram processados localmente."
    : "Project exported by DataVizLab. Import this ZIP in My projects to restore data and visualizations. Data was processed locally.");
  downloadBlob(await zip.generateAsync({ type: "blob" }), `${slugify(project.name, "datavizlab-project")}.zip`);
}
