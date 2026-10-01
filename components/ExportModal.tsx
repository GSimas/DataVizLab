import { useEffect, useState } from "react";
import { ArrowDownToLine, FileArchive, FileImage, Image as ImageIcon, PenTool } from "lucide-react";
import type { Locale } from "../lib/catalog";
import type { TranslationKey } from "../lib/i18n";
import { renderRaster, runExport, type ExportFormat, type ExportLook } from "../lib/export";
import { rowsForViz, type Project, type Visualization } from "../lib/projects";
import { Modal } from "./Modal";
import { Segmented } from "./ui/Controls";

type Props = {
  project: Project;
  viz: Visualization;
  size: { width: number; height: number };
  dark: boolean;
  contrast: boolean;
  fontScale: number;
  locale: Locale;
  tr: (key: TranslationKey) => string;
  notify: (message: string) => void;
  onClose: () => void;
};

const formats: Array<{ id: ExportFormat; icon: typeof PenTool; title: TranslationKey; hint: TranslationKey }> = [
  { id: "svg", icon: PenTool, title: "exportSvgTitle", hint: "exportSvgHint" },
  { id: "jpg", icon: FileImage, title: "exportJpgTitle", hint: "exportJpgHint" },
  { id: "png", icon: ImageIcon, title: "exportPngTitle", hint: "exportPngHint" },
  { id: "project", icon: FileArchive, title: "exportProjectTitle", hint: "exportProjectHint" },
];

/** One export entry point: format, colors and a live preview of the result. */
export function ExportModal({ project, viz, size, dark, contrast, fontScale, locale, tr, notify, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>("svg");
  const [theme, setTheme] = useState<"dark" | "light">(dark ? "dark" : "light");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const hasData = rowsForViz(project, viz).length > 0;
  const look: ExportLook = { dark: theme === "dark", contrast, fontScale, width: Math.max(480, Math.round(size.width)), height: Math.max(320, Math.round(size.height)), locale };
  const lookKey = `${theme}-${contrast}-${fontScale}-${look.width}-${look.height}`;

  // Small raster preview of what will be exported (transparency shown on a checkerboard).
  useEffect(() => {
    if (!hasData) return;
    const frame = requestAnimationFrame(() => {
      try { setPreview(renderRaster(project, viz, look, "png", format === "png", 0.6)); } catch { setPreview(""); }
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookKey captures every field of `look`
  }, [project, viz, format, lookKey, hasData]);

  const run = async (close: () => void) => {
    setBusy(true);
    try {
      await runExport(format, project, viz, look, locale);
      notify(tr("downloadReady"));
      close();
    } catch {
      notify(tr("exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="export-title" closeLabel={tr("close")} className="export-modal">
      {(close) => (
        <>
          <p className="kicker">{tr("export")}</p>
          <h2 id="export-title" className="modal-title">{tr("exportTitle")}</h2>
          <p className="modal-lead">{viz.title || viz.chartId} · {project.name}</p>
          <div className="export-layout">
            <div className="export-options" role="radiogroup" aria-labelledby="export-title">
              {formats.map(({ id, icon: Icon, title, hint }) => {
                const disabled = !hasData && id !== "project";
                return (
                  <button key={id} type="button" role="radio" aria-checked={format === id} disabled={disabled} className={format === id ? "export-option is-active" : "export-option"} onClick={() => setFormat(id)}>
                    <span className="export-icon"><Icon size={18} /></span>
                    <span><strong>{tr(title)}</strong><small>{tr(hint)}</small></span>
                  </button>
                );
              })}
            </div>
            <div className="export-side">
              <div className={format === "png" ? "export-preview is-transparent" : "export-preview"}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL preview, nothing to optimize */}
                {hasData && preview ? <img src={preview} alt={tr("exportPreview")} /> : <span>{tr("noData")}</span>}
              </div>
              {format !== "project" || hasData ? (
                <Segmented label={tr("exportColors")} value={theme} onChange={setTheme} options={[{ value: "light", label: tr("themeLightLabel") }, { value: "dark", label: tr("themeDarkLabel") }]} />
              ) : null}
              <p className="export-meta">{format === "project" ? tr("exportProjectMeta") : `${look.width} × ${look.height}px${format === "svg" ? "" : " · 2×"}`}</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button button-primary" type="button" disabled={busy} onClick={() => run(close)}>{busy ? tr("exporting") : tr("exportAction")}<ArrowDownToLine size={16} /></button>
            <button className="button button-quiet" type="button" onClick={close}>{tr("cancel")}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
