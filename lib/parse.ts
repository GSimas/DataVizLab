import Papa from "papaparse";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import { sanitizeSpecs, type ColumnSpecs } from "./columns";
import type { Visualization } from "./projects";

/* Reading files: CSV, TSV, Excel, JSON and project ZIPs. These parsers are heavy, so this module runs in the
   import worker (lib/import.worker.ts) and never ships with the page itself. */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ROWS = 50000;

export const normalizeRows = (input: unknown[]): DataRow[] => input
  .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
  .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim() || "Campo", value == null ? null : typeof value === "number" || typeof value === "boolean" ? value : String(value).trim()])))
  .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

export const parseDelimited = (text: string): DataRow[] =>
  normalizeRows(Papa.parse<Record<string, unknown>>(text, { header: true, dynamicTyping: true, skipEmptyLines: "greedy" }).data);

export type ProjectFile = { name?: string; description?: string; dataName?: string; rows?: unknown[]; columnTypes?: unknown; config?: Partial<ChartConfig>; visualizations?: Partial<Visualization>[] };

/** `columnTypes` is present when the file is a project export that already declared its column types. */
export type ParsedImport = { rows: DataRow[]; dataName: string; project?: ProjectFile; columnTypes?: ColumnSpecs };

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
    return { rows: normalizeRows(parsed.rows).slice(0, MAX_ROWS), dataName: parsed.dataName || file.name, project: parsed, columnTypes: sanitizeSpecs(parsed.columnTypes) };
  }
  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    return { rows: parseDelimited(await file.text()).slice(0, MAX_ROWS), dataName: file.name };
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  return { rows: normalizeRows(data).slice(0, MAX_ROWS), dataName: `${file.name} · ${workbook.SheetNames[0]}` };
}
