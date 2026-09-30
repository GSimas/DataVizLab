/* What the chart types need from the fields they are mapped to (used by the integrity checker and the sample tests). */

/** Charts that place points by two quantities, so the X field must be numeric too. */
export const NEEDS_NUMERIC_X = new Set(["scatter", "bubble", "connected-scatter", "choropleth", "bubble-map", "dot-map", "hexbin-map", "cartogram", "flow-map"]);

/** Charts that do not read a numeric value from the Y field (they read links, sets, dates or several columns). */
export const NO_NUMERIC_Y = new Set(["venn", "upset", "radar", "tree", "dendrogram", "non-ribbon-chord", "network", "arc", "edge-bundling", "flowchart", "brainstorm", "cooccurrence", "timeline", "gantt"]);
