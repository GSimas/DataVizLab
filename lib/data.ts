import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import type { Locale } from "./catalog";
import { classifyColumn, columnsOf, kindOfSpec, type ColumnSpecs } from "./columns";
import type { PreparedImport } from "./importTask";
import type { ProjectFile } from "./parse";
import { makeViz, sheetsOf, switchSheet, uid, withSheets, type Project, type Sheet, type Visualization } from "./projects";

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

type SheetedImport = PreparedImport & { sheets: NonNullable<PreparedImport["sheets"]> };
export const hasSheets = (table: PreparedImport): table is SheetedImport => Boolean(table.sheets && table.sheets.length > 0);

/** A table on its way into a project as a sheet. `id` is kept when a project export already named it. */
export type IncomingSheet = { id?: string; name: string; dataName: string; rows: DataRow[]; columnTypes?: ColumnSpecs };

/** A short sheet name from a data name: the sheet of a workbook (`plano.xlsx · Vendas` → `Vendas`) or the file name without extension. */
export const sheetLabel = (dataName: string, fallback: string) =>
  (dataName.includes(" · ") ? dataName.slice(dataName.lastIndexOf(" · ") + 3) : dataName.replace(/\.[^.]+$/, "")).trim() || fallback;

/** `name`, or `name (2)`, `name (3)`… when it is already taken. Adds the result to `taken`. */
const uniqueName = (name: string, taken: Set<string>) => {
  let result = name;
  for (let counter = 2; taken.has(result); counter++) result = `${name} (${counter})`;
  taken.add(result);
  return result;
};

/** Every table read from one or more files, as sheets: each sheet of a workbook, and each CSV/JSON file, is one sheet. */
export function sheetsFromImports(results: Array<{ fileName: string; table: PreparedImport }>, taken = new Set<string>()): IncomingSheet[] {
  return results.flatMap(({ fileName, table }) => hasSheets(table)
    ? table.sheets.map((sheet) => ({ id: sheet.id, name: uniqueName(sheet.name, taken), dataName: sheet.dataName || `${fileName} · ${sheet.name}`, rows: sheet.rows, columnTypes: sheet.columnTypes }))
    : [{ name: uniqueName(sheetLabel(table.dataName || fileName, fileName), taken), dataName: table.dataName || fileName, rows: table.rows, columnTypes: table.columnTypes }]);
}

const mappingsOf = (sheet: { rows: DataRow[]; columnTypes?: ColumnSpecs }) => suggestMappings(sheet.rows, sheet.columnTypes);
const vizFor = (sheet: Sheet, base: ChartConfig): Visualization => ({ ...makeViz({ ...base, ...mappingsOf(sheet), title: sheet.name }), sheetId: sheet.id });

/** Replaces the data of `current` with several tables: every table becomes a sheet and every sheet gets a visualization.
 *  The project's own visualizations (and those of an imported project file, in `extra`) belong to the first sheet
 *  unless the file says otherwise. */
export function applySheets(current: Project, incoming: IncomingSheet[], extra: Visualization[], base: ChartConfig): Project {
  const sheets: Sheet[] = incoming.map((sheet) => ({ id: sheet.id || uid(), name: sheet.name, dataName: sheet.dataName, rows: sheet.rows, columnTypes: sheet.columnTypes }));
  const [first] = sheets;
  const known = new Set(sheets.map((sheet) => sheet.id));
  const fields = new Set(columnsOf(first.rows));
  const carried = current.visualizations.map((viz) => ({ ...(fields.has(viz.xField) && fields.has(viz.yField) ? viz : { ...viz, ...mappingsOf(first) }), sheetId: first.id }));
  const added = extra.map((viz) => ({ ...viz, sheetId: viz.sheetId && known.has(viz.sheetId) ? viz.sheetId : first.id }));
  const visualizations: Visualization[] = [...carried, ...added];
  sheets.forEach((sheet) => { if (!visualizations.some((viz) => viz.sheetId === sheet.id)) visualizations.push(vizFor(sheet, base)); });
  const open = (added.find((viz) => viz.sheetId === first.id) ?? visualizations.find((viz) => viz.sheetId === first.id))!.id;
  return {
    ...current,
    rows: first.rows,
    columnTypes: first.columnTypes,
    dataName: first.dataName,
    sheets: sheets.map((sheet, index) => (index === 0 ? { ...sheet, rows: [], columnTypes: undefined, activeVizId: open } : sheet)),
    activeSheetId: first.id,
    visualizations,
    activeVizId: open,
  };
}

/** Adds tables to `current` as new sheets, each with its own visualization, keeping everything already there.
 *  The first added sheet opens. A project without any data simply takes the new sheets. */
export function appendSheets(current: Project, incoming: IncomingSheet[], base: ChartConfig, firstName: string): Project {
  if (!incoming.length) return current;
  if (!current.sheets && !current.rows.length) return applySheets(current, incoming, [], base);
  const project = withSheets(current, sheetLabel(current.dataName, firstName));
  const taken = new Set(project.sheets!.map((sheet) => sheet.name));
  const sheets: Sheet[] = incoming.map((sheet) => ({ id: uid(), name: uniqueName(sheet.name, taken), dataName: sheet.dataName, rows: sheet.rows, columnTypes: sheet.columnTypes }));
  const visualizations = sheets.map((sheet) => vizFor(sheet, base));
  return switchSheet({
    ...project,
    sheets: [...project.sheets!, ...sheets.map((sheet, index) => ({ ...sheet, activeVizId: visualizations[index].id }))],
    visualizations: [...project.visualizations, ...visualizations],
  }, sheets[0].id);
}

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
  const sheets = project.sheets ? sheetsOf(project) : undefined;
  // One CSV per sheet, so the data of a workbook is readable without DataVizLab.
  sheets?.forEach((sheet, index) => zip.file(`sheets/${String(index + 1).padStart(2, "0")}-${slugify(sheet.name, "aba")}.csv`, Papa.unparse(csvSafe(sheet.rows))));
  zip.file("project.json", JSON.stringify({
    schemaVersion: project.sheets ? 3 : 2,
    app: "DataVizLab",
    exportedAt: new Date().toISOString(),
    name: project.name,
    description: project.description,
    dataName: project.dataName,
    visualizations: project.visualizations.map((viz) => { const copy: Partial<Visualization> = { ...viz }; delete copy.id; return copy; }),
    columnTypes: project.columnTypes,
    rows: project.rows,
    ...(sheets ? { activeSheetId: project.activeSheetId, sheets: sheets.map(({ id, name, dataName, rows, columnTypes }) => ({ id, name, dataName, columnTypes, rows })) } : {}),
  }, null, 2));
  zip.file("README.txt", locale === "pt"
    ? "Projeto exportado pelo DataVizLab. Importe este ZIP em Meus projetos para reproduzir dados e visualizações. Os dados foram processados localmente."
    : "Project exported by DataVizLab. Import this ZIP in My projects to restore data and visualizations. Data was processed locally.");
  downloadBlob(await zip.generateAsync({ type: "blob" }), `${slugify(project.name, "datavizlab-project")}.zip`);
}
