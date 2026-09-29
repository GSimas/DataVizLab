"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Coffee, Compass, FolderPlus, Menu, X } from "lucide-react";
import type { VizEntry } from "../lib/catalog";
import { t, type TranslationKey } from "../lib/i18n";
import { activeViz, createProject, listProjects, makeViz, migrateLegacyProject, removeProject, saveProject, type Project } from "../lib/projects";
import { MiniViz } from "./MiniViz";
import { Modal } from "./Modal";
import { HomeView } from "./HomeView";
import { ProjectsView } from "./ProjectsView";
import { StudioView } from "./StudioView";
import { CatalogView } from "./CatalogView";
import { parseHash, routeHref, type AppApi, type Route } from "./app";
import { SettingsMenu } from "./SettingsMenu";
import { TooltipLayer } from "./ui/TooltipLayer";
import { Ambient } from "./Ambient";
import { DURATION, usePresence, withViewTransition } from "../lib/motion";
import { applyPrefs, fontScale, readPrefs, savePrefs, type Prefs } from "../lib/prefs";
import { TOUR_DONE_KEY } from "../lib/tour";
import type { AgentContext } from "../lib/ai/tools";
import { Assistant } from "./assistant/Assistant";
import { Tour } from "./Tour";

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><b>+</b></span>;
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

  useEffect(() => {
    if (!toast.visible) return;
    const timer = window.setTimeout(() => setToast((current) => ({ ...current, visible: false })), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message: string) => setToast({ message, visible: true }), []);

  // Theme and contrast swaps cross-fade the whole page; other preferences apply instantly.
  const updatePrefs = useCallback((next: Partial<Prefs>) => {
    const apply = () => setPrefs((current) => {
      const merged = { ...current, ...next };
      applyPrefs(merged);
      return merged;
    });
    if (next.theme !== undefined && next.theme !== prefs.theme || next.contrast !== undefined && next.contrast !== prefs.contrast) withViewTransition(apply, "theme");
    else apply();
  }, [prefs.theme, prefs.contrast]);

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

  const updateProject = useCallback((id: string, updater: (project: Project) => Project) => {
    setProjects((current) => current.map((project) => {
      if (project.id !== id) return project;
      const next = { ...updater(project), updatedAt: new Date().toISOString() };
      pendingSaves.current.set(id, next);
      return next;
    }));
    window.clearTimeout(saveTimers.current.get(id));
    saveTimers.current.set(id, window.setTimeout(() => {
      const project = pendingSaves.current.get(id);
      pendingSaves.current.delete(id);
      saveTimers.current.delete(id);
      if (project) saveProject(project).catch(() => undefined);
    }, 400));
  }, []);

  const deleteProject = useCallback((id: string) => {
    window.clearTimeout(saveTimers.current.get(id));
    saveTimers.current.delete(id);
    pendingSaves.current.delete(id);
    setProjects((current) => current.filter((project) => project.id !== id));
    removeProject(id).catch(() => undefined);
  }, []);

  const chart = useMemo(() => ({ contrast: prefs.contrast === "high", fontScale: fontScale[prefs.fontSize], reducedMotion: prefs.motion === "reduced" }), [prefs.contrast, prefs.fontSize, prefs.motion]);
  const api: AppApi = useMemo(() => ({ locale, dark, chart, tr, notify, navigate, projects, loaded, addProject, updateProject, deleteProject }), [locale, dark, chart, tr, notify, navigate, projects, loaded, addProject, updateProject, deleteProject]);

  const addChartTo = (project: Project | null) => {
    if (!pickerEntry) return;
    const title = pickerEntry.name[locale];
    if (project) {
      const viz = makeViz({ ...activeViz(project), chartId: pickerEntry.id, title });
      updateProject(project.id, (current) => ({ ...current, visualizations: [...current.visualizations, viz], activeVizId: viz.id }));
      navigate({ view: "studio", id: project.id });
    } else {
      const created = createProject({ name: title, locale, withSample: true });
      const viz = { ...created.visualizations[0], chartId: pickerEntry.id, title };
      const next = { ...created, visualizations: [viz] };
      addProject(next);
      navigate({ view: "studio", id: next.id });
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
        {route.view === "studio" && <StudioView key={route.id} api={api} projectId={route.id} />}
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
                <span className="picker-viz"><MiniViz entry={pickerEntry} index={0} /></span>
                <span><strong>{project.name}</strong><small>{project.visualizations.length} {project.visualizations.length === 1 ? tr("vizSingular") : tr("vizPlural")} · {project.rows.length} {tr("rows")}</small></span>
                <ArrowUpRight size={16} />
              </button>
            ))}
            <button type="button" className="picker-new" onClick={() => addChartTo(null)}><span className="picker-viz"><FolderPlus size={20} /></span><span><strong>{tr("newProjectWithChart")}</strong></span><ArrowUpRight size={16} /></button>
          </div>
        </Modal>
      )}

      <Assistant open={assistantOpen} onOpenChange={setAssistantOpen} locale={locale} getContext={assistantContext} />
      <Tour active={tourActive} onClose={() => setTourActive(false)} locale={locale} route={route} getProjects={() => projectsRef.current} addProject={addProject} navigate={navigate} />
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
