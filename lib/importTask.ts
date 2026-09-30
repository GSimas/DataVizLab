import type { Locale } from "./catalog";
import { prepareTable } from "./columns";
import { parseDelimited, parseFile, type ParsedImport } from "./parse";

/** A file to read, or text pasted into the table. */
export type ImportRequest = { file?: File; text?: string; locale: Locale };

/** The parsed import with its rows already coerced to their column types (`columnTypes` always set). */
export type PreparedImport = ParsedImport & { columnTypes: NonNullable<ParsedImport["columnTypes"]> };

/** Parses and types a table. Runs inside the import worker, or on the main thread as a fallback. */
export async function runImport({ file, text, locale }: ImportRequest): Promise<PreparedImport> {
  const parsed: ParsedImport = file ? await parseFile(file) : { rows: parseDelimited(text ?? ""), dataName: "" };
  if (!parsed.rows.length) throw new Error("empty");
  const table = prepareTable(parsed.rows, locale, parsed.columnTypes);
  return { ...parsed, rows: table.rows, columnTypes: table.specs };
}
