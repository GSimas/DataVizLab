import { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Sheet } from "../lib/projects";

type Props = {
  sheets: Sheet[];
  activeId: string;
  label: string;
  renameHint: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** "bottom": tabs under the editable table, like a spreadsheet program. "bar": the sheet bar above the visualizations, with row counts. */
  variant?: "bottom" | "bar";
  /** The "+" button after the tabs (bottom variant). */
  onAdd?: () => void;
  addLabel?: string;
  rowsLabel?: string;
};

/** The sheets of a project as tabs. Arrow keys move between tabs; double click (or F2) renames the open one. */
export function SheetTabs({ sheets, activeId, label, renameHint, onSelect, onRename, variant = "bottom", onAdd, addLabel, rowsLabel }: Props) {
  const base = useId();
  const [renaming, setRenaming] = useState<string | null>(null);
  const cancelled = useRef(false);

  const onKey = (event: React.KeyboardEvent) => {
    if (renaming) return;
    if (event.key === "F2") { event.preventDefault(); setRenaming(activeId); return; }
    const index = sheets.findIndex((sheet) => sheet.id === activeId);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: sheets.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const id = sheets[(target + sheets.length) % sheets.length].id;
    onSelect(id);
    document.getElementById(`${base}-${id}`)?.focus();
  };

  const commit = (id: string, value: string) => {
    if (!cancelled.current && value.trim()) onRename(id, value.trim());
    cancelled.current = false;
    setRenaming(null);
    // The tab was replaced by the input while renaming; give focus back to it.
    requestAnimationFrame(() => document.getElementById(`${base}-${id}`)?.focus());
  };

  const tablist = (
    <div className="sheet-tablist" role="tablist" aria-label={label} onKeyDown={onKey}>
      {sheets.map((sheet) => sheet.id === renaming ? (
        <input key={sheet.id} className="sheet-rename" autoFocus defaultValue={sheet.name} maxLength={40} aria-label={renameHint}
          onFocus={(event) => event.target.select()}
          onBlur={(event) => commit(sheet.id, event.target.value)}
          onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelled.current = true; event.currentTarget.blur(); } }} />
      ) : (
        <button key={sheet.id} id={`${base}-${sheet.id}`} type="button" role="tab" aria-selected={sheet.id === activeId} tabIndex={sheet.id === activeId ? 0 : -1}
          className={sheet.id === activeId ? "sheet-tab is-active" : "sheet-tab"} data-tip={sheet.id === activeId ? renameHint : undefined}
          onClick={() => onSelect(sheet.id)} onDoubleClick={() => { onSelect(sheet.id); setRenaming(sheet.id); }}>
          <span className="sheet-tab-name">{sheet.name}</span>
          {variant === "bar" && <small aria-label={rowsLabel ? `${sheet.rows.length} ${rowsLabel}` : undefined}>{sheet.rows.length}</small>}
        </button>
      ))}
    </div>
  );

  if (variant === "bar") return tablist;
  return (
    <div className="sheet-tabs">
      {tablist}
      {onAdd && <button type="button" className="sheet-add" onClick={onAdd} aria-label={addLabel} data-tip={addLabel}><Plus size={14} /></button>}
    </div>
  );
}
