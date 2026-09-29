import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Copy, Download, FileUp, PencilLine, Plus, Search, Sparkles, Table2, Trash2 } from "lucide-react";
import { getEntry } from "../lib/catalog";
import { columnsOf, parseFile, suggestMappings, visualizationsFrom } from "../lib/data";
import { activeViz, blankConfig, createProject, uid, type Project } from "../lib/projects";
import { formatDate, routeHref, type AppApi } from "./app";
import { MiniViz } from "./MiniViz";
import { Modal } from "./Modal";
import { DEFAULT_EXPORT_SIZE, exportProjectArchive } from "../lib/export";

type Draft = { name: string; description: string; withSample: boolean };

export function ProjectsView({ api }: { api: AppApi }) {
  const { tr, locale, dark, chart, projects, loaded, addProject, updateProject, deleteProject, navigate, notify } = api;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", description: "" });
  const [deleting, setDeleting] = useState<Project | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...projects]
      .filter((project) => !needle || `${project.name} ${project.description} ${project.dataName}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [projects, query]);

  const openCreate = (withSample = false) => setCreating({ name: "", description: "", withSample });

  const submitCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!creating) return;
    const project = createProject({ ...creating, locale });
    addProject(project);
    setCreating(null);
    notify(tr("projectCreated"));
    navigate({ view: "studio", id: project.id });
  };

  const submitEdit = (event: React.FormEvent, close: () => void) => {
    event.preventDefault();
    if (!editing) return;
    updateProject(editing.id, (project) => ({ ...project, name: editDraft.name.trim() || project.name, description: editDraft.description.trim() }));
    close();
  };

  const duplicate = (project: Project) => {
    const now = new Date().toISOString();
    const visualizations = project.visualizations.map((viz) => ({ ...viz, id: uid() }));
    const activeIndex = Math.max(0, project.visualizations.findIndex((viz) => viz.id === project.activeVizId));
    addProject({ ...project, id: uid(), name: `${project.name} ${tr("copySuffix")}`, createdAt: now, updatedAt: now, visualizations, activeVizId: visualizations[activeIndex].id });
    notify(tr("projectDuplicated"));
  };

  const importFile = async (file: File) => {
    try {
      const parsed = await parseFile(file);
      if (!parsed.rows.length) throw new Error("empty");
      const base = createProject({ name: parsed.project?.name || file.name.replace(/\.[^.]+$/, ""), description: parsed.project?.description, locale, withSample: false });
      const fallback = { ...blankConfig(locale), ...suggestMappings(parsed.rows) };
      const visualizations = parsed.project ? visualizationsFrom(parsed.project, fallback) : [{ ...base.visualizations[0], ...suggestMappings(parsed.rows) }];
      const project: Project = { ...base, rows: parsed.rows, dataName: parsed.dataName, visualizations, activeVizId: visualizations[0].id };
      addProject(project);
      notify(tr("projectImported"));
      navigate({ view: "studio", id: project.id });
    } catch (error) {
      notify(error instanceof Error && error.message === "too-large" ? tr("tooLarge") : tr("invalidFile"));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className="page projects-page">
      <header className="page-head">
        <div>
          <p className="kicker">{tr("projectsKicker")}</p>
          <h1 className="page-title">{tr("projectsTitleA")} <em>{tr("projectsTitleB")}</em></h1>
          <p className="page-lead">{tr("projectsText")}</p>
        </div>
        <div className="page-actions">
          <button className="button button-primary" type="button" data-tour="new-project" onClick={() => openCreate(false)}>{tr("newProject")}<Plus size={16} /></button>
          <button className="button button-outline" type="button" onClick={() => fileRef.current?.click()}>{tr("importProject")}<FileUp size={16} /></button>
          <input ref={fileRef} className="hidden-input" type="file" accept=".zip,.json,.csv,.tsv,.txt,.xls,.xlsx" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} />
        </div>
      </header>

      {loaded && projects.length > 0 && (
        <div className="toolbar-row">
          <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("searchProjects")} aria-label={tr("searchProjects")} /></label>
          <span className="count-label">{sorted.length} / {projects.length}</span>
        </div>
      )}

      {loaded && projects.length === 0 && (
        <div className="empty-state">
          <div className="empty-mark" aria-hidden="true"><i /><i /><i /></div>
          <h2>{tr("emptyTitle")}</h2>
          <p>{tr("emptyText")}</p>
          <div className="empty-actions">
            <button className="button button-primary" type="button" onClick={() => openCreate(false)}>{tr("newProject")}<Plus size={16} /></button>
            <button className="launch-link" type="button" onClick={() => openCreate(true)}>{tr("startSample")}<span><Sparkles size={15} /></span></button>
          </div>
        </div>
      )}

      {projects.length > 0 && sorted.length === 0 && <p className="empty-inline">{tr("noResults")}</p>}

      {sorted.length > 0 && (
        <div className="project-grid" data-tour="project-grid">
          <button className="project-card project-card-new" type="button" onClick={() => openCreate(false)}>
            <span className="new-icon"><Plus size={22} /></span>
            <strong>{tr("newProject")}</strong>
            <small>{tr("startBlank")} · {tr("startSample")}</small>
          </button>
          {sorted.map((project, index) => {
            const viz = activeViz(project);
            const entry = getEntry(viz.chartId);
            const vizCount = project.visualizations.length;
            return (
              <article className="project-card" key={project.id} style={{ "--i": Math.min(index + 1, 12) } as React.CSSProperties}>
                <a className="card-hit" href={routeHref({ view: "studio", id: project.id })} aria-label={`${tr("open")}: ${project.name}`} />
                <div className="project-preview"><MiniViz entry={entry} index={index} /></div>
                <div className="project-body">
                  <p className="card-meta"><span style={{ "--dot": `var(--fam-${entry.family})` } as React.CSSProperties}>{entry.name[locale]}</span><small>{vizCount} {vizCount === 1 ? tr("vizSingular") : tr("vizPlural")}</small></p>
                  <h3>{project.name}</h3>
                  {project.description && <p className="project-desc">{project.description}</p>}
                  <p className="project-stats"><Table2 size={13} />{project.rows.length ? `${project.rows.length} ${tr("rows")} · ${columnsOf(project.rows).length} ${tr("columns")}` : tr("noData")}</p>
                </div>
                <footer className="project-foot">
                  <small>{tr("updated")} {formatDate(project.updatedAt, locale)}</small>
                  <div className="project-actions">
                    <button type="button" onClick={() => { setEditing(project); setEditDraft({ name: project.name, description: project.description }); }} aria-label={`${tr("rename")}: ${project.name}`} data-tip={tr("rename")}><PencilLine size={14} /></button>
                    <button type="button" onClick={() => duplicate(project)} aria-label={`${tr("duplicate")}: ${project.name}`} data-tip={tr("duplicate")}><Copy size={14} /></button>
                    <button type="button" onClick={() => { exportProjectArchive(project, locale, { dark, contrast: chart.contrast, fontScale: chart.fontScale, ...DEFAULT_EXPORT_SIZE }).then(() => notify(tr("downloadReady"))); }} aria-label={`${tr("exportZip")}: ${project.name}`} data-tip={tr("exportZip")}><Download size={14} /></button>
                    <button type="button" className="danger" onClick={() => setDeleting(project)} aria-label={`${tr("delete")}: ${project.name}`} data-tip={tr("delete")}><Trash2 size={14} /></button>
                    <span className="open-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal onClose={() => setCreating(null)} labelledBy="create-title" closeLabel={tr("close")} className="modal-narrow">
          {(close) => <form onSubmit={submitCreate}>
            <p className="kicker">DataVizLab / {tr("navProjects")}</p>
            <h2 id="create-title" className="modal-title">{tr("newProject")}</h2>
            <label className="field">{tr("projectName")}<input autoFocus value={creating.name} onChange={(event) => setCreating({ ...creating, name: event.target.value })} placeholder={tr("projectNamePlaceholder")} maxLength={90} /></label>
            <label className="field">{tr("projectDescription")}<textarea rows={2} value={creating.description} onChange={(event) => setCreating({ ...creating, description: event.target.value })} placeholder={tr("projectDescriptionPlaceholder")} maxLength={280} /></label>
            <fieldset className="choice-group">
              <legend>{tr("startWith")}</legend>
              {([[false, "startBlank", "startBlankHint"], [true, "startSample", "startSampleHint"]] as const).map(([value, label, hint]) => (
                <label key={label} className={creating.withSample === value ? "choice is-active" : "choice"}>
                  <input type="radio" name="start" checked={creating.withSample === value} onChange={() => setCreating({ ...creating, withSample: value })} />
                  <span><strong>{tr(label)}</strong><small>{tr(hint)}</small></span>
                </label>
              ))}
            </fieldset>
            <div className="modal-actions">
              <button className="button button-primary" type="submit">{tr("create")}<ArrowUpRight size={16} /></button>
              <button className="button button-quiet" type="button" onClick={close}>{tr("cancel")}</button>
            </div>
          </form>}
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} labelledBy="edit-title" closeLabel={tr("close")} className="modal-narrow">
          {(close) => <form onSubmit={(event) => submitEdit(event, close)}>
            <p className="kicker">DataVizLab / {tr("navProjects")}</p>
            <h2 id="edit-title" className="modal-title">{tr("renameTitle")}</h2>
            <label className="field">{tr("projectName")}<input autoFocus value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} maxLength={90} /></label>
            <label className="field">{tr("projectDescription")}<textarea rows={2} value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} placeholder={tr("projectDescriptionPlaceholder")} maxLength={280} /></label>
            <div className="modal-actions">
              <button className="button button-primary" type="submit">{tr("save")}<ArrowUpRight size={16} /></button>
              <button className="button button-quiet" type="button" onClick={close}>{tr("cancel")}</button>
            </div>
          </form>}
        </Modal>
      )}

      {deleting && (
        <Modal onClose={() => setDeleting(null)} labelledBy="delete-title" closeLabel={tr("close")} className="modal-narrow">
          {(close) => <>
          <p className="kicker kicker-danger">{tr("delete")}</p>
          <h2 id="delete-title" className="modal-title">{tr("deleteTitle")}</h2>
          <p className="modal-lead">{tr("deleteText").replace("{name}", deleting.name)}</p>
          <div className="modal-actions">
            <button className="button button-danger" type="button" onClick={() => { deleteProject(deleting.id); close(); notify(tr("projectDeleted")); }}>{tr("confirmDelete")}<Trash2 size={16} /></button>
            <button className="button button-quiet" type="button" onClick={close}>{tr("cancel")}</button>
          </div>
          </>}
        </Modal>
      )}
    </section>
  );
}
