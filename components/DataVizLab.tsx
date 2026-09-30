"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Coffee, Compass, FolderPlus, Menu, X } from "lucide-react";
import type { VizEntry } from "../lib/catalog";
import { t, type TranslationKey } from "../lib/i18n";
import { activeViz, createProject, listProjects, makeViz, migrateLegacyProject, removeProject, saveProject, type Project } from "../lib/projects";
import { MiniViz } from "./MiniViz";
import { Modal } from "./Modal";
import { HomeView } from "./HomeView";
import { ProjectsView } from "./ProjectsView";
import { ErrorBoundary } from "./ErrorBoundary";
import { lazyView } from "./lazyView";
import { CatalogView } from "./CatalogView";
import { formatDate, parseHash, routeHref, type AppApi, type Route } from "./app";
import { SettingsMenu } from "./SettingsMenu";
import { TooltipLayer } from "./ui/TooltipLayer";
import { Ambient } from "./Ambient";
import { DURATION, usePresence, withViewTransition } from "../lib/motion";
import { applyPrefs, fontScale, readPrefs, savePrefs, type Prefs } from "../lib/prefs";
import { TOUR_DONE_KEY } from "../lib/tour";
import type { AgentContext } from "../lib/ai/tools";
import { Assistant } from "./assistant/Assistant";

// The studio carries the chart library and the table editor; the tour only matters once it starts.
// Both download on first use, and the studio also as soon as a visit is heading to it (see below).
const StudioView = lazyView<{ api: AppApi; projectId: string }>(() => import("./StudioView").then(({ StudioView: View }) => ({ default: View })));
const Tour = lazyView<React.ComponentProps<typeof import("./Tour").Tour>>(() => import("./Tour").then(({ Tour: View }) => ({ default: View })));

type ProjectHistory = { past: Project[]; future: Project[]; lastAt: number };
const HISTORY_LIMIT = 100;
/** Edits closer together than this (typing, dragging through values) are undone as one step. */
const HISTORY_BURST_MS = 800;

/** Links and buttons that lead to the studio: hovering or focusing them starts its download. */
const TOWARDS_STUDIO = 'a[href^="#/projetos/"], [data-tour="new-project"], .project-card, .picker-list button, .launch-link';


export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><b>+</b></span>;
}

/** Shown in place of a view that failed to load or crashed; the header, navigation and other views keep working. */
function ViewError({ tr, retry }: { tr: (key: TranslationKey) => string; retry: () => void }) {
  return (
    <section className="page studio-page">
      <div className="empty-state" role="alert">
        <h2>{tr("partErrorTitle")}</h2>
        <p>{tr("partErrorText")}</p>
        <div className="empty-actions">
          <button className="button button-primary" type="button" onClick={retry}>{tr("retry")}</button>
          <a className="launch-link" href={routeHref({ view: "projects" })}>{tr("backToProjects")}<span><ArrowUpRight size={15} /></span></a>
        </div>
      </div>
    </section>
  );
}

export default function DataVizLab() {
  // Server render uses defaults; the saved preferences are read after hydration
  // (the <head> bootstrap already applied them to <html> before first paint).
  const [prefs, setPrefs] = useState<Prefs>({ locale: "pt", theme: "dark", contrast: "normal", motion: "full", fontSize: "md" });
  const [prefsReady, setPrefsReady] = useState(false);
  const [route, setRoute] = useState<Route>({ view: "home" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState({ message: "", visible: false });
  const [mobileNav, setMobileNav] = useState(false);
  const [pickerEntry, setPickerEntry] = useState<VizEntry | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourInvite, setTourInvite] = useState(false);
  // Once started, the tour stays mounted so its closing animation can play.
  const [tourLoaded, setTourLoaded] = useState(false);
  if (tourActive && !tourLoaded) setTourLoaded(true);
  // Latest state for the assistant's tools, which run outside React renders.
  const projectsRef = useRef<Project[]>([]);
  const routeRef = useRef<Route>({ view: "home" });
  const prefsRef = useRef(prefs);
  const saveTimers = useRef(new Map<string, number>());
  const pendingSaves = useRef(new Map<string, Project>());
  const { locale } = prefs;
  const dark = prefs.theme === "dark";
  const tr = useCallback((key: TranslationKey) => t(locale, key), [locale]);
  const toastPresence = usePresence(toast.visible, DURATION.base);
  const invitePresence = usePresence(tourInvite && !tourActive, DURATION.base);

  useEffect(() => { projectsRef.current = projects; routeRef.current = route; prefsRef.current = prefs; }, [projects, route, prefs]);

  // First visit: offer the guided tour once.
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem(TOUR_DONE_KEY) === "1"; } catch { /* storage blocked */ }
    if (seen || new URLSearchParams(location.search).has("code")) return;
    const timer = window.setTimeout(() => setTourInvite(true), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate client-only state after SSR */
    setPrefs(readPrefs());
    setPrefsReady(true);
    setRoute(parseHash(window.location.hash));
    /* eslint-enable react-hooks/set-state-in-effect */
    const onHash = () => withViewTransition(() => { setRoute(parseHash(window.location.hash)); setMobileNav(false); window.scrollTo({ top: 0, behavior: "instant" }); });
    // vinext's router treats every popstate as a page traversal and refetches the RSC
    // payload (reloading on failure). Views here live in the hash of a single page, so
    // hash-only history moves are kept away from it; capture runs before its listener.
    let lastPath = window.location.pathname + window.location.search;
    const onPop = (event: PopStateEvent) => {
      const path = window.location.pathname + window.location.search;
      if (path === lastPath) event.stopImmediatePropagation();
      lastPath = path;
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onPop, { capture: true });
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onPop, { capture: true }); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedLocale = (() => { try { return localStorage.getItem("datavizlab-locale") === "en" ? "en" : "pt"; } catch { return "pt"; } })();
      await migrateLegacyProject(storedLocale);
      const stored = await listProjects().catch(() => []);
      if (!cancelled) { setProjects(stored); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    applyPrefs(prefs);
    savePrefs(prefs);
  }, [prefs, prefsReady]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  // Start downloading the studio when the visit is heading there, so opening a project does not wait.
  useEffect(() => {
    const onIntent = (event: Event) => { if (event.target instanceof Element && event.target.closest(TOWARDS_STUDIO)) StudioView.preload(); };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    return () => { document.removeEventListener("pointerover", onIntent); document.removeEventListener("focusin", onIntent); };
  }, []);
  useEffect(() => {
    if (route.view !== "projects") return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    // Also build the date formatter project cards use: the first one of a session loads locale data (~100 ms on
    // a phone), better spent now than when the first project is created.
    const handle = idle(() => { StudioView.preload(); formatDate(new Date().toISOString(), locale); }, { timeout: 3000 });
    return () => cancel(handle);
  }, [route.view, locale]);

  useEffect(() => {
    if (!toast.visible) return;
    const timer = window.setTimeout(() => setToast((current) => ({ ...current, visible: false })), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message: string) => setToast({ message, visible: true }), []);

  // Theme, contrast, language and text-size swaps cross-fade the whole page; motion applies instantly.
  const updatePrefs = useCallback((next: Partial<Prefs>) => {
    const apply = () => setPrefs((current) => {
      const merged = { ...current, ...next };
      applyPrefs(merged);
      return merged;
    });
    const changed = (key: keyof Prefs) => next[key] !== undefined && next[key] !== prefs[key];
    if (changed("theme") || changed("contrast")) withViewTransition(apply, "theme");
    else if (changed("fontSize")) {
      // A partial zoom hints at the direction of the change without the old page visibly overshooting.
      const ratio = fontScale[next.fontSize!] / fontScale[prefs.fontSize];
      withViewTransition(apply, "font", 1 + (ratio - 1) * 0.4);
    }
    else if (changed("locale")) withViewTransition(apply, "locale");
    else apply();
  }, [prefs]);

  // Persist edits that are still waiting for their debounce when the tab is hidden.
  useEffect(() => {
    const flush = () => {
      pendingSaves.current.forEach((project) => { saveProject(project).catch(() => undefined); });
      pendingSaves.current.clear();
      saveTimers.current.forEach((timer) => window.clearTimeout(timer));
      saveTimers.current.clear();
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", flush); };
  }, []);

  const navigate = useCallback((next: Route) => {
    const href = routeHref(next);
    if (window.location.hash === href) { setRoute(next); return; }
    window.location.hash = href;
  }, []);

  const addProject = useCallback((project: Project) => {
    setProjects((current) => [project, ...current]);
    saveProject(project).catch(() => undefined);
  }, []);

  const scheduleSave = useCallback((id: string) => {
    window.clearTimeout(saveTimers.current.get(id));
    saveTimers.current.set(id, window.setTimeout(() => {
      const project = pendingSaves.current.get(id);
      pendingSaves.current.delete(id);
      saveTimers.current.delete(id);
      if (project) saveProject(project).catch(() => undefined);
    }, 400));
  }, []);

  // Undo/redo history of each project: the state before every edit (a burst of edits, like typing a title,
  // is one step). Kept for the session, up to HISTORY_LIMIT steps per project.
  const histories = useRef(new Map<string, ProjectHistory>());
  const [historyTick, setHistoryTick] = useState(0);

  const updateProject = useCallback((id: string, updater: (project: Project) => Project, options: { history?: boolean } = {}) => {
    setProjects((current) => current.map((project) => {
      if (project.id !== id) return project;
      const updated = updater(project);
      if (updated === project) return project;
      if (options.history !== false) {
        let history = histories.current.get(id);
        if (!history) { history = { past: [], future: [], lastAt: 0 }; histories.current.set(id, history); }
        const now = Date.now();
        // React may run this updater twice in development: the same `project` is only recorded once.
        if (history.past[history.past.length - 1] !== project && now - history.lastAt > HISTORY_BURST_MS) {
          history.past.push(project);
          if (history.past.length > HISTORY_LIMIT) history.past.shift();
        }
        history.lastAt = now;
        history.future = [];
      }
      const next = { ...updated, updatedAt: new Date().toISOString() };
      pendingSaves.current.set(id, next);
      return next;
    }));
    setHistoryTick((tick) => tick + 1);
    scheduleSave(id);
  }, [scheduleSave]);

  /** Moves one step back (or forward) in a project's history; the chart transitions to the restored state. */
  const travel = useCallback((id: string, direction: "undo" | "redo") => {
    const history = histories.current.get(id);
    const current = projectsRef.current.find((project) => project.id === id);
    const target = direction === "undo" ? history?.past.pop() : history?.future.pop();
    if (!history || !current || !target) return;
    (direction === "undo" ? history.future : history.past).push(current);
    history.lastAt = 0;
    const restored = { ...target, updatedAt: new Date().toISOString() };
    pendingSaves.current.set(id, restored);
    setProjects((projects) => projects.map((project) => (project.id === id ? restored : project)));
    setHistoryTick((tick) => tick + 1);
    scheduleSave(id);
  }, [scheduleSave]);
  const undo = useCallback((id: string) => travel(id, "undo"), [travel]);
  const redo = useCallback((id: string) => travel(id, "redo"), [travel]);
  // historyTick makes these re-read the history after every change.
  const canUndo = useCallback((id: string) => Boolean(historyTick >= 0 && histories.current.get(id)?.past.length), [historyTick]);
  const canRedo = useCallback((id: string) => Boolean(historyTick >= 0 && histories.current.get(id)?.future.length), [historyTick]);

  const deleteProject = useCallback((id: string) => {
    window.clearTimeout(saveTimers.current.get(id));
    saveTimers.current.delete(id);
    pendingSaves.current.delete(id);
    setProjects((current) => current.filter((project) => project.id !== id));
    histories.current.delete(id);
    removeProject(id).catch(() => undefined);
  }, []);

  const chart = useMemo(() => ({ contrast: prefs.contrast === "high", fontScale: fontScale[prefs.fontSize], reducedMotion: prefs.motion === "reduced" }), [prefs.contrast, prefs.fontSize, prefs.motion]);
  const api: AppApi = useMemo(() => ({ locale, dark, chart, tr, notify, navigate, projects, loaded, addProject, updateProject, deleteProject, undo, redo, canUndo, canRedo }), [locale, dark, chart, tr, notify, navigate, projects, loaded, addProject, updateProject, deleteProject, undo, redo, canUndo, canRedo]);

  const addChartTo = (project: Project | null) => {
    if (!pickerEntry) return;
    const title = pickerEntry.name[locale];
    if (project) {
      const viz = makeViz({ ...activeViz(project), chartId: pickerEntry.id, title });
      updateProject(project.id, (current) => ({ ...current, visualizations: [...current.visualizations, viz], activeVizId: viz.id }));
      navigate({ view: "studio", id: project.id });
    } else {
      const created = createProject({ name: "", locale, withSample: true, chartId: pickerEntry.id });
      addProject(created);
      navigate({ view: "studio", id: created.id });
    }
    setPickerEntry(null);
    notify(tr("vizAdded"));
  };

  const startTour = useCallback(() => {
    setAssistantOpen(false);
    setTourInvite(false);
    setTourActive(true);
  }, []);

  const dismissInvite = () => {
    setTourInvite(false);
    try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch { /* storage blocked */ }
  };

  const assistantContext = useCallback((): Omit<AgentContext, "sharing"> => ({
    locale,
    getProjects: () => projectsRef.current,
    getRoute: () => routeRef.current,
    getPrefs: () => prefsRef.current,
    addProject,
    updateProject,
    deleteProject,
    navigate,
    setPrefs: updatePrefs,
    startTour,
  }), [locale, addProject, updateProject, deleteProject, navigate, updatePrefs, startTour]);

  const navItems: Array<[Route, TranslationKey]> = [[{ view: "home" }, "navHome"], [{ view: "projects" }, "navProjects"], [{ view: "catalog" }, "navCatalog"]];
  const isActive = (target: Route) => target.view === route.view || (target.view === "projects" && route.view === "studio");

  return (
    <div className="app-shell" data-view={route.view}>
      <a className="skip-link" href="#main">{tr("skip")}</a>
      <Ambient view={route.view} />
      <header className="site-header">
        <a className="brand" href="#/" aria-label="DataVizLab">
          <BrandMark />
          <span className="brand-text"><span className="brand-title">DataVizLab</span><span className="brand-subtitle">{tr("scientataApp")}</span></span>
        </a>
        <nav className={mobileNav ? "main-nav is-open" : "main-nav"} aria-label="Primary" data-tour="nav">
          {navItems.map(([target, key]) => <a key={key} href={routeHref(target)} aria-current={isActive(target) ? "page" : undefined} onClick={() => setMobileNav(false)}>{tr(key)}</a>)}
        </nav>
        <div className="header-actions">
          <SettingsMenu prefs={prefs} onChange={updatePrefs} tr={tr} onStartTour={startTour} />
          <a className="header-cta" href="https://scientata.com" target="_blank" rel="noreferrer">Scientata<ArrowUpRight size={14} /></a>
          <button className="round-button mobile-menu" type="button" onClick={() => setMobileNav((value) => !value)} aria-expanded={mobileNav} aria-label="Menu">{mobileNav ? <X size={17} /> : <Menu size={17} />}</button>
        </div>
      </header>

      <main id="main" key={route.view === "studio" ? `studio-${route.id}` : route.view}>
        {route.view === "home" && <HomeView api={api} />}
        {route.view === "projects" && <ProjectsView api={api} />}
        {route.view === "catalog" && <CatalogView api={api} onUseChart={setPickerEntry} />}
        {route.view === "studio" && (
          <ErrorBoundary resetKeys={[route.id]} fallback={(retry) => <ViewError tr={tr} retry={retry} />}>
            <Suspense fallback={<section className="page studio-page" aria-busy="true"><p className="loading-line" role="status">DataVizLab…</p></section>}>
              <StudioView key={route.id} api={api} projectId={route.id} />
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <a className="brand" href="#/"><BrandMark /><span className="brand-text"><span className="brand-title">DataVizLab</span><span className="brand-subtitle">{tr("scientataApp")}</span></span></a>
          <p>{tr("footerText")}</p>
        </div>
        <div className="footer-meta">
          <div className="footer-links">{navItems.map(([target, key]) => <a key={key} href={routeHref(target)}>{tr(key)}</a>)}<a href="https://scientata.com" target="_blank" rel="noreferrer">Scientata</a></div>
          <small>© {new Date().getFullYear()} DataVizLab · Scientata · Florianópolis, Brasil</small>
        </div>
      </footer>

      <a className="coffee-button" href="https://link.mercadopago.com.br/strangerhits" target="_blank" rel="noreferrer" aria-label={tr("coffee")}><span><Coffee size={20} /></span><b>{tr("coffee")}</b></a>

      {pickerEntry && (
        <Modal onClose={() => setPickerEntry(null)} labelledBy="picker-title" closeLabel={tr("close")} className="modal-narrow">
          <p className="kicker">{pickerEntry.name[locale]}</p>
          <h2 id="picker-title" className="modal-title">{tr("pickProjectTitle")}</h2>
          <p className="modal-lead">{tr("pickProjectText")}</p>
          <div className="picker-list">
            {[...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((project) => (
              <button key={project.id} type="button" onClick={() => addChartTo(project)}>
                <span className="picker-viz"><MiniViz entry={pickerEntry} dark={dark} locale={locale} /></span>
                <span><strong>{project.name}</strong><small>{project.visualizations.length} {project.visualizations.length === 1 ? tr("vizSingular") : tr("vizPlural")} · {project.rows.length} {tr("rows")}</small></span>
                <ArrowUpRight size={16} />
              </button>
            ))}
            <button type="button" className="picker-new" onClick={() => addChartTo(null)}><span className="picker-viz"><FolderPlus size={20} /></span><span><strong>{tr("newProjectWithChart")}</strong></span><ArrowUpRight size={16} /></button>
          </div>
        </Modal>
      )}

      <Assistant open={assistantOpen} onOpenChange={setAssistantOpen} locale={locale} getContext={assistantContext} />
      {tourLoaded && (
        <ErrorBoundary fallback={() => null}>
          <Suspense fallback={null}>
            <Tour active={tourActive} onClose={() => setTourActive(false)} locale={locale} route={route} getProjects={() => projectsRef.current} addProject={addProject} navigate={navigate} />
          </Suspense>
        </ErrorBoundary>
      )}
      {invitePresence.mounted && (
        <aside className="tour-invite" data-state={invitePresence.closing ? "closed" : "open"} aria-label={tr("tourInviteTitle")}>
          <span className="tour-invite-icon" aria-hidden="true"><Compass size={18} /></span>
          <div>
            <strong>{tr("tourInviteTitle")}</strong>
            <p>{tr("tourInviteText")}</p>
            <div className="tour-invite-actions">
              <button type="button" className="button button-primary" onClick={startTour}>{tr("tourStart")}<ArrowUpRight size={15} /></button>
              <button type="button" className="button button-quiet" onClick={dismissInvite}>{tr("tourLater")}</button>
            </div>
          </div>
        </aside>
      )}

      <TooltipLayer />
      <div className="toast-region" role="status" aria-live="polite">
        {toastPresence.mounted && <div className="toast" data-state={toastPresence.closing ? "closed" : "open"}><Check size={14} />{toast.message}</div>}
      </div>
    </div>
  );
}
