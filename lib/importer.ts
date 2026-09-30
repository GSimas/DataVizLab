import type { Locale } from "./catalog";
import type { ImportRequest, PreparedImport } from "./importTask";

export type { PreparedImport } from "./importTask";

/* Main-thread side of importing: hands the file to the import worker and waits for the typed table.
   Where workers are unavailable (or the worker fails to start), the same code runs here instead. */

type Reply = { id: number; ok: true; result: PreparedImport } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (result: PreparedImport) => void; reject: (error: Error) => void }>();

function startWorker(): Worker | null {
  if (worker || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const entry = waiting.get(reply.id);
      if (!entry) return;
      waiting.delete(reply.id);
      if (reply.ok) entry.resolve(reply.result);
      else entry.reject(new Error(reply.error));
    };
    worker.onerror = () => {
      // A worker that cannot start sends every waiting import back to the main thread.
      worker?.terminate();
      worker = null;
      const stuck = [...waiting.values()];
      waiting.clear();
      stuck.forEach((entry) => entry.reject(new Error("worker-failed")));
    };
  } catch {
    worker = null;
  }
  return worker;
}

const onMainThread = (request: ImportRequest) => import("./importTask").then(({ runImport }) => runImport(request));

/** Reads a file (or pasted text) and returns its rows already typed, without blocking the page. */
export function importTable(source: File | string, locale: Locale): Promise<PreparedImport> {
  const request: ImportRequest = typeof source === "string" ? { text: source, locale } : { file: source, locale };
  const target = startWorker();
  if (!target) return onMainThread(request);
  const id = ++nextId;
  return new Promise<PreparedImport>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    target.postMessage({ id, ...request });
  }).catch((error: Error) => (error.message === "worker-failed" ? onMainThread(request) : Promise.reject(error)));
}
