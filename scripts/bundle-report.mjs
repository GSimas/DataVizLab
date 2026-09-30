// Bundle report for the production build (`next build`): what the first visit downloads,
// every JS chunk with its raw, gzip and brotli size, and which heavy library each one carries.
// Usage: node scripts/bundle-report.mjs [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = ".next";
const kb = (bytes) => Math.round(bytes / 102.4) / 10;
const sizes = (buffer) => ({
  raw: buffer.length,
  gzip: gzipSync(buffer, { level: 9 }).length,
  brotli: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});

// Signatures that only appear inside a given library's code.
const MARKERS = {
  echarts: /zrender|__ec_inner_|echarts/i,
  xlsx: /SheetJS|XLSX\.version|sheet_to_json/,
  jszip: /JSZip|jszip/,
  papaparse: /papaparse|Papa\.parse|BAD_DELIMITERS/,
  "anthropic-sdk": /anthropic-version|@anthropic-ai|AnthropicError/,
  "react-dom": /react-dom|__reactFiber/,
  lucide: /lucide/,
};

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

const chunks = walk(join(root, "static")).filter((path) => path.endsWith(".js")).map((path) => {
  const buffer = readFileSync(path);
  const text = buffer.toString("utf8");
  return { file: path.replace(/\\/g, "/").replace(`${root}/`, ""), ...sizes(buffer), libs: Object.entries(MARKERS).filter(([, re]) => re.test(text)).map(([name]) => name) };
}).sort((a, b) => b.raw - a.raw);

// The first visit: every script the prerendered home page references.
const html = readFileSync(join(root, "server", "app", "index.html"), "utf8");
const initialFiles = new Set([...html.matchAll(/(?:src|href)="\/_next\/(static\/[^"]+?\.js)"/g)].map((match) => match[1]));
const initial = chunks.filter((chunk) => initialFiles.has(chunk.file));
const sum = (list, key) => list.reduce((total, chunk) => total + chunk[key], 0);
const css = walk(join(root, "static")).filter((path) => path.endsWith(".css")).map((path) => sizes(readFileSync(path)));

const report = {
  initial: { files: initial.length, raw: sum(initial, "raw"), gzip: sum(initial, "gzip"), brotli: sum(initial, "brotli"), libs: [...new Set(initial.flatMap((chunk) => chunk.libs))] },
  total: { files: chunks.length, raw: sum(chunks, "raw"), gzip: sum(chunks, "gzip"), brotli: sum(chunks, "brotli") },
  css: { files: css.length, raw: sum(css, "raw"), gzip: sum(css, "gzip") },
  lazyChunks: chunks.length - initial.length,
  chunks,
};

console.log("\nFirst visit (home page)");
console.log(`  JS  ${report.initial.files} files · ${kb(report.initial.raw)} KB raw · ${kb(report.initial.gzip)} KB gzip · ${kb(report.initial.brotli)} KB brotli`);
console.log(`  libraries loaded up front: ${report.initial.libs.join(", ") || "none"}`);
console.log(`All JS: ${report.total.files} files · ${kb(report.total.raw)} KB raw · ${kb(report.total.gzip)} KB gzip · ${kb(report.total.brotli)} KB brotli`);
console.log(`CSS: ${report.css.files} files · ${kb(report.css.raw)} KB raw · ${kb(report.css.gzip)} KB gzip`);
console.log(`Chunks loaded on demand: ${report.lazyChunks}\n`);
console.log("Largest chunks");
for (const chunk of chunks.slice(0, 12)) {
  console.log(`  ${initialFiles.has(chunk.file) ? "initial" : "lazy   "}  ${String(kb(chunk.raw)).padStart(7)} KB raw  ${String(kb(chunk.gzip)).padStart(6)} KB gz  ${chunk.file.split("/").pop()}  ${chunk.libs.join(", ")}`);
}

const out = process.argv.indexOf("--json");
if (out > -1) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 2));
