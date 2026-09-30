// Lab measurements for DataVizLab in a real, headless Chrome: loads the app on a clean profile, runs the
// interactions people actually do, and reports Web Vitals, per-interaction latency and memory.
//
// Usage: node scripts/perf-lab.mjs [url] [--mobile] [--json out.json]
//   --mobile  4× slower CPU and a slow 4G link (Lighthouse's mobile preset)
import { writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const url = args.find((arg) => arg.startsWith("http")) ?? "http://localhost:5190/";
const mobile = args.includes("--mobile");
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

// Observers installed before any app code runs, so nothing is missed.
const INSTRUMENT = `
  window.__perf = { long: [], events: [], lcp: 0, fcp: 0, cls: 0 };
  const watch = (type, fn, extra = {}) => { try { new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch {} };
  watch("longtask", (e) => __perf.long.push([e.startTime, e.duration]));
  watch("largest-contentful-paint", (e) => { __perf.lcp = e.startTime; });
  watch("paint", (e) => { if (e.name === "first-contentful-paint") __perf.fcp = e.startTime; });
  watch("layout-shift", (e) => { if (!e.hadRecentInput) __perf.cls += e.value; });
  watch("event", (e) => { if (e.interactionId) __perf.events.push([e.startTime, e.duration, e.name]); }, { durationThreshold: 16 });
`;

const page = await launch({ mobile, init: INSTRUMENT });
const { evaluate, click, type, press, waitFor } = page;
const readPerf = () => evaluate("JSON.stringify(__perf)").then(JSON.parse);

/** Runs one interaction and reports its worst event latency and the main-thread blocking that followed. */
async function measure(name, action, settle = 1800) {
  const start = await evaluate("performance.now()");
  await action();
  await sleep(settle);
  const perf = await readPerf();
  const events = perf.events.filter(([t]) => t >= start - 5);
  const longs = perf.long.filter(([t]) => t >= start - 5);
  return { name, latency: Math.round(Math.max(0, ...events.map(([, duration]) => duration))), blocking: Math.round(longs.reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0)), longest: Math.round(Math.max(0, ...longs.map(([, duration]) => duration))), longTasks: longs.length };
}

const results = { url, profile: mobile ? "mobile (4× CPU, slow 4G)" : "desktop", load: {}, interactions: [], memory: {} };
try {
  // 1. First load of the home page.
  await page.goto(url);
  await sleep(mobile ? 6000 : 3500);
  const perf = await readPerf();
  const transfer = await evaluate("performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).reduce((sum, r) => sum + r.transferSize, 0)");
  results.load = { FCP: Math.round(perf.fcp), LCP: Math.round(perf.lcp), CLS: Math.round(perf.cls * 1000) / 1000, TBT: Math.round(perf.long.reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0)), longestTask: Math.round(Math.max(0, ...perf.long.map(([, d]) => d))), jsTransferKB: Math.round(transfer / 1024), heapMB: await page.heapMB(), domNodes: await page.domNodes() };

  // 2. Interactions, in the order a visitor would do them.
  const run = async (name, action, settle) => { try { results.interactions.push(await measure(name, action, settle)); } catch (error) { results.interactions.push({ name, error: String(error.message ?? error) }); } };
  await run("Abrir catálogo", () => click('.main-nav a[href="#/catalogo"]'), 2500);
  await run("Buscar no catálogo (digitar)", async () => { await click(".search-field input"); await type("barras"); });
  await run("Limpar busca", async () => { await evaluate("document.querySelector('.search-field input').select()"); await press("Backspace"); });
  await run("Carregar mais métodos", () => click(".load-more button"), 2500);
  await run("Abrir ficha do método", () => click(".viz-card .card-hit"));
  await run("Fechar ficha (Esc)", () => press("Escape"));
  await run("Abrir projetos", () => click('.main-nav a[href="#/projetos"]'));
  await run("Criar projeto de exemplo", async () => { await click("button[data-tour=new-project]"); await waitFor(".modal .choice-group"); await click(".modal .choice-group label:nth-of-type(2)"); await click(".modal button[type=submit]"); }, 3000);
  await waitFor(".data-table td input.cell-num", 8000).catch(() => undefined);
  await run("Editar célula numérica", async () => { await click(".data-table td input.cell-num"); await type("12"); });
  await run("Trocar gráfico (sugestão)", () => click(".suggestion-list .suggestion:nth-child(2)"), 2500);
  await run("Voltar ao início", () => click('.main-nav a[href="#/"]'));

  // 3. Memory: cycle through every view; what stays after garbage collection is a leak.
  const heapBefore = await page.heapMB();
  const nodesBefore = await page.domNodes();
  for (let i = 0; i < 6; i++) {
    for (const hash of ["#/catalogo", "#/projetos", "#/", "#/catalogo"]) { await evaluate(`location.hash = ${JSON.stringify(hash)}`); await sleep(500); }
    await evaluate("(() => { const a = document.querySelector('a[href^=\"#/projetos/\"]'); if (a) location.hash = a.getAttribute('href'); })()");
    await sleep(900);
  }
  await evaluate("location.hash = '#/'");
  // Let the last view transition finish, then collect twice so only what is really retained remains.
  await sleep(2000);
  await page.heapMB();
  results.memory = { heapBeforeMB: heapBefore, heapAfterMB: await page.heapMB(), nodesBefore, nodesAfter: await page.domNodes() };
} finally {
  await page.close();
}

const { load, memory } = results;
console.log(`\n${results.profile} · ${url}`);
console.log(`Load: FCP ${load.FCP} ms · LCP ${load.LCP} ms · CLS ${load.CLS} · TBT ${load.TBT} ms · longest task ${load.longestTask} ms · JS ${load.jsTransferKB} KB · heap ${load.heapMB} MB · ${load.domNodes} nodes`);
console.log("\nInteraction                       latency  blocking  longest  tasks");
for (const item of results.interactions) {
  if (item.error) { console.log(`  ${item.name.padEnd(32)} ERROR ${item.error}`); continue; }
  console.log(`  ${item.name.padEnd(32)} ${String(item.latency).padStart(5)} ms ${String(item.blocking).padStart(6)} ms ${String(item.longest).padStart(6)} ms ${String(item.longTasks).padStart(5)}`);
}
results.INP = Math.max(0, ...results.interactions.filter((item) => !item.error).map((item) => item.latency));
results.interactionBlocking = results.interactions.reduce((sum, item) => sum + (item.blocking ?? 0), 0);
console.log(`\nINP (worst interaction): ${results.INP} ms · main-thread blocking across all interactions: ${results.interactionBlocking} ms`);
console.log(`Memory after 6 navigation cycles: ${memory.heapBeforeMB} → ${memory.heapAfterMB} MB heap · ${memory.nodesBefore} → ${memory.nodesAfter} DOM nodes`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
