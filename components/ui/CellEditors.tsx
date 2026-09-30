import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../../lib/catalog";
import { booleanLabel, editText, formatCell, isCellValid, numberToText, parseNumeric, parseTime, readTyped, typingPattern, type CellValue, type ColumnSpec, type ColumnType } from "../../lib/columns";
import type { TranslationKey } from "../../lib/i18n";
import { Select } from "./Select";

/* ---------------------------------------------------------------------------
 * Cell editors of the data table, one per column type. Every editor keeps the text
 * being typed in a local draft, commits to the table only values that are valid for
 * the column, and reverts to the formatted stored value when it loses focus.
 * ------------------------------------------------------------------------- */

type Tr = (key: TranslationKey) => string;

export const TYPE_KEYS: Record<ColumnType, TranslationKey> = {
  text: "typeText", category: "typeCategory", integer: "typeInteger", number: "typeNumber", currency: "typeCurrency",
  percent: "typePercent", date: "typeDate", time: "typeTime", boolean: "typeBoolean",
};

export type CellProps = { value: unknown; spec: ColumnSpec; locale: Locale; ariaLabel: string; onChange: (value: CellValue) => void; tr: Tr };

/** Short message that fades after a moment; used when a keystroke is rejected. */
function useWarning() {
  const [warn, setWarn] = useState("");
  useEffect(() => {
    if (!warn) return;
    const timer = window.setTimeout(() => setWarn(""), 1800);
    return () => window.clearTimeout(timer);
  }, [warn]);
  return [warn, setWarn] as const;
}

export const invalidTip = (spec: ColumnSpec, tr: Tr) => `${tr("cellInvalid")}: ${tr(TYPE_KEYS[spec.type])}`;

const asText = (value: unknown) => (value == null ? "" : String(value));

export function TextCell({ value, ariaLabel, onChange }: CellProps) {
  return <input className="cell-input" aria-label={ariaLabel} value={asText(value)} onChange={(event) => onChange(event.target.value)} />;
}

/** Integer, number, currency and percent columns: only digits and one decimal separator get in. */
export function NumberCell({ value, spec, locale, ariaLabel, onChange, tr }: CellProps) {
  const integer = spec.type === "integer";
  const [draft, setDraft] = useState<string | null>(null);
  const [warn, setWarn] = useWarning();
  const invalid = !isCellValid(spec, value, locale);
  const shown = draft ?? formatCell(spec, value, locale);

  const commit = (text: string) => {
    if (text.trim() === "") { onChange(""); return; }
    const number = readTyped(text);
    if (number !== null) onChange(number);
  };

  const edit = (next: string) => {
    if (typingPattern(spec.type).test(next)) { setWarn(""); setDraft(next); commit(next); return; }
    // Pasted "R$ 1.234,56", "45%"…: accept it when it is a number, in the column's plain notation.
    const pasted = parseNumeric(next, locale);
    if (pasted !== null && (!integer || Number.isInteger(pasted))) { const text = numberToText(pasted, locale); setWarn(""); setDraft(text); commit(text); return; }
    // A leftover that is not a number (like "n/d") can still be erased character by character.
    if (invalid && draft !== null && next.length < draft.length) { setDraft(next); if (next === "") onChange(""); return; }
    setWarn(integer ? tr("cellInteger") : tr("cellNumber"));
  };

  return (
    <div className="cell">
      <input className="cell-input cell-num" inputMode={integer ? "numeric" : "decimal"} autoComplete="off" spellCheck={false} aria-label={ariaLabel} aria-invalid={invalid || undefined} data-tip={invalid ? invalidTip(spec, tr) : undefined} value={shown}
        onFocus={(event) => { setDraft(editText(spec, value, locale)); if (invalid) event.target.select(); }} onBlur={() => { setDraft(null); setWarn(""); }} onChange={(event) => edit(event.target.value)} />
      {warn && <span className="cell-hint" role="alert">{warn}</span>}
    </div>
  );
}

/** hh:mm (or hh:mm:ss): digits and colons only; the colon after the hour is added for you. */
export function TimeCell({ value, spec, locale, ariaLabel, onChange, tr }: CellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [warn, setWarn] = useWarning();
  const invalid = !isCellValid(spec, value, locale);
  const shown = draft ?? formatCell(spec, value, locale);

  const edit = (typed: string) => {
    // "0930" (pasted, or typed without the colon) reads as 09:30.
    const raw = /^\d{3,4}$/.test(typed) ? typed.replace(/^(\d{1,2})(\d{2})$/, "$1:$2") : typed;
    if (!/^\d{0,2}(?::\d{0,2}(?::\d{0,2})?)?$/.test(raw)) {
      if (invalid && draft !== null && raw.length < draft.length) { setDraft(raw); if (raw === "") onChange(""); return; }
      setWarn(tr("cellTime"));
      return;
    }
    const next = draft !== null && raw.length > draft.length && /^\d{2}$/.test(raw) ? `${raw}:` : raw;
    setWarn("");
    setDraft(next);
    if (next === "") { onChange(""); return; }
    const time = parseTime(next);
    if (time) onChange(time);
    else if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(next)) setWarn(tr("cellTime"));
  };

  return (
    <div className="cell">
      <input className="cell-input" inputMode="numeric" autoComplete="off" spellCheck={false} placeholder="hh:mm" aria-label={ariaLabel} aria-invalid={invalid || undefined} data-tip={invalid ? invalidTip(spec, tr) : undefined} value={shown}
        onFocus={(event) => { setDraft(editText(spec, value, locale)); if (invalid) event.target.select(); }} onBlur={() => { setDraft(null); setWarn(""); }} onChange={(event) => edit(event.target.value)} />
      {warn && <span className="cell-hint" role="alert">{warn}</span>}
    </div>
  );
}

type CategoryProps = CellProps & { options: string[]; onAddOption: (name: string) => void };

/** Category columns pick from a list; typing a name that is not there offers to add it. */
export function CategoryCell({ value, ariaLabel, options, onChange, onAddOption, tr }: CategoryProps) {
  const text = asText(value);
  const list = useMemo(() => [{ value: "", label: "—" }, ...options.map((option) => ({ value: option, label: option }))], [options]);
  return (
    <div className="cell">
      <Select variant="cell" ariaLabel={ariaLabel} value={text} onChange={onChange} options={list} searchable popMinWidth={210}
        searchPlaceholder={tr("searchOrAddOption")} emptyText={tr("noOptionsYet")} createLabel={(name) => tr("addOption").replace("{name}", name)}
        onCreate={(name) => { onAddOption(name); onChange(name); }} />
    </div>
  );
}

/** Yes/No columns. Anything else found in the cell is shown as text and marked as invalid. */
export function BooleanCell({ value, spec, locale, ariaLabel, onChange, tr }: CellProps) {
  const invalid = !isCellValid(spec, value, locale);
  const current = value === true ? "true" : value === false ? "false" : "";
  const list = useMemo(() => [{ value: "", label: "—" }, { value: "true", label: booleanLabel(true, locale) }, { value: "false", label: booleanLabel(false, locale) }], [locale]);
  return (
    <div className="cell" data-invalid={invalid || undefined} data-tip={invalid ? invalidTip(spec, tr) : undefined}>
      <Select variant="cell" ariaLabel={ariaLabel} value={current} onChange={(next) => onChange(next === "" ? "" : next === "true")} options={list} searchable={false} placeholder={invalid ? asText(value) : "—"} />
    </div>
  );
}
