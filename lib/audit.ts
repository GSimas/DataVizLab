import type { ChartConfig, DataRow } from "../components/ChartRenderer";
import { NEEDS_NUMERIC_X, NO_NUMERIC_Y } from "./chartNeeds";
import type { ColumnKind } from "./columns";

/* The integrity checker: readability problems the chosen chart and fields are likely to cause. */

export type AuditIssue = "issueCategories" | "issuePie" | "issueMissing" | "issueNegative" | "issueLabels" | "issueNumericX" | "issueNumericY";

/** Charts whose X field is not a set of categories to compare (an identifier, or a ranked list of terms). */
const X_IS_NOT_A_CATEGORY_AXIS = new Set(["histogram", "density", "stem-leaf", "venn", "upset", "word-cloud", "term-frequency", "word-tree"]);

export function auditChart(rows: DataRow[], viz: ChartConfig, kinds: Record<string, ColumnKind>): AuditIssue[] {
  if (!rows.length) return [];
  const issues: AuditIssue[] = [];
  const { chartId, xField, yField } = viz;
  const categories = new Set(rows.map((row) => String(row[xField] ?? ""))).size;
  // Many distinct values only crowd an axis when they are categories; dates and numbers are read as a scale.
  if (xField && kinds[xField] === "categorical" && !X_IS_NOT_A_CATEGORY_AXIS.has(chartId) && categories > 18) issues.push("issueCategories");
  // A rose is meant for cyclic categories such as the twelve months, so only pies and donuts are held to five slices.
  if (["pie", "donut"].includes(chartId) && categories > 5) issues.push("issuePie");
  const used = [xField, yField].filter(Boolean);
  if (rows.some((row) => used.some((field) => row[field] == null || row[field] === ""))) issues.push("issueMissing");
  if (["pie", "donut", "treemap", "sunburst", "funnel"].includes(chartId) && yField && rows.some((row) => Number(row[yField]) < 0)) issues.push("issueNegative");
  if (!viz.showLabels && ["pie", "donut", "funnel"].includes(chartId)) issues.push("issueLabels");
  if (NEEDS_NUMERIC_X.has(chartId) && xField && kinds[xField] !== "numeric") issues.push("issueNumericX");
  if (!NO_NUMERIC_Y.has(chartId) && yField && kinds[yField] && kinds[yField] !== "numeric") issues.push("issueNumericY");
  return issues;
}
