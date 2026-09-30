import type { Locale } from "../lib/catalog";
import type { TranslationKey } from "../lib/i18n";
import { dateFormat } from "../lib/intl";
import type { Project } from "../lib/projects";

export type Route = { view: "home" } | { view: "projects" } | { view: "catalog" } | { view: "studio"; id: string };

export type AppApi = {
  locale: Locale;
  dark: boolean;
  /** Display preferences the chart renderer needs (canvas text cannot read CSS). */
  chart: { contrast: boolean; fontScale: number; reducedMotion: boolean };
  tr: (key: TranslationKey) => string;
  notify: (message: string) => void;
  navigate: (route: Route) => void;
  projects: Project[];
  loaded: boolean;
  addProject: (project: Project) => void;
  /** `history: false` for changes that are not edits (switching tabs, types inferred on open): they are not undone. */
  updateProject: (id: string, updater: (project: Project) => Project, options?: { history?: boolean }) => void;
  deleteProject: (id: string) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  canUndo: (id: string) => boolean;
  canRedo: (id: string) => boolean;
};

export const parseHash = (hash: string): Route => {
  const path = decodeURIComponent(hash.replace(/^#\/?/, "")).replace(/\/+$/, "");
  if (path === "projetos") return { view: "projects" };
  if (path.startsWith("projetos/")) return { view: "studio", id: path.slice("projetos/".length) };
  if (path === "catalogo") return { view: "catalog" };
  return { view: "home" };
};

export const routeHref = (route: Route) => {
  if (route.view === "projects") return "#/projetos";
  if (route.view === "catalog") return "#/catalogo";
  if (route.view === "studio") return `#/projetos/${encodeURIComponent(route.id)}`;
  return "#/";
};

export const formatDate = (iso: string, locale: Locale) => {
  try { return dateFormat(locale === "pt" ? "pt-BR" : "en", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
};
