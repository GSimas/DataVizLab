import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Clipboard, Copy, Download, FileSpreadsheet, Move, Plus, Redo2, ShieldCheck, Sparkles, Table2, Trash2, Undo2, Upload } from "lucide-react";
import { ChartRenderer, type ChartConfig, type ChartDisplay, type ChartRendererHandle, type DataRow } from "./ChartRenderer";
import { isNavigable } from "./chartNavigation";
import { DataTable, typeChoices } from "./DataTable";
import { catalog, familyLabels, getEntry, type VizEntry, type VizFamily } from "../lib/catalog";
import { auditChart } from "../lib/audit";
import { categoryOptions, choiceToSpec, columnsOf, convertColumn, kindOfSpec, resolveSpecs, specToChoice, type CellValue, type ColumnKind, type ColumnSpec } from "../lib/columns";
import { suggestMappings, visualizationsFrom } from "../lib/data";
import { importTable, type PreparedImport } from "../lib/importer";
import type { TranslationKey } from "../lib/i18n";
import { activeViz, blankConfig, makeViz, type Project, type Visualization } from "../lib/projects";
import { matchSample, sampleConfig, sampleFor, type Sample } from "../lib/samples";
import { routeHref, type AppApi } from "./app";
import { MiniViz } from "./MiniViz";
import { Modal } from "./Modal";
import { ExportModal } from "./ExportModal";
import { ErrorBoundary } from "./ErrorBoundary";
import { Switch } from "./ui/Controls";
import { Select, type SelectGroup } from "./ui/Select";

type Intent = "comparison" | "distribution" | "relationship" | "time" | "composition" | "flow";

const recommendationsByIntent: Record<Intent, string[]> = {
  comparison: ["bar", "grouped-bar", "lollipop", "dot-plot"],
  distribution: ["histogram", "boxplot", "violin", "density"],
  relationship: ["scatter", "bubble", "heatmap", "correlogram"],
  time: ["line", "area", "calendar", "slope"],
  composition: ["stacked-bar", "treemap", "donut", "sunburst"],
  flow: ["sankey", "network", "alluvial", "arc"],
};

const intents: Array<[Intent, TranslationKey]> = [["comparison", "intentCompare"], ["distribution", "intentDistribution"], ["relationship", "intentRelationship"], ["time", "intentTime"], ["composition", "intentComposition"], ["flow", "intentFlow"]];

const chartIdsByFamily: Partial<Record<VizFamily, string[]>> = {
  comparison: ["bar", "column", "grouped-bar", "lollipop", "dot-plot", "waterfall"],
  distribution: ["histogram", "density", "violin", "boxplot", "ridgeline"],
  relationship: ["scatter", "bubble", "heatmap", "radar", "parallel"],
  time: ["line", "area", "stacked-area", "calendar", "timeline"],
  composition: ["stacked-bar", "pie", "donut", "treemap", "waffle"],
  hierarchy: ["treemap", "sunburst", "tree", "dendrogram", "circle-packing"],
  flow: ["sankey", "alluvial", "network", "arc", "chord"],
  geo: ["choropleth", "bubble-map", "dot-map", "flow-map", "hexbin-map"],
  finance: ["candlestick", "waterfall", "funnel", "kagi", "point-figure"],
  text: ["term-frequency", "word-cloud", "cooccurrence", "word-tree", "brainstorm"],
};

// A title the user never customized follows the chart type when it changes.
const isDefaultTitle = (title: string) => !title.trim() || title === "Nova visualização" || title === "New visualization" || catalog.some((entry) => entry.name.pt === title || entry.name.en === title);

export function StudioView({ api, projectId }: { api: AppApi; projectId: string }) {
  const { tr, locale, dark, chart, projects, loaded, updateProject, notify, undo, redo, canUndo, canRedo } = api;
  const project = projects.find((item) => item.id === projectId);
  // A stable object: the chart only redraws when a display preference actually changes.
  const display = useMemo<ChartDisplay>(() => ({ dark, ...chart, locale }), [dark, chart, locale]);
  const history = useMemo<StudioHistory>(() => ({ undo: () => undo(projectId), redo: () => redo(projectId), canUndo: canUndo(projectId), canRedo: canRedo(projectId) }), [undo, redo, canUndo, canRedo, projectId]);

  if (!loaded) return <section className="page studio-page"><p className="loading-line">DataVizLab…</p></section>;
  if (!project) {
    return (
      <section className="page studio-page">
        <div className="empty-state">
          <h2>{tr("notFoundTitle")}</h2>
          <p>{tr("notFoundText")}</p>
          <div className="empty-actions"><a className="button button-primary" href={routeHref({ view: "projects" })}>{tr("backToProjects")}<ArrowUpRight size={16} /></a></div>
        </div>
      </section>
    );
  }
  return <Studio key={project.id} project={project} update={(updater, options) => updateProject(project.id, updater, options)} tr={tr} locale={locale} display={display} notify={notify} history={history} />;
}

type StudioHistory = { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
type StudioProps = { project: Project; update: (updater: (project: Project) => Project, options?: { history?: boolean }) => void; tr: AppApi["tr"]; locale: AppApi["locale"]; display: ChartDisplay; notify: (message: string) => void; history: StudioHistory };

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Where Ctrl+Z belongs to the field being typed in (its own text undo), not to the project. */
const editsText = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || (target.tagName === "INPUT" && !["checkbox", "radio", "button", "range"].includes((target as HTMLInputElement).type)) || target.tagName === "TEXTAREA");

/** Field label + custom Select, linked for assistive technology. */
function SelectField({ label, ...props }: { label: string } & Omit<React.ComponentProps<typeof Select>, "labelledBy">) {
  const id = useId();
  return <div className="field"><span id={id}>{label}</span><Select labelledBy={id} {...props} /></div>;
}

function Studio({ project, update, tr, locale, display, notify, history }: StudioProps) {
  const [intent, setIntent] = useState<Intent>("comparison");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [columnChoice, setColumnChoice] = useState("text");
  const [pendingSample, setPendingSample] = useState<Sample | null>(null);
  const [exportSize, setExportSize] = useState<{ width: number; height: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<ChartRendererHandle>(null);

  const viz = activeViz(project);
  const { rows } = project;
  const columns = useMemo(() => columnsOf(rows), [rows]);
  // Column types are declared, not re-guessed while cells are edited; only columns without a stored type are inferred.
  const specs = useMemo(() => resolveSpecs(project.columnTypes, rows, locale), [project.columnTypes, rows, locale]);
  const columnKinds = useMemo(() => Object.fromEntries(columns.map((column) => [column, kindOfSpec(specs[column])])) as Record<string, ColumnKind>, [columns, specs]);
  const missingTypes = columns.some((column) => !project.columnTypes?.[column]);
  // Types inferred when an older project opens are not an edit: nothing to undo.
  const saveInferredTypes = useEffectEvent(() => update((current) => ({ ...current, columnTypes: resolveSpecs(current.columnTypes, current.rows, locale) }), { history: false }));
  useEffect(() => { if (rows.length && missingTypes) saveInferredTypes(); }, [rows.length, missingTypes]);
  const profile = useMemo(() => ({
    numeric: columns.filter((column) => columnKinds[column] === "numeric").length,
    temporal: columns.filter((column) => columnKinds[column] === "temporal").length,
  }), [columnKinds, columns]);

  const recommendations = useMemo(() => recommendationsByIntent[intent].map((id, index) => ({
    entry: getEntry(id),
    score: Math.max(68, 96 - index * 8 + (intent === "time" && profile.temporal ? 3 : 0) + (intent === "relationship" && profile.numeric >= 2 ? 3 : 0)),
  })), [intent, profile]);

  const auditIssues = useMemo<TranslationKey[]>(() => auditChart(rows, viz, columnKinds), [viz, rows, columnKinds]);

  const setConfig = (patch: Partial<ChartConfig>) => update((current) => ({ ...current, visualizations: current.visualizations.map((item) => item.id === current.activeVizId ? { ...item, ...patch } : item) }));
  const setRows = (next: (rows: DataRow[]) => DataRow[]) => update((current) => ({ ...current, rows: next(current.rows) }));
  const pickChart = (entry: VizEntry) => {
    const patch: Partial<ChartConfig> = { chartId: entry.id, ...(isDefaultTitle(viz.title) ? { title: entry.name[locale] } : {}) };
    // While the table still holds an untouched sample (and nothing else depends on it), switching chart also switches
    // to the sample that suits the new chart, so the example always makes sense for what is on screen.
    const current = project.visualizations.length === 1 ? matchSample(rows, locale) : null;
    if (current) {
      const next = sampleFor(entry.id, locale);
      if (next.datasetId !== current) {
        loadSample(next);
        notify(tr("sampleSwapped").replace("{chart}", entry.name[locale]));
        return;
      }
      const previous = sampleFor(viz.chartId, locale);
      const keepsFields = (["xField", "yField", "seriesField", "sizeField"] as const).every((key) => viz[key] === previous.mapping[key]);
      if (keepsFields) Object.assign(patch, next.mapping, { showLabels: next.showLabels }, viz.title === previous.title || isDefaultTitle(viz.title) ? { title: next.title, subtitle: next.subtitle } : {});
    }
    setConfig(patch);
  };

  /** Puts an imported table (already parsed and typed by the import worker) into the project. */
  const applyTable = (table: PreparedImport, dataName: string, extra: Visualization[] = []) => {
    const nextColumns = new Set(columnsOf(table.rows));
    const mappings = suggestMappings(table.rows, table.columnTypes);
    update((current) => {
      const remapped = current.visualizations.map((item) => nextColumns.has(item.xField) && nextColumns.has(item.yField) ? item : { ...item, ...mappings });
      const visualizations = [...remapped, ...extra];
      return { ...current, rows: table.rows, columnTypes: table.columnTypes, dataName, visualizations, activeVizId: extra[0]?.id ?? current.activeVizId };
    });
    notify(tr("imported"));
  };

  const handleFile = async (file: File) => {
    // Large files take a moment in the worker; the page stays usable and says what is happening.
    if (file.size > 512 * 1024) notify(tr("processingFile"));
    try {
      const table = await importTable(file, locale);
      const extra = table.project ? visualizationsFrom(table.project, { ...blankConfig(locale), ...suggestMappings(table.rows, table.columnTypes) }) : [];
      applyTable(table, table.dataName, extra);
    } catch (error) {
      notify(error instanceof Error && error.message === "too-large" ? tr("tooLarge") : tr("invalidFile"));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const importPaste = async (close: () => void) => {
    if (!pasteValue.trim()) { notify(tr("emptyPaste")); return; }
    try { applyTable(await importTable(pasteValue, locale), locale === "pt" ? "tabela-colada.csv" : "pasted-table.csv"); close(); } catch { notify(tr("invalidFile")); }
  };

  /** Replaces the table with a sample and points the active visualization at it (title and fields included). */
  const loadSample = (sample: Sample) => update((current) => {
    const fields = new Set(Object.keys(sample.rows[0] ?? {}));
    const fallback = suggestMappings(sample.rows, sample.columnTypes);
    const visualizations = current.visualizations.map((item) => {
      if (item.id === current.activeVizId) return { ...item, ...sampleConfig(sample) };
      return fields.has(item.xField) ? item : { ...item, ...fallback };
    });
    return { ...current, rows: sample.rows, dataName: sample.dataName, columnTypes: sample.columnTypes, visualizations };
  });

  // "Use sample" loads the fictional project that suits the chart being built. Data the user brought is never replaced unasked.
  const applySample = () => {
    const sample = sampleFor(viz.chartId, locale);
    if (rows.length && !matchSample(rows, locale)) { setPendingSample(sample); return; }
    loadSample(sample);
    notify(tr("sampleLoaded").replace("{name}", sample.name));
  };

  const addViz = () => {
    const next = makeViz({ ...viz, chartId: viz.chartId, title: tr("newViz") });
    update((current) => ({ ...current, visualizations: [...current.visualizations, next], activeVizId: next.id }));
  };
  const duplicateViz = () => {
    const next = makeViz({ ...viz, title: `${viz.title} ${tr("copySuffix")}` });
    update((current) => ({ ...current, visualizations: [...current.visualizations, next], activeVizId: next.id }));
  };
  const deleteViz = () => update((current) => {
    if (current.visualizations.length < 2) return current;
    const index = current.visualizations.findIndex((item) => item.id === current.activeVizId);
    const visualizations = current.visualizations.filter((item) => item.id !== current.activeVizId);
    return { ...current, visualizations, activeVizId: visualizations[Math.max(0, index - 1)].id };
  });

  const updateCell = (rowIndex: number, column: string, value: CellValue) => setRows((current) => current.map((row, index) => index === rowIndex ? { ...row, [column]: value } : row));

  const addOption = (column: string, option: string) => update((current) => {
    const base = resolveSpecs(current.columnTypes, current.rows, locale);
    const spec = base[column];
    if (!spec || spec.type !== "category" || spec.options?.includes(option)) return current;
    return { ...current, columnTypes: { ...base, [column]: { ...spec, options: [...(spec.options ?? []), option] } } };
  });

  // A new type converts what it can (`12,5` → 12.5, `15/03/2024` → a date); the rest stays put and is highlighted.
  const changeType = (column: string, next: ColumnSpec) => {
    if (specs[column] && specToChoice(specs[column]) === specToChoice(next)) return;
    const converted = convertColumn(rows, column, next, locale);
    update((current) => {
      const base = resolveSpecs(current.columnTypes, current.rows, locale);
      const spec: ColumnSpec = next.type === "category" ? { ...next, options: categoryOptions({ type: "category" }, converted.rows, column, locale) } : next;
      return { ...current, rows: converted.rows, columnTypes: { ...base, [column]: spec } };
    });
    notify(converted.invalid ? tr("typeChangedInvalid").replace("{n}", String(converted.invalid)) : tr("typeChanged"));
  };

  const submitAddColumn = (event: React.FormEvent, close: () => void) => {
    event.preventDefault();
    let name = columnName.trim() || `${locale === "pt" ? "Coluna" : "Column"}_${columns.length + 1}`;
    if (columns.includes(name)) { let counter = 2; while (columns.includes(`${name}_${counter}`)) counter++; name = `${name}_${counter}`; }
    const spec = choiceToSpec(columnChoice);
    update((current) => {
      const base = resolveSpecs(current.columnTypes, current.rows, locale);
      return { ...current, rows: current.rows.length ? current.rows.map((row) => ({ ...row, [name]: "" })) : [{ [name]: "" }], columnTypes: { ...base, [name]: spec.type === "category" ? { ...spec, options: [] } : spec } };
    });
    close();
  };

  // Visualization tabs follow the ARIA tabs pattern: one tab in the Tab order, arrows (and Home/End) move between them.
  const panelId = useId();
  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (⌘ on a Mac) undo and redo project edits, except while typing in a field,
  // where they keep undoing the field's own text.
  const keyHistory = useEffectEvent((event: KeyboardEvent) => {
    const mod = isMac() ? event.metaKey : event.ctrlKey;
    if (!mod || event.altKey || editsText(event.target) || document.querySelector(".modal")) return;
    const key = event.key.toLowerCase();
    const wantsRedo = key === "y" || (key === "z" && event.shiftKey);
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    if (wantsRedo) history.redo(); else history.undo();
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyHistory(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const undoLabel = `${tr("undo")} (${isMac() ? "⌘Z" : "Ctrl+Z"})`;
  const redoLabel = `${tr("redo")} (${isMac() ? "⇧⌘Z" : "Ctrl+Y"})`;

  // Switching tabs is navigation, not an edit: it stays out of the undo history.
  const selectViz = (id: string) => update((current) => ({ ...current, activeVizId: id }), { history: false });
  const onTabKey = (event: React.KeyboardEvent) => {
    const ids = project.visualizations.map((item) => item.id);
    const index = ids.indexOf(viz.id);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const id = ids[(target + ids.length) % ids.length];
    selectViz(id);
    document.getElementById(`${panelId}-tab-${id}`)?.focus();
  };

  // Sliding underline under the active visualization tab.
  const tabsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const bar = strip?.querySelector<HTMLElement>(".tab-indicator");
    if (!strip || !tab || !bar) return;
    bar.style.width = `${tab.offsetWidth}px`;
    bar.style.transform = `translateX(${tab.offsetLeft}px)`;
  }, [viz.id, viz.title, project.visualizations.length, locale]);

  // Every chart of the catalog is available; the family favorites come first.
  const typeGroups: SelectGroup[] = (Object.keys(familyLabels) as VizFamily[]).map((familyId) => {
    const favorites = chartIdsByFamily[familyId] ?? [];
    const rest = catalog.filter((entry) => entry.family === familyId && !favorites.includes(entry.id)).map((entry) => entry.id);
    return { label: familyLabels[familyId][locale], options: [...favorites, ...rest].map((id) => ({ value: id, label: getEntry(id).name[locale], dot: `var(--fam-${familyId})` })) };
  });
  const columnOptions = (optional: boolean) => [
    ...(optional || !columns.length ? [{ value: "", label: tr("none") }] : []),
    ...columns.map((column) => ({ value: column, label: column, hint: tr(columnKinds[column]) })),
  ];

  const copyDescription = async () => {
    try { await navigator.clipboard.writeText(chartRef.current?.getDescription() ?? ""); notify(tr("copied")); } catch { /* clipboard may be blocked */ }
  };

  const currentEntry = getEntry(viz.chartId);
  const mappingFields: Array<[keyof ChartConfig, TranslationKey]> = [["xField", "xField"], ["yField", "yField"], ["seriesField", "seriesField"], ["sizeField", "sizeField"]];

  return (
    <section className="page studio-page">
      <header className="studio-head">
        <div className="studio-head-row">
          <a className="crumb" href={routeHref({ view: "projects" })}><ArrowLeft size={14} />{tr("backToProjects")}</a>
          <div className="history-actions" role="group" aria-label={tr("editHistory")}>
            <button type="button" onClick={history.undo} disabled={!history.canUndo} aria-label={undoLabel} data-tip={undoLabel}><Undo2 size={15} /></button>
            <button type="button" onClick={history.redo} disabled={!history.canRedo} aria-label={redoLabel} data-tip={redoLabel}><Redo2 size={15} /></button>
          </div>
        </div>
        <input className="project-name-input" value={project.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} onBlur={(event) => { if (!event.target.value.trim()) update((current) => ({ ...current, name: tr("newProject") })); }} aria-label={tr("projectName")} maxLength={90} />
        <p className="studio-meta">
          <span>{project.dataName || tr("noData")}</span>
          <span>{rows.length} {tr("rows")} · {columns.length} {tr("columns")}</span>
          <span className="saved"><i />{tr("savedLocally")}</span>
        </p>
      </header>

      <div ref={tabsRef} className="viz-tabs" data-tour="viz-tabs">
        <span className="tab-indicator" aria-hidden="true" />
        {/* The tablist holds only the tabs (it lays out as if it were not there); add, duplicate and delete sit beside it. */}
        <div className="viz-tablist" role="tablist" aria-label={tr("visualizations")} onKeyDown={onTabKey}>
          {project.visualizations.map((item) => (
            <button key={item.id} id={`${panelId}-tab-${item.id}`} type="button" role="tab" aria-selected={item.id === viz.id} aria-controls={panelId} tabIndex={item.id === viz.id ? 0 : -1} className={item.id === viz.id ? "viz-tab is-active" : "viz-tab"} onClick={() => selectViz(item.id)}>
              <span className="tab-dot" style={{ background: `var(--fam-${getEntry(item.chartId).family})` }} />
              <span className="tab-label">{item.title || getEntry(item.chartId).name[locale]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="viz-tab viz-tab-add" onClick={addViz}><Plus size={14} />{tr("newViz")}</button>
        <span className="tab-tools">
          <button type="button" onClick={duplicateViz} aria-label={tr("duplicateViz")} data-tip={tr("duplicateViz")}><Copy size={14} /></button>
          <button type="button" className="danger" onClick={deleteViz} disabled={project.visualizations.length < 2} aria-label={tr("deleteViz")} data-tip={tr("deleteViz")}><Trash2 size={14} /></button>
        </span>
      </div>

      <div className="studio-shell" role="tabpanel" id={panelId} aria-labelledby={`${panelId}-tab-${viz.id}`}>
        <aside className="studio-sidebar">
          <section className="control-group" data-tour="data-panel">
            <h2 className="control-title"><span>01</span>{tr("data")}</h2>
            <input ref={fileRef} className="hidden-input" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.json,.zip" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
            <button className="upload-zone" type="button" onClick={() => fileRef.current?.click()}><Upload size={18} /><strong>{tr("upload")}</strong><small>{tr("fileHint")}</small></button>
            <div className="mini-actions">
              <button type="button" onClick={() => setPasteOpen(true)}><Clipboard size={14} />{tr("paste")}</button>
              <button type="button" onClick={applySample} data-tip={tr("sampleFor").replace("{chart}", getEntry(viz.chartId).name[locale])}><Sparkles size={14} />{tr("sampleData")}</button>
            </div>
            {rows.length > 0 && <div className="data-file"><FileSpreadsheet size={16} /><div><strong>{project.dataName}</strong><span>{rows.length} {tr("rows")} · {columns.length} {tr("columns")}</span></div><Check size={15} /></div>}
          </section>

          <section className="control-group" data-tour="viz-panel">
            <h2 className="control-title"><span>02</span>{tr("visualization")}</h2>
            <SelectField label={tr("type")} value={viz.chartId} onChange={(id) => pickChart(getEntry(id))} groups={typeGroups} searchPlaceholder={tr("searchChartType")} emptyText={tr("noResultsShort")} />
            <p className="sub-label">{tr("suggestions")}</p>
            <div className="intent-chips">
              {intents.map(([id, label]) => <button key={id} type="button" className={intent === id ? "is-active" : ""} onClick={() => setIntent(id)}>{tr(label)}</button>)}
            </div>
            <div className="suggestion-list">
              {recommendations.map(({ entry, score }) => (
                <button key={entry.id} type="button" className={entry.id === viz.chartId ? "suggestion is-active" : "suggestion"} onClick={() => pickChart(entry)}>
                  <span className="suggestion-viz"><MiniViz entry={entry} dark={display.dark} locale={locale} /></span>
                  <span className="suggestion-text"><strong>{entry.name[locale]}</strong><span className="score"><i><b style={{ width: `${score}%` }} /></i>{score}% {tr("fit")}</span></span>
                </button>
              ))}
            </div>
          </section>

          <section className="control-group" data-tour="mapping-panel">
            <h2 className="control-title"><span>03</span>{tr("mapping")}</h2>
            {mappingFields.map(([field, label]) => (
              <SelectField key={field} label={tr(label)} value={String(viz[field])} onChange={(value) => setConfig({ [field]: value })} options={columnOptions(field === "seriesField" || field === "sizeField")} searchPlaceholder={tr("searchColumns")} emptyText={tr("noResultsShort")} />
            ))}
          </section>

          <section className="control-group">
            <h2 className="control-title"><span>04</span>{tr("presentation")}</h2>
            <label className="field">{tr("chartTitle")}<input value={viz.title} onChange={(event) => setConfig({ title: event.target.value })} /></label>
            <label className="field">{tr("chartSubtitle")}<input value={viz.subtitle} onChange={(event) => setConfig({ subtitle: event.target.value })} /></label>
            <Switch label={tr("showLabels")} hint={tr("showLabelsHint")} checked={viz.showLabels} onChange={(showLabels) => setConfig({ showLabels })} />
            <Switch label={tr("accessiblePatterns")} hint={tr("patternsHint")} checked={viz.patterns} onChange={(patterns) => setConfig({ patterns })} />
          </section>
        </aside>

        <div className="studio-main" data-tour="preview">
          <div className="preview-toolbar">
            <p><span className="signal-dot" />{tr("preview")}<small>{currentEntry.name[locale]}</small></p>
            <div>
              {rows.length > 0 && isNavigable(viz.chartId) && (
                <span className="nav-hint">
                  <Move size={13} aria-hidden="true" />
                  <span className="nav-hint-mouse">{tr("navHint")}</span>
                  <span className="nav-hint-touch">{tr("navHintTouch")}</span>
                </span>
              )}
              <button type="button" className="export-button" data-tour="export" onClick={() => setExportSize(chartRef.current?.getSize() ?? { width: 1200, height: 700 })}><Download size={14} />{tr("export")}</button>
            </div>
          </div>
          <div className="preview-stage">
            {rows.length ? (
              <ErrorBoundary resetKeys={[rows, viz, display]} fallback={(retry) => (
                <div className="stage-empty" role="alert">
                  <div className="empty-mark" aria-hidden="true"><i /><i /><i /></div>
                  <h3>{tr("chartErrorTitle")}</h3>
                  <p>{tr("chartErrorText")}</p>
                  <div className="empty-actions"><button className="button button-primary" type="button" onClick={retry}>{tr("retry")}</button></div>
                </div>
              )}>
                <ChartRenderer ref={chartRef} rows={rows} config={viz} display={display} locale={locale} className="chart-canvas" />
              </ErrorBoundary>
            ) : (
              <div className="stage-empty">
                <div className="empty-mark" aria-hidden="true"><i /><i /><i /></div>
                <h3>{tr("emptyDataTitle")}</h3>
                <p>{tr("emptyDataText")}</p>
                <div className="empty-actions">
                  <button className="button button-primary" type="button" onClick={() => fileRef.current?.click()}>{tr("upload")}<Upload size={16} /></button>
                  <button className="button button-outline" type="button" onClick={() => setPasteOpen(true)}>{tr("paste")}<Clipboard size={16} /></button>
                  <button className="launch-link" type="button" onClick={applySample}>{tr("sampleData")}<span><Sparkles size={14} /></span></button>
                </div>
              </div>
            )}
          </div>
          {rows.length > 0 && (
            <div className="preview-bottom">
              <div className={auditIssues.length ? "audit-card has-issues" : "audit-card good"}>
                <span>{auditIssues.length ? <CircleAlert size={18} /> : <ShieldCheck size={18} />}</span>
                <div><strong>{tr("auditTitle")}</strong>{auditIssues.length ? <ul>{auditIssues.map((issue) => <li key={issue}>{tr(issue)}</li>)}</ul> : <p>{tr("auditGoodText")}</p>}</div>
                <b>{auditIssues.length || <Check size={15} />}</b>
              </div>
              <button className="description-button" type="button" onClick={copyDescription}><Clipboard size={16} /><span><strong>{tr("copyDescription")}</strong><small>{tr("altTextHint")}</small></span></button>
            </div>
          )}
        </div>
      </div>

      <div className="table-panel" data-tour="table">
        <div className="table-header">
          <p><Table2 size={16} /><span><strong>{tr("tableEditor")}</strong><small>{tr("tableHint")}</small></span></p>
          <div>
            <button type="button" onClick={() => setRows((current) => [...current, Object.fromEntries(columns.map((column) => [column, ""]))])} disabled={!columns.length}><Plus size={14} />{tr("addRow")}</button>
            <button type="button" onClick={() => { setColumnName(""); setColumnChoice("text"); setColumnModalOpen(true); }}><Plus size={14} />{tr("addColumn")}</button>
            <button type="button" className="danger" onClick={() => setRows(() => [])} disabled={!rows.length}><Trash2 size={14} />{tr("clear")}</button>
          </div>
        </div>
        {columns.length > 0 && (
          <DataTable rows={rows} columns={columns} specs={specs} locale={locale} tr={tr} onCell={updateCell} onDeleteRow={(rowIndex) => setRows((current) => current.filter((_, index) => index !== rowIndex))} onType={changeType} onAddOption={addOption} />
        )}
      </div>

      {exportSize && (
        <ExportModal project={project} viz={viz} size={exportSize} dark={display.dark} contrast={display.contrast} fontScale={display.fontScale} locale={locale} tr={tr} notify={notify} onClose={() => setExportSize(null)} />
      )}

      {pasteOpen && (
        <Modal onClose={() => { setPasteOpen(false); setPasteValue(""); }} labelledBy="paste-title" closeLabel={tr("close")}>
          {(close) => <>
          <p className="kicker">DataVizLab / {tr("data")}</p>
          <h2 id="paste-title" className="modal-title">{tr("pasteTitle")}</h2>
          <p className="modal-lead">{tr("pasteHelp")}</p>
          <textarea className="paste-area" autoFocus value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder={"Categoria,Valor\nA,32\nB,48"} />
          <div className="modal-actions">
            <button className="button button-primary" type="button" onClick={() => importPaste(close)}>{tr("importData")}<ArrowUpRight size={16} /></button>
            <button className="button button-quiet" type="button" onClick={close}>{tr("cancel")}</button>
          </div>
          </>}
        </Modal>
      )}

      {columnModalOpen && (
        <Modal onClose={() => { setColumnModalOpen(false); setColumnName(""); }} labelledBy="column-title" closeLabel={tr("close")} className="modal-narrow">
          {(close) => <form onSubmit={(event) => submitAddColumn(event, close)}>
            <p className="kicker">DataVizLab / {tr("tableEditor")}</p>
            <h2 id="column-title" className="modal-title">{tr("addColumnTitle")}</h2>
            <p className="modal-lead">{tr("addColumnDesc")}</p>
            <label className="field">{tr("newColumnPrompt")}<input autoFocus value={columnName} onChange={(event) => setColumnName(event.target.value)} placeholder={tr("columnNamePlaceholder")} /></label>
            <SelectField label={tr("columnType")} value={columnChoice} onChange={setColumnChoice} options={typeChoices(tr, locale)} searchable={false} />
            <div className="modal-actions">
              <button type="submit" className="button button-primary">{tr("addColumn")}<Plus size={16} /></button>
              <button type="button" className="button button-quiet" onClick={close}>{tr("cancel")}</button>
            </div>
          </form>}
        </Modal>
      )}

      {pendingSample && (
        <Modal onClose={() => setPendingSample(null)} labelledBy="replace-title" closeLabel={tr("close")} className="modal-narrow">
          {(close) => <>
            <p className="kicker kicker-danger">DataVizLab / {tr("data")}</p>
            <h2 id="replace-title" className="modal-title">{tr("replaceDataTitle")}</h2>
            <p className="modal-lead">{tr("replaceDataText").replace("{name}", pendingSample.name).replace("{rows}", String(rows.length))}</p>
            <div className="modal-actions">
              <button className="button button-danger" type="button" onClick={() => { loadSample(pendingSample); notify(tr("sampleLoaded").replace("{name}", pendingSample.name)); close(); }}>{tr("replaceData")}<Sparkles size={16} /></button>
              <button className="button button-quiet" type="button" onClick={close}>{tr("cancel")}</button>
            </div>
          </>}
        </Modal>
      )}
    </section>
  );
}
