import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { appendSheets, applySheets, hasSheets, sheetsFromImports } from "../../lib/data";
import { runImport } from "../../lib/importTask";
import { activateViz, addSheet, blankConfig, createProject, removeSheet, rowsForViz, sheetsOf, switchSheet, vizzesOnActiveSheet } from "../../lib/projects";

const workbook = () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Mês: "Jan", Receita: 10 }, { Mês: "Fev", Receita: 14 }]), "Vendas");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Região: "Sul", Pessoas: 3 }, { Região: "Norte", Pessoas: 5 }, { Região: "Leste", Pessoas: 2 }]), "Equipe");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Vazia");
  return new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], "plano.xlsx");
};

const imported = async () => {
  const table = await runImport({ file: workbook(), locale: "pt" });
  assert.ok(hasSheets(table));
  const base = createProject({ name: "Plano", locale: "pt", withSample: false });
  return applySheets({ ...base, visualizations: [] }, sheetsFromImports([{ fileName: "plano.xlsx", table }]), [], blankConfig("pt"));
};

test("an Excel workbook becomes one sheet per filled tab, each typed on its own", async () => {
  const table = await runImport({ file: workbook(), locale: "pt" });
  assert.deepEqual(table.sheets?.map((sheet) => sheet.name), ["Vendas", "Equipe"]);
  assert.equal(table.sheets?.[0].columnTypes.Receita.type !== undefined, true);
  assert.equal(table.sheets?.[1].rows.length, 3);
});

test("every sheet gets its own visualization and the first sheet is open", async () => {
  const project = await imported();
  assert.equal(project.sheets?.length, 2);
  assert.equal(project.rows.length, 2);
  assert.equal(project.sheets?.[0].rows.length, 0, "the open sheet is a placeholder");
  assert.equal(vizzesOnActiveSheet(project).length, 1);
  assert.deepEqual(project.visualizations.map((viz) => viz.sheetId), project.sheets?.map((sheet) => sheet.id));
  assert.equal(project.visualizations[1].xField, "Região");
});

test("switching sheets swaps the table, keeps edits and opens that sheet's chart", async () => {
  const project = await imported();
  const [vendas, equipe] = project.sheets!;
  const edited = { ...project, rows: project.rows.map((row, index) => (index === 0 ? { ...row, Receita: 99 } : row)) };
  const onTeam = switchSheet(edited, equipe.id);
  assert.equal(onTeam.rows.length, 3);
  assert.equal(onTeam.activeSheetId, equipe.id);
  assert.equal(onTeam.visualizations.find((viz) => viz.id === onTeam.activeVizId)?.sheetId, equipe.id);
  const back = switchSheet(onTeam, vendas.id);
  assert.equal(back.rows[0].Receita, 99);
  assert.equal(sheetsOf(back).find((sheet) => sheet.id === equipe.id)?.rows.length, 3);
});

test("a visualization draws the rows of its own sheet even when another sheet is open", async () => {
  const project = await imported();
  const teamViz = project.visualizations[1];
  assert.equal(rowsForViz(project, teamViz).length, 3);
  assert.equal(rowsForViz(project, project.visualizations[0]).length, 2);
  assert.equal(activateViz(project, teamViz.id).rows.length, 3);
});

test("adding and removing sheets keeps one visualization per sheet", async () => {
  const project = await imported();
  const added = addSheet(project, "Nova", blankConfig("pt"), "Aba 1");
  assert.equal(added.sheets?.length, 3);
  assert.equal(added.rows.length, 0);
  assert.equal(vizzesOnActiveSheet(added).length, 1);
  const removed = removeSheet(added, added.activeSheetId!);
  assert.equal(removed.sheets?.length, 2);
  assert.equal(removed.rows.length > 0, true);
  assert.equal(removed.visualizations.every((viz) => removed.sheets?.some((sheet) => sheet.id === viz.sheetId)), true);
  assert.equal(removeSheet(removeSheet(removed, removed.activeSheetId!), removed.sheets![0].id).sheets?.length, 1);
});

test("a single-sheet project becomes a workbook when a sheet is added, without losing its table", () => {
  const project = createProject({ name: "X", locale: "pt", withSample: true });
  const rows = project.rows.length;
  const added = addSheet(project, "Aba 2", blankConfig("pt"), "Aba 1");
  assert.equal(added.sheets?.length, 2);
  const first = switchSheet(added, added.sheets![0].id);
  assert.equal(first.rows.length, rows);
  assert.equal(first.visualizations.filter((viz) => viz.sheetId === first.activeSheetId).length, 1);
});

test("a project exported with sheets imports back with its sheets and their visualizations", async () => {
  const project = await imported();
  const sheets = sheetsOf(project);
  const exported = { schemaVersion: 3, name: project.name, rows: project.rows, sheets: sheets.map(({ id, name, dataName, rows, columnTypes }) => ({ id, name, dataName, rows, columnTypes })), visualizations: project.visualizations.map((viz) => { const copy: Partial<typeof viz> = { ...viz }; delete copy.id; return copy; }) };
  const table = await runImport({ file: new File([JSON.stringify(exported)], "projeto.json"), locale: "pt" });
  assert.ok(hasSheets(table));
  assert.deepEqual(table.sheets.map((sheet) => sheet.name), ["Vendas", "Equipe"]);
  const { visualizationsFrom } = await import("../../lib/data");
  const back = applySheets({ ...createProject({ name: "x", locale: "pt", withSample: false }), visualizations: [] }, sheetsFromImports([{ fileName: "projeto.json", table }]), visualizationsFrom(table.project!, blankConfig("pt")), blankConfig("pt"));
  assert.equal(back.visualizations.length, 2);
  assert.deepEqual(back.visualizations.map((viz) => viz.sheetId), back.sheets?.map((sheet) => sheet.id));
  assert.equal(rowsForViz(back, back.visualizations[1]).length, 3);
});

test("several files at once become one sheet each, with unique names", async () => {
  const csv = (name: string, text: string) => runImport({ file: new File([text], name), locale: "pt" }).then((table) => ({ fileName: name, table }));
  const read = [await csv("vendas.csv", "Mês,Receita\nJan,10\nFev,12"), await csv("vendas.tsv", "Mês\tReceita\nMar,3"), { fileName: "plano.xlsx", table: await runImport({ file: workbook(), locale: "pt" }) }];
  const sheets = sheetsFromImports(read);
  assert.deepEqual(sheets.map((sheet) => sheet.name), ["vendas", "vendas (2)", "Vendas", "Equipe"]);
  assert.equal(sheets[3].dataName, "plano.xlsx · Equipe");
});

test("adding spreadsheets keeps the current data and opens the first new sheet", async () => {
  const project = createProject({ name: "X", locale: "pt", withSample: true });
  const rows = project.rows.length;
  const table = await runImport({ file: workbook(), locale: "pt" });
  const added = appendSheets(project, sheetsFromImports([{ fileName: "plano.xlsx", table }]), blankConfig("pt"), "Aba 1");
  assert.equal(added.sheets?.length, 3);
  assert.equal(added.sheets?.[1].name, "Vendas");
  assert.equal(added.rows.length, 2, "the first added sheet is open");
  assert.equal(sheetsOf(added)[0].rows.length, rows, "the original table is kept as the first sheet");
  assert.equal(added.visualizations.length, 3);
  const again = appendSheets(added, sheetsFromImports([{ fileName: "plano.xlsx", table }]), blankConfig("pt"), "Aba 1");
  assert.deepEqual(again.sheets?.map((sheet) => sheet.name).slice(3), ["Vendas (2)", "Equipe (2)"]);
  const empty = appendSheets(createProject({ name: "Y", locale: "pt", withSample: false }), sheetsFromImports([{ fileName: "plano.xlsx", table }]), blankConfig("pt"), "Aba 1");
  assert.equal(empty.sheets?.length, 2, "an empty project just takes the new sheets");
});
