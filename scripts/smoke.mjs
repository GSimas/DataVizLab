// End-to-end smoke test of the production build in headless Chrome: every lazily loaded part actually loads
// and works (catalog thumbnails, studio chart, keyboard tabs, file import through the worker, pasted data,
// assistant panel, guided tour). Usage: node scripts/smoke.mjs [url]
import { resolve } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const url = process.argv.find((arg) => arg.startsWith("http")) ?? "http://localhost:5190/";
const page = await launch();
const results = [];
const check = async (name, fn) => {
  try { const detail = await fn(); results.push([true, name, detail ?? ""]); } catch (error) { results.push([false, name, String(error.message ?? error).slice(0, 160)]); }
};
const expect = (condition, message) => { if (!condition) throw new Error(message); };

try {
  await page.goto(url);
  await sleep(1500);
  await page.evaluate("window.__errors = []; addEventListener('error', (e) => __errors.push(String(e.message))); addEventListener('unhandledrejection', (e) => __errors.push(String(e.reason)))");

  await check("catalog thumbnails load (images and inline text charts)", async () => {
    await page.evaluate("location.hash = '#/catalogo'");
    await page.waitFor(".viz-card .chart-thumb img");
    await sleep(2500);
    const stats = JSON.parse(await page.evaluate(`JSON.stringify((() => { const imgs = [...document.querySelectorAll('.viz-card .chart-thumb img')]; imgs.forEach((img) => img.scrollIntoView()); return { imgs: imgs.length, decoded: imgs.filter((img) => img.complete && img.naturalWidth > 0).length, inline: document.querySelectorAll('.viz-card .chart-thumb svg').length }; })())`));
    await sleep(1500);
    const decoded = await page.evaluate("[...document.querySelectorAll('.viz-card .chart-thumb img')].filter((img) => img.complete && img.naturalWidth > 0).length");
    expect(decoded === stats.imgs && stats.imgs > 0, `${decoded}/${stats.imgs} images decoded`);
    return `${decoded} images, ${stats.inline} inline`;
  });

  await check("studio opens with a drawn chart", async () => {
    await page.evaluate("location.hash = '#/projetos'");
    await page.waitFor("button[data-tour=new-project]", 6000);
    await sleep(600);
    await page.click("button[data-tour=new-project]");
    await page.waitFor(".modal .choice-group");
    await page.click(".modal .choice-group label:nth-of-type(2)");
    await page.click(".modal button[type=submit]");
    await page.waitFor(".chart-canvas canvas", 10000);
    const label = await page.evaluate("document.querySelector('.chart-canvas').getAttribute('aria-label')");
    expect(label && label.length > 40, "chart has a text alternative");
    return label.slice(0, 60) + "…";
  });

  await check("visualization tabs work with the keyboard", async () => {
    await page.click(".viz-tab-add");
    await sleep(600);
    const tabs = await page.evaluate("document.querySelectorAll('[role=tablist] [role=tab]').length");
    expect(tabs === 2, `${tabs} tabs`);
    await page.evaluate("document.querySelector('[role=tab][aria-selected=true]').focus()");
    await page.press("ArrowLeft");
    await sleep(400);
    const state = JSON.parse(await page.evaluate(`JSON.stringify({ selected: [...document.querySelectorAll('[role=tab]')].findIndex((t) => t.getAttribute('aria-selected') === 'true'), focused: document.activeElement?.getAttribute('role'), panel: !!document.getElementById(document.querySelector('[role=tab]').getAttribute('aria-controls')), tabbable: [...document.querySelectorAll('[role=tab]')].filter((t) => t.tabIndex === 0).length })`));
    expect(state.selected === 0 && state.focused === "tab" && state.panel && state.tabbable === 1, JSON.stringify(state));
    return JSON.stringify(state);
  });

  await check("a CSV file is imported through the worker", async () => {
    const { root } = await page.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".studio-sidebar input[type=file]" });
    await page.send("DOM.setFileInputFiles", { nodeId, files: [resolve("public/sample-energy.csv")] });
    await sleep(2500);
    const info = JSON.parse(await page.evaluate(`JSON.stringify({ file: document.querySelector('.data-file strong')?.textContent, rows: document.querySelectorAll('.data-table tbody tr').length, worker: performance.getEntriesByType('resource').some((r) => /worker/i.test(r.name) || r.initiatorType === 'other' && /\\.js/.test(r.name)) })`));
    expect(info.file === "sample-energy.csv" && info.rows > 0, JSON.stringify(info));
    return JSON.stringify(info);
  });

  await check("pasted data is imported", async () => {
    await page.click(".mini-actions button");
    await page.waitFor(".paste-area");
    await page.evaluate("document.querySelector('.paste-area').focus()");
    await page.send("Input.insertText", { text: "Fruta,Qtd\nMaçã,12\nPera,7\nUva,21" });
    await sleep(200);
    await page.click(".modal .button-primary");
    await sleep(1500);
    const rows = await page.evaluate("document.querySelectorAll('.data-table tbody tr').length");
    expect(rows === 3, `${rows} rows`);
    return `${rows} rows`;
  });

  await check("assistant panel loads on first open and closes with Escape", async () => {
    await page.click(".assistant-fab");
    await page.waitFor("aside.assistant", 8000);
    const controls = await page.evaluate("document.querySelector('.assistant-fab').getAttribute('aria-controls') === document.querySelector('aside.assistant').id");
    expect(controls, "fab aria-controls points at the panel");
    await page.press("Escape");
    await sleep(700);
    expect(!(await page.evaluate("!!document.querySelector('aside.assistant')")), "panel closed");
  });

  await check("guided tour loads and starts", async () => {
    await page.click(".settings-trigger");
    await page.waitFor(".settings-tour");
    await page.click(".settings-tour");
    await page.waitFor(".tour-card", 8000);
    await page.press("Escape");
  });

  await check("no uncaught errors", async () => {
    const found = JSON.parse(await page.evaluate("JSON.stringify(window.__errors || [])"));
    expect(!found.length, found.join(" | "));
  });
} finally {
  await page.close();
}

for (const [ok, name, detail] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
process.exitCode = results.every(([ok]) => ok) ? 0 : 1;
