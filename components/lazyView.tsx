"use client";

import { use, type ComponentType } from "react";

/** A component whose code downloads on first render (inside <Suspense>). Unlike React.lazy, a download that
 *  failed is tried again when an error boundary retries, and `preload` can start it ahead of time (on hover,
 *  on focus, when the next step is likely). */
export function lazyView<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const get = () => (pending ??= load().catch((error) => { pending = null; throw error; }));
  function View(props: P) {
    const { default: Loaded } = use(get());
    return <Loaded {...props} />;
  }
  return Object.assign(View, { preload: () => { get().catch(() => undefined); } });
}
