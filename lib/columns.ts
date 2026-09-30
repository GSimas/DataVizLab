import type { DataRow } from "../components/ChartRenderer";
import type { Locale } from "./catalog";
import { formatDisplayDate, parseDate, toIsoDate } from "./dates";
import { collator, numberFormat } from "./intl";

/* ---------------------------------------------------------------------------
 * Column types. Each column of a project has a declared type that decides how a
 * cell is edited, validated and stored: numbers stay numbers, dates are ISO
 * strings, categories come from a list. The type is chosen when data is loaded
 * (inferred, or set by a sample) and can be changed by the user; it does not
 * follow the cell contents while they are being edited.
 * ------------------------------------------------------------------------- */

export type ColumnType = "text" | "category" | "integer" | "number" | "currency" | "percent" | "date" | "time" | "boolean";
/** Coarse role of a column in a chart. */
export type ColumnKind = "numeric" | "categorical" | "temporal";
export type ColumnSpec = { type: ColumnType; currency?: string; options?: string[] };
export type ColumnSpecs = Record<string, ColumnSpec>;
export type CellValue = string | number | boolean | null;

export const COLUMN_TYPES: ColumnType[] = ["text", "category", "integer", "number", "currency", "percent", "date", "time", "boolean"];
export const CURRENCIES = ["BRL", "USD", "EUR", "GBP"] as const;
const CURRENCY_SYMBOL: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£" };
export const currencySymbol = (code: string) => CURRENCY_SYMBOL[code] ?? code;
export const defaultCurrency = (locale: Locale) => (locale === "pt" ? "BRL" : "USD");

export const isNumericType = (type: ColumnType) => type === "integer" || type === "number" || type === "currency" || type === "percent";
export const kindOfSpec = (spec: ColumnSpec): ColumnKind => (isNumericType(spec.type) ? "numeric" : spec.type === "date" || spec.type === "time" ? "temporal" : "categorical");

export const columnsOf = (rows: DataRow[]) => Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && value.trim() === "");
const tag = (locale: Locale) => (locale === "pt" ? "pt-BR" : "en-US");

/* ---------------------------------- numbers --------------------------------- */

const SYMBOLS = /R\$|US\$|[$€£]/g;
const HAS_SYMBOL = /R\$|US\$|[$€£]/;

/**
 * Reads a number the way people write it: "1234,5", "1.234,50", "1,234.5", "R$ 12", "45%".
 * A lone separator followed by exactly three digits counts as a thousands mark only when
 * that is the locale's grouping character ("1.234" is 1234 in Portuguese, 1.234 in English).
 */
export function parseNumeric(input: unknown, locale: Locale): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/[\s  ]/g, "").replace(/−/g, "-").replace(SYMBOLS, "").replace(/%$/, "");
  if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const sign = s.startsWith("-") ? -1 : 1;
  s = s.replace(/^[-+]/, "");
  const grouping = locale === "pt" ? "." : ",";
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let normalized: string;
  if (dots && commas) {
    const decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    const pieces = s.split(decimal);
    if (pieces.length !== 2 || !new RegExp(`^\\d{1,3}(?:\\${thousands}\\d{3})*$`).test(pieces[0])) return null;
    normalized = `${pieces[0].split(thousands).join("")}.${pieces[1]}`;
  } else if (dots || commas) {
    const mark = dots ? "." : ",";
    const parts = s.split(mark);
    if (parts.length > 2) {
      if (parts[0].length < 1 || parts[0].length > 3 || !parts.slice(1).every((part) => part.length === 3)) return null;
      normalized = parts.join("");
    } else {
      const [head, tail] = parts;
      const grouped = mark === grouping && tail.length === 3 && head.length >= 1 && head.length <= 3 && head !== "0";
      normalized = grouped ? head + tail : `${head || "0"}.${tail}`;
    }
  } else {
    normalized = s;
  }
  const result = Number(normalized) * sign;
  return Number.isFinite(result) ? result : null;
}

/** Plain, editable text for a number: no grouping, decimal comma in Portuguese. */
export const numberToText = (value: number, locale: Locale) => {
  const text = numberFormat("en-US", { useGrouping: false, maximumFractionDigits: 12 }).format(value);
  return locale === "pt" ? text.replace(".", ",") : text;
};

/** Matches what may be typed into a numeric cell at any moment while editing. */
export const typingPattern = (type: ColumnType) => (type === "integer" ? /^[-+]?\d*$/ : /^[-+]?\d*[.,]?\d*$/);

/** Number in a partially typed cell; null while the text is still incomplete ("", "-", ","). */
export const readTyped = (text: string) => {
  if (!/\d/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};

/* --------------------------------- time / bool --------------------------------- */

const two = (n: number) => String(n).padStart(2, "0");

export function parseTime(text: string): string | null {
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(text.trim());
  if (!clock) return null;
  let hours = +clock[1];
  const minutes = +clock[2];
  const seconds = clock[3] === undefined ? undefined : +clock[3];
  if (clock[4]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (/p/i.test(clock[4]) ? 12 : 0);
  }
  if (hours > 23 || minutes > 59 || (seconds !== undefined && seconds > 59)) return null;
  return seconds === undefined ? `${two(hours)}:${two(minutes)}` : `${two(hours)}:${two(minutes)}:${two(seconds)}`;
}

const TRUE_WORDS = ["true", "sim", "yes", "verdadeiro", "s", "y"];
const FALSE_WORDS = ["false", "não", "nao", "no", "falso", "n"];

/** Words that clearly mean yes/no. 1 and 0 only count when `loose` (a column already declared boolean). */
export function parseBoolean(value: unknown, loose = true): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return loose && (value === 1 || value === 0) ? value === 1 : null;
  if (typeof value !== "string") return null;
  const word = value.trim().toLocaleLowerCase();
  if (loose && (word === "1" || word === "0")) return word === "1";
  if (word.length === 1 && !loose) return null;
  if (TRUE_WORDS.includes(word)) return true;
  if (FALSE_WORDS.includes(word)) return false;
  return null;
}

/* ------------------------------ coercion & display ----------------------------- */

const parseAnyDate = (value: string, locale: Locale) => {
  const stamp = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(value.trim());
  return parseDate(stamp ? stamp[1] : value, locale);
};

/**
 * Converts a cell to the canonical value of its column type. Values that do not fit are
 * returned untouched and marked invalid, so nothing the user typed or imported is lost.
 */
export function coerceCell(spec: ColumnSpec, value: unknown, locale: Locale): { value: CellValue; valid: boolean } {
  if (isEmpty(value)) return { value: value === null ? null : "", valid: true };
  const keep = { value: value as CellValue, valid: false };
  switch (spec.type) {
    case "text":
    case "category":
      return { value: typeof value === "string" ? value : String(value), valid: true };
    case "integer":
    case "number":
    case "currency":
    case "percent": {
      const n = typeof value === "boolean" ? null : parseNumeric(value, locale);
      if (n === null || (spec.type === "integer" && !Number.isInteger(n))) return keep;
      return { value: n, valid: true };
    }
    case "date": {
      const parsed = typeof value === "string" ? parseAnyDate(value, locale) : null;
      return parsed ? { value: toIsoDate(parsed.date), valid: true } : keep;
    }
    case "time": {
      const time = typeof value === "string" ? parseTime(value) : null;
      return time ? { value: time, valid: true } : keep;
    }
    case "boolean": {
      const flag = parseBoolean(value);
      return flag === null ? keep : { value: flag, valid: true };
    }
  }
}

export const isCellValid = (spec: ColumnSpec, value: unknown, locale: Locale) => coerceCell(spec, value, locale).valid;

const currencyFormat = (code: string, locale: Locale) => {
  try { return numberFormat(tag(locale), { style: "currency", currency: code, maximumFractionDigits: 2 }); } catch { return null; }
};

export const booleanLabel = (value: boolean, locale: Locale) => (locale === "pt" ? (value ? "Sim" : "Não") : value ? "Yes" : "No");

/** Cell text when the cell is not being edited. */
export function formatCell(spec: ColumnSpec, value: unknown, locale: Locale): string {
  if (isEmpty(value)) return "";
  const { value: canonical, valid } = coerceCell(spec, value, locale);
  if (!valid) return String(value);
  switch (spec.type) {
    case "integer":
    case "number": return numberToText(canonical as number, locale);
    case "percent": return `${numberToText(canonical as number, locale)}%`;
    case "currency": {
      const formatted = currencyFormat(spec.currency ?? defaultCurrency(locale), locale)?.format(canonical as number);
      return formatted ? formatted.replace(/ /g, " ") : numberToText(canonical as number, locale);
    }
    case "date": { const parsed = parseAnyDate(String(canonical), locale); return parsed ? formatDisplayDate(parsed.date, locale) : String(value); }
    case "boolean": return booleanLabel(canonical as boolean, locale);
    default: return String(canonical);
  }
}

/** Text placed in the input when a cell gets focus: like the display text, minus symbols. */
export function editText(spec: ColumnSpec, value: unknown, locale: Locale): string {
  if (isEmpty(value)) return "";
  const { value: canonical, valid } = coerceCell(spec, value, locale);
  if (!valid) return String(value);
  if (isNumericType(spec.type)) return numberToText(canonical as number, locale);
  return formatCell(spec, canonical, locale);
}

/** Rewrites one column to the canonical values of `spec`; returns how many cells do not fit. */
export function convertColumn(rows: DataRow[], column: string, spec: ColumnSpec, locale: Locale) {
  let invalid = 0;
  const next = rows.map((row) => {
    if (!(column in row)) return row;
    const result = coerceCell(spec, row[column], locale);
    if (!result.valid) invalid++;
    return result.value === row[column] ? row : { ...row, [column]: result.value };
  });
  return { rows: next, invalid };
}

/** Number of cells, per column, that do not fit the declared type. */
export function invalidCounts(rows: DataRow[], specs: ColumnSpecs, locale: Locale) {
  const counts: Record<string, number> = {};
  Object.entries(specs).forEach(([column, spec]) => {
    if (spec.type === "text" || spec.type === "category") return;
    let count = 0;
    for (const row of rows) {
      const value = row[column];
      if (typeof value === "number" && (spec.type === "number" || spec.type === "currency" || spec.type === "percent")) continue;
      if (!isCellValid(spec, value, locale)) count++;
    }
    if (count) counts[column] = count;
  });
  return counts;
}

/* ---------------------------------- inference --------------------------------- */

const looksLikeCode = (text: string) => /^[-+]?0\d/.test(text) || text.replace(/\D/g, "").length > 15;

const isNumericLike = (value: unknown, locale: Locale) => {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || looksLikeCode(value.trim())) return false;
  return parseNumeric(value, locale) !== null;
};

const currencyOf = (text: string) => (/US\$|\$/.test(text) ? (/R\$/.test(text) ? "BRL" : "USD") : /€/.test(text) ? "EUR" : /£/.test(text) ? "GBP" : /R\$/.test(text) ? "BRL" : null);

const sortedOptions = (values: Iterable<string>, locale: Locale) => Array.from(new Set(values)).sort(collator(tag(locale), { numeric: true }).compare);

/** Guesses the type of a column from its contents. Only used when data arrives without types. */
export function inferColumnSpec(rows: DataRow[], column: string, locale: Locale): ColumnSpec {
  const values: unknown[] = [];
  for (const row of rows) {
    if (!isEmpty(row[column])) values.push(row[column]);
    if (values.length >= 500) break;
  }
  if (!values.length) return { type: "text" };
  const share = (test: (value: unknown) => boolean) => values.filter(test).length / values.length;
  const isString = (value: unknown): value is string => typeof value === "string";

  if (values.every((value) => typeof value === "boolean" || (isString(value) && parseBoolean(value, false) !== null))) return { type: "boolean" };
  if (share((value) => isString(value) && parseTime(value) !== null) >= 0.9) return { type: "time" };
  if (share((value) => isString(value) && parseAnyDate(value, locale) !== null) >= 0.9) return { type: "date" };
  if (share((value) => isString(value) && /%\s*$/.test(value) && parseNumeric(value, locale) !== null) >= 0.9) return { type: "percent" };
  const priced = values.filter((value): value is string => isString(value) && HAS_SYMBOL.test(value) && parseNumeric(value, locale) !== null);
  if (priced.length / values.length >= 0.9) {
    const counts = new Map<string, number>();
    priced.forEach((value) => { const code = currencyOf(value); if (code) counts.set(code, (counts.get(code) ?? 0) + 1); });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { type: "currency", currency: top ?? defaultCurrency(locale) };
  }
  if (share((value) => isNumericLike(value, locale)) >= 0.8) return { type: "number" };

  const texts = values.map(String);
  const distinct = new Set(texts);
  // A list of labels that never repeats is a name or a note; repetition is what makes a category.
  if (distinct.size <= 30 && distinct.size < texts.length && distinct.size <= Math.ceil(texts.length * 0.6)) return { type: "category", options: sortedOptions(distinct, locale) };
  return { type: "text" };
}

export const classifyColumn = (rows: DataRow[], column: string, locale: Locale = "pt"): ColumnKind => kindOfSpec(inferColumnSpec(rows, column, locale));

/** Options offered by a category column: the ones declared plus any value found in the data. */
export function categoryOptions(spec: ColumnSpec, rows: DataRow[], column: string, locale: Locale) {
  const found = rows.map((row) => row[column]).filter((value) => !isEmpty(value)).map(String);
  return sortedOptions([...(spec.options ?? []), ...found], locale);
}

const cleanSpec = (raw: unknown): ColumnSpec | null => {
  if (!raw || typeof raw !== "object") return null;
  const { type, currency, options } = raw as Partial<ColumnSpec>;
  if (!type || !COLUMN_TYPES.includes(type)) return null;
  return {
    type,
    ...(type === "currency" ? { currency: typeof currency === "string" && currency ? currency.toUpperCase().slice(0, 3) : undefined } : {}),
    ...(type === "category" && Array.isArray(options) ? { options: options.filter((option): option is string => typeof option === "string").slice(0, 500) } : {}),
  };
};

/** Validates column types read from a project file. */
export function sanitizeSpecs(raw: unknown): ColumnSpecs | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const specs: ColumnSpecs = {};
  Object.entries(raw as Record<string, unknown>).forEach(([column, value]) => { const spec = cleanSpec(value); if (spec) specs[column] = spec; });
  return Object.keys(specs).length ? specs : undefined;
}

/** Types for every column of `rows`: the stored ones, with the missing ones inferred. */
export function resolveSpecs(stored: ColumnSpecs | undefined, rows: DataRow[], locale: Locale): ColumnSpecs {
  const specs: ColumnSpecs = {};
  columnsOf(rows).forEach((column) => { specs[column] = stored?.[column] ?? inferColumnSpec(rows, column, locale); });
  return specs;
}

/** Brings freshly loaded rows to their column types (provided or inferred) and normalizes their values. */
export function prepareTable(rows: DataRow[], locale: Locale, provided?: ColumnSpecs) {
  const specs = resolveSpecs(provided, rows, locale);
  const columns = Object.keys(specs);
  const converted = rows.map((row) => {
    const next: DataRow = { ...row };
    columns.forEach((column) => {
      const spec = specs[column];
      if (spec.type === "text" || spec.type === "category" || !(column in row)) return;
      next[column] = coerceCell(spec, row[column], locale).value;
    });
    return next;
  });
  return { rows: converted, specs };
}

/** Column types with `column` removed, renamed or added; keeps the stored map tidy. */
export const withoutColumn = (specs: ColumnSpecs | undefined, column: string) => {
  if (!specs || !(column in specs)) return specs;
  const next = { ...specs };
  delete next[column];
  return next;
};

export const renameColumnSpec = (specs: ColumnSpecs | undefined, from: string, to: string) => {
  if (!specs || !(from in specs)) return specs;
  const next = withoutColumn(specs, from) ?? {};
  next[to] = specs[from];
  return next;
};

/* ------------------------------ type picker options ----------------------------- */

/** The type picker lists each currency as its own entry: "currency:BRL". */
export const specToChoice = (spec: ColumnSpec) => (spec.type === "currency" ? `currency:${spec.currency ?? "BRL"}` : spec.type);

export const choiceToSpec = (choice: string): ColumnSpec => {
  if (choice.startsWith("currency:")) return { type: "currency", currency: choice.slice("currency:".length) };
  return { type: (COLUMN_TYPES.includes(choice as ColumnType) ? choice : "text") as ColumnType };
};
