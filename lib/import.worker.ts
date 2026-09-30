/// <reference lib="webworker" />
import type { Locale } from "./catalog";
import { runImport, type ImportRequest } from "./importTask";

/* Import worker: parses the file and types every column off the main thread, so a 50 000-row spreadsheet
   never freezes the page. The main thread only receives the finished table. */

self.onmessage = async (event: MessageEvent<ImportRequest & { id: number; locale: Locale }>) => {
  const { id, ...request } = event.data;
  try {
    self.postMessage({ id, ok: true, result: await runImport(request) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
