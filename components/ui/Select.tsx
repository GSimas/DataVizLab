import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { usePresence } from "../../lib/motion";
import { Portal, useAnchoredPosition, useOutsidePress } from "./floating";

export type SelectOption = { value: string; label: string; hint?: string; dot?: string };
export type SelectGroup = { label: string; options: SelectOption[] };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  /** Id of the element that names the control. Give `ariaLabel` instead when there is no visible label. */
  labelledBy?: string;
  ariaLabel?: string;
  /** "cell" fills a table cell; "chip" is a small inline trigger (e.g. in a column header). */
  variant?: "field" | "cell" | "chip";
  /** With `onCreate`, typing text that matches no option offers to add it as a new one. */
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  /** Minimum width of the open list, for triggers narrower than their options. */
  popMinWidth?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Search box inside the list. Defaults to on for lists longer than SEARCH_THRESHOLD. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
};

const SEARCH_THRESHOLD = 7;
const CREATE = "__datavizlab-create__";
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();

/** Accessible single-select listbox styled as part of DataVizLab (replaces native <select>). */
export function Select({ value, onChange, options, groups, labelledBy, ariaLabel, variant = "field", onCreate, createLabel, popMinWidth, placeholder = "—", disabled, searchable, searchPlaceholder = "Buscar…", emptyText = "Nenhum resultado" }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", timer: 0 });
  const id = useId();
  const { mounted, closing } = usePresence(open);
  const allSections = useMemo<SelectGroup[]>(() => groups ?? [{ label: "", options: options ?? [] }], [groups, options]);
  const total = allSections.reduce((sum, section) => sum + section.options.length, 0);
  const withSearch = searchable ?? (Boolean(onCreate) || total > SEARCH_THRESHOLD);
  const nameId = labelledBy ?? `${id}-name`;

  // Filtering keeps group headers; a group whose name matches shows all of its options.
  const sections = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return allSections;
    return allSections
      .map((section) => fold(section.label).includes(needle) ? section : { ...section, options: section.options.filter((option) => fold(`${option.label} ${option.hint ?? ""} ${option.value}`).includes(needle)) })
      .filter((section) => section.options.length);
  }, [allSections, query]);
  const flat = useMemo(() => sections.flatMap((section, s) => section.options.map((option, o) => ({ ...option, key: `${s}-${o}-${option.value}` }))), [sections]);
  const createText = query.trim();
  const canCreate = Boolean(onCreate) && createText !== "" && !allSections.some((section) => section.options.some((option) => fold(option.label) === fold(createText) || fold(option.value) === fold(createText)));
  const createOption = canCreate ? { value: CREATE, label: createLabel?.(createText) ?? createText, key: CREATE } : null;
  const items = createOption ? [...flat, createOption] : flat;
  const starts = useMemo(() => sections.map((_, s) => sections.slice(0, s).reduce((sum, section) => sum + section.options.length, 0)), [sections]);
  const selected = useMemo(() => allSections.flatMap((section) => section.options).find((option) => option.value === value), [allSections, value]);

  const popRef = useAnchoredPosition<HTMLDivElement>(triggerRef, mounted, { matchWidth: true, maxHeight: 380, minWidth: popMinWidth });
  const close = useCallback((restoreFocus = true) => { setOpen(false); if (restoreFocus) triggerRef.current?.focus({ preventScroll: true }); }, []);
  const outsideRefs = useMemo(() => [triggerRef, popRef], [popRef]);
  useOutsidePress(outsideRefs, open, useCallback(() => close(false), [close]));

  useEffect(() => {
    if (!open) return;
    (withSearch ? searchRef.current : listRef.current)?.focus({ preventScroll: true });
  }, [open, withSearch]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, allSections.flatMap((section) => section.options).findIndex((option) => option.value === value)));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = items[index];
    if (option?.value === CREATE) onCreate?.(createText);
    else if (option) onChange(option.value);
    close();
  };

  const onTriggerKey = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); openList(); }
  };

  const navigate = (event: KeyboardEvent) => {
    const last = items.length - 1;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(last, index + 1)); return true; }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); return true; }
    if (event.key === "Enter") { event.preventDefault(); choose(active); return true; }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return true; }
    if (event.key === "Tab") { close(false); return true; }
    return false;
  };

  const onListKey = (event: KeyboardEvent) => {
    if (navigate(event)) return;
    const last = items.length - 1;
    if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(last); }
    else if (event.key === " ") { event.preventDefault(); choose(active); }
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const state = typeahead.current;
      window.clearTimeout(state.timer);
      state.text += fold(event.key);
      state.timer = window.setTimeout(() => { state.text = ""; }, 600);
      const match = flat.findIndex((option) => fold(option.label).startsWith(state.text));
      if (match >= 0) setActive(match);
    }
  };

  const activeId = open && items[active] ? `${id}-opt-${active}` : undefined;
  return (
    <>
      {!labelledBy && <span id={nameId} className="sr-only">{ariaLabel}</span>}
      <button ref={triggerRef} type="button" className={variant === "field" ? "select-trigger" : `select-trigger select-trigger-${variant}`} data-open={open || undefined} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-labelledby={`${nameId} ${id}-value`} onClick={() => (open ? close() : openList())} onKeyDown={onTriggerKey}>
        <span id={`${id}-value`} className="select-value">
          {selected?.dot && <i className="select-dot" style={{ background: selected.dot }} />}
          <span>{selected?.label ?? placeholder}</span>
          {selected?.hint && <small>{selected.hint}</small>}
        </span>
        <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
      </button>
      {mounted && (
        <Portal>
          <div ref={popRef} className={variant === "field" ? "select-pop" : `select-pop select-pop-${variant}`} data-state={closing ? "closed" : "open"}>
            {withSearch && (
              <label className="select-search">
                <Search size={14} aria-hidden="true" />
                <input ref={searchRef} role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={activeId} aria-autocomplete="list" aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={navigate} />
                {query && !onCreate && <span className="select-count">{flat.length}</span>}
              </label>
            )}
            <ul ref={listRef} id={`${id}-list`} role="listbox" tabIndex={-1} className="select-list" aria-labelledby={nameId} aria-activedescendant={withSearch ? undefined : activeId} onKeyDown={onListKey}>
              {!items.length && <li role="presentation" className="select-empty">{emptyText}</li>}
              {sections.map((section, s) => (
                <li key={section.label || "options"} role="presentation">
                  {section.label && <div className="select-group" role="presentation">{section.label}</div>}
                  <ul role="presentation">
                    {section.options.map((option, o) => {
                      const current = starts[s] + o;
                      return (
                        <li key={flat[current].key} id={`${id}-opt-${current}`} data-index={current} role="option" aria-selected={option.value === value} className={current === active ? "select-option is-active" : "select-option"} onPointerMove={() => setActive(current)} onClick={() => choose(current)}>
                          {option.dot && <i className="select-dot" style={{ background: option.dot }} />}
                          <span>{option.label}</span>
                          {option.hint && <small>{option.hint}</small>}
                          {option.value === value && <Check size={14} className="select-check" aria-hidden="true" />}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
              {createOption && (
                <li id={`${id}-opt-${flat.length}`} data-index={flat.length} role="option" aria-selected={false} className={active === flat.length ? "select-option select-create is-active" : "select-option select-create"} onPointerMove={() => setActive(flat.length)} onClick={() => choose(flat.length)}>
                  <Plus size={14} aria-hidden="true" />
                  <span>{createOption.label}</span>
                </li>
              )}
            </ul>
          </div>
        </Portal>
      )}
    </>
  );
}
