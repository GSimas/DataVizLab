import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Compass, Moon, RotateCcw, Settings2, Sun } from "lucide-react";
import type { TranslationKey } from "../lib/i18n";
import { usePresence } from "../lib/motion";
import { defaultPrefs, type Prefs } from "../lib/prefs";
import { Segmented, Switch } from "./ui/Controls";
import { useOutsidePress } from "./ui/floating";

type Props = { prefs: Prefs; onChange: (next: Partial<Prefs>) => void; tr: (key: TranslationKey) => string; onStartTour: () => void };

export function SettingsMenu({ prefs, onChange, tr, onStartTour }: Props) {
  const [open, setOpen] = useState(false);
  const { mounted, closing } = usePresence(open);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const refs = useMemo(() => [triggerRef, panelRef], []);
  useOutsidePress(refs, open, useCallback(() => setOpen(false), []));

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const defaults = defaultPrefs();
  const isDefault = (Object.keys(defaults) as Array<keyof Prefs>).every((key) => prefs[key] === defaults[key]);

  return (
    <div className="settings" data-tour="settings">
      <button ref={triggerRef} type="button" className="round-button settings-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={tr("settings")} data-tip={open ? undefined : tr("settings")} onClick={() => setOpen((value) => !value)}>
        <Settings2 size={16} />
      </button>
      {mounted && (
        <div ref={panelRef} className="popover settings-panel" data-state={closing ? "closed" : "open"} role="dialog" aria-labelledby={titleId}>
          <p className="kicker" id={titleId}>{tr("settings")}</p>
          <Segmented label={tr("language")} value={prefs.locale} onChange={(locale) => onChange({ locale })} options={[{ value: "pt", label: "Português" }, { value: "en", label: "English" }]} />
          <Segmented label={tr("theme")} value={prefs.theme} onChange={(theme) => onChange({ theme })} options={[{ value: "dark", label: <><Moon size={14} />{tr("themeDarkLabel")}</> }, { value: "light", label: <><Sun size={14} />{tr("themeLightLabel")}</> }]} />
          <Segmented label={tr("textSize")} value={prefs.fontSize} onChange={(fontSize) => onChange({ fontSize })} options={[
            { value: "sm", label: <span className="size-glyph size-sm">A</span>, ariaLabel: tr("sizeSmall") },
            { value: "md", label: <span className="size-glyph size-md">A</span>, ariaLabel: tr("sizeMedium") },
            { value: "lg", label: <span className="size-glyph size-lg">A</span>, ariaLabel: tr("sizeLarge") },
          ]} />
          <div className="settings-switches">
            <Switch label={tr("contrast")} hint={tr("contrastHint")} checked={prefs.contrast === "high"} onChange={(checked) => onChange({ contrast: checked ? "high" : "normal" })} />
            <Switch label={tr("reducedMotion")} hint={tr("reducedMotionHint")} checked={prefs.motion === "reduced"} onChange={(checked) => onChange({ motion: checked ? "reduced" : "full" })} />
          </div>
          <div className="settings-foot">
            <button type="button" className="settings-tour" onClick={() => { setOpen(false); onStartTour(); }}><Compass size={14} />{tr("tourStartSettings")}</button>
            <button type="button" className="settings-reset" disabled={isDefault} onClick={() => onChange(defaults)}><RotateCcw size={13} />{tr("resetPrefs")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
