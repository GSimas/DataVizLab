import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildThumbnails } from "../../scripts/build-thumbnails";
import { runImport } from "../../lib/importTask";

/* What the page ships instead of computing: pre-rendered thumbnails, and imports typed off the main thread. */

test("the pre-rendered catalog thumbnails match the charts (run `npm run thumbs` after changing a chart)", () => {
  const { files, versionModule } = buildThumbnails();
  assert.equal(files.size, 78 * 2 * 2, "every chart, in both themes and both languages");
  const stale = [...files].filter(([path, svg]) => !existsSync(path) || readFileSync(path, "utf8") !== svg).map(([path]) => path);
  assert.deepEqual(stale.slice(0, 5), [], `${stale.length} stale thumbnails`);
  assert.equal(readFileSync("components/thumbs.generated.ts", "utf8"), versionModule, "the cache-busting version matches the files");
  for (const svg of files.values()) assert.ok(!/\bzr\d+-/.test(svg), "element ids do not depend on render order");
});

test("imports are parsed and typed in one step (the work the import worker does)", async () => {
  const table = await runImport({ text: "Mês;Receita;Data\nJan;1.234,50;15/03/2024\nFev;980,00;16/03/2024\nMar;1.050,75;17/03/2024", locale: "pt" });
  assert.deepEqual(Object.keys(table.columnTypes), ["Mês", "Receita", "Data"]);
  assert.equal(table.columnTypes.Data.type, "date");
  assert.equal(table.rows[0].Data, "2024-03-15");
  assert.equal(typeof table.rows[0].Receita, "number");
  await assert.rejects(runImport({ text: "", locale: "pt" }), /empty/);
});
