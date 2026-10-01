import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import type { Locale } from "./catalog";
import type { ColumnSpecs } from "./columns";
import { DEFAULT_SAMPLE_CHART, sampleConfig, sampleFor } from "./samples";

/** `sheetId` ties a visualization to one sheet of a multi-sheet project; single-sheet projects leave it unset. */
export type Visualization = ChartConfig & { id: string; sheetId?: string };

/** One sheet (tab) of an imported workbook. */
export type Sheet = { id: string; name: string; dataName: string; rows: DataRow[]; columnTypes?: ColumnSpecs; activeVizId?: string };

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  dataName: string;
  rows: DataRow[];
  /** Declared type of each column. Missing columns are inferred from the data when the table opens. */
  columnTypes?: ColumnSpecs;
  visualizations: Visualization[];
  activeVizId: string;
  /** Present only for projects with several sheets. The active sheet's data lives in `rows`/`columnTypes`/`dataName`
   *  (so the table, the chart and the assistant keep working on one table); its entry here is an empty placeholder
   *  that `sheetsOf` fills in. The other sheets keep their data here until they are opened. */
  sheets?: Sheet[];
  activeSheetId?: string;
};

export const uid = () => {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch { /* insecure context */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Chart settings for the default sample (the community-energy project). */
export const defaultSampleConfig = (locale: Locale): ChartConfig => sampleConfig(sampleFor(DEFAULT_SAMPLE_CHART, locale));

export const blankConfig = (locale: Locale): ChartConfig => ({
  chartId: "bar",
  xField: "",
  yField: "",
  seriesField: "",
  sizeField: "",
  title: locale === "pt" ? "Nova visualização" : "New visualization",
  subtitle: "",
  showLabels: false,
  patterns: true,
});

export const makeViz = (config: ChartConfig): Visualization => ({ ...config, id: uid() });

/** With `withSample`, the project starts with the fictional sample that suits `chartId` (or the default chart). */
export function createProject({ name, description = "", locale, withSample, chartId }: { name: string; description?: string; locale: Locale; withSample: boolean; chartId?: string }): Project {
  const now = new Date().toISOString();
  const sample = withSample ? sampleFor(chartId ?? DEFAULT_SAMPLE_CHART, locale) : null;
  const viz = makeViz(sample ? sampleConfig(sample) : blankConfig(locale));
  return {
    id: uid(),
    name: name.trim() || sample?.name || (locale === "pt" ? "Projeto sem título" : "Untitled project"),
    description: description.trim() || sample?.story || "",
    createdAt: now,
    updatedAt: now,
    dataName: sample?.dataName ?? "",
    rows: sample?.rows ?? [],
    ...(sample ? { columnTypes: sample.columnTypes } : {}),
    visualizations: [viz],
    activeVizId: viz.id,
  };
}

export const activeViz = (project: Project): Visualization =>
  project.visualizations.find((viz) => viz.id === project.activeVizId) ?? project.visualizations[0];

/* ---------------------------------------------------------------------------
 * Sheets. See `Project.sheets` for how the active sheet is stored.
 * ------------------------------------------------------------------------- */

/** Every sheet with its current data (the active one read from the project itself). */
export const sheetsOf = (project: Project): Sheet[] =>
  (project.sheets ?? []).map((sheet) => sheet.id === project.activeSheetId
    ? { ...sheet, rows: project.rows, columnTypes: project.columnTypes, dataName: project.dataName, activeVizId: project.activeVizId }
    : sheet);

/** The visualizations shown for the active sheet (all of them in a single-sheet project). */
export const vizzesOnActiveSheet = (project: Project): Visualization[] =>
  project.sheets ? project.visualizations.filter((viz) => viz.sheetId === project.activeSheetId) : project.visualizations;

/** The rows `viz` draws, whichever sheet it belongs to. */
export const rowsForViz = (project: Project, viz: Visualization): DataRow[] =>
  project.sheets && viz.sheetId && viz.sheetId !== project.activeSheetId ? sheetsOf(project).find((sheet) => sheet.id === viz.sheetId)?.rows ?? [] : project.rows;

/** Opens another sheet: its table, and the visualization that was open on it, take the place of the current ones. */
export function switchSheet(project: Project, sheetId: string): Project {
  if (!project.sheets || project.activeSheetId === sheetId) return project;
  const all = sheetsOf(project);
  const target = all.find((sheet) => sheet.id === sheetId);
  if (!target) return project;
  const onSheet = project.visualizations.filter((viz) => viz.sheetId === sheetId);
  const remembered = onSheet.find((viz) => viz.id === target.activeVizId) ?? onSheet[0];
  const placeholder = (sheet: Sheet): Sheet => ({ ...sheet, rows: [], columnTypes: undefined });
  return {
    ...project,
    sheets: all.map((sheet) => (sheet.id === sheetId ? placeholder(sheet) : sheet)),
    activeSheetId: sheetId,
    rows: target.rows,
    columnTypes: target.columnTypes,
    dataName: target.dataName,
    activeVizId: remembered?.id ?? project.activeVizId,
  };
}

/** Makes `vizId` the open visualization, opening its sheet first when it belongs to another one. */
export function activateViz(project: Project, vizId: string): Project {
  const viz = project.visualizations.find((item) => item.id === vizId);
  if (!viz) return project;
  const switched = viz.sheetId ? switchSheet(project, viz.sheetId) : project;
  return { ...switched, activeVizId: vizId };
}

/** Turns a project with one table into a multi-sheet one (the table becomes the first sheet). */
export function withSheets(project: Project, firstName: string): Project {
  if (project.sheets) return project;
  const id = uid();
  return {
    ...project,
    sheets: [{ id, name: firstName, dataName: project.dataName, rows: [], activeVizId: project.activeVizId }],
    activeSheetId: id,
    visualizations: project.visualizations.map((viz) => ({ ...viz, sheetId: id })),
  };
}

/** Adds an empty sheet with one blank visualization and opens it. */
export function addSheet(project: Project, name: string, config: ChartConfig, firstName: string): Project {
  const base = withSheets(project, firstName);
  const id = uid();
  const viz: Visualization = { ...makeViz(config), sheetId: id };
  return switchSheet({ ...base, sheets: [...base.sheets!, { id, name, dataName: "", rows: [], activeVizId: viz.id }], visualizations: [...base.visualizations, viz] }, id);
}

/** Removes a sheet and its visualizations; the neighbouring sheet opens. Returns the project unchanged for the last sheet. */
export function removeSheet(project: Project, sheetId: string): Project {
  if (!project.sheets || project.sheets.length < 2) return project;
  const index = project.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (index < 0) return project;
  const all = sheetsOf(project);
  const rest = all.filter((sheet) => sheet.id !== sheetId);
  const next = rest[Math.max(0, index - 1)];
  const kept = project.visualizations.filter((viz) => viz.sheetId !== sheetId);
  if (project.activeSheetId !== sheetId) return { ...project, sheets: project.sheets.filter((sheet) => sheet.id !== sheetId), visualizations: kept };
  // The removed sheet was open: its neighbour takes over the project's table.
  const remembered = kept.find((viz) => viz.id === next.activeVizId) ?? kept.find((viz) => viz.sheetId === next.id);
  return {
    ...project,
    sheets: rest.map((sheet) => (sheet.id === next.id ? { ...sheet, rows: [], columnTypes: undefined } : sheet)),
    activeSheetId: next.id,
    visualizations: kept,
    rows: next.rows,
    columnTypes: next.columnTypes,
    dataName: next.dataName,
    activeVizId: remembered?.id ?? kept[0]?.id ?? project.activeVizId,
  };
}

/* ---------------------------------------------------------------------------
 * Persistence. Projects live in IndexedDB so that large tables fit (localStorage
 * caps out around 5 MB). If IndexedDB is unavailable — some private modes — the
 * app keeps working with an in-memory store for the session.
 * ------------------------------------------------------------------------- */

const DB_NAME = "datavizlab";
const STORE = "projects";
const LEGACY_KEY = "datavizlab-project";
const memory = new Map<string, Project>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    if (!db) { resolve(undefined); return; }
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function listProjects(): Promise<Project[]> {
  const stored = (await run<Project[]>("readonly", (store) => store.getAll()).catch(() => undefined)) ?? Array.from(memory.values());
  return stored.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveProject(project: Project): Promise<void> {
  memory.set(project.id, project);
  await run("readwrite", (store) => store.put(project));
}

export async function removeProject(id: string): Promise<void> {
  memory.delete(id);
  await run("readwrite", (store) => store.delete(id));
}

/** Converts the single project the previous version kept in localStorage. */
export async function migrateLegacyProject(locale: Locale): Promise<Project | null> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rows?: DataRow[]; config?: ChartConfig; dataName?: string };
    localStorage.removeItem(LEGACY_KEY);
    if (!parsed.rows?.length) return null;
    const project = createProject({ name: locale === "pt" ? "Meu primeiro projeto" : "My first project", locale, withSample: false });
    const viz = makeViz({ ...defaultSampleConfig(locale), ...parsed.config });
    const migrated: Project = { ...project, rows: parsed.rows, dataName: parsed.dataName ?? "", visualizations: [viz], activeVizId: viz.id };
    await saveProject(migrated);
    return migrated;
  } catch { return null; }
}
