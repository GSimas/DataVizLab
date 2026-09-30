import assert from "node:assert/strict";
import test from "node:test";
import { catalog, type Locale } from "../../lib/catalog";
import { categoryOptions, coerceCell, kindOfSpec, type ColumnSpecs } from "../../lib/columns";
import { auditChart } from "../../lib/audit";
import { NEEDS_NUMERIC_X, NO_NUMERIC_Y } from "../../lib/chartNeeds";
import { chartsWithoutSample, matchSample, sampleConfig, sampleFor, type Sample } from "../../lib/samples";

const locales: Locale[] = ["pt", "en"];
const ids = catalog.map((entry) => entry.id);

const forEach = (fn: (sample: Sample, chartId: string, locale: Locale) => void) => {
  for (const locale of locales) for (const id of ids) fn(sampleFor(id, locale), id, locale);
};

const kind = (sample: Sample, field: string) => kindOfSpec(sample.columnTypes[field]);

test("every chart in the catalog has its own sample", () => {
  assert.deepEqual(chartsWithoutSample(), []);
  forEach((sample, id) => assert.equal(sample.chartId, id));
});

test("samples are tables: rows, typed columns, mapped fields that exist", () => {
  forEach((sample, id, locale) => {
    const where = `${id}/${locale}`;
    assert.ok(sample.rows.length >= 4, `${where}: rows`);
    const columns = Object.keys(sample.rows[0]);
    assert.deepEqual(Object.keys(sample.columnTypes), columns, `${where}: one type per column`);
    sample.rows.forEach((row) => assert.deepEqual(Object.keys(row), columns, `${where}: same columns in every row`));
    for (const field of Object.values(sample.mapping)) if (field) assert.ok(columns.includes(field), `${where}: mapped field ${field} exists`);
    assert.ok(sample.mapping.xField, `${where}: has an X field`);
    assert.ok(sample.title && sample.subtitle && sample.name && sample.story, `${where}: texts`);
  });
});

test("every cell is valid for the type of its column", () => {
  forEach((sample, id, locale) => {
    sample.rows.forEach((row, index) => {
      Object.entries(sample.columnTypes).forEach(([column, spec]) => {
        const result = coerceCell(spec, row[column], locale);
        assert.ok(result.valid, `${id}/${locale}: row ${index + 1}, ${column} = ${JSON.stringify(row[column])} is not ${spec.type}`);
        assert.deepEqual(result.value, row[column], `${id}/${locale}: ${column} is stored canonically`);
        if (spec.type === "category" && spec.options?.length) assert.ok(spec.options.includes(String(row[column])), `${id}/${locale}: ${column} value ${row[column]} is a declared option`);
      });
    });
  });
});

test("category columns list the options that appear in the data", () => {
  const sample = sampleFor("grouped-bar", "pt");
  const options = categoryOptions(sample.columnTypes.Fonte, sample.rows, "Fonte", "pt");
  assert.deepEqual(new Set(options), new Set(["Solar", "Eólica", "Biogás"]));
});

test("the fields each chart reads have the kind of data it needs", () => {
  const noY = NO_NUMERIC_Y;
  const numericX = NEEDS_NUMERIC_X;
  const needsSeries = ["grouped-bar", "stacked-bar", "normalized-bar", "stacked-area", "streamgraph", "dumbbell", "dot-plot", "span", "butterfly", "population-pyramid", "waterfall", "slope", "heatmap", "correlogram", "marimekko", "parallel", "sankey", "alluvial", "chord", "non-ribbon-chord", "network", "arc", "edge-bundling", "flowchart", "cooccurrence", "brainstorm", "tree", "dendrogram", "treemap", "sunburst", "circle-packing", "icicle", "flow-map"];
  const linkSizes = ["network", "arc", "chord", "edge-bundling", "cooccurrence", "dendrogram"];
  forEach((sample, id) => {
    const { xField, yField, seriesField, sizeField } = sample.mapping;
    if (!noY.has(id)) assert.equal(kind(sample, yField), "numeric", `${id}: Y is numeric`);
    if (numericX.has(id)) assert.equal(kind(sample, xField), "numeric", `${id}: X is numeric`);
    if (needsSeries.includes(id)) assert.ok(seriesField, `${id}: has a series/target field`);
    if (id === "bubble") assert.equal(kind(sample, sizeField), "numeric", "bubble: size is numeric");
    if (linkSizes.includes(id) && id !== "dendrogram") assert.equal(kind(sample, sizeField), "numeric", `${id}: link weight is numeric`);
    if (id === "calendar" || id === "candlestick" || id === "ohlc") assert.equal(sample.columnTypes[xField].type, "date", `${id}: X is a date`);
    if (id === "gantt") { assert.equal(sample.columnTypes[yField].type, "date"); assert.equal(sample.columnTypes[sizeField].type, "date"); }
    if (id === "timeline") assert.equal(sample.columnTypes[yField].type, "date");
  });
});

test("sample stories hold together", () => {
  const p = (id: string) => sampleFor(id, "pt");

  // Pareto: sorted from the largest cause down.
  const returns = p("pareto").rows.map((row) => Number(row.Ocorrencias));
  assert.deepEqual(returns, [...returns].sort((a, b) => b - a));

  // Funnel: never grows from one stage to the next.
  const funnel = p("funnel").rows.map((row) => Number(row.Candidatos));
  funnel.forEach((value, i) => i && assert.ok(value <= funnel[i - 1]));

  // Waterfall: the closing total equals the opening total plus every change.
  const bridge = p("waterfall").rows;
  const opening = Number(bridge[0].Valor);
  const changes = bridge.filter((row) => row.Tipo === "Variação").reduce((sum, row) => sum + Number(row.Valor), 0);
  assert.equal(opening + changes, Number(bridge[bridge.length - 1].Valor));

  // Population pyramid: both sexes for every age group.
  const pyramid = p("population-pyramid").rows;
  const ages = new Set(pyramid.map((row) => row.Faixa_etaria));
  assert.equal(pyramid.length, ages.size * 2);

  // Alluvial: people entering a middle stage equal people leaving it.
  const journey = p("alluvial").rows;
  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  journey.forEach((row) => {
    inflow.set(String(row.Destino), (inflow.get(String(row.Destino)) ?? 0) + Number(row.Estudantes));
    outflow.set(String(row.Origem), (outflow.get(String(row.Origem)) ?? 0) + Number(row.Estudantes));
  });
  ["Cursando", "Trocou de curso", "Trancou"].forEach((node) => assert.equal(inflow.get(node), outflow.get(node), node));

  // Candlestick: low ≤ open, close ≤ high, on business days only.
  p("candlestick").rows.forEach((row) => {
    assert.ok(Number(row.Minima) <= Math.min(Number(row.Abertura), Number(row.Fechamento)));
    assert.ok(Number(row.Maxima) >= Math.max(Number(row.Abertura), Number(row.Fechamento)));
    const weekday = new Date(`${row.Data}T12:00:00`).getDay();
    assert.ok(weekday > 0 && weekday < 6);
  });

  // Correlogram: a symmetric matrix with 1 on the diagonal, values within [-1, 1].
  const corr = p("correlogram").rows;
  const size = Math.sqrt(corr.length);
  assert.ok(Number.isInteger(size));
  corr.forEach((row) => {
    const r = Number(row.Correlacao);
    assert.ok(r >= -1 && r <= 1);
    if (row.Variavel_A === row.Variavel_B) assert.equal(r, 1);
    const mirror = corr.find((other) => other.Variavel_A === row.Variavel_B && other.Variavel_B === row.Variavel_A);
    assert.equal(mirror?.Correlacao, row.Correlacao);
  });

  // Radar draws the first four rows against at most seven numeric fields.
  const radar = p("radar");
  assert.equal(radar.rows.length, 4);
  assert.ok(Object.values(radar.columnTypes).filter((spec) => kindOfSpec(spec) === "numeric").length <= 7);

  // Scatter shows a real relationship: study hours and score correlate positively.
  const study = p("scatter").rows;
  const hours = study.map((row) => Number(row.Horas_de_estudo));
  const score = study.map((row) => Number(row.Nota));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const [mh, ms] = [mean(hours), mean(score)];
  const cov = hours.reduce((sum, h, i) => sum + (h - mh) * (score[i] - ms), 0);
  const r = cov / Math.sqrt(hours.reduce((s, h) => s + (h - mh) ** 2, 0) * score.reduce((s, v) => s + (v - ms) ** 2, 0));
  assert.ok(r > 0.6, `study hours and score correlate (r = ${r.toFixed(2)})`);

  // Heatmap: one value for every day × hour.
  const calls = p("heatmap").rows;
  assert.equal(calls.length, 5 * 11);
});

test("samples are deterministic and independent copies", () => {
  const a = sampleFor("histogram", "pt");
  const b = sampleFor("density", "pt");
  assert.deepEqual(a.rows, b.rows);
  a.rows[0].Tempo_min = -1;
  assert.notEqual(sampleFor("histogram", "pt").rows[0].Tempo_min, -1);
});

test("an untouched sample is recognized, an edited one is not", () => {
  const sample = sampleFor("scatter", "pt");
  assert.equal(matchSample(sample.rows, "pt"), sample.datasetId);
  assert.equal(matchSample(sample.rows, "en"), null);
  const edited = sample.rows.map((row, i) => (i === 0 ? { ...row, Nota: 1 } : row));
  assert.equal(matchSample(edited, "pt"), null);
  assert.equal(matchSample([], "pt"), null);
});

test("column types survive as a specs map", () => {
  const specs: ColumnSpecs = sampleFor("column", "pt").columnTypes;
  assert.equal(specs["Mês"].type, "category");
  assert.equal(specs["Receita"].type, "currency");
  assert.equal(specs["Receita"].currency, "BRL");
});

test("the integrity checker has nothing to flag in a chart's own sample", () => {
  forEach((sample, id, locale) => {
    const kinds = Object.fromEntries(Object.entries(sample.columnTypes).map(([column, spec]) => [column, kindOfSpec(spec)]));
    assert.deepEqual(auditChart(sample.rows, sampleConfig(sample), kinds), [], `${id}/${locale}`);
  });
});

test("the checker still catches a chart that does not fit the data", () => {
  const sample = sampleFor("grouped-bar", "pt");
  const kinds = Object.fromEntries(Object.entries(sample.columnTypes).map(([column, spec]) => [column, kindOfSpec(spec)]));
  const scatterOnCategories = { ...sampleConfig(sample), chartId: "scatter" };
  assert.deepEqual(auditChart(sample.rows, scatterOnCategories, kinds), ["issueNumericX"]);
});
