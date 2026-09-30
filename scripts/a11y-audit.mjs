// Accessibility audit of DataVizLab (WCAG 2.1 A and AA) with axe-core in a real headless Chrome.
// Visits every view, modal and menu in the dark and light themes, and tabs through the page to check
// that every focused element shows a visible focus indicator.
//
// Usage: node scripts/a11y-audit.mjs [url] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { launch, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const url = args.find((arg) => arg.startsWith("http")) ?? "http://localhost:5190/";
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Runs axe on the current page and returns its WCAG violations, one entry per rule and node. */
async function axe(page) {
  if (await page.evaluate("typeof window.axe") !== "object") await page.send("Runtime.evaluate", { expression: axeSource });
  const raw = await page.evaluate(`axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(TAGS)} }, resultTypes: ["violations"] }).then((r) => JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(" "), summary: n.failureSummary.split("\\n").slice(1, 2).join(" ").trim() })) }))))`);
  return JSON.parse(raw);
}

/** Tabs through the page and lists focused elements whose focus leaves no visible trace. */
async function focusCheck(page, steps = 45) {
  await page.evaluate("document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0)");
  const invisible = [];
  for (let i = 0; i < steps; i++) {
    await page.press("Tab");
    await sleep(40);
    // Visible means: the element or one of its two nearest ancestors (a :focus-within ring) looks different
    // focused than unfocused. Compared with transitions off, so the unfocused look is read immediately.
    const info = await page.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const chain = [el, el.parentElement, el.parentElement && el.parentElement.parentElement].filter(Boolean);
      const look = () => chain.map((node) => { const s = getComputedStyle(node); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|"); }).join("/");
      const style = document.createElement("style");
      style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
      document.head.appendChild(style);
      const focused = look();
      el.blur();
      const unfocused = look();
      el.focus({ preventScroll: true });
      style.remove();
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 40);
      return { visible: focused !== unfocused, id: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/)[0] : "") + " «" + label + "»" };
    })()`);
    if (info && !info.visible && !invisible.includes(info.id)) invisible.push(info.id);
  }
  return invisible;
}

const page = await launch();
const states = [];
const record = async (name, { focus = false } = {}) => {
  await sleep(500);
  const violations = await axe(page);
  const noFocusRing = focus ? await focusCheck(page) : [];
  states.push({ name, violations, noFocusRing });
};

try {
  for (const theme of ["dark", "light"]) {
    await page.goto(url);
    await page.evaluate(`localStorage.setItem("datavizlab-prefs", JSON.stringify({ locale: "pt", theme: "${theme}", contrast: "normal", motion: "reduced", fontSize: "md" }))`);
    await page.goto(url);
    await sleep(1500);
    const t = theme === "dark" ? "escuro" : "claro";
    await record(`Início (${t})`, { focus: theme === "dark" });
    await page.click(".settings-trigger"); await record(`Menu de ajustes (${t})`); await page.press("Escape");
    await page.click(".assistant-fab"); await record(`Assistente aberto (${t})`); await page.press("Escape");
    await page.evaluate("location.hash = '#/catalogo'"); await sleep(1500); await record(`Catálogo (${t})`, { focus: theme === "dark" });
    await page.click(".viz-card .card-hit"); await record(`Ficha do método (${t})`); await page.press("Escape");
    await page.evaluate("location.hash = '#/projetos'"); await sleep(1000); await record(`Projetos (${t})`);
    await page.click("button[data-tour=new-project]"); await page.waitFor(".modal .choice-group"); await record(`Novo projeto (${t})`);
    await page.click(".modal .choice-group label:nth-of-type(2)"); await page.click(".modal button[type=submit]");
    await page.waitFor(".data-table td input", 8000); await sleep(1200);
    await record(`Estúdio (${t})`, { focus: theme === "dark" });
  }
} finally {
  await page.close();
}

// Same rule on the same element in several states counts once.
const unique = new Map();
for (const state of states) for (const violation of state.violations) for (const node of violation.nodes) {
  const key = `${violation.id}|${node.target}`;
  if (!unique.has(key)) unique.set(key, { rule: violation.id, impact: violation.impact, help: violation.help, target: node.target, summary: node.summary, states: [] });
  unique.get(key).states.push(state.name);
}
const focusIssues = [...new Set(states.flatMap((state) => state.noFocusRing))];

console.log(`\nWCAG 2.1 A/AA · axe-core · ${states.length} states`);
for (const state of states) console.log(`  ${state.name.padEnd(28)} ${state.violations.reduce((sum, v) => sum + v.nodes.length, 0)} nodes in ${state.violations.length} rules`);
console.log(`\nDistinct violations: ${unique.size}`);
const byRule = new Map();
for (const item of unique.values()) byRule.set(item.rule, [...(byRule.get(item.rule) ?? []), item]);
for (const [rule, items] of byRule) {
  console.log(`\n  [${items[0].impact}] ${rule} — ${items[0].help} (${items.length})`);
  for (const item of items.slice(0, 8)) console.log(`     ${item.target}  ${item.summary ? "· " + item.summary.slice(0, 110) : ""}`);
  if (items.length > 8) console.log(`     … ${items.length - 8} more`);
}
console.log(`\nFocused elements without a visible focus indicator: ${focusIssues.length}`);
for (const item of focusIssues) console.log(`  ${item}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ states, violations: [...unique.values()], focusIssues }, null, 2));
