import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { Locale } from "../lib/catalog";
import { motionReduced, usePresence } from "../lib/motion";
import { createProject, type Project } from "../lib/projects";
import { TOUR_DONE_KEY, tourSteps } from "../lib/tour";
import type { Route } from "./app";
import { Portal } from "./ui/floating";

type Props = {
  active: boolean;
  onClose: () => void;
  locale: Locale;
  route: Route;
  getProjects: () => Project[];
  addProject: (project: Project) => void;
  navigate: (route: Route) => void;
};

const labels = {
  pt: { next: "Próximo", prev: "Anterior", finish: "Concluir", skip: "Pular tour", label: "Tutorial guiado", sample: "Tour · Energia comunitária" },
  en: { next: "Next", prev: "Back", finish: "Finish", skip: "Skip tour", label: "Guided tour", sample: "Tour · Community energy" },
};

const PAD = 8;

/** Guided walkthrough: moves between screens and spotlights one element per step. */
export function Tour({ active, onClose, locale, route, getProjects, addProject, navigate }: Props) {
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const { mounted, closing } = usePresence(active);
  const spotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const direction = useRef(1);
  const step = tourSteps[index];
  const t = labels[locale];

  const finish = useCallback(() => {
    try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch { /* optional */ }
    onClose();
  }, [onClose]);

  // Flag the document while the tour runs (page transitions are skipped meanwhile).
  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.tour = "on";
    return () => { delete document.documentElement.dataset.tour; };
  }, [active]);

  // Reset to the first step each time the tour starts.
  useEffect(() => {
    if (!active) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- restart from step one */
    setIndex(0);
    direction.current = 1;
  }, [active]);

  // Bring the step's screen up, then wait for its target element.
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let frame = 0;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- hide the card while the next target is located */
    setReady(false);
    targetRef.current = null;

    if (step.view === "studio") {
      const projects = [...getProjects()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      let project = projects.find((item) => item.rows.length) ?? projects[0];
      if (!project) { project = { ...createProject({ name: t.sample, locale, withSample: true }) }; addProject(project); }
      if (route.view !== "studio" || route.id !== project.id) navigate({ view: "studio", id: project.id });
    } else if (step.view && route.view !== step.view) {
      navigate({ view: step.view });
    }

    if (!step.target) { setReady(true); return; }
    const started = performance.now();
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(step.target!);
      if (el && el.getBoundingClientRect().width > 0) {
        targetRef.current = el;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: motionReduced() ? "instant" : "smooth" });
        setReady(true);
        return;
      }
      if (performance.now() - started > 2500) {
        // Missing on this screen (e.g. no projects yet): move on in the same direction.
        setIndex((current) => Math.min(tourSteps.length - 1, Math.max(0, current + direction.current)));
        return;
      }
      frame = requestAnimationFrame(find);
    };
    frame = requestAnimationFrame(find);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per step only
  }, [active, index]);

  // Follow the target every frame (scrolling, layout changes, animations).
  useEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const loop = () => {
      const spot = spotRef.current;
      const card = cardRef.current;
      const el = targetRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (spot) {
        if (el && ready) {
          const r = el.getBoundingClientRect();
          spot.style.transform = `translate(${r.left - PAD}px, ${r.top - PAD}px)`;
          spot.style.width = `${r.width + PAD * 2}px`;
          spot.style.height = `${r.height + PAD * 2}px`;
          spot.style.opacity = "1";
          if (card) {
            const cw = card.offsetWidth;
            const ch = card.offsetHeight;
            const gap = PAD + 14;
            const clampTop = (value: number) => Math.min(Math.max(12, value), vh - ch - 12);
            const centeredLeft = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
            // Prefer below, then above, then beside the target; never on top of it if avoidable.
            let top: number;
            let left: number;
            if (r.bottom + gap + ch < vh - 12) { top = r.bottom + gap; left = centeredLeft; }
            else if (r.top - gap - ch > 12) { top = r.top - gap - ch; left = centeredLeft; }
            else if (r.right + gap + cw < vw - 12) { top = clampTop(r.top); left = r.right + gap; }
            else if (r.left - gap - cw > 12) { top = clampTop(r.top); left = r.left - gap - cw; }
            else { top = vh - ch - 12; left = centeredLeft; }
            if (vw < 640) { top = vh - ch - 12; left = 12; }
            card.style.transform = `translate(${left}px, ${top}px)`;
          }
        } else {
          spot.style.transform = `translate(${vw / 2}px, ${vh / 2}px)`;
          spot.style.width = "0px";
          spot.style.height = "0px";
          spot.style.opacity = step?.target ? "0" : "1";
          if (card) card.style.transform = `translate(${Math.max(12, (vw - card.offsetWidth) / 2)}px, ${Math.max(12, (vh - card.offsetHeight) / 2)}px)`;
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [mounted, ready, step]);

  const go = useCallback((delta: number) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= tourSteps.length) { finish(); return; }
    direction.current = delta;
    setIndex(next);
  }, [index, finish]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, go, finish]);

  useEffect(() => {
    if (ready) cardRef.current?.querySelector<HTMLElement>(".tour-next")?.focus({ preventScroll: true });
  }, [ready, index]);

  if (!mounted || !step) return null;
  const last = index === tourSteps.length - 1;
  return (
    <Portal>
      <div className="tour" data-state={closing ? "closed" : "open"}>
        <div className="tour-blocker" onClick={(event) => event.stopPropagation()} />
        <div ref={spotRef} className="tour-spot" aria-hidden="true" />
        <div ref={cardRef} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" data-ready={ready || undefined}>
          <div key={step.id} className="tour-content">
            <p className="tour-meta"><span>{t.label}</span><span>{String(index + 1).padStart(2, "0")} / {String(tourSteps.length).padStart(2, "0")}</span></p>
            <h2 id="tour-title">{step.title[locale]}</h2>
            <p id="tour-body">{step.body[locale]}</p>
          </div>
          <div className="tour-progress" aria-hidden="true"><i style={{ transform: `scaleX(${(index + 1) / tourSteps.length})` }} /></div>
          <div className="tour-actions">
            <button type="button" className="tour-skip" onClick={finish}><X size={13} />{t.skip}</button>
            <span>
              {index > 0 && <button type="button" className="button button-quiet" onClick={() => go(-1)}><ArrowLeft size={15} />{t.prev}</button>}
              <button type="button" className="button button-primary tour-next" onClick={() => go(1)}>{last ? t.finish : t.next}{last ? <Check size={15} /> : <ArrowRight size={15} />}</button>
            </span>
          </div>
        </div>
      </div>
    </Portal>
  );
}
