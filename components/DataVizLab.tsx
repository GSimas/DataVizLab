"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Coffee,
  Download,
  FileArchive,
  FileSpreadsheet,
  FlaskConical,
  Grid3X3,
  Info,
  Languages,
  Lightbulb,
  LockKeyhole,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { ChartRenderer, type ChartConfig, type ChartRendererHandle, type DataRow } from "./ChartRenderer";
import { catalog, familyColors, familyLabels, getEntry, type Locale, type VizEntry, type VizFamily } from "../lib/catalog";
import { t, type TranslationKey } from "../lib/i18n";

type Intent = "comparison" | "distribution" | "relationship" | "time" | "composition" | "flow";
type ColumnKind = "numeric" | "categorical" | "temporal";

const sampleRows: DataRow[] = [
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

const defaultConfig = (locale: Locale): ChartConfig => ({
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

const normalizeRows = (input: unknown[]): DataRow[] => input
  .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
  .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim() || "Campo", value == null ? null : typeof value === "number" || typeof value === "boolean" ? value : String(value).trim()])))
  .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

const classifyColumn = (rows: DataRow[], column: string): ColumnKind => {
  const values = rows.map((row) => row[column]).filter((value) => value !== null && value !== "").slice(0, 200);
  if (!values.length) return "categorical";
  const numeric = values.filter((value) => typeof value === "number" || /^[-+]?\d[\d.,\s]*$/.test(String(value))).length;
  if (numeric / values.length > 0.78) return "numeric";
  const temporal = values.filter((value) => /^\d{4}([-/]\d{1,2}([-/]\d{1,2})?)?$/.test(String(value)) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(String(value))).length;
  if (temporal / values.length > 0.7) return "temporal";
  return "categorical";
};

const recommendationsByIntent: Record<Intent, string[]> = {
  comparison: ["bar", "grouped-bar", "lollipop", "dot-plot"],
  distribution: ["histogram", "boxplot", "violin", "density"],
  relationship: ["scatter", "bubble", "heatmap", "correlogram"],
  time: ["line", "area", "calendar", "slope"],
  composition: ["stacked-bar", "treemap", "donut", "sunburst"],
  flow: ["sankey", "network", "alluvial", "arc"],
};

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

function MiniViz({ entry, index }: { entry: VizEntry; index: number }) {
  const color = familyColors[entry.family];
  const seed = (index % 5) + 2;
  if (["flow", "hierarchy"].includes(entry.family)) {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <path d={`M24 58 C60 ${20 + seed * 3}, 100 ${72 - seed * 4}, 154 28`} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" opacity=".38" />
        <path d="M24 30 C62 70, 112 18, 154 62" fill="none" stroke={color} strokeWidth="2" opacity=".65" />
        {["24,58", "24,30", "88,44", "154,28", "154,62"].map((coords, i) => {
          const [cx, cy] = coords.split(",").map(Number);
          return <circle key={coords} cx={cx} cy={cy} r={i === 2 ? 8 : 6} fill={i % 2 ? color : "var(--surface-strong)"} stroke={color} strokeWidth="2" />;
        })}
      </svg>
    );
  }
  if (["pie", "donut", "sunburst", "nightingale", "radial-bar"].includes(entry.id)) {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <circle cx="90" cy="45" r="31" fill="none" stroke="var(--line)" strokeWidth="16" />
        <circle cx="90" cy="45" r="31" fill="none" stroke={color} strokeWidth="16" strokeDasharray={`${80 + seed * 5} 195`} transform="rotate(-90 90 45)" />
        <circle cx="90" cy="45" r="15" fill="var(--surface)" />
      </svg>
    );
  }
  if (["scatter", "bubble", "beeswarm", "strip", "dot-map"].includes(entry.id) || entry.family === "geo") {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <path d="M22 70H160M22 70V14" stroke="var(--line)" strokeWidth="1" />
        {[0, 1, 2, 3, 4, 5, 6].map((n) => <circle key={n} cx={38 + n * 17} cy={61 - ((n * seed * 7) % 42)} r={3 + ((n + seed) % 4)} fill={color} opacity={0.42 + n * 0.07} />)}
      </svg>
    );
  }
  if (["line", "area", "stacked-area", "density", "ridgeline", "streamgraph"].includes(entry.id) || entry.family === "time") {
    return (
      <svg viewBox="0 0 180 90" aria-hidden="true">
        <path d="M18 69 C42 65, 50 28, 74 42 S112 72, 132 34 S152 22, 164 30" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <path d="M18 69 C42 65, 50 28, 74 42 S112 72, 132 34 S152 22, 164 30 L164 74 L18 74Z" fill={color} opacity=".12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 180 90" aria-hidden="true">
      <path d="M18 73H165" stroke="var(--line)" />
      {[0, 1, 2, 3, 4, 5].map((n) => <rect key={n} x={26 + n * 23} y={65 - ((n * seed * 9) % 47)} width="11" height={8 + ((n * seed * 9) % 47)} rx="2" fill={color} opacity={0.45 + n * 0.08} />)}
    </svg>
  );
}

export default function DataVizLab() {
  const [locale, setLocale] = useState<Locale>("pt");
  const [dark, setDark] = useState(true);
  const [rows, setRows] = useState<DataRow[]>(sampleRows);
  const [config, setConfig] = useState<ChartConfig>(() => defaultConfig("pt"));
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<VizFamily | "all">("all");
  const [visibleCount, setVisibleCount] = useState(24);
  const [detail, setDetail] = useState<VizEntry | null>(null);
  const [intent, setIntent] = useState<Intent>("comparison");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnInputName, setColumnInputName] = useState("");
  const [toast, setToast] = useState("");
  const [dataName, setDataName] = useState("energia-comunitaria.csv");
  const [mobileNav, setMobileNav] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<ChartRendererHandle>(null);
  const tr = (key: TranslationKey) => t(locale, key);

  const columns = useMemo(() => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))), [rows]);
  const columnKinds = useMemo(() => Object.fromEntries(columns.map((column) => [column, classifyColumn(rows, column)])) as Record<string, ColumnKind>, [columns, rows]);
  const profile = useMemo(() => ({
    numeric: columns.filter((column) => columnKinds[column] === "numeric").length,
    categorical: columns.filter((column) => columnKinds[column] === "categorical").length,
    temporal: columns.filter((column) => columnKinds[column] === "temporal").length,
  }), [columnKinds, columns]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedLocale = localStorage.getItem("datavizlab-locale") as Locale | null;
        const savedTheme = localStorage.getItem("datavizlab-theme");
        if (savedLocale === "pt" || savedLocale === "en") setLocale(savedLocale);
        if (savedTheme) setDark(savedTheme === "dark");
        const project = localStorage.getItem("datavizlab-project");
        if (project) {
          const parsed = JSON.parse(project) as { rows?: DataRow[]; config?: ChartConfig; dataName?: string };
          if (parsed.rows?.length && parsed.rows.length <= 2000) setRows(parsed.rows);
          if (parsed.config) setConfig(parsed.config);
          if (parsed.dataName) setDataName(parsed.dataName);
        }
      } catch { /* local persistence is optional */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = locale === "pt" ? "pt-BR" : "en";
    localStorage.setItem("datavizlab-theme", dark ? "dark" : "light");
    localStorage.setItem("datavizlab-locale", locale);
  }, [dark, locale]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem("datavizlab-project", JSON.stringify({ rows: rows.slice(0, 2000), config, dataName })); } catch { /* quota may be exceeded */ }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [config, dataName, rows]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setDetail(null); setPasteOpen(false); setColumnModalOpen(false); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const filteredCatalog = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale === "pt" ? "pt-BR" : "en");
    return catalog.filter((entry) => {
      if (family !== "all" && entry.family !== family) return false;
      if (!needle) return true;
      const haystack = [entry.name.pt, entry.name.en, entry.what.pt, entry.what.en, entry.when.pt, entry.when.en, ...entry.aliases, ...entry.tags].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [family, locale, query]);

  const recommendations = useMemo(() => recommendationsByIntent[intent].map((id, index) => ({ entry: getEntry(id), score: Math.max(68, 96 - index * 8 + (intent === "time" && profile.temporal ? 3 : 0) + (intent === "relationship" && profile.numeric >= 2 ? 3 : 0)) })), [intent, profile]);

  const uniqueCategories = useMemo(() => new Set(rows.map((row) => String(row[config.xField] ?? ""))).size, [config.xField, rows]);
  const auditIssues = useMemo(() => {
    const issues: string[] = [];
    if (uniqueCategories > 18) issues.push(t(locale, "issueCategories"));
    if (["pie", "donut", "nightingale"].includes(config.chartId) && uniqueCategories > 5) issues.push(t(locale, "issuePie"));
    if (rows.some((row) => row[config.xField] == null || row[config.xField] === "" || row[config.yField] == null || row[config.yField] === "")) issues.push(t(locale, "issueMissing"));
    if (["pie", "donut", "treemap", "sunburst", "funnel"].includes(config.chartId) && rows.some((row) => Number(row[config.yField]) < 0)) issues.push(t(locale, "issueNegative"));
    if (!config.showLabels && ["pie", "donut", "funnel"].includes(config.chartId)) issues.push(t(locale, "issueLabels"));
    return issues;
  }, [config, rows, uniqueCategories, locale]);

  const ensureMappings = (newRows: DataRow[]) => {
    const nextColumns = Array.from(new Set(newRows.flatMap((row) => Object.keys(row))));
    const numeric = nextColumns.filter((column) => classifyColumn(newRows, column) === "numeric");
    const categorical = nextColumns.filter((column) => classifyColumn(newRows, column) === "categorical");
    setConfig((current) => ({ ...current, xField: categorical[0] ?? nextColumns[0] ?? "", yField: numeric[0] ?? nextColumns[1] ?? nextColumns[0] ?? "", seriesField: categorical[1] ?? "", sizeField: numeric[1] ?? "" }));
  };

  const loadRows = (newRows: DataRow[], name: string) => {
    if (!newRows.length) throw new Error("empty");
    setRows(newRows.slice(0, 50000));
    setDataName(name);
    ensureMappings(newRows);
    setToast(tr("imported"));
  };

  const handleFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) { setToast(tr("tooLarge")); return; }
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "json" || extension === "zip") {
        let text: string;
        if (extension === "zip") {
          const archive = await JSZip.loadAsync(await file.arrayBuffer());
          const projectFile = archive.file("project.json");
          if (!projectFile) throw new Error("project.json missing");
          text = await projectFile.async("string");
        } else {
          text = await file.text();
        }
        const parsed = JSON.parse(text) as { rows?: unknown[]; config?: Partial<ChartConfig>; dataName?: string } | unknown[];
        if (Array.isArray(parsed)) {
          loadRows(normalizeRows(parsed), file.name);
        } else if (parsed.rows?.length) {
          const projectRows = normalizeRows(parsed.rows);
          loadRows(projectRows, parsed.dataName || file.name);
          if (parsed.config) setConfig((current) => ({ ...current, ...parsed.config }));
        } else {
          throw new Error("invalid project");
        }
      } else if (extension === "csv" || extension === "tsv" || extension === "txt") {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, dynamicTyping: true, skipEmptyLines: "greedy" });
        loadRows(normalizeRows(parsed.data), file.name);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
        loadRows(normalizeRows(data), `${file.name} · ${workbook.SheetNames[0]}`);
      }
    } catch { setToast(tr("invalidFile")); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const importPaste = () => {
    if (!pasteValue.trim()) { setToast(tr("emptyPaste")); return; }
    const parsed = Papa.parse<Record<string, unknown>>(pasteValue, { header: true, dynamicTyping: true, skipEmptyLines: "greedy" });
    try { loadRows(normalizeRows(parsed.data), "tabela-colada.csv"); setPasteOpen(false); setPasteValue(""); } catch { setToast(tr("invalidFile")); }
  };

  const updateCell = (rowIndex: number, column: string, value: string) => setRows((current) => current.map((row, index) => index === rowIndex ? { ...row, [column]: columnKinds[column] === "numeric" && value !== "" && Number.isFinite(Number(value.replace(",", "."))) ? Number(value.replace(",", ".")) : value } : row));
  const removeRow = (rowIndex: number) => setRows((current) => current.filter((_, index) => index !== rowIndex));
  const addRow = () => setRows((current) => [...current, Object.fromEntries(columns.map((column) => [column, ""]))]);
  const openAddColumnModal = () => {
    setColumnInputName(`${locale === "pt" ? "Coluna" : "Column"}_${columns.length + 1}`);
    setColumnModalOpen(true);
  };
  const submitAddColumn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const defaultName = `${locale === "pt" ? "Coluna" : "Column"}_${columns.length + 1}`;
    let colName = columnInputName.trim() || defaultName;
    if (columns.includes(colName)) {
      let counter = 2;
      while (columns.includes(`${colName}_${counter}`)) counter++;
      colName = `${colName}_${counter}`;
    }
    setRows((current) => {
      if (current.length === 0) {
        return [{ [colName]: "" }];
      }
      return current.map((row) => ({ ...row, [colName]: "" }));
    });
    setColumnModalOpen(false);
    setColumnInputName("");
  };

  const pickChart = (entry: VizEntry, scroll = true) => {
    setConfig((current) => ({ ...current, chartId: entry.id, title: entry.name[locale] }));
    setDetail(null);
    if (scroll) window.setTimeout(() => document.querySelector("#studio")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
      const text = String(value ?? "");
      return [key, /^[=+@-]/.test(text) ? `'${text}` : value];
    })));
    zip.file("data.csv", Papa.unparse(safeRows));
    zip.file("project.json", JSON.stringify({ schemaVersion: 1, app: "DataVizLab", exportedAt: new Date().toISOString(), dataName, config, rows }, null, 2));
    zip.file("README.txt", locale === "pt" ? "Projeto exportado pelo DataVizLab. Importe project.json para reproduzir a configuração. Os dados foram processados localmente." : "Project exported by DataVizLab. Import project.json to reproduce the configuration. Data was processed locally.");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "datavizlab-project.zip"; anchor.click();
    URL.revokeObjectURL(url);
    setToast(tr("downloadReady"));
  };

  const copyDescription = async () => {
    await navigator.clipboard.writeText(chartRef.current?.getDescription() ?? "");
    setToast(tr("copied"));
  };

  const navItems = [["atlas", "navExplore"], ["chooser", "navChoose"], ["studio", "navCreate"], ["learn", "navLearn"]] as const;
  const intents: Array<[Intent, TranslationKey]> = [["comparison", "intentCompare"], ["distribution", "intentDistribution"], ["relationship", "intentRelationship"], ["time", "intentTime"], ["composition", "intentComposition"], ["flow", "intentFlow"]];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="DataVizLab home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span className="brand-text">
            <span className="brand-title">DataViz<span>Lab</span></span>
            <span className="brand-subtitle">{tr("scientataApp")}</span>
          </span>
        </a>
        <nav className={mobileNav ? "main-nav is-open" : "main-nav"} aria-label="Primary">
          {navItems.map(([href, key]) => <a key={href} href={`#${href}`} onClick={() => setMobileNav(false)}>{tr(key)}</a>)}
        </nav>
        <div className="header-actions">
          <button className="icon-button language-button" type="button" onClick={() => setLocale((value) => value === "pt" ? "en" : "pt")} aria-label={tr("language")} title={tr("language")}><Languages size={17} /><span>{locale.toUpperCase()}</span></button>
          <button className="icon-button" type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? tr("themeLight") : tr("themeDark")} title={dark ? tr("themeLight") : tr("themeDark")}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <a className="icon-button spark-button" href="https://scientata.com" target="_blank" rel="noreferrer" aria-label="Scientata" title="Scientata"><Sparkles size={17} /><span>Scientata</span></a>
          <button className="mobile-menu" type="button" onClick={() => setMobileNav((value) => !value)} aria-expanded={mobileNav} aria-label="Menu"><Grid3X3 size={19} /></button>
        </div>
      </header>

      <main id="main">
        <section id="top" className="hero section-pad">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow"><FlaskConical size={15} />{tr("eyebrow")}</p>
              <h1>{tr("heroTitleA")}<br /><em>{tr("heroTitleB")}</em></h1>
              <p className="hero-lead">{tr("heroText")}</p>
              <div className="hero-actions">
                <a className="button primary" href="#studio">{tr("openStudio")}<ArrowDownRight size={18} /></a>
                <a className="button ghost" href="#atlas">{tr("exploreAtlas")}<ArrowRight size={17} /></a>
              </div>
              <div className="privacy-pill"><span><LockKeyhole size={14} /></span><div><strong>{tr("localBadge")}</strong><small>{tr("localText")}</small></div></div>
            </div>
            <div className="hero-lab" aria-label={tr("labTitle")}>
              <div className="lab-header"><div><span className="signal-dot" />{tr("recommendation")}</div><span>R–01 / 96%</span></div>
              <div className="lab-visual">
                <div className="lab-axis y" /><div className="lab-axis x" />
                {[52, 76, 39, 87, 64, 92].map((height, i) => <div key={height} className="lab-bar" style={{ height: `${height}%`, left: `${12 + i * 14}%`, animationDelay: `${i * 80}ms` }}><i /><span>{[184, 238, 142, 286, 207, 262][i]}</span></div>)}
                <div className="lab-note"><Sparkles size={13} /><span>{locale === "pt" ? "Barras agrupadas distinguem as fontes sem ocultar o total por bairro." : "Grouped bars distinguish sources without hiding each district total."}</span></div>
              </div>
              <div className="lab-footer"><span>{tr("sample")}</span><a href="#chooser">{tr("why")} <ArrowRight size={14} /></a></div>
            </div>
          </div>
          <div className="hero-metrics">
            <div><strong>{catalog.length}</strong><span>{tr("catalogCount")}</span></div>
            <div><strong>10</strong><span>{tr("engineCount")}</span></div>
            <div><strong>5</strong><span>{tr("exportCount")}</span></div>
            <div className="metric-statement"><span className="line-symbol" />{tr("labText")}</div>
          </div>
        </section>

        <section id="atlas" className="section-pad atlas-section">
          <div className="section-heading split-heading">
            <div><p className="eyebrow">{tr("atlasEyebrow")}</p><h2>{tr("atlasTitle")}</h2></div>
            <p>{tr("atlasText")}</p>
          </div>
          <div className="atlas-tools">
            <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(24); }} placeholder={tr("search")} /><kbd>⌘ K</kbd></label>
            <label className="select-box"><span className="sr-only">Family</span><select value={family} onChange={(event) => { setFamily(event.target.value as VizFamily | "all"); setVisibleCount(24); }}><option value="all">{tr("allFamilies")}</option>{Object.entries(familyLabels).map(([id, label]) => <option key={id} value={id}>{label[locale]}</option>)}</select><ChevronDown size={16} /></label>
          </div>
          <div className="family-strip" role="list">
            <button className={family === "all" ? "active" : ""} onClick={() => setFamily("all")}>{tr("allFamilies")}<span>{catalog.length}</span></button>
            {(Object.keys(familyLabels) as VizFamily[]).map((id) => <button key={id} className={family === id ? "active" : ""} onClick={() => { setFamily(id); setVisibleCount(24); }}><i style={{ background: familyColors[id] }} />{familyLabels[id][locale]}<span>{catalog.filter((entry) => entry.family === id).length}</span></button>)}
          </div>
          <div className="atlas-count">{tr("showing")} <strong>{Math.min(visibleCount, filteredCatalog.length)}</strong> / {filteredCatalog.length} {tr("methods")}</div>
          <div className="catalog-grid">
            {filteredCatalog.slice(0, visibleCount).map((entry, index) => (
              <article className="viz-card" key={entry.id} style={{ "--family": familyColors[entry.family] } as React.CSSProperties}>
                <button className="card-hit" onClick={() => setDetail(entry)} aria-label={`${tr("details")}: ${entry.name[locale]}`} />
                <div className="card-meta"><span><i />{familyLabels[entry.family][locale]}</span><small>{String(index + 1).padStart(2, "0")}</small></div>
                <div className="mini-viz"><MiniViz entry={entry} index={index} /></div>
                <h3>{entry.name[locale]}</h3>
                <p>{entry.what[locale]}</p>
                <div className="card-foot"><span>{entry.complexity === "basic" ? (locale === "pt" ? "Essencial" : "Essential") : entry.complexity === "intermediate" ? (locale === "pt" ? "Intermediário" : "Intermediate") : (locale === "pt" ? "Avançado" : "Advanced")}</span><ArrowRight size={16} /></div>
              </article>
            ))}
          </div>
          {visibleCount < filteredCatalog.length && <div className="load-more"><button className="button ghost" onClick={() => setVisibleCount((count) => count + 24)}>{locale === "pt" ? "Carregar mais métodos" : "Load more methods"}<Plus size={17} /></button></div>}
        </section>

        <section id="chooser" className="section-pad chooser-section">
          <div className="section-heading split-heading">
            <div><p className="eyebrow">{tr("chooseEyebrow")}</p><h2>{tr("chooseTitle")}</h2></div>
            <p>{tr("chooseText")}</p>
          </div>
          <div className="chooser-grid">
            <div className="intent-panel panel">
              <div className="panel-label"><Lightbulb size={16} />{tr("intent")}</div>
              <div className="intent-list">
                {intents.map(([id, label], index) => <button key={id} className={intent === id ? "active" : ""} onClick={() => setIntent(id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{tr(label)}</strong><ArrowRight size={17} /></button>)}
              </div>
              <div className="profile-card"><span>{tr("datasetProfile")}</span><div><b>{rows.length}</b> {tr("rows")} · <b>{columns.length}</b> {tr("columns")}</div><ul><li><i className="numeric" />{profile.numeric} {tr("numeric")}</li><li><i className="categorical" />{profile.categorical} {tr("categorical")}</li><li><i className="temporal" />{profile.temporal} {tr("temporal")}</li></ul></div>
            </div>
            <div className="recommendation-panel panel">
              <div className="panel-label"><Sparkles size={16} />{tr("suggestions")}</div>
              <div className="recommendation-list">
                {recommendations.map(({ entry, score }, index) => <article key={entry.id} className={index === 0 ? "recommendation-card top" : "recommendation-card"}>
                  <div className="rec-rank">{String(index + 1).padStart(2, "0")}</div>
                  <div className="rec-mini"><MiniViz entry={entry} index={index + 3} /></div>
                  <div className="rec-content"><div><h3>{entry.name[locale]}</h3><span style={{ color: familyColors[entry.family] }}>{familyLabels[entry.family][locale]}</span></div><p>{entry.when[locale]}</p><div className="score"><i><span style={{ width: `${score}%` }} /></i><b>{score}% {tr("fit")}</b></div></div>
                  <div className="rec-actions"><button onClick={() => setDetail(entry)} aria-label={tr("learnMore")}><Info size={17} /></button><button onClick={() => pickChart(entry)} aria-label={tr("useInStudio")}><ArrowDownRight size={18} /></button></div>
                </article>)}
              </div>
            </div>
          </div>
        </section>

        <section id="studio" className="section-pad studio-section">
          <div className="section-heading split-heading">
            <div><p className="eyebrow">{tr("createEyebrow")}</p><h2>{tr("createTitle")}</h2></div>
            <p>{tr("createText")}</p>
          </div>
          <div className="studio-shell">
            <aside className="studio-sidebar">
              <div className="studio-tabs"><button className="active"><FileSpreadsheet size={15} />{tr("data")}</button><button><BarChart3 size={15} />{tr("visualization")}</button><button><ShieldCheck size={15} />{tr("audit")}</button></div>
              <div className="sidebar-scroll">
                <section className="control-group">
                  <div className="control-title"><span>01</span><strong>{tr("data")}</strong></div>
                  <input ref={fileRef} className="hidden-input" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.json,.zip" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
                  <button className="upload-zone" onClick={() => fileRef.current?.click()}><span><Upload size={20} /></span><strong>{tr("upload")}</strong><small>{tr("fileHint")}</small></button>
                  <div className="mini-actions"><button onClick={() => setPasteOpen(true)}><Clipboard size={15} />{tr("paste")}</button><button onClick={() => { setRows(sampleRows); setDataName("energia-comunitaria.csv"); setConfig(defaultConfig(locale)); }}><Sparkles size={15} />{tr("sampleData")}</button></div>
                  <div className="data-file"><FileSpreadsheet size={18} /><div><strong>{dataName}</strong><span>{rows.length} {tr("rows")} · {columns.length} {tr("columns")}</span></div><Check size={16} /></div>
                </section>
                <section className="control-group">
                  <div className="control-title"><span>02</span><strong>{tr("visualization")}</strong></div>
                  <label className="field-label">{tr("type")}<select value={config.chartId} onChange={(event) => setConfig((current) => ({ ...current, chartId: event.target.value, title: getEntry(event.target.value).name[locale] }))}>{(Object.keys(chartIdsByFamily) as VizFamily[]).map((familyId) => <optgroup key={familyId} label={familyLabels[familyId][locale]}>{chartIdsByFamily[familyId]?.map((id) => <option key={id} value={id}>{getEntry(id).name[locale]}</option>)}</optgroup>)}</select></label>
                </section>
                <section className="control-group">
                  <div className="control-title"><span>03</span><strong>{tr("mapping")}</strong></div>
                  {([["xField", "xField"], ["yField", "yField"], ["seriesField", "seriesField"], ["sizeField", "sizeField"]] as Array<[keyof ChartConfig, TranslationKey]>).map(([field, label]) => <label key={field} className="field-label">{tr(label)}<select value={String(config[field])} onChange={(event) => setConfig((current) => ({ ...current, [field]: event.target.value }))}>{(field === "seriesField" || field === "sizeField") && <option value="">{tr("none")}</option>}{columns.map((column) => <option key={column} value={column}>{column} · {tr(columnKinds[column])}</option>)}</select></label>)}
                </section>
                <section className="control-group">
                  <div className="control-title"><span>04</span><strong>{locale === "pt" ? "Apresentação" : "Presentation"}</strong></div>
                  <label className="field-label">{tr("chartTitle")}<input value={config.title} onChange={(event) => setConfig((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label className="field-label">{tr("chartSubtitle")}<input value={config.subtitle} onChange={(event) => setConfig((current) => ({ ...current, subtitle: event.target.value }))} /></label>
                  <label className="toggle-row"><span><strong>{tr("showLabels")}</strong><small>{locale === "pt" ? "Valores próximos às marcas" : "Values close to marks"}</small></span><input type="checkbox" checked={config.showLabels} onChange={(event) => setConfig((current) => ({ ...current, showLabels: event.target.checked }))} /></label>
                  <label className="toggle-row"><span><strong>{tr("accessiblePatterns")}</strong><small>{locale === "pt" ? "Redundância além da cor" : "Redundancy beyond color"}</small></span><input type="checkbox" checked={config.patterns} onChange={(event) => setConfig((current) => ({ ...current, patterns: event.target.checked }))} /></label>
                </section>
              </div>
            </aside>
            <div className="studio-main">
              <div className="preview-toolbar"><div><span className="signal-dot" />{tr("preview")}<small>{getEntry(config.chartId).name[locale]}</small></div><div><button onClick={() => chartRef.current?.exportImage("png")}><Download size={15} />{tr("exportPng")}</button><button onClick={() => chartRef.current?.exportImage("svg")}><Download size={15} />{tr("exportSvg")}</button><button onClick={downloadProject}><FileArchive size={15} />{tr("exportProject")}</button></div></div>
              <div className="preview-stage"><ChartRenderer ref={chartRef} rows={rows} config={config} dark={dark} locale={locale} className="chart-canvas" /></div>
              <div className="preview-bottom">
                <div className={auditIssues.length ? "audit-card has-issues" : "audit-card good"}><span>{auditIssues.length ? <CircleAlert size={20} /> : <ShieldCheck size={20} />}</span><div><strong>{tr("auditTitle")}</strong>{auditIssues.length ? <ul>{auditIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>{tr("auditGoodText")}</p>}</div><b>{auditIssues.length ? auditIssues.length : <Check size={16} />}</b></div>
                <button className="description-button" onClick={copyDescription}><Clipboard size={17} /><span><strong>{tr("copyDescription")}</strong><small>{locale === "pt" ? "Texto alternativo gerado localmente" : "Alt text generated locally"}</small></span></button>
              </div>
            </div>
          </div>

          <div className="table-panel">
            <div className="table-header"><div><Table2 size={19} /><span><strong>{tr("tableEditor")}</strong><small>{tr("tableHint")}</small></span></div><div><button onClick={addRow}><Plus size={15} />{tr("addRow")}</button><button onClick={openAddColumnModal}><Plus size={15} />{tr("addColumn")}</button><button className="danger" onClick={() => { setRows([]); localStorage.removeItem("datavizlab-project"); }}><Trash2 size={15} />{tr("clear")}</button></div></div>
            <div className="data-table-wrap">
              <table className="data-table"><thead><tr><th>#</th>{columns.map((column) => <th key={column}><span>{column}</span><small>{tr(columnKinds[column])}</small></th>)}<th /></tr></thead><tbody>{rows.slice(0, 120).map((row, rowIndex) => <tr key={rowIndex}><td>{rowIndex + 1}</td>{columns.map((column) => <td key={column}><input aria-label={`${column}, row ${rowIndex + 1}`} value={String(row[column] ?? "")} onChange={(event) => updateCell(rowIndex, column, event.target.value)} /></td>)}<td><button onClick={() => removeRow(rowIndex)} aria-label={`Remove row ${rowIndex + 1}`}><X size={14} /></button></td></tr>)}</tbody></table>
              {rows.length > 120 && <div className="table-limit">+ {rows.length - 120} {tr("rows")} · {locale === "pt" ? "prévia limitada para manter a edição fluida" : "preview limited to keep editing responsive"}</div>}
            </div>
          </div>

          <div className="privacy-banner"><span><LockKeyhole size={24} /></span><div><strong>{tr("privacyTitle")}</strong><p>{tr("privacyText")}</p></div><ShieldCheck size={31} /></div>
        </section>

        <section id="learn" className="section-pad learn-section">
          <div className="section-heading split-heading"><div><p className="eyebrow">{tr("learnEyebrow")}</p><h2>{tr("learnTitle")}</h2></div><p>{tr("learnText")}</p></div>
          <div className="learning-grid">
            {[["01", "caveatAxis", "caveatAxisText"], ["02", "caveatColor", "caveatColorText"], ["03", "caveatData", "caveatDataText"]].map(([number, title, text], index) => <article key={number}><div className={`lesson-visual lesson-${index + 1}`}><span>{number}</span>{index === 0 ? <><i /><i /><i /></> : index === 1 ? <><b /><b /><b /><b /><b /></> : <><em>RAW</em><ArrowRight size={18} /><em>VIEW</em></>}</div><h3>{tr(title as TranslationKey)}</h3><p>{tr(text as TranslationKey)}</p><a href="#atlas">{tr("learnMore")}<ArrowRight size={15} /></a></article>)}
          </div>
          <div className="principles"><div><span>DataVizLab / 04</span><h3>{tr("principles")}</h3></div><ol>{["principle1", "principle2", "principle3", "principle4"].map((key, i) => <li key={key}><span>0{i + 1}</span>{tr(key as TranslationKey)}<Check size={16} /></li>)}</ol></div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><a className="brand" href="#top"><span className="brand-mark"><span /><span /><span /></span><span className="brand-text"><span className="brand-title">DataViz<span>Lab</span></span><span className="brand-subtitle">{tr("scientataApp")}</span></span></a><p>{tr("footerText")}</p></div>
        <div className="footer-links">{navItems.map(([href, key]) => <a key={href} href={`#${href}`}>{tr(key)}</a>)}</div>
        <div className="footer-credit"><span><a href="https://scientata.com" target="_blank" rel="noreferrer">{tr("scientataApp")}</a></span><small>© {new Date().getFullYear()} · DataVizLab</small></div>
      </footer>

      <a className="coffee-button" href="https://link.mercadopago.com.br/strangerhits" target="_blank" rel="noreferrer" aria-label={tr("coffee")}><span><Coffee size={22} /></span><b>{tr("coffee")}</b><i /></a>

      {detail && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="modal-close" onClick={() => setDetail(null)} aria-label={tr("close")}><X size={19} /></button><div className="detail-top" style={{ "--family": familyColors[detail.family] } as React.CSSProperties}><div><span><i />{familyLabels[detail.family][locale]}</span><h2 id="detail-title">{detail.name[locale]}</h2><p>{detail.aliases.join(" · ")}</p></div><div className="detail-viz"><MiniViz entry={detail} index={catalog.indexOf(detail)} /></div></div><div className="detail-body"><p className="detail-definition">{detail.what[locale]}</p><div className="detail-grid"><article><Check size={18} /><div><h3>{tr("when")}</h3><p>{detail.when[locale]}</p></div></article><article className="warning"><CircleAlert size={18} /><div><h3>{tr("avoid")}</h3><p>{detail.avoid[locale]}</p></div></article><article><Table2 size={18} /><div><h3>{tr("fields")}</h3><code>{detail.fields[locale]}</code></div></article><article><BarChart3 size={18} /><div><h3>{locale === "pt" ? "Família e nível" : "Family & level"}</h3><p>{familyLabels[detail.family][locale]} · {detail.complexity}</p></div></article></div><div className="detail-actions"><button className="button primary" onClick={() => pickChart(detail)}>{tr("useInStudio")}<ArrowDownRight size={18} /></button><button className="button ghost" onClick={() => setDetail(null)}>{tr("close")}</button></div></div></section></div>}

      {pasteOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasteOpen(false); }}><section className="paste-modal" role="dialog" aria-modal="true" aria-labelledby="paste-title"><button className="modal-close" onClick={() => setPasteOpen(false)} aria-label={tr("close")}><X size={19} /></button><div><p className="eyebrow"><Clipboard size={14} />DataVizLab / Paste</p><h2 id="paste-title">{tr("pasteTitle")}</h2><p>{tr("pasteHelp")}</p></div><textarea autoFocus value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder={'Categoria,Valor\nA,32\nB,48'} /><div className="detail-actions"><button className="button primary" onClick={importPaste}>{tr("importData")}<ArrowDownRight size={18} /></button><button className="button ghost" onClick={() => setPasteOpen(false)}>{tr("cancel")}</button></div></section></div>}

      {columnModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setColumnModalOpen(false); }}><section className="paste-modal column-modal" role="dialog" aria-modal="true" aria-labelledby="column-modal-title"><button className="modal-close" onClick={() => setColumnModalOpen(false)} aria-label={tr("close")}><X size={19} /></button><form onSubmit={submitAddColumn}><div><p className="eyebrow"><Table2 size={14} />DataVizLab / Table</p><h2 id="column-modal-title">{tr("addColumnTitle")}</h2><p>{tr("addColumnDesc")}</p></div><label className="field-label" style={{ marginTop: 18 }}>{tr("newColumnPrompt")}<input autoFocus value={columnInputName} onChange={(event) => setColumnInputName(event.target.value)} placeholder={tr("columnNamePlaceholder")} className="column-modal-input" /></label><div className="detail-actions" style={{ marginTop: 22 }}><button type="submit" className="button primary">{tr("addColumn")}<ArrowDownRight size={18} /></button><button type="button" className="button ghost" onClick={() => setColumnModalOpen(false)}>{tr("cancel")}</button></div></form></section></div>}

      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}
