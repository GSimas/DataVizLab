import assert from "node:assert/strict";
import test from "node:test";
import {
  coerceCell, convertColumn, formatCell, inferColumnSpec, invalidCounts, parseBoolean, parseNumeric, parseTime, prepareTable, readTyped, typingPattern,
} from "../../lib/columns";

test("parseNumeric follows the locale for a lone separator", () => {
  assert.equal(parseNumeric("1.234", "pt"), 1234);
  assert.equal(parseNumeric("1.234", "en"), 1.234);
  assert.equal(parseNumeric("1,234", "pt"), 1.234);
  assert.equal(parseNumeric("1,234", "en"), 1234);
  assert.equal(parseNumeric("0.125", "pt"), 0.125);
  assert.equal(parseNumeric("12,5", "pt"), 12.5);
});

test("parseNumeric handles grouped numbers, symbols and signs", () => {
  assert.equal(parseNumeric("1.234,50", "pt"), 1234.5);
  assert.equal(parseNumeric("1,234.50", "en"), 1234.5);
  assert.equal(parseNumeric("R$ 1.234.567,89", "pt"), 1234567.89);
  assert.equal(parseNumeric("-45%", "pt"), -45);
  assert.equal(parseNumeric("−3,5", "pt"), -3.5);
  assert.equal(parseNumeric(".5", "en"), 0.5);
});

test("parseNumeric rejects text and malformed numbers", () => {
  for (const bad of ["abc", "12abc", "1.2.3", "12.34.56", "--1", "", "n/d", "1,2,3", "1.234,567.8", "-"]) assert.equal(parseNumeric(bad, "pt"), null, bad);
  assert.equal(parseNumeric(Number.NaN, "pt"), null);
});

test("typing pattern and live reading", () => {
  const decimal = typingPattern("number");
  const integer = typingPattern("integer");
  for (const ok of ["", "-", "12", "12,", "12,5", "12.5", "-0,5"]) assert.ok(decimal.test(ok), `decimal accepts ${ok}`);
  for (const bad of ["a", "1a", "1,2,3", "12 3", "1e5", "--1"]) assert.ok(!decimal.test(bad), `decimal rejects ${bad}`);
  assert.ok(integer.test("-42") && !integer.test("4,2") && !integer.test("4.2"));
  assert.equal(readTyped("-"), null);
  assert.equal(readTyped(","), null);
  assert.equal(readTyped("12,"), 12);
  assert.equal(readTyped("12,5"), 12.5);
});

test("time and boolean parsing", () => {
  assert.equal(parseTime("9:05"), "09:05");
  assert.equal(parseTime("23:59:59"), "23:59:59");
  assert.equal(parseTime("3:30 PM"), "15:30");
  assert.equal(parseTime("12:00 AM"), "00:00");
  for (const bad of ["24:00", "12:60", "9", "9:5", "ab:cd", "13:00 PM"]) assert.equal(parseTime(bad), null, bad);
  assert.equal(parseBoolean("Sim"), true);
  assert.equal(parseBoolean("não"), false);
  assert.equal(parseBoolean("1"), true);
  assert.equal(parseBoolean("1", false), null);
  assert.equal(parseBoolean("talvez"), null);
});

test("coerceCell canonicalizes values and flags what does not fit", () => {
  assert.deepEqual(coerceCell({ type: "number" }, "12,5", "pt"), { value: 12.5, valid: true });
  assert.deepEqual(coerceCell({ type: "integer" }, "12,5", "pt"), { value: "12,5", valid: false });
  assert.deepEqual(coerceCell({ type: "integer" }, 7, "pt"), { value: 7, valid: true });
  assert.deepEqual(coerceCell({ type: "currency", currency: "BRL" }, "R$ 1.000,00", "pt"), { value: 1000, valid: true });
  assert.deepEqual(coerceCell({ type: "percent" }, "45%", "pt"), { value: 45, valid: true });
  assert.deepEqual(coerceCell({ type: "number" }, "n/d", "pt"), { value: "n/d", valid: false });
  assert.deepEqual(coerceCell({ type: "date" }, "15/03/2024", "pt"), { value: "2024-03-15", valid: true });
  assert.deepEqual(coerceCell({ type: "date" }, "03/15/2024", "en"), { value: "2024-03-15", valid: true });
  assert.deepEqual(coerceCell({ type: "date" }, "2024-03-15T10:00:00Z", "pt"), { value: "2024-03-15", valid: true });
  assert.equal(coerceCell({ type: "date" }, "2024-02-31", "pt").valid, false);
  assert.deepEqual(coerceCell({ type: "time" }, "8:05", "pt"), { value: "08:05", valid: true });
  assert.deepEqual(coerceCell({ type: "boolean" }, "sim", "pt"), { value: true, valid: true });
  assert.deepEqual(coerceCell({ type: "number" }, "", "pt"), { value: "", valid: true });
  assert.deepEqual(coerceCell({ type: "number" }, null, "pt"), { value: null, valid: true });
  assert.deepEqual(coerceCell({ type: "text" }, 42, "pt"), { value: "42", valid: true });
});

test("formatCell shows numbers, currency and dates for people", () => {
  assert.equal(formatCell({ type: "number" }, 1234.5, "pt"), "1234,5");
  assert.equal(formatCell({ type: "number" }, 1234.5, "en"), "1234.5");
  assert.equal(formatCell({ type: "percent" }, 12.5, "pt"), "12,5%");
  assert.equal(formatCell({ type: "currency", currency: "BRL" }, 1234.5, "pt"), "R$ 1.234,50");
  assert.equal(formatCell({ type: "date" }, "2024-03-15", "pt"), "15/03/2024");
  assert.equal(formatCell({ type: "date" }, "2024-03-15", "en"), "03/15/2024");
  assert.equal(formatCell({ type: "boolean" }, true, "pt"), "Sim");
  assert.equal(formatCell({ type: "number" }, "n/d", "pt"), "n/d");
});

test("inferColumnSpec picks the type from the contents", () => {
  const rows = (values: unknown[]) => values.map((value) => ({ v: value as string | number | boolean | null }));
  assert.equal(inferColumnSpec(rows([1, 2.5, 3]), "v", "pt").type, "number");
  assert.equal(inferColumnSpec(rows(["1,5", "2,5", "10"]), "v", "pt").type, "number");
  assert.equal(inferColumnSpec(rows(["12%", "15%", "30,5%"]), "v", "pt").type, "percent");
  assert.deepEqual(inferColumnSpec(rows(["R$ 10,00", "R$ 25,50", "R$ 3,00"]), "v", "pt"), { type: "currency", currency: "BRL" });
  assert.deepEqual(inferColumnSpec(rows(["$10.00", "$25.50"]), "v", "en"), { type: "currency", currency: "USD" });
  assert.equal(inferColumnSpec(rows(["2024-01-05", "2024-02-10", "2024-03-15"]), "v", "pt").type, "date");
  assert.equal(inferColumnSpec(rows(["15/01/2024", "16/01/2024"]), "v", "pt").type, "date");
  assert.equal(inferColumnSpec(rows(["08:30", "12:45", "18:00"]), "v", "pt").type, "time");
  assert.equal(inferColumnSpec(rows([true, false, true]), "v", "pt").type, "boolean");
  assert.equal(inferColumnSpec(rows(["sim", "não", "sim"]), "v", "pt").type, "boolean");
  assert.equal(inferColumnSpec(rows([]), "v", "pt").type, "text");
});

test("inferColumnSpec separates categories from free text and keeps codes as text", () => {
  const rows = (values: string[]) => values.map((value) => ({ v: value }));
  const category = inferColumnSpec(rows(["Solar", "Eólica", "Solar", "Biogás", "Solar", "Eólica", "Biogás", "Solar"]), "v", "pt");
  assert.equal(category.type, "category");
  assert.deepEqual(category.options, ["Biogás", "Eólica", "Solar"]);
  assert.equal(inferColumnSpec(rows(["Ana", "Bruno", "Carla", "Daniel", "Eva", "Fábio", "Gabi", "Hugo"]), "v", "pt").type, "text");
  assert.equal(inferColumnSpec(rows(["001", "002", "003", "004"]), "v", "pt").type, "text");
  assert.equal(inferColumnSpec(rows(["A", "B", "C", "D", "E"]), "v", "pt").type, "text");
});

test("a mostly numeric column stays numeric and flags the strays", () => {
  const data = [10, 20, 30, 40, "n/d", 50, 60, 70, 80, 90].map((v) => ({ v: v as string | number }));
  const spec = inferColumnSpec(data, "v", "pt");
  assert.equal(spec.type, "number");
  assert.deepEqual(invalidCounts(data, { v: spec }, "pt"), { v: 1 });
});

test("prepareTable normalizes imported strings to their types", () => {
  const { rows, specs } = prepareTable([
    { Data: "15/01/2024", Valor: "1.234,50", Ativo: "sim", Nome: "Ana" },
    { Data: "16/01/2024", Valor: "2.000,00", Ativo: "não", Nome: "Bruno" },
  ], "pt");
  assert.equal(specs.Data.type, "date");
  assert.equal(specs.Valor.type, "number");
  assert.equal(specs.Ativo.type, "boolean");
  assert.deepEqual(rows[0], { Data: "2024-01-15", Valor: 1234.5, Ativo: true, Nome: "Ana" });
  assert.equal(rows[1].Valor, 2000);
});

test("convertColumn converts what it can and counts the rest", () => {
  const data = [{ v: "10" }, { v: "2,5" }, { v: "abc" }, { v: "" }];
  const { rows, invalid } = convertColumn(data, "v", { type: "number" }, "pt");
  assert.deepEqual(rows.map((row) => row.v), [10, 2.5, "abc", ""]);
  assert.equal(invalid, 1);
  const integers = convertColumn(data, "v", { type: "integer" }, "pt");
  assert.equal(integers.invalid, 2);
});
