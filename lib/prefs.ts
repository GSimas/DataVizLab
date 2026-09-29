import type { Locale } from "./catalog";

export type Prefs = {
  locale: Locale;
  theme: "dark" | "light";
  contrast: "normal" | "high";
  motion: "full" | "reduced";
  fontSize: "sm" | "md" | "lg";
};

export const PREFS_KEY = "datavizlab-prefs";

/** Chart text follows the interface text size. */
export const fontScale: Record<Prefs["fontSize"], number> = { sm: 0.875, md: 1, lg: 1.125 };

export const defaultPrefs = (): Prefs => {
  const media = (query: string) => typeof window !== "undefined" && window.matchMedia?.(query).matches;
  return {
    locale: "pt",
    theme: "dark",
    contrast: media("(prefers-contrast: more)") ? "high" : "normal",
    motion: media("(prefers-reduced-motion: reduce)") ? "reduced" : "full",
    fontSize: "md",
  };
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function readPrefs(): Prefs {
  const base = defaultPrefs();
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    // Earlier versions kept locale and theme under their own keys.
    const legacyLocale = localStorage.getItem("datavizlab-locale");
    const legacyTheme = localStorage.getItem("datavizlab-theme");
    return {
      locale: pick(stored?.locale ?? legacyLocale, ["pt", "en"] as const, base.locale),
      theme: pick(stored?.theme ?? legacyTheme, ["dark", "light"] as const, base.theme),
      contrast: pick(stored?.contrast, ["normal", "high"] as const, base.contrast),
      motion: pick(stored?.motion, ["full", "reduced"] as const, base.motion),
      fontSize: pick(stored?.fontSize, ["sm", "md", "lg"] as const, base.fontSize),
    };
  } catch { return base; }
}

export function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.contrast = prefs.contrast;
  root.dataset.motion = prefs.motion;
  root.dataset.font = prefs.fontSize;
  root.lang = prefs.locale === "pt" ? "pt-BR" : "en";
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    localStorage.removeItem("datavizlab-locale");
    localStorage.removeItem("datavizlab-theme");
  } catch { /* storage may be blocked */ }
}

/**
 * Inline script for <head>: applies saved preferences before first paint so
 * no theme, contrast or text-size flash happens. Mirrors readPrefs/applyPrefs.
 */
export const prefsBootstrap = `(function(){var r=document.documentElement,m=function(q){return window.matchMedia&&matchMedia(q).matches};var p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}")||{};if(!p.theme)p.theme=localStorage.getItem("datavizlab-theme")}catch(e){}r.dataset.theme=p.theme==="light"?"light":"dark";r.dataset.contrast=p.contrast==="high"||(!p.contrast&&m("(prefers-contrast: more)"))?"high":"normal";r.dataset.motion=p.motion==="reduced"||(!p.motion&&m("(prefers-reduced-motion: reduce)"))?"reduced":"full";r.dataset.font=p.fontSize==="sm"||p.fontSize==="lg"?p.fontSize:"md";if(!document.startViewTransition)r.classList.add("no-vt")})()`;
