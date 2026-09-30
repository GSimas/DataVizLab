import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import type { Locale } from "./catalog";
import type { ColumnSpecs } from "./columns";
import { DEFAULT_SAMPLE_CHART, sampleConfig, sampleFor } from "./samples";

export type Visualization = ChartConfig & { id: string };

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
