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
export const MAX_SHEETS = 24;

export const normalizeRows = (input: unknown[]): DataRow[] => input
  .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
  .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim() || "Campo", value == null ? null : typeof value === "number" || typeof value === "boolean" ? value : String(value).trim()])))
  .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

export const parseDelimited = (text: string): DataRow[] =>
  normalizeRows(Papa.parse<Record<string, unknown>>(text, { header: true, dynamicTyping: true, skipEmptyLines: "greedy" }).data);

export type ProjectSheetFile = { id?: string; name?: string; dataName?: string; rows?: unknown[]; columnTypes?: unknown };
export type ProjectFile = { name?: string; description?: string; dataName?: string; rows?: unknown[]; columnTypes?: unknown; sheets?: ProjectSheetFile[]; config?: Partial<ChartConfig>; visualizations?: Partial<Visualization>[] };

/** One sheet of a workbook (or of a project export). `id` is only present when a project export already named it. */
export type ParsedSheet = { id?: string; name: string; dataName?: string; rows: DataRow[]; columnTypes?: ColumnSpecs };

/** `columnTypes` is present when the file is a project export that already declared its column types.
 *  `sheets` is present when the file holds several tables (an Excel workbook with several filled sheets, or a
 *  project exported with sheets); `rows` is then the first sheet. */
export type ParsedImport = { rows: DataRow[]; dataName: string; project?: ProjectFile; columnTypes?: ColumnSpecs; sheets?: ParsedSheet[] };

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
    const sheets = (parsed.sheets ?? []).slice(0, MAX_SHEETS).map((sheet, index): ParsedSheet => ({
      id: typeof sheet.id === "string" ? sheet.id : undefined,
      name: String(sheet.name || `${index + 1}`),
      dataName: sheet.dataName,
      rows: normalizeRows(sheet.rows ?? []).slice(0, MAX_ROWS),
      columnTypes: sanitizeSpecs(sheet.columnTypes),
    }));
    if (sheets.some((sheet) => sheet.rows.length)) {
      return { rows: sheets[0].rows, dataName: sheets[0].dataName || parsed.dataName || file.name, project: parsed, columnTypes: sheets[0].columnTypes, sheets };
    }
    if (!parsed.rows?.length) throw new Error("invalid project");
    return { rows: normalizeRows(parsed.rows).slice(0, MAX_ROWS), dataName: parsed.dataName || file.name, project: parsed, columnTypes: sanitizeSpecs(parsed.columnTypes) };
  }
  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    return { rows: parseDelimited(await file.text()).slice(0, MAX_ROWS), dataName: file.name };
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  // Every sheet that holds data becomes a table of its own; empty sheets are left out.
  const sheets = workbook.SheetNames.slice(0, MAX_SHEETS)
    .map((name): ParsedSheet => ({ name, rows: normalizeRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: null, raw: false })).slice(0, MAX_ROWS) }))
    .filter((sheet) => sheet.rows.length);
  if (sheets.length > 1) return { rows: sheets[0].rows, dataName: file.name, sheets };
  const only = sheets[0] ?? { name: workbook.SheetNames[0], rows: [] };
  return { rows: only.rows, dataName: `${file.name} · ${only.name}` };
}
