import { useEffect, useMemo, useRef } from "react";
import { Plus, X } from "lucide-react";
import type { Locale } from "../lib/catalog";
import { CURRENCIES, categoryOptions, choiceToSpec, currencySymbol, formatCell, invalidCounts, isCellValid, specToChoice, type CellValue, type ColumnSpec, type ColumnSpecs, type ColumnType } from "../lib/columns";
import type { TranslationKey } from "../lib/i18n";
import type { DataRow } from "./ChartRenderer";
import { BooleanCell, CategoryCell, NumberCell, TextCell, TimeCell, TYPE_KEYS, invalidTip } from "./ui/CellEditors";
import { DateCell } from "./ui/DatePicker";
import { Select, type SelectOption } from "./ui/Select";

const VISIBLE_ROWS = 120;

const EXAMPLES: Record<ColumnType, unknown> = { text: "Aa", category: "A", integer: 1234, number: 12.5, currency: 1234.5, percent: 12.5, date: "2024-03-15", time: "14:30", boolean: true };

/** Every choice of the column type picker; each currency is its own entry. */
export function typeChoices(tr: (key: TranslationKey) => string, locale: Locale): SelectOption[] {
  const one = (type: ColumnType, spec: ColumnSpec = { type }, label = tr(TYPE_KEYS[type])): SelectOption => ({ value: specToChoice(spec), label, hint: formatCell(spec, EXAMPLES[type], locale) });
  return [
    one("text"), one("category"), one("integer"), one("number"),
    ...CURRENCIES.map((code) => one("currency", { type: "currency", currency: code }, `${tr("typeCurrency")} · ${currencySymbol(code)}`)),
    one("percent"), one("date"), one("time"), one("boolean"),
  ];
}

type Props = {
  rows: DataRow[];
  columns: string[];
  specs: ColumnSpecs;
  locale: Locale;
  tr: (key: TranslationKey) => string;
  onCell: (rowIndex: number, column: string, value: CellValue) => void;
  onDeleteRow: (rowIndex: number) => void;
  onType: (column: string, spec: ColumnSpec) => void;
  onAddOption: (column: string, option: string) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
};

/** Editable table with one typed editor per column: category lists, numeric fields, dates, times… */
export function DataTable({ rows, columns, specs, locale, tr, onCell, onDeleteRow, onType, onAddOption, onAddRow, onAddColumn }: Props) {
  const tableRef = useRef<HTMLTableElement>(null);
  const hoverColumn = useRef(-1);
  const focusNewRow = useRef(false);

  // A row added from the table's own button is ready to type into.
  useEffect(() => {
    if (!focusNewRow.current) return;
    focusNewRow.current = false;
    tableRef.current?.querySelector<HTMLElement>("tbody tr:last-child td:nth-child(2) :is(input, button)")?.focus();
  }, [rows.length]);
  const invalid = useMemo(() => invalidCounts(rows, specs, locale), [rows, specs, locale]);
  const choices = useMemo(() => typeChoices(tr, locale), [tr, locale]);
  const options = useMemo(() => Object.fromEntries(columns.filter((column) => specs[column]?.type === "category").map((column) => [column, categoryOptions(specs[column], rows, column, locale)])), [columns, specs, rows, locale]);
  const dateLabels = { open: tr("openCalendar"), previous: tr("prevMonth"), next: tr("nextMonth"), today: tr("today") };
  const dateHint = locale === "pt" ? "dd/mm/aaaa" : "mm/dd/yyyy";

  // Crosshair highlight: the row comes from CSS (:hover / :focus-within); the column is
  // toggled here without re-rendering the table.
  const highlightColumn = (target: EventTarget | null) => {
    const table = tableRef.current;
    const cell = (target as HTMLElement | null)?.closest?.<HTMLTableCellElement>("td, th");
    const index = cell && table?.contains(cell) ? cell.cellIndex : -1;
    if (!table || index === hoverColumn.current) return;
    table.querySelectorAll(".is-col-hover").forEach((el) => el.classList.remove("is-col-hover"));
    hoverColumn.current = index;
    if (index > 0 && index <= columns.length) table.querySelectorAll(`tr > :nth-child(${index + 1})`).forEach((el) => el.classList.add("is-col-hover"));
  };

  const renderCell = (row: DataRow, rowIndex: number, column: string) => {
    const spec = specs[column] ?? { type: "text" as const };
    const common = { value: row[column], spec, locale, ariaLabel: `${column}, ${rowIndex + 1}`, tr, onChange: (value: CellValue) => onCell(rowIndex, column, value) };
    switch (spec.type) {
      case "category": return <CategoryCell {...common} options={options[column] ?? []} onAddOption={(name) => onAddOption(column, name)} />;
      case "boolean": return <BooleanCell {...common} />;
      case "time": return <TimeCell {...common} />;
      case "date": {
        const bad = !isCellValid(spec, row[column], locale);
        return <DateCell value={row[column]} onChange={common.onChange} locale={locale} ariaLabel={common.ariaLabel} labels={dateLabels} invalid={bad} invalidTip={invalidTip(spec, tr)} formatHint={dateHint} onlyDatesHint={tr("cellDate")} />;
      }
      case "integer": case "number": case "currency": case "percent": return <NumberCell {...common} />;
      default: return <TextCell {...common} />;
    }
  };

  return (
    <div className="data-table-wrap">
      <table ref={tableRef} className="data-table" onPointerOver={(event) => highlightColumn(event.target)} onPointerLeave={() => highlightColumn(null)} onFocus={(event) => highlightColumn(event.target)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) highlightColumn(null); }}>
        <thead>
          <tr>
            <th>#</th>
            {columns.map((column) => (
              <th key={column}>
                <span className="col-name">{column}</span>
                <span className="col-meta">
                  <Select variant="chip" ariaLabel={`${tr("columnType")}: ${column}`} value={specToChoice(specs[column] ?? { type: "text" })} onChange={(choice) => onType(column, choiceToSpec(choice))} options={choices} searchable={false} popMinWidth={236} />
                  {invalid[column] ? <b className="col-invalid" data-tip={tr("invalidColumnTip").replace("{n}", String(invalid[column]))}>{invalid[column]}</b> : null}
                </span>
              </th>
            ))}
            <th><button type="button" className="col-add" onClick={onAddColumn} aria-label={tr("addColumnTitle")} data-tip={tr("addColumnTitle")}><Plus size={15} /></button></th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, VISIBLE_ROWS).map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td>{rowIndex + 1}</td>
              {columns.map((column) => <td key={column} data-type={specs[column]?.type}>{renderCell(row, rowIndex, column)}</td>)}
              <td><button type="button" className="row-delete" onClick={() => onDeleteRow(rowIndex)} aria-label={`${tr("delete")} ${rowIndex + 1}`} data-tip={tr("delete")}><X size={13} /></button></td>
            </tr>
          ))}
        </tbody>
        {columns.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={columns.length + 2}>
                <button type="button" className="row-add" onClick={() => { focusNewRow.current = true; onAddRow(); }}><Plus size={14} />{tr("addRow")}</button>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > VISIBLE_ROWS && <div className="table-limit">+ {rows.length - VISIBLE_ROWS} {tr("rows")} · {tr("tableLimit")}</div>}
    </div>
  );
}
