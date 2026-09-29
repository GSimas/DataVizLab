import type { Connection } from "./providers";

/* ---------------------------------------------------------------------------
 * Assistant settings and credentials. Keys live only in this browser:
 * localStorage when the user asks to be remembered, sessionStorage otherwise.
 * ------------------------------------------------------------------------- */

export type Sharing = "none" | "schema" | "full";
export type AiSettings = { acknowledged: boolean; sharing: Sharing; remember: boolean };

const SETTINGS_KEY = "datavizlab-ai";
const CONNECTION_KEY = "datavizlab-ai-connection";
const PKCE_KEY = "datavizlab-openrouter-pkce";

const safe = <T,>(read: () => T, fallback: T) => { try { return read(); } catch { return fallback; } };

export const readSettings = (): AiSettings => safe(() => {
  const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AiSettings>;
  return { acknowledged: stored.acknowledged === true, sharing: stored.sharing === "none" || stored.sharing === "full" ? stored.sharing : "schema", remember: stored.remember === true };
}, { acknowledged: false, sharing: "schema", remember: false });

export const saveSettings = (settings: AiSettings) => safe(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), undefined);

export const readConnection = (): Connection | null => safe(() => {
  const raw = localStorage.getItem(CONNECTION_KEY) ?? sessionStorage.getItem(CONNECTION_KEY);
  const parsed = raw ? JSON.parse(raw) as Connection : null;
  return parsed?.key && parsed.provider && parsed.model ? parsed : null;
}, null);

export const saveConnection = (connection: Connection | null, remember: boolean) => safe(() => {
  localStorage.removeItem(CONNECTION_KEY);
  sessionStorage.removeItem(CONNECTION_KEY);
  if (connection) (remember ? localStorage : sessionStorage).setItem(CONNECTION_KEY, JSON.stringify(connection));
}, undefined);

/* ---------- OpenRouter OAuth (PKCE, S256) ---------- */

const base64url = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Sends the user to OpenRouter; they come back to this page with ?code=… */
export async function startOpenRouterLogin(returnHash: string) {
  if (!window.isSecureContext || !crypto.subtle) throw new Error("insecure-context");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, returnHash }));
  const callback = `${location.origin}${location.pathname}`;
  location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256&key_label=DataVizLab`;
}

/** Finishes the login when the page loads with an OpenRouter ?code=… Returns the new key. */
export async function finishOpenRouterLogin(): Promise<{ key: string; returnHash: string } | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const pending = safe(() => JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? "null") as { verifier: string; returnHash: string } | null, null);
  if (!code || !pending) return null;
  sessionStorage.removeItem(PKCE_KEY);
  // Drop ?code from the address bar right away.
  params.delete("code");
  const query = params.toString();
  history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${pending.returnHash || location.hash}`);
  const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: pending.verifier, code_challenge_method: "S256" }),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  const { key } = await response.json() as { key: string };
  return { key, returnHash: pending.returnHash };
}
