import type { Locale } from "./catalog";
import { prepareTable } from "./columns";
import { parseDelimited, parseFile, type ParsedImport, type ParsedSheet } from "./parse";

/** A file to read, or text pasted into the table. */
export type ImportRequest = { file?: File; text?: string; locale: Locale };

/** The parsed import with its rows already coerced to their column types (`columnTypes` always set). */
export type PreparedImport = Omit<ParsedImport, "sheets"> & { columnTypes: NonNullable<ParsedImport["columnTypes"]>; sheets?: Array<ParsedSheet & { columnTypes: NonNullable<ParsedSheet["columnTypes"]> }> };

/** Parses and types a table. Runs inside the import worker, or on the main thread as a fallback. */
export async function runImport({ file, text, locale }: ImportRequest): Promise<PreparedImport> {
  const parsed: ParsedImport = file ? await parseFile(file) : { rows: parseDelimited(text ?? ""), dataName: "" };
  if (!parsed.rows.length && !parsed.sheets?.length) throw new Error("empty");
  // Each sheet is typed on its own; a sheet's column types never leak into another's.
  const sheets = parsed.sheets?.map((sheet) => {
    const typed = prepareTable(sheet.rows, locale, sheet.columnTypes);
    return { ...sheet, rows: typed.rows, columnTypes: typed.specs };
  });
  if (sheets?.length) return { ...parsed, rows: sheets[0].rows, columnTypes: sheets[0].columnTypes, sheets };
  const table = prepareTable(parsed.rows, locale, parsed.columnTypes);
  return { ...parsed, sheets: undefined, rows: table.rows, columnTypes: table.specs };
}
