import type { Locale } from "./catalog";

export type DateFormat = { order: "ymd" | "dmy" | "mdy"; sep: string; shortYear: boolean; pad: boolean };

const two = (n: number) => String(n).padStart(2, "0");

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
  const d = format.pad ? two(date.getDate()) : String(date.getDate());
  const m = format.pad ? two(date.getMonth() + 1) : String(date.getMonth() + 1);
  const y = format.shortYear ? two(date.getFullYear() % 100) : String(date.getFullYear());
  const parts = format.order === "ymd" ? [y, m, d] : format.order === "dmy" ? [d, m, y] : [m, d, y];
  return parts.join(format.sep);
}

/** Canonical storage format for date columns: 2024-03-15 (local calendar day, no time zone shifts). */
export const toIsoDate = (date: Date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;

/** How dates are shown to people: 15/03/2024 in Portuguese, 03/15/2024 in English. */
export const displayFormat = (locale: Locale): DateFormat => ({ order: locale === "pt" ? "dmy" : "mdy", sep: "/", shortYear: false, pad: true });

export const formatDisplayDate = (date: Date, locale: Locale) => formatDate(date, displayFormat(locale));

/** Days since the epoch at local midnight; handy for building sample calendars. */
export const addDaysIso = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
};
