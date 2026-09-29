import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Clipboard, Copy, Download, FileSpreadsheet, Plus, ShieldCheck, Sparkles, Table2, Trash2, Upload, X } from "lucide-react";
import { ChartRenderer, type ChartConfig, type ChartDisplay, type ChartRendererHandle, type DataRow } from "./ChartRenderer";
import { catalog, familyLabels, getEntry, type VizEntry, type VizFamily } from "../lib/catalog";
import { classifyColumn, columnsOf, parseDelimited, parseFile, suggestMappings, visualizationsFrom, type ColumnKind } from "../lib/data";
import type { TranslationKey } from "../lib/i18n";
import { activeViz, blankConfig, makeViz, sampleConfig, sampleDataName, sampleRows, type Project, type Visualization } from "../lib/projects";
import { routeHref, type AppApi } from "./app";
import { MiniViz } from "./MiniViz";
import { Modal } from "./Modal";
import { ExportModal } from "./ExportModal";
import { Switch } from "./ui/Controls";
import { DateCell } from "./ui/DatePicker";
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
  const { tr, locale, dark, chart, projects, loaded, updateProject, notify } = api;
  const project = projects.find((item) => item.id === projectId);

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
  return <Studio key={project.id} project={project} update={(updater) => updateProject(project.id, updater)} tr={tr} locale={locale} display={{ dark, ...chart }} notify={notify} />;
}

type StudioProps = { project: Project; update: (updater: (project: Project) => Project) => void; tr: AppApi["tr"]; locale: AppApi["locale"]; display: ChartDisplay; notify: (message: string) => void };

/** Field label + custom Select, linked for assistive technology. */
function SelectField({ label, ...props }: { label: string } & Omit<React.ComponentProps<typeof Select>, "labelledBy">) {
  const id = useId();
  return <div className="field"><span id={id}>{label}</span><Select labelledBy={id} {...props} /></div>;
}

function Studio({ project, update, tr, locale, display, notify }: StudioProps) {
  const [intent, setIntent] = useState<Intent>("comparison");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [exportSize, setExportSize] = useState<{ width: number; height: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<ChartRendererHandle>(null);

  const viz = activeViz(project);
  const { rows } = project;
  const columns = useMemo(() => columnsOf(rows), [rows]);
  const columnKinds = useMemo(() => Object.fromEntries(columns.map((column) => [column, classifyColumn(rows, column)])) as Record<string, ColumnKind>, [columns, rows]);
  const profile = useMemo(() => ({
    numeric: columns.filter((column) => columnKinds[column] === "numeric").length,
    temporal: columns.filter((column) => columnKinds[column] === "temporal").length,
  }), [columnKinds, columns]);

  const recommendations = useMemo(() => recommendationsByIntent[intent].map((id, index) => ({
    entry: getEntry(id),
    score: Math.max(68, 96 - index * 8 + (intent === "time" && profile.temporal ? 3 : 0) + (intent === "relationship" && profile.numeric >= 2 ? 3 : 0)),
  })), [intent, profile]);

  const uniqueCategories = useMemo(() => new Set(rows.map((row) => String(row[viz.xField] ?? ""))).size, [viz.xField, rows]);
  const auditIssues = useMemo(() => {
    if (!rows.length) return [];
    const issues: TranslationKey[] = [];
    if (uniqueCategories > 18) issues.push("issueCategories");
    if (["pie", "donut", "nightingale"].includes(viz.chartId) && uniqueCategories > 5) issues.push("issuePie");
    if (rows.some((row) => row[viz.xField] == null || row[viz.xField] === "" || row[viz.yField] == null || row[viz.yField] === "")) issues.push("issueMissing");
    if (["pie", "donut", "treemap", "sunburst", "funnel"].includes(viz.chartId) && rows.some((row) => Number(row[viz.yField]) < 0)) issues.push("issueNegative");
    if (!viz.showLabels && ["pie", "donut", "funnel"].includes(viz.chartId)) issues.push("issueLabels");
    return issues;
  }, [viz, rows, uniqueCategories]);

  const setConfig = (patch: Partial<ChartConfig>) => update((current) => ({ ...current, visualizations: current.visualizations.map((item) => item.id === current.activeVizId ? { ...item, ...patch } : item) }));
  const setRows = (next: (rows: DataRow[]) => DataRow[]) => update((current) => ({ ...current, rows: next(current.rows) }));
  const pickChart = (entry: VizEntry) => setConfig({ chartId: entry.id, ...(isDefaultTitle(viz.title) ? { title: entry.name[locale] } : {}) });

  const loadRows = (newRows: DataRow[], dataName: string, extra: Visualization[] = []) => {
    if (!newRows.length) throw new Error("empty");
    const nextColumns = new Set(columnsOf(newRows));
    const mappings = suggestMappings(newRows);
    update((current) => {
      const remapped = current.visualizations.map((item) => nextColumns.has(item.xField) && nextColumns.has(item.yField) ? item : { ...item, ...mappings });
      const visualizations = [...remapped, ...extra];
      return { ...current, rows: newRows, dataName, visualizations, activeVizId: extra[0]?.id ?? current.activeVizId };
    });
    notify(tr("imported"));
  };

  const handleFile = async (file: File) => {
    try {
      const parsed = await parseFile(file);
      const extra = parsed.project ? visualizationsFrom(parsed.project, { ...blankConfig(locale), ...suggestMappings(parsed.rows) }) : [];
      loadRows(parsed.rows, parsed.dataName, extra);
    } catch (error) {
      notify(error instanceof Error && error.message === "too-large" ? tr("tooLarge") : tr("invalidFile"));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const importPaste = (close: () => void) => {
    if (!pasteValue.trim()) { notify(tr("emptyPaste")); return; }
    try { loadRows(parseDelimited(pasteValue), locale === "pt" ? "tabela-colada.csv" : "pasted-table.csv"); close(); } catch { notify(tr("invalidFile")); }
  };

  const applySample = () => update((current) => {
    const sample = makeViz(sampleConfig(locale));
    const untouched = current.visualizations.length === 1 && !current.rows.length;
    return { ...current, rows: sampleRows, dataName: sampleDataName, visualizations: untouched ? [sample] : current.visualizations.map((item) => ({ ...item, ...suggestMappings(sampleRows) })), activeVizId: untouched ? sample.id : current.activeVizId };
  });

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

  const updateCell = (rowIndex: number, column: string, value: string) => setRows((current) => current.map((row, index) => index === rowIndex ? { ...row, [column]: columnKinds[column] === "numeric" && value !== "" && Number.isFinite(Number(value.replace(",", "."))) ? Number(value.replace(",", ".")) : value } : row));
  const submitAddColumn = (event: React.FormEvent, close: () => void) => {
    event.preventDefault();
    let name = columnName.trim() || `${locale === "pt" ? "Coluna" : "Column"}_${columns.length + 1}`;
    if (columns.includes(name)) { let counter = 2; while (columns.includes(`${name}_${counter}`)) counter++; name = `${name}_${counter}`; }
    setRows((current) => current.length ? current.map((row) => ({ ...row, [name]: "" })) : [{ [name]: "" }]);
    close();
  };

  // Crosshair highlight in the editable table: the row comes from CSS (:hover /
  // :focus-within); the column is toggled here without re-rendering the table.
  const tableRef = useRef<HTMLTableElement>(null);
  const hoverColumn = useRef(-1);
  const highlightColumn = (target: EventTarget | null) => {
    const table = tableRef.current;
    const cell = (target as HTMLElement | null)?.closest?.<HTMLTableCellElement>("td, th");
    const index = cell && table?.contains(cell) ? cell.cellIndex : -1;
    if (!table || index === hoverColumn.current) return;
    table.querySelectorAll(".is-col-hover").forEach((el) => el.classList.remove("is-col-hover"));
    hoverColumn.current = index;
    if (index > 0 && index <= columns.length) table.querySelectorAll(`tr > :nth-child(${index + 1})`).forEach((el) => el.classList.add("is-col-hover"));
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

  const typeGroups: SelectGroup[] = (Object.keys(chartIdsByFamily) as VizFamily[]).map((familyId) => ({
    label: familyLabels[familyId][locale],
    options: (chartIdsByFamily[familyId] ?? []).map((id) => ({ value: id, label: getEntry(id).name[locale], dot: `var(--fam-${familyId})` })),
  }));
  const columnOptions = (optional: boolean) => [
    ...(optional || !columns.length ? [{ value: "", label: tr("none") }] : []),
    ...columns.map((column) => ({ value: column, label: column, hint: tr(columnKinds[column]) })),
  ];
  const dateLabels = { open: tr("openCalendar"), previous: tr("prevMonth"), next: tr("nextMonth"), today: tr("today") };

  const copyDescription = async () => {
    try { await navigator.clipboard.writeText(chartRef.current?.getDescription() ?? ""); notify(tr("copied")); } catch { /* clipboard may be blocked */ }
  };

  const currentEntry = getEntry(viz.chartId);
  const mappingFields: Array<[keyof ChartConfig, TranslationKey]> = [["xField", "xField"], ["yField", "yField"], ["seriesField", "seriesField"], ["sizeField", "sizeField"]];

  return (
    <section className="page studio-page">
      <header className="studio-head">
        <a className="crumb" href={routeHref({ view: "projects" })}><ArrowLeft size={14} />{tr("backToProjects")}</a>
        <input className="project-name-input" value={project.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} onBlur={(event) => { if (!event.target.value.trim()) update((current) => ({ ...current, name: tr("newProject") })); }} aria-label={tr("projectName")} maxLength={90} />
        <p className="studio-meta">
          <span>{project.dataName || tr("noData")}</span>
          <span>{rows.length} {tr("rows")} · {columns.length} {tr("columns")}</span>
          <span className="saved"><i />{tr("savedLocally")}</span>
        </p>
      </header>

      <div ref={tabsRef} className="viz-tabs" data-tour="viz-tabs" role="tablist" aria-label={tr("visualizations")}>
        <span className="tab-indicator" aria-hidden="true" />
        {project.visualizations.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={item.id === viz.id} className={item.id === viz.id ? "viz-tab is-active" : "viz-tab"} onClick={() => update((current) => ({ ...current, activeVizId: item.id }))}>
            <span className="tab-dot" style={{ background: `var(--fam-${getEntry(item.chartId).family})` }} />
            <span className="tab-label">{item.title || getEntry(item.chartId).name[locale]}</span>
          </button>
        ))}
        <button type="button" className="viz-tab viz-tab-add" onClick={addViz}><Plus size={14} />{tr("newViz")}</button>
        <span className="tab-tools">
          <button type="button" onClick={duplicateViz} aria-label={tr("duplicateViz")} data-tip={tr("duplicateViz")}><Copy size={14} /></button>
          <button type="button" className="danger" onClick={deleteViz} disabled={project.visualizations.length < 2} aria-label={tr("deleteViz")} data-tip={tr("deleteViz")}><Trash2 size={14} /></button>
        </span>
      </div>

      <div className="studio-shell">
        <aside className="studio-sidebar">
          <section className="control-group" data-tour="data-panel">
            <h2 className="control-title"><span>01</span>{tr("data")}</h2>
            <input ref={fileRef} className="hidden-input" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.json,.zip" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
            <button className="upload-zone" type="button" onClick={() => fileRef.current?.click()}><Upload size={18} /><strong>{tr("upload")}</strong><small>{tr("fileHint")}</small></button>
            <div className="mini-actions">
              <button type="button" onClick={() => setPasteOpen(true)}><Clipboard size={14} />{tr("paste")}</button>
              <button type="button" onClick={applySample}><Sparkles size={14} />{tr("sampleData")}</button>
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
                  <span className="suggestion-viz"><MiniViz entry={entry} index={2} /></span>
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
              <button type="button" className="export-button" data-tour="export" onClick={() => setExportSize(chartRef.current?.getSize() ?? { width: 1200, height: 700 })}><Download size={14} />{tr("export")}</button>
            </div>
          </div>
          <div className="preview-stage">
            {rows.length ? <ChartRenderer ref={chartRef} rows={rows} config={viz} display={display} locale={locale} className="chart-canvas" /> : (
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
            <button type="button" onClick={() => { setColumnName(""); setColumnModalOpen(true); }}><Plus size={14} />{tr("addColumn")}</button>
            <button type="button" className="danger" onClick={() => setRows(() => [])} disabled={!rows.length}><Trash2 size={14} />{tr("clear")}</button>
          </div>
        </div>
        {columns.length > 0 && (
          <div className="data-table-wrap">
            <table ref={tableRef} className="data-table" onPointerOver={(event) => highlightColumn(event.target)} onPointerLeave={() => highlightColumn(null)} onFocus={(event) => highlightColumn(event.target)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) highlightColumn(null); }}>
              <thead><tr><th>#</th>{columns.map((column) => <th key={column}><span>{column}</span><small>{tr(columnKinds[column])}</small></th>)}<th /></tr></thead>
              <tbody>{rows.slice(0, 120).map((row, rowIndex) => <tr key={rowIndex}><td>{rowIndex + 1}</td>{columns.map((column) => <td key={column}>{columnKinds[column] === "temporal"
                ? <DateCell ariaLabel={`${column}, ${rowIndex + 1}`} value={String(row[column] ?? "")} onChange={(value) => updateCell(rowIndex, column, value)} locale={locale} labels={dateLabels} />
                : <input aria-label={`${column}, ${rowIndex + 1}`} value={String(row[column] ?? "")} onChange={(event) => updateCell(rowIndex, column, event.target.value)} />}</td>)}<td><button type="button" onClick={() => setRows((current) => current.filter((_, index) => index !== rowIndex))} aria-label={`${tr("delete")} ${rowIndex + 1}`} data-tip={tr("delete")}><X size={13} /></button></td></tr>)}</tbody>
            </table>
            {rows.length > 120 && <div className="table-limit">+ {rows.length - 120} {tr("rows")} · {tr("tableLimit")}</div>}
          </div>
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
            <div className="modal-actions">
              <button type="submit" className="button button-primary">{tr("addColumn")}<Plus size={16} /></button>
              <button type="button" className="button button-quiet" onClick={close}>{tr("cancel")}</button>
            </div>
          </form>}
        </Modal>
      )}
    </section>
  );
}
