"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Locale, VizEntry } from "../lib/catalog";
import { TEXT_THUMBS, THUMBS_VERSION } from "./thumbs.generated";

/* Thumbnails are pre-rendered SVG files (scripts/build-thumbnails.ts): the real chart, drawn from that chart's
   own sample. Most are shown as images, which the browser decodes and rasterizes off the main thread and which
   add no DOM. The few that contain text are fetched and inlined, so they keep the page's web fonts. */

const markup = new Map<string, string>();
const loading = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

const thumbUrl = (id: string, locale: Locale, dark: boolean) => `/thumbs/${dark ? "dark" : "light"}/${locale}/${id}.svg?v=${THUMBS_VERSION}`;

function load(url: string) {
  if (markup.has(url) || loading.has(url)) return;
  loading.add(url);
  fetch(url)
    .then((response) => (response.ok ? response.text() : ""))
    .catch(() => "")
    .then((svg) => {
      loading.delete(url);
      // A failed request leaves the frame empty and is retried the next time the thumbnail mounts.
      if (svg.startsWith("<svg")) markup.set(url, svg);
      listeners.get(url)?.forEach((notify) => notify());
    });
}

function subscribe(url: string, notify: () => void) {
  const set = listeners.get(url) ?? new Set();
  set.add(notify);
  listeners.set(url, set);
  load(url);
  return () => { set.delete(notify); if (!set.size) listeners.delete(url); };
}

function InlineThumb({ url, label }: { url: string; label: string }) {
  const watch = useCallback((notify: () => void) => subscribe(url, notify), [url]);
  const svg = useSyncExternalStore(watch, () => markup.get(url) ?? "", () => "");
  return <div className="chart-thumb" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Thumbnail of a visualization method: the real chart, drawn from that method's own sample data. */
export function MiniViz({ entry, dark, locale = "pt" }: { entry: VizEntry; dark: boolean; locale?: Locale }) {
  const url = thumbUrl(entry.id, locale, dark);
  const label = entry.name[locale];
  if (TEXT_THUMBS.has(entry.id)) return <InlineThumb url={url} label={label} />;
  // A static, versioned vector file: next/image would add nothing (SVG is not optimized) but a server round trip.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="chart-thumb" role="img" aria-label={label}><img src={url} alt="" decoding="async" loading="lazy" draggable={false} /></div>;
}
