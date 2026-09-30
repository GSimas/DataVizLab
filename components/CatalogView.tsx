import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, Check, CircleAlert, Plus, Search, Table2 } from "lucide-react";
import { catalog, familyColors, familyLabels, type VizEntry, type VizFamily } from "../lib/catalog";
import type { TranslationKey } from "../lib/i18n";
import type { AppApi } from "./app";
import { MiniViz } from "./MiniViz";
import { Modal } from "./Modal";

const PAGE = 24;
const complexityKey: Record<VizEntry["complexity"], TranslationKey> = { basic: "essential", intermediate: "intermediate", advanced: "advanced" };

export function CatalogView({ api, onUseChart }: { api: AppApi; onUseChart: (entry: VizEntry) => void }) {
  const { tr, locale } = api;
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<VizFamily | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [detail, setDetail] = useState<VizEntry | null>(null);
  // The field answers every keystroke at once; the filtered grid follows right after, at lower priority.
  const search = useDeferredValue(query);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale === "pt" ? "pt-BR" : "en");
    return catalog.filter((entry) => {
      if (family !== "all" && entry.family !== family) return false;
      if (!needle) return true;
      return [entry.name.pt, entry.name.en, entry.what.pt, entry.what.en, entry.when.pt, entry.when.en, ...entry.aliases, ...entry.tags].join(" ").toLowerCase().includes(needle);
    });
  }, [family, locale, search]);

  return (
    <>
      <section className="page catalog-page">
        <header className="page-head">
          <div>
            <p className="kicker">{tr("atlasEyebrow")}</p>
            <h1 className="page-title">{tr("atlasTitleA")} <em>{tr("atlasTitleB")}</em></h1>
            <p className="page-lead">{tr("atlasText")}</p>
          </div>
        </header>

        <div className="catalog-tools" data-tour="catalog-tools">
        <div className="toolbar-row">
          <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE); }} placeholder={tr("search")} aria-label={tr("search")} /></label>
          <span className="count-label">{tr("showing")} {Math.min(visibleCount, filtered.length)} / {filtered.length} {tr("methods")}</span>
        </div>
        <div className="filter-pills" role="group" aria-label="Filters">
          <button type="button" className={family === "all" ? "is-active" : ""} onClick={() => { setFamily("all"); setVisibleCount(PAGE); }}>{tr("allFamilies")}<span>{catalog.length}</span></button>
          {(Object.keys(familyLabels) as VizFamily[]).map((id) => (
            <button key={id} type="button" className={family === id ? "is-active" : ""} onClick={() => { setFamily(id); setVisibleCount(PAGE); }}>
              <i style={{ background: familyColors[id] }} />{familyLabels[id][locale]}<span>{catalog.filter((entry) => entry.family === id).length}</span>
            </button>
          ))}
        </div>
        </div>

        <div className="catalog-grid" data-tour="catalog-grid">
          {filtered.slice(0, visibleCount).map((entry, index) => (
            <article className="viz-card" key={entry.id} style={{ "--i": Math.min(index % PAGE, 12), "--dot": familyColors[entry.family] } as React.CSSProperties}>
              <button className="card-hit" type="button" onClick={() => setDetail(entry)} aria-label={`${tr("details")}: ${entry.name[locale]}`} />
              <p className="card-meta"><span style={{ "--dot": familyColors[entry.family] } as React.CSSProperties}>{familyLabels[entry.family][locale]}</span><small>{String(index + 1).padStart(2, "0")}</small></p>
              <div className="mini-viz"><MiniViz entry={entry} dark={api.dark} locale={locale} /></div>
              <h3>{entry.name[locale]}</h3>
              <p>{entry.what[locale]}</p>
              <footer className="card-foot"><span>{tr(complexityKey[entry.complexity])}</span><ArrowRight size={15} /></footer>
            </article>
          ))}
        </div>
        {visibleCount < filtered.length && <div className="load-more"><button className="button button-outline" type="button" onClick={() => setVisibleCount((count) => count + PAGE)}>{tr("loadMore")}<Plus size={16} /></button></div>}
      </section>

      <section className="learn-band">
        <div className="learn-head">
          <p className="kicker">{tr("learnEyebrow")}</p>
          <h2 className="page-title">{tr("learnTitleA")} <em>{tr("learnTitleB")}</em></h2>
        </div>
        <ol className="learn-list">
          {([["caveatAxis", "caveatAxisText"], ["caveatColor", "caveatColorText"], ["caveatData", "caveatDataText"]] as const).map(([title, text], index) => (
            <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{tr(title)}</h3><p>{tr(text)}</p></div></li>
          ))}
        </ol>
      </section>

      {detail && (
        <Modal onClose={() => setDetail(null)} labelledBy="detail-title" closeLabel={tr("close")} className="detail-modal">
          {(close) => <>
          <div className="detail-top">
            <div>
              <p className="card-meta"><span style={{ "--dot": familyColors[detail.family] } as React.CSSProperties}>{familyLabels[detail.family][locale]}</span></p>
              <h2 id="detail-title" className="modal-title">{detail.name[locale]}</h2>
              <p className="detail-aliases">{detail.aliases.join(" · ")}</p>
            </div>
            <div className="detail-viz"><MiniViz entry={detail} dark={api.dark} locale={locale} /></div>
          </div>
          <p className="detail-definition">{detail.what[locale]}</p>
          <div className="detail-grid">
            <article><Check size={17} /><div><h3>{tr("when")}</h3><p>{detail.when[locale]}</p></div></article>
            <article className="warning"><CircleAlert size={17} /><div><h3>{tr("avoid")}</h3><p>{detail.avoid[locale]}</p></div></article>
            <article><Table2 size={17} /><div><h3>{tr("fields")}</h3><code>{detail.fields[locale]}</code></div></article>
            <article><BarChart3 size={17} /><div><h3>{tr("familyLevel")}</h3><p>{familyLabels[detail.family][locale]} · {tr(complexityKey[detail.complexity])}</p></div></article>
          </div>
          <div className="modal-actions">
            <button className="button button-primary" type="button" onClick={() => { onUseChart(detail); setDetail(null); }}>{tr("useInProject")}<ArrowUpRight size={16} /></button>
            <button className="button button-quiet" type="button" onClick={close}>{tr("close")}</button>
          </div>
          </>}
        </Modal>
      )}
    </>
  );
}
