import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Locale } from "../../lib/catalog";
import { usePresence } from "../../lib/motion";
import { Portal, useAnchoredPosition, useOutsidePress } from "./floating";

type DateFormat = { order: "ymd" | "dmy" | "mdy"; sep: string; shortYear: boolean; pad: boolean };

const valid = (y: number, m: number, d: number) => { const date = new Date(y, m - 1, d); return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null; };

/** Reads full dates (2024-03-15, 15/03/2024, 3/15/24…) and remembers how they were written. */
export function parseDate(text: string, locale: Locale): { date: Date; format: DateFormat } | null {
  const iso = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/.exec(text.trim());
  if (iso) {
    const date = valid(+iso[1], +iso[3], +iso[4]);
    return date ? { date, format: { order: "ymd", sep: iso[2], shortYear: false, pad: iso[3].length === 2 } } : null;
  }
  const local = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{2}|\d{4})$/.exec(text.trim());
  if (!local) return null;
  const a = +local[1];
  const b = +local[3];
  const shortYear = local[4].length === 2;
  const year = shortYear ? 2000 + +local[4] : +local[4];
  const pad = local[1].length === 2;
  const dmyFirst = locale === "pt" ? a <= 31 && b <= 12 : !(a <= 12 && b <= 31);
  const tries: Array<DateFormat["order"]> = dmyFirst ? ["dmy", "mdy"] : ["mdy", "dmy"];
  for (const order of tries) {
    const date = order === "dmy" ? valid(year, b, a) : valid(year, a, b);
    if (date) return { date, format: { order, sep: local[2], shortYear, pad } };
  }
  return null;
}

export function formatDate(date: Date, format: DateFormat) {
  const two = (n: number) => String(n).padStart(2, "0");
  const d = format.pad ? two(date.getDate()) : String(date.getDate());
  const m = format.pad ? two(date.getMonth() + 1) : String(date.getMonth() + 1);
  const y = format.shortYear ? two(date.getFullYear() % 100) : String(date.getFullYear());
  const parts = format.order === "ymd" ? [y, m, d] : format.order === "dmy" ? [d, m, y] : [m, d, y];
  return parts.join(format.sep);
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date: Date, months: number) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
};

type Labels = { open: string; previous: string; next: string; today: string };
type CalendarProps = { selected: Date | null; onSelect: (date: Date) => void; onClose: () => void; locale: Locale; labels: Labels };

function Calendar({ selected, onSelect, onClose, locale, labels }: CalendarProps) {
  const [focus, setFocus] = useState(() => selected ?? new Date());
  const [direction, setDirection] = useState<"prev" | "next" | "none">("none");
  const gridRef = useRef<HTMLDivElement>(null);
  const tag = locale === "pt" ? "pt-BR" : "en";
  const weekStart = locale === "pt" ? 1 : 0;
  const today = new Date();
  const rawMonth = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(focus);
  const monthLabel = rawMonth.charAt(0).toLocaleUpperCase(tag) + rawMonth.slice(1);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(tag, { weekday: "narrow" }).format(new Date(2024, 0, 7 + weekStart + i))), [tag, weekStart]);
  const days = useMemo(() => {
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const start = addDays(first, -((first.getDay() - weekStart + 7) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [focus, weekStart]);

  const move = (next: Date) => {
    if (next.getMonth() !== focus.getMonth() || next.getFullYear() !== focus.getFullYear()) setDirection(next > focus ? "next" : "prev");
    setFocus(next);
  };

  useEffect(() => { gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true }); }, [focus]);

  const onKey = (event: KeyboardEvent) => {
    const map: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1), ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1), PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -((focus.getDay() - weekStart + 7) % 7)), End: () => addDays(focus, 6 - ((focus.getDay() - weekStart + 7) % 7)),
    };
    if (map[event.key]) { event.preventDefault(); move(map[event.key]()); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(focus); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  };

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" onClick={() => move(addMonths(focus, -1))} aria-label={labels.previous} data-tip={labels.previous}><ChevronLeft size={16} /></button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button type="button" onClick={() => move(addMonths(focus, 1))} aria-label={labels.next} data-tip={labels.next}><ChevronRight size={16} /></button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day, i) => <span key={i}>{day}</span>)}</div>
      <div ref={gridRef} key={`${focus.getFullYear()}-${focus.getMonth()}`} className="calendar-grid" data-dir={direction} role="grid" aria-label={monthLabel} onKeyDown={onKey}>
        {days.map((day) => {
          const outside = day.getMonth() !== focus.getMonth();
          const isSelected = selected ? sameDay(day, selected) : false;
          return (
            <button key={day.toISOString()} type="button" role="gridcell" aria-selected={isSelected} tabIndex={sameDay(day, focus) ? 0 : -1} className={["calendar-day", outside ? "is-outside" : "", isSelected ? "is-selected" : "", sameDay(day, today) ? "is-today" : ""].join(" ")} onClick={() => onSelect(day)}>
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="calendar-foot"><button type="button" onClick={() => onSelect(today)}>{labels.today}</button></div>
    </div>
  );
}

type DateCellProps = { value: string; onChange: (value: string) => void; locale: Locale; ariaLabel: string; labels: Labels };

/** Table cell for a date column: free text plus a DataVizLab calendar popover. */
export function DateCell({ value, onChange, locale, ariaLabel, labels }: DateCellProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { mounted, closing } = usePresence(open);
  const parsed = parseDate(value, locale);
  const popRef = useAnchoredPosition<HTMLDivElement>(anchorRef, mounted, { maxHeight: 400 });
  const close = useCallback(() => { setOpen(false); buttonRef.current?.focus({ preventScroll: true }); }, []);
  const refs = useMemo(() => [anchorRef, popRef], [popRef]);
  useOutsidePress(refs, open, useCallback(() => setOpen(false), []));

  const select = (date: Date) => {
    onChange(formatDate(date, parsed?.format ?? { order: "ymd", sep: "-", shortYear: false, pad: true }));
    close();
  };

  return (
    <div ref={anchorRef} className="date-cell">
      <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} />
      <button ref={buttonRef} type="button" aria-label={`${labels.open}: ${ariaLabel}`} aria-expanded={open} data-tip={labels.open} onClick={() => setOpen((current) => !current)}><CalendarDays size={14} /></button>
      {mounted && (
        <Portal>
          <div ref={popRef} className="popover calendar-popover" data-state={closing ? "closed" : "open"} role="dialog" aria-label={labels.open}>
            <Calendar selected={parsed?.date ?? null} onSelect={select} onClose={close} locale={locale} labels={labels} />
          </div>
        </Portal>
      )}
    </div>
  );
}
