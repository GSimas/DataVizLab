// A headless Chrome (or Edge) driven over the DevTools protocol, with Node's built-in WebSocket.
// Shared by the lab scripts (perf-lab.mjs, a11y-audit.mjs); nothing here is shipped to the app.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);

/** Starts a clean browser profile; `init` runs in every page before the app's own scripts. */
export async function launch({ mobile = false, init = "", port = 9333 } = {}) {
  if (!CHROME) throw new Error("No Chrome or Edge found");
  const profileDir = mkdtempSync(join(tmpdir(), "dvl-lab-"));
  const browser = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--headless=new", "--window-size=1280,800", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--js-flags=--expose-gc", "about:blank"], { stdio: "ignore" });
  const endpoint = async (path, method = "GET") => {
    for (let i = 0; i < 60; i++) {
      try { return await (await fetch(`http://127.0.0.1:${port}${path}`, { method })).json(); } catch { await sleep(250); }
    }
    throw new Error("Chrome did not start");
  };
  await endpoint("/json/version");
  const target = await endpoint("/json/new?about:blank", "PUT");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
    else if (data.method) listeners.get(data.method)?.forEach((fn) => fn(data.params));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const once = (method) => new Promise((resolve) => { const fn = (params) => { listeners.set(method, (listeners.get(method) ?? []).filter((other) => other !== fn)); resolve(params); }; listeners.set(method, [...(listeners.get(method) ?? []), fn]); });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Performance.enable");
  // First visits skip the guided-tour invitation so it does not cover the page being measured.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("datavizlab-tour-done", "1"); } catch {}\n${init}` });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  if (mobile) {
    await send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }

  const quoted = (selector) => JSON.stringify(selector);
  const pointAt = async (selector) => {
    const found = await evaluate(`(() => { const el = document.querySelector(${quoted(selector)}); if (!el) return false; el.scrollIntoView({ block: "center", behavior: "instant" }); return true; })()`);
    if (!found) throw new Error(`Not found: ${selector}`);
    await sleep(120);
    return evaluate(`(() => { const r = document.querySelector(${quoted(selector)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  };
  const keyCode = (key) => ({ Escape: 27, Backspace: 8, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38 })[key] ?? 0;

  return {
    send, once, evaluate,
    async goto(url) { const loaded = once("Page.loadEventFired"); await send("Page.navigate", { url }); await loaded; },
    async waitFor(selector, timeout = 4000) {
      const until = Date.now() + timeout;
      while (Date.now() < until) { if (await evaluate(`!!document.querySelector(${quoted(selector)})`)) return; await sleep(100); }
      throw new Error(`Timed out waiting for ${selector}`);
    },
    async click(selector) {
      const [x, y] = await pointAt(selector);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    },
    async type(text) {
      for (const char of text) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", text: char, key: char, unmodifiedText: char });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: char });
        await sleep(60);
      }
    },
    async press(key, modifiers = 0) {
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: keyCode(key), modifiers });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: keyCode(key), modifiers });
    },
    async heapMB() { await evaluate("window.gc && gc()"); const { metrics } = await send("Performance.getMetrics"); return Math.round(metrics.find((m) => m.name === "JSHeapUsedSize").value / 104857.6) / 10; },
    async domNodes() { return (await send("Performance.getMetrics")).metrics.find((m) => m.name === "Nodes").value; },
    async close() {
      socket.close();
      browser.kill();
      await sleep(500);
      try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
    },
  };
}
