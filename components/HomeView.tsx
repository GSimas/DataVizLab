import { ArrowDown, ArrowUpRight } from "lucide-react";
import { routeHref, type AppApi } from "./app";

export function HomeView({ api }: { api: AppApi }) {
  const { tr, projects } = api;
  const recent = projects.length ? [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : null;

  return (
    <section className="home-hero">
      <div className="hero-field" aria-hidden="true">
        <span className="crosshair" />
        <span className="hud hud-tl">DVL / 001</span>
        <span className="hud hud-tr">27°35′S — 48°32′W</span>
        <span className="data-tag tag-a">n = local</span>
        <span className="data-tag tag-b">r = 0.96 ↗</span>
      </div>
      <div className="home-copy">
        <p className="eyebrow"><span />{tr("homeEyebrow")}</p>
        <h1>{tr("heroTitleA")} <em>{tr("heroTitleB")}</em></h1>
        <p className="home-lead">{tr("heroText")}</p>
        <div className="home-actions" data-tour="home-actions">
          <a className="button button-primary" href={routeHref({ view: "projects" })}>{tr("ctaProjects")}<ArrowDown size={16} /></a>
          <a className="launch-link" href={routeHref({ view: "catalog" })}>{tr("ctaCatalog")}<span><ArrowUpRight size={15} /></span></a>
        </div>
        {recent && (
          <a className="continue-link" href={routeHref({ view: "studio", id: recent.id })}>
            <span>{tr("continueProject")}</span><strong>{recent.name}</strong><ArrowUpRight size={14} />
          </a>
        )}
      </div>
      <ul className="status-row" aria-label="Status">
        <li><i />{tr("statusLocal")}</li>
        <li><i />{tr("statusNoUpload")}</li>
        <li><i />{tr("statusOffline")}</li>
      </ul>
    </section>
  );
}
