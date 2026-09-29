import type { ChartConfig, DataRow } from "../../components/ChartRenderer";
import type { Route } from "../../components/app";
import { catalog, familyLabels, getEntry, type Locale } from "../catalog";
import { classifyColumn, columnsOf, type ColumnKind } from "../data";
import { DEFAULT_EXPORT_SIZE, runExport, type ExportFormat } from "../export";
import type { Prefs } from "../prefs";
import { activeViz, createProject, makeViz, uid, type Project } from "../projects";
import type { ToolDef } from "./providers";
import type { Sharing } from "./session";

/* ---------------------------------------------------------------------------
 * What the assistant can see and do. Read tools run immediately (within the
 * data-sharing level the user chose); action tools are always shown to the
 * user for confirmation first, and return an undo when possible.
 * ------------------------------------------------------------------------- */

export type AgentContext = {
  locale: Locale;
  sharing: Sharing;
  getProjects: () => Project[];
  getRoute: () => Route;
  getPrefs: () => Prefs;
  addProject: (project: Project) => void;
  updateProject: (id: string, updater: (project: Project) => Project) => void;
  deleteProject: (id: string) => void;
  navigate: (route: Route) => void;
  setPrefs: (next: Partial<Prefs>) => void;
  startTour: () => void;
};

export type ToolOutcome = { content: string; undo?: () => void };
type Input = Record<string, unknown>;
type ToolSpec = ToolDef & {
  kind: "read" | "action";
  /** One line shown to the user: for reads as activity, for actions as the confirmation text. */
  summarize: (input: Input, ctx: AgentContext) => string;
  run: (input: Input, ctx: AgentContext) => Promise<ToolOutcome> | ToolOutcome;
};

export class ToolError extends Error {}

const L = (ctx: AgentContext, pt: string, en: string) => (ctx.locale === "pt" ? pt : en);
const str = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));
const json = (value: unknown) => JSON.stringify(value);

const currentProjectId = (ctx: AgentContext) => { const route = ctx.getRoute(); return route.view === "studio" ? route.id : undefined; };

function findProject(ctx: AgentContext, input: Input) {
  const id = str(input.project_id) || currentProjectId(ctx);
  const project = ctx.getProjects().find((item) => item.id === id);
  if (!project) throw new ToolError(`Project not found: ${id || "(none open)"}. Call get_app_state to list project ids.`);
  return project;
}

const projectName = (ctx: AgentContext, input: Input) => {
  const id = str(input.project_id) || currentProjectId(ctx);
  return ctx.getProjects().find((item) => item.id === id)?.name ?? id ?? "?";
};

function requireSharing(ctx: AgentContext, level: "schema" | "full") {
  const order: Sharing[] = ["none", "schema", "full"];
  if (order.indexOf(ctx.sharing) < order.indexOf(level)) {
    throw new ToolError(level === "full"
      ? "Row values are not shared. The user controls this in the assistant's data-sharing setting ('Complete'). Ask them to enable it if you need row values, or work from get_project statistics."
      : "Project structure is not shared. The user controls this in the assistant's data-sharing setting. Ask them to choose 'Structure' or 'Complete' if you need it.");
  }
}

const snapshot = (project: Project): Project => structuredClone(project);
const restore = (ctx: AgentContext, before: Project) => () => ctx.updateProject(before.id, () => before);

const toNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? "").trim().replace(/\s/g, "").replace(",", "."));
  return String(value ?? "").trim() !== "" && Number.isFinite(parsed) ? parsed : null;
};

const cellValue = (kind: ColumnKind | undefined, value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  if (kind === "numeric") { const n = toNumber(text); if (n !== null) return n; }
  return text;
};

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
};
const round = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);

function columnProfile(rows: DataRow[], column: string) {
  const kind = classifyColumn(rows, column);
  const values = rows.map((row) => row[column]);
  const missing = values.filter((value) => value === null || value === "").length;
  if (kind === "numeric") {
    const numbers = values.map(toNumber).filter((value): value is number => value !== null).sort((a, b) => a - b);
    const mean = numbers.reduce((sum, value) => sum + value, 0) / (numbers.length || 1);
    const std = Math.sqrt(numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, numbers.length - 1));
    return { column, type: kind, count: numbers.length, missing, min: numbers[0] ?? null, q1: round(quantile(numbers, 0.25)), median: round(quantile(numbers, 0.5)), q3: round(quantile(numbers, 0.75)), max: numbers[numbers.length - 1] ?? null, mean: round(mean), std: round(std), sum: round(numbers.reduce((sum, value) => sum + value, 0)) };
  }
  const counts = new Map<string, number>();
  values.forEach((value) => { if (value !== null && value !== "") counts.set(String(value), (counts.get(String(value)) ?? 0) + 1); });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([value, count]) => ({ value, count }));
  const sortedKeys = [...counts.keys()].sort();
  return { column, type: kind, count: rows.length - missing, missing, unique: counts.size, top, ...(kind === "temporal" ? { first: sortedKeys[0], last: sortedKeys[sortedKeys.length - 1] } : {}) };
}

/** Structure of a project as the assistant sees it at the "schema" level. */
export function describeProject(project: Project, withStats: boolean) {
  const columns = columnsOf(project.rows);
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    dataName: project.dataName,
    rowCount: project.rows.length,
    columns: withStats ? columns.map((column) => columnProfile(project.rows, column)) : columns.map((column) => ({ column, type: classifyColumn(project.rows, column) })),
    visualizations: project.visualizations.map((viz) => ({ id: viz.id, title: viz.title, chart_type: viz.chartId, x_field: viz.xField, y_field: viz.yField, series_field: viz.seriesField, size_field: viz.sizeField, subtitle: viz.subtitle, show_labels: viz.showLabels, accessible_patterns: viz.patterns, active: viz.id === project.activeVizId })),
  };
}

const vizChangesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    chart_type: { type: "string", description: "Catalog chart id, e.g. bar, grouped-bar, line, scatter, histogram, pie, treemap, sankey." },
    x_field: { type: "string", description: "Column for category / X axis." },
    y_field: { type: "string", description: "Column for value / Y axis." },
    series_field: { type: "string", description: "Column for series / group, or empty string for none." },
    size_field: { type: "string", description: "Column for size / weight, or empty string for none." },
    title: { type: "string" },
    subtitle: { type: "string" },
    show_labels: { type: "boolean" },
    accessible_patterns: { type: "boolean", description: "Texture patterns in addition to color." },
  },
};

function applyVizChanges(project: Project, changes: Input): Partial<ChartConfig> {
  const columns = new Set(columnsOf(project.rows));
  const patch: Partial<ChartConfig> = {};
  if (changes.chart_type !== undefined) {
    const id = str(changes.chart_type);
    if (!catalog.some((entry) => entry.id === id)) throw new ToolError(`Unknown chart_type "${id}". Valid ids: ${catalog.map((entry) => entry.id).join(", ")}`);
    patch.chartId = id;
  }
  (["x_field", "y_field", "series_field", "size_field"] as const).forEach((key) => {
    if (changes[key] === undefined) return;
    const column = str(changes[key]);
    if (column && !columns.has(column)) throw new ToolError(`Column "${column}" does not exist. Columns: ${[...columns].join(", ")}`);
    const target = { x_field: "xField", y_field: "yField", series_field: "seriesField", size_field: "sizeField" }[key] as keyof ChartConfig;
    (patch as Record<string, unknown>)[target] = column;
  });
  if (changes.title !== undefined) patch.title = str(changes.title);
  if (changes.subtitle !== undefined) patch.subtitle = str(changes.subtitle);
  if (changes.show_labels !== undefined) patch.showLabels = Boolean(changes.show_labels);
  if (changes.accessible_patterns !== undefined) patch.patterns = Boolean(changes.accessible_patterns);
  return patch;
}

const describeChanges = (ctx: AgentContext, changes: Input) => Object.entries(changes)
  .filter(([, value]) => value !== undefined)
  .map(([key, value]) => key === "chart_type" ? `${L(ctx, "tipo", "type")} → ${getEntry(str(value)).name[ctx.locale]}` : `${key} → ${typeof value === "string" ? `“${value}”` : String(value)}`)
  .join("; ");

const projectIdProp = { project_id: { type: "string", description: "Project id. Defaults to the project open in the studio." } };

export const TOOLS: ToolSpec[] = [
  /* ---------------- read ---------------- */
  {
    name: "get_app_state", kind: "read",
    description: "Current screen, open project, display preferences, data-sharing level and the list of all projects (ids, names, sizes). Call this after actions to see the new state.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    summarize: (_input, ctx) => L(ctx, "Consultou o estado do DataVizLab", "Read the DataVizLab state"),
    run: (_input, ctx) => ({ content: json(appState(ctx)) }),
  },
  {
    name: "get_project", kind: "read",
    description: "Project structure: columns with types and per-column statistics (count, missing, min/quartiles/max, mean, std for numbers; unique values and most frequent values for text), plus every visualization and its settings. Requires sharing level 'schema' or 'full'.",
    parameters: { type: "object", properties: projectIdProp, additionalProperties: false },
    summarize: (input, ctx) => L(ctx, `Leu a estrutura e as estatísticas de “${projectName(ctx, input)}”`, `Read structure and statistics of “${projectName(ctx, input)}”`),
    run: (input, ctx) => { requireSharing(ctx, "schema"); return { content: json(describeProject(findProject(ctx, input), true)) }; },
  },
  {
    name: "get_rows", kind: "read",
    description: "Row values of a project (1-based row numbers, as shown in the editable table). Requires sharing level 'full'. Max 200 rows per call.",
    parameters: { type: "object", additionalProperties: false, properties: { ...projectIdProp, start_row: { type: "integer", minimum: 1, description: "First row (1-based). Default 1." }, limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50." }, columns: { type: "array", items: { type: "string" }, description: "Subset of columns. Default all." } } },
    summarize: (input, ctx) => L(ctx, `Leu linhas de “${projectName(ctx, input)}”`, `Read rows of “${projectName(ctx, input)}”`),
    run: (input, ctx) => {
      requireSharing(ctx, "full");
      const project = findProject(ctx, input);
      const start = Math.max(1, Number(input.start_row) || 1);
      const limit = Math.min(200, Math.max(1, Number(input.limit) || 50));
      const columns = Array.isArray(input.columns) && input.columns.length ? input.columns.map(str) : columnsOf(project.rows);
      const rows = project.rows.slice(start - 1, start - 1 + limit).map((row, index) => ({ row: start + index, ...Object.fromEntries(columns.map((column) => [column, row[column] ?? null])) }));
      return { content: json({ totalRows: project.rows.length, rows }) };
    },
  },
  {
    name: "aggregate", kind: "read",
    description: "Group-by aggregation computed locally over all rows: for each value of group_by, count, sum, mean, min and max of a numeric column. Without group_by, totals over all rows. Requires sharing level 'schema' or 'full'.",
    parameters: { type: "object", additionalProperties: false, required: ["column"], properties: { ...projectIdProp, column: { type: "string", description: "Numeric column to aggregate." }, group_by: { type: "string", description: "Optional grouping column." }, limit: { type: "integer", minimum: 1, maximum: 100, description: "Max groups, largest sums first. Default 30." } } },
    summarize: (input, ctx) => L(ctx, `Calculou agregações de “${str(input.column)}”${input.group_by ? ` por “${str(input.group_by)}”` : ""}`, `Aggregated “${str(input.column)}”${input.group_by ? ` by “${str(input.group_by)}”` : ""}`),
    run: (input, ctx) => {
      requireSharing(ctx, "schema");
      const project = findProject(ctx, input);
      const column = str(input.column);
      const groupBy = str(input.group_by);
      const columns = columnsOf(project.rows);
      [column, groupBy].filter(Boolean).forEach((name) => { if (!columns.includes(name)) throw new ToolError(`Column "${name}" does not exist. Columns: ${columns.join(", ")}`); });
      const groups = new Map<string, number[]>();
      project.rows.forEach((row) => {
        const n = toNumber(row[column]);
        if (n === null) return;
        const key = groupBy ? String(row[groupBy] ?? "—") : "(all)";
        groups.set(key, [...(groups.get(key) ?? []), n]);
      });
      const result = [...groups.entries()].map(([group, values]) => ({ group, count: values.length, sum: round(values.reduce((s, v) => s + v, 0)), mean: round(values.reduce((s, v) => s + v, 0) / values.length), min: Math.min(...values), max: Math.max(...values) }))
        .sort((a, b) => (b.sum ?? 0) - (a.sum ?? 0)).slice(0, Math.min(100, Number(input.limit) || 30));
      return { content: json({ column, group_by: groupBy || null, groups: result, totalGroups: groups.size }) };
    },
  },
  {
    name: "get_chart_type", kind: "read",
    description: "Catalog entry for a chart type: what it is, when to use it, when to avoid it and the data it needs.",
    parameters: { type: "object", additionalProperties: false, required: ["chart_type"], properties: { chart_type: { type: "string" } } },
    summarize: (input, ctx) => L(ctx, `Consultou a ficha de “${getEntry(str(input.chart_type)).name.pt}”`, `Read the entry for “${getEntry(str(input.chart_type)).name.en}”`),
    run: (input, ctx) => {
      const entry = catalog.find((item) => item.id === str(input.chart_type));
      if (!entry) throw new ToolError(`Unknown chart type. Valid ids: ${catalog.map((item) => item.id).join(", ")}`);
      const l = ctx.locale;
      return { content: json({ id: entry.id, name: entry.name[l], family: familyLabels[entry.family][l], level: entry.complexity, what: entry.what[l], when: entry.when[l], avoid: entry.avoid[l], fields: entry.fields[l] }) };
    },
  },

  /* ---------------- actions (confirmed by the user) ---------------- */
  {
    name: "navigate", kind: "action",
    description: "Open a screen: home, projects (My projects), catalog, or studio (needs project_id). In the studio, visualization_id selects a visualization tab.",
    parameters: { type: "object", additionalProperties: false, required: ["view"], properties: { view: { type: "string", enum: ["home", "projects", "catalog", "studio"] }, project_id: { type: "string" }, visualization_id: { type: "string" } } },
    summarize: (input, ctx) => {
      const view = str(input.view);
      if (view === "studio") return L(ctx, `Abrir o estúdio do projeto “${projectName(ctx, input)}”`, `Open the studio for “${projectName(ctx, input)}”`);
      const names = { home: L(ctx, "Início", "Home"), projects: L(ctx, "Meus projetos", "My projects"), catalog: L(ctx, "Catálogo", "Catalog") } as Record<string, string>;
      return L(ctx, `Ir para ${names[view] ?? view}`, `Go to ${names[view] ?? view}`);
    },
    run: (input, ctx) => {
      const view = str(input.view);
      if (view === "studio") {
        const project = findProject(ctx, input);
        const vizId = str(input.visualization_id);
        if (vizId && project.visualizations.some((viz) => viz.id === vizId)) ctx.updateProject(project.id, (current) => ({ ...current, activeVizId: vizId }));
        ctx.navigate({ view: "studio", id: project.id });
      } else if (view === "home" || view === "projects" || view === "catalog") ctx.navigate({ view });
      else throw new ToolError("Unknown view");
      return { content: json({ ok: true }) };
    },
  },
  {
    name: "create_project", kind: "action",
    description: "Create a project (optionally with the community-energy sample data) and open it in the studio.",
    parameters: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" }, description: { type: "string" }, with_sample_data: { type: "boolean" } } },
    summarize: (input, ctx) => L(ctx, `Criar o projeto “${str(input.name)}”${input.with_sample_data ? " com dados de exemplo" : ""}`, `Create project “${str(input.name)}”${input.with_sample_data ? " with sample data" : ""}`),
    run: (input, ctx) => {
      const project = createProject({ name: str(input.name), description: str(input.description), locale: ctx.locale, withSample: Boolean(input.with_sample_data) });
      ctx.addProject(project);
      ctx.navigate({ view: "studio", id: project.id });
      return { content: json({ ok: true, project_id: project.id, visualization_id: project.activeVizId }), undo: () => ctx.deleteProject(project.id) };
    },
  },
  {
    name: "update_project", kind: "action",
    description: "Rename a project and/or change its description.",
    parameters: { type: "object", additionalProperties: false, properties: { ...projectIdProp, name: { type: "string" }, description: { type: "string" } } },
    summarize: (input, ctx) => L(ctx, `Atualizar o projeto “${projectName(ctx, input)}”: ${describeChanges(ctx, { name: input.name, description: input.description })}`, `Update project “${projectName(ctx, input)}”: ${describeChanges(ctx, { name: input.name, description: input.description })}`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => ({ ...current, ...(input.name !== undefined ? { name: str(input.name) || current.name } : {}), ...(input.description !== undefined ? { description: str(input.description) } : {}) }));
      return { content: json({ ok: true }), undo: restore(ctx, before) };
    },
  },
  {
    name: "delete_project", kind: "action",
    description: "Delete a project and all its data from this device.",
    parameters: { type: "object", additionalProperties: false, required: ["project_id"], properties: projectIdProp },
    summarize: (input, ctx) => L(ctx, `Excluir o projeto “${projectName(ctx, input)}” (dados e visualizações)`, `Delete project “${projectName(ctx, input)}” (data and visualizations)`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const before = snapshot(project);
      if (currentProjectId(ctx) === project.id) ctx.navigate({ view: "projects" });
      ctx.deleteProject(project.id);
      return { content: json({ ok: true }), undo: () => ctx.addProject(before) };
    },
  },
  {
    name: "update_visualization", kind: "action",
    description: "Change a visualization: chart type, field mappings, title, subtitle, labels, patterns. Defaults to the active visualization of the project. The changed visualization becomes the active tab.",
    parameters: { type: "object", additionalProperties: false, required: ["changes"], properties: { ...projectIdProp, visualization_id: { type: "string" }, changes: vizChangesSchema } },
    summarize: (input, ctx) => {
      const project = ctx.getProjects().find((item) => item.id === (str(input.project_id) || currentProjectId(ctx)));
      const viz = project?.visualizations.find((item) => item.id === str(input.visualization_id)) ?? (project ? activeViz(project) : undefined);
      return L(ctx, `Alterar a visualização “${viz?.title ?? "?"}”: ${describeChanges(ctx, (input.changes ?? {}) as Input)}`, `Change visualization “${viz?.title ?? "?"}”: ${describeChanges(ctx, (input.changes ?? {}) as Input)}`);
    },
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const target = str(input.visualization_id) || project.activeVizId;
      if (!project.visualizations.some((viz) => viz.id === target)) throw new ToolError("Visualization not found. Use get_project to list visualization ids.");
      const patch = applyVizChanges(project, (input.changes ?? {}) as Input);
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => ({ ...current, activeVizId: target, visualizations: current.visualizations.map((viz) => (viz.id === target ? { ...viz, ...patch } : viz)) }));
      return { content: json({ ok: true, visualization_id: target }), undo: restore(ctx, before) };
    },
  },
  {
    name: "add_visualization", kind: "action",
    description: "Add a new visualization tab to a project (it becomes active).",
    parameters: { type: "object", additionalProperties: false, required: ["changes"], properties: { ...projectIdProp, changes: vizChangesSchema } },
    summarize: (input, ctx) => L(ctx, `Adicionar uma visualização em “${projectName(ctx, input)}”: ${describeChanges(ctx, (input.changes ?? {}) as Input)}`, `Add a visualization to “${projectName(ctx, input)}”: ${describeChanges(ctx, (input.changes ?? {}) as Input)}`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const changes = (input.changes ?? {}) as Input;
      const patch = applyVizChanges(project, changes);
      const base = activeViz(project);
      const viz = makeViz({ ...base, ...patch, title: patch.title ?? (patch.chartId ? getEntry(patch.chartId).name[ctx.locale] : base.title) });
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => ({ ...current, visualizations: [...current.visualizations, viz], activeVizId: viz.id }));
      return { content: json({ ok: true, visualization_id: viz.id }), undo: restore(ctx, before) };
    },
  },
  {
    name: "delete_visualization", kind: "action",
    description: "Delete a visualization tab (a project keeps at least one).",
    parameters: { type: "object", additionalProperties: false, required: ["visualization_id"], properties: { ...projectIdProp, visualization_id: { type: "string" } } },
    summarize: (input, ctx) => {
      const project = ctx.getProjects().find((item) => item.id === (str(input.project_id) || currentProjectId(ctx)));
      const viz = project?.visualizations.find((item) => item.id === str(input.visualization_id));
      return L(ctx, `Excluir a visualização “${viz?.title ?? "?"}”`, `Delete visualization “${viz?.title ?? "?"}”`);
    },
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      if (project.visualizations.length < 2) throw new ToolError("A project must keep at least one visualization.");
      const target = str(input.visualization_id);
      if (!project.visualizations.some((viz) => viz.id === target)) throw new ToolError("Visualization not found.");
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => {
        const visualizations = current.visualizations.filter((viz) => viz.id !== target);
        return { ...current, visualizations, activeVizId: current.activeVizId === target ? visualizations[0].id : current.activeVizId };
      });
      return { content: json({ ok: true }), undo: restore(ctx, before) };
    },
  },
  {
    name: "edit_cells", kind: "action",
    description: "Set cell values. Rows are 1-based as in the editable table. Batch all edits in one call.",
    parameters: { type: "object", additionalProperties: false, required: ["edits"], properties: { ...projectIdProp, edits: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["row", "column", "value"], properties: { row: { type: "integer", minimum: 1 }, column: { type: "string" }, value: { type: ["string", "number", "boolean", "null"] } } } } } },
    summarize: (input, ctx) => {
      const edits = Array.isArray(input.edits) ? input.edits as Input[] : [];
      const preview = edits.slice(0, 4).map((edit) => `${L(ctx, "linha", "row")} ${str(edit.row)} · ${str(edit.column)} → ${str(edit.value) || "∅"}`).join("; ");
      return L(ctx, `Editar ${edits.length} célula(s) em “${projectName(ctx, input)}”: ${preview}${edits.length > 4 ? "…" : ""}`, `Edit ${edits.length} cell(s) in “${projectName(ctx, input)}”: ${preview}${edits.length > 4 ? "…" : ""}`);
    },
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const columns = columnsOf(project.rows);
      const edits = (Array.isArray(input.edits) ? input.edits : []) as Input[];
      edits.forEach((edit) => {
        const row = Number(edit.row);
        if (!Number.isInteger(row) || row < 1 || row > project.rows.length) throw new ToolError(`Row ${str(edit.row)} is out of range 1..${project.rows.length}.`);
        if (!columns.includes(str(edit.column))) throw new ToolError(`Column "${str(edit.column)}" does not exist. Columns: ${columns.join(", ")}`);
      });
      const kinds = Object.fromEntries(columns.map((column) => [column, classifyColumn(project.rows, column)]));
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => {
        const rows = current.rows.map((row) => ({ ...row }));
        edits.forEach((edit) => { rows[Number(edit.row) - 1][str(edit.column)] = cellValue(kinds[str(edit.column)], edit.value); });
        return { ...current, rows };
      });
      return { content: json({ ok: true, edited: edits.length }), undo: restore(ctx, before) };
    },
  },
  {
    name: "add_rows", kind: "action",
    description: "Append rows (objects keyed by column name). Unknown keys become new columns.",
    parameters: { type: "object", additionalProperties: false, required: ["rows"], properties: { ...projectIdProp, rows: { type: "array", minItems: 1, maxItems: 500, items: { type: "object" } } } },
    summarize: (input, ctx) => L(ctx, `Adicionar ${(input.rows as unknown[] | undefined)?.length ?? 0} linha(s) em “${projectName(ctx, input)}”`, `Append ${(input.rows as unknown[] | undefined)?.length ?? 0} row(s) to “${projectName(ctx, input)}”`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const incoming = (Array.isArray(input.rows) ? input.rows : []) as Input[];
      const kinds = Object.fromEntries(columnsOf(project.rows).map((column) => [column, classifyColumn(project.rows, column)]));
      const rows = incoming.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cellValue(kinds[key], value)]))) as DataRow[];
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => ({ ...current, rows: [...current.rows, ...rows], dataName: current.dataName || L(ctx, "dados-do-assistente.csv", "assistant-data.csv") }));
      return { content: json({ ok: true, totalRows: project.rows.length + rows.length }), undo: restore(ctx, before) };
    },
  },
  {
    name: "delete_rows", kind: "action",
    description: "Delete rows by 1-based row number.",
    parameters: { type: "object", additionalProperties: false, required: ["rows"], properties: { ...projectIdProp, rows: { type: "array", minItems: 1, items: { type: "integer", minimum: 1 } } } },
    summarize: (input, ctx) => { const rows = (input.rows as number[] | undefined) ?? []; return L(ctx, `Excluir ${rows.length} linha(s) de “${projectName(ctx, input)}”: ${rows.slice(0, 12).join(", ")}${rows.length > 12 ? "…" : ""}`, `Delete ${rows.length} row(s) from “${projectName(ctx, input)}”: ${rows.slice(0, 12).join(", ")}${rows.length > 12 ? "…" : ""}`); },
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const remove = new Set(((input.rows as unknown[]) ?? []).map(Number));
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => ({ ...current, rows: current.rows.filter((_, index) => !remove.has(index + 1)) }));
      return { content: json({ ok: true, removed: remove.size }), undo: restore(ctx, before) };
    },
  },
  {
    name: "add_column", kind: "action",
    description: "Add a column (e.g. a derived or computed column). Give either values (one per row, in row order) or a single default_value.",
    parameters: { type: "object", additionalProperties: false, required: ["name"], properties: { ...projectIdProp, name: { type: "string" }, values: { type: "array", items: { type: ["string", "number", "boolean", "null"] } }, default_value: { type: ["string", "number", "boolean", "null"] } } },
    summarize: (input, ctx) => L(ctx, `Adicionar a coluna “${str(input.name)}” em “${projectName(ctx, input)}”${Array.isArray(input.values) ? ` com ${input.values.length} valor(es)` : ""}`, `Add column “${str(input.name)}” to “${projectName(ctx, input)}”${Array.isArray(input.values) ? ` with ${input.values.length} value(s)` : ""}`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const name = str(input.name).trim();
      if (!name) throw new ToolError("Column name is required.");
      if (columnsOf(project.rows).includes(name)) throw new ToolError(`Column "${name}" already exists; use edit_cells to change it.`);
      const values = Array.isArray(input.values) ? input.values : null;
      if (values && values.length !== project.rows.length) throw new ToolError(`values has ${values.length} items but the project has ${project.rows.length} rows.`);
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => ({ ...current, rows: current.rows.length ? current.rows.map((row, index) => ({ ...row, [name]: cellValue(undefined, values ? values[index] : input.default_value ?? "") })) : [{ [name]: "" }] }));
      return { content: json({ ok: true }), undo: restore(ctx, before) };
    },
  },
  {
    name: "rename_column", kind: "action",
    description: "Rename a column; visualization mappings follow the new name.",
    parameters: { type: "object", additionalProperties: false, required: ["column", "new_name"], properties: { ...projectIdProp, column: { type: "string" }, new_name: { type: "string" } } },
    summarize: (input, ctx) => L(ctx, `Renomear a coluna “${str(input.column)}” para “${str(input.new_name)}”`, `Rename column “${str(input.column)}” to “${str(input.new_name)}”`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const from = str(input.column);
      const to = str(input.new_name).trim();
      const columns = columnsOf(project.rows);
      if (!columns.includes(from)) throw new ToolError(`Column "${from}" does not exist.`);
      if (!to || columns.includes(to)) throw new ToolError("new_name is empty or already used.");
      const before = snapshot(project);
      const swap = (value: string) => (value === from ? to : value);
      ctx.updateProject(project.id, (current) => ({
        ...current,
        rows: current.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [swap(key), value]))),
        visualizations: current.visualizations.map((viz) => ({ ...viz, xField: swap(viz.xField), yField: swap(viz.yField), seriesField: swap(viz.seriesField), sizeField: swap(viz.sizeField) })),
      }));
      return { content: json({ ok: true }), undo: restore(ctx, before) };
    },
  },
  {
    name: "delete_column", kind: "action",
    description: "Delete a column; visualization mappings that used it are cleared.",
    parameters: { type: "object", additionalProperties: false, required: ["column"], properties: { ...projectIdProp, column: { type: "string" } } },
    summarize: (input, ctx) => L(ctx, `Excluir a coluna “${str(input.column)}” de “${projectName(ctx, input)}”`, `Delete column “${str(input.column)}” from “${projectName(ctx, input)}”`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const column = str(input.column);
      if (!columnsOf(project.rows).includes(column)) throw new ToolError(`Column "${column}" does not exist.`);
      const before = snapshot(project);
      const clear = (value: string) => (value === column ? "" : value);
      ctx.updateProject(project.id, (current) => ({
        ...current,
        rows: current.rows.map((row) => { const next = { ...row }; delete next[column]; return next; }),
        visualizations: current.visualizations.map((viz) => ({ ...viz, xField: clear(viz.xField), yField: clear(viz.yField), seriesField: clear(viz.seriesField), sizeField: clear(viz.sizeField) })),
      }));
      return { content: json({ ok: true }), undo: restore(ctx, before) };
    },
  },
  {
    name: "sort_rows", kind: "action",
    description: "Sort all rows by a column.",
    parameters: { type: "object", additionalProperties: false, required: ["column"], properties: { ...projectIdProp, column: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } } },
    summarize: (input, ctx) => L(ctx, `Ordenar as linhas por “${str(input.column)}” (${input.direction === "desc" ? "decrescente" : "crescente"})`, `Sort rows by “${str(input.column)}” (${input.direction === "desc" ? "descending" : "ascending"})`),
    run: (input, ctx) => {
      const project = findProject(ctx, input);
      const column = str(input.column);
      if (!columnsOf(project.rows).includes(column)) throw new ToolError(`Column "${column}" does not exist.`);
      const sign = input.direction === "desc" ? -1 : 1;
      const numeric = classifyColumn(project.rows, column) === "numeric";
      const before = snapshot(project);
      ctx.updateProject(project.id, (current) => ({
        ...current,
        rows: [...current.rows].sort((a, b) => sign * (numeric ? (toNumber(a[column]) ?? -Infinity) - (toNumber(b[column]) ?? -Infinity) : String(a[column] ?? "").localeCompare(String(b[column] ?? ""), ctx.locale === "pt" ? "pt-BR" : "en", { numeric: true }))),
      }));
      return { content: json({ ok: true }), undo: restore(ctx, before) };
    },
  },
  {
    name: "set_preferences", kind: "action",
    description: "Change display settings: theme, language, high contrast, reduced motion, text size.",
    parameters: { type: "object", additionalProperties: false, properties: { theme: { type: "string", enum: ["dark", "light"] }, language: { type: "string", enum: ["pt", "en"] }, high_contrast: { type: "boolean" }, reduced_motion: { type: "boolean" }, text_size: { type: "string", enum: ["sm", "md", "lg"] } } },
    summarize: (input, ctx) => L(ctx, `Alterar configurações: ${describeChanges(ctx, input)}`, `Change settings: ${describeChanges(ctx, input)}`),
    run: (input, ctx) => {
      const before = { ...ctx.getPrefs() };
      const next: Partial<Prefs> = {};
      if (input.theme === "dark" || input.theme === "light") next.theme = input.theme;
      if (input.language === "pt" || input.language === "en") next.locale = input.language;
      if (typeof input.high_contrast === "boolean") next.contrast = input.high_contrast ? "high" : "normal";
      if (typeof input.reduced_motion === "boolean") next.motion = input.reduced_motion ? "reduced" : "full";
      if (input.text_size === "sm" || input.text_size === "md" || input.text_size === "lg") next.fontSize = input.text_size;
      ctx.setPrefs(next);
      return { content: json({ ok: true }), undo: () => ctx.setPrefs(before) };
    },
  },
  {
    name: "export", kind: "action",
    description: "Download a visualization as svg (vector), jpg (with background) or png (transparent background), or the whole project as a ZIP (format 'project').",
    parameters: { type: "object", additionalProperties: false, required: ["format"], properties: { ...projectIdProp, visualization_id: { type: "string" }, format: { type: "string", enum: ["svg", "jpg", "png", "project"] }, theme: { type: "string", enum: ["dark", "light"], description: "Colors of the exported image. Default: current theme." } } },
    summarize: (input, ctx) => L(ctx, `Baixar ${str(input.format).toUpperCase()} de “${projectName(ctx, input)}”`, `Download ${str(input.format).toUpperCase()} of “${projectName(ctx, input)}”`),
    run: async (input, ctx) => {
      const project = findProject(ctx, input);
      const viz = project.visualizations.find((item) => item.id === str(input.visualization_id)) ?? activeViz(project);
      const prefs = ctx.getPrefs();
      const format = str(input.format) as ExportFormat;
      if (format !== "project" && !project.rows.length) throw new ToolError("The project has no data to draw.");
      await runExport(format, project, viz, { dark: (str(input.theme) || prefs.theme) === "dark", contrast: prefs.contrast === "high", fontScale: 1, ...DEFAULT_EXPORT_SIZE }, ctx.locale);
      return { content: json({ ok: true, downloaded: format }) };
    },
  },
  {
    name: "start_tutorial", kind: "action",
    description: "Start the guided walkthrough of DataVizLab.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    summarize: (_input, ctx) => L(ctx, "Iniciar o tutorial guiado", "Start the guided tour"),
    run: (_input, ctx) => { ctx.startTour(); return { content: json({ ok: true }) }; },
  },
];

export const toolDefs: ToolDef[] = TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
export const toolSpec = (name: string) => TOOLS.find((tool) => tool.name === name);

/** Compact snapshot of the app, attached to each user message. */
export function appState(ctx: AgentContext) {
  const route = ctx.getRoute();
  const projects = ctx.getProjects();
  const open = route.view === "studio" ? projects.find((project) => project.id === route.id) : undefined;
  const prefs = ctx.getPrefs();
  return {
    screen: route.view,
    data_sharing: ctx.sharing,
    open_project: open ? (ctx.sharing === "none"
      ? { id: open.id, name: open.name, rowCount: open.rows.length, visualizations: open.visualizations.map((viz) => ({ id: viz.id, title: viz.title, chart_type: viz.chartId, active: viz.id === open.activeVizId })) }
      : describeProject(open, false)) : null,
    projects: projects.map((project) => ({ id: project.id, name: project.name, rows: project.rows.length, visualizations: project.visualizations.length, updated: project.updatedAt.slice(0, 10) })),
    preferences: { theme: prefs.theme, language: prefs.locale, high_contrast: prefs.contrast === "high", reduced_motion: prefs.motion === "reduced", text_size: prefs.fontSize },
  };
}

export const stateContext = (ctx: AgentContext) => `<app_state generated_by="DataVizLab">\n${JSON.stringify(appState(ctx))}\n</app_state>`;

export const newCallId = () => `local_${uid()}`;
