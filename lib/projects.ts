import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import type { Locale } from "./catalog";

export type Visualization = ChartConfig & { id: string };

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  dataName: string;
  rows: DataRow[];
  visualizations: Visualization[];
  activeVizId: string;
};

export const uid = () => {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch { /* insecure context */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const sampleRows: DataRow[] = [
  { Bairro: "Centro", Fonte: "Solar", Ano: 2022, Geracao_MWh: 184, Capacidade_kW: 126, Impacto_tCO2: 31.2 },
  { Bairro: "Centro", Fonte: "Eólica", Ano: 2023, Geracao_MWh: 238, Capacidade_kW: 154, Impacto_tCO2: 40.5 },
  { Bairro: "Lagoa", Fonte: "Solar", Ano: 2022, Geracao_MWh: 142, Capacidade_kW: 98, Impacto_tCO2: 24.1 },
  { Bairro: "Lagoa", Fonte: "Biogás", Ano: 2023, Geracao_MWh: 196, Capacidade_kW: 112, Impacto_tCO2: 33.3 },
  { Bairro: "Trindade", Fonte: "Solar", Ano: 2022, Geracao_MWh: 214, Capacidade_kW: 143, Impacto_tCO2: 36.4 },
  { Bairro: "Trindade", Fonte: "Eólica", Ano: 2023, Geracao_MWh: 286, Capacidade_kW: 179, Impacto_tCO2: 48.6 },
  { Bairro: "Ribeirão", Fonte: "Biogás", Ano: 2022, Geracao_MWh: 126, Capacidade_kW: 82, Impacto_tCO2: 21.4 },
  { Bairro: "Ribeirão", Fonte: "Solar", Ano: 2023, Geracao_MWh: 171, Capacidade_kW: 108, Impacto_tCO2: 29.1 },
  { Bairro: "Ingleses", Fonte: "Eólica", Ano: 2022, Geracao_MWh: 262, Capacidade_kW: 168, Impacto_tCO2: 44.5 },
  { Bairro: "Ingleses", Fonte: "Solar", Ano: 2023, Geracao_MWh: 229, Capacidade_kW: 151, Impacto_tCO2: 38.9 },
  { Bairro: "Campeche", Fonte: "Solar", Ano: 2022, Geracao_MWh: 248, Capacidade_kW: 161, Impacto_tCO2: 42.1 },
  { Bairro: "Campeche", Fonte: "Biogás", Ano: 2023, Geracao_MWh: 207, Capacidade_kW: 121, Impacto_tCO2: 35.2 },
];

export const sampleDataName = "energia-comunitaria.csv";

export const sampleConfig = (locale: Locale): ChartConfig => ({
  chartId: "grouped-bar",
  xField: "Bairro",
  yField: "Geracao_MWh",
  seriesField: "Fonte",
  sizeField: "Capacidade_kW",
  title: locale === "pt" ? "Geração comunitária por bairro" : "Community generation by district",
  subtitle: locale === "pt" ? "MWh · dados demonstrativos" : "MWh · demonstration data",
  showLabels: false,
  patterns: true,
});

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

export function createProject({ name, description = "", locale, withSample }: { name: string; description?: string; locale: Locale; withSample: boolean }): Project {
  const now = new Date().toISOString();
  const viz = makeViz(withSample ? sampleConfig(locale) : blankConfig(locale));
  return {
    id: uid(),
    name: name.trim() || (locale === "pt" ? "Projeto sem título" : "Untitled project"),
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
    dataName: withSample ? sampleDataName : "",
    rows: withSample ? sampleRows : [],
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
    const viz = makeViz({ ...sampleConfig(locale), ...parsed.config });
    const migrated: Project = { ...project, rows: parsed.rows, dataName: parsed.dataName ?? "", visualizations: [viz], activeVizId: viz.id };
    await saveProject(migrated);
    return migrated;
  } catch { return null; }
}
