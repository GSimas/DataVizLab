import { useCallback, useRef, useState } from "react";
import type { Locale } from "../../lib/catalog";
import { systemPrompt } from "../../lib/ai/prompt";
import { complete, ProviderError, type ChatTurn, type Connection, type ToolResult } from "../../lib/ai/providers";
import type { AiStrings } from "../../lib/ai/strings";
import { stateContext, toolDefs, toolSpec, type AgentContext } from "../../lib/ai/tools";

export type ActionStatus = "pending" | "running" | "done" | "declined" | "error" | "undone";
export type ActionState = { status: ActionStatus; summary: string; error?: string; undo?: () => void };
export type ReadNote = { summary: string; error?: boolean };
export type Notice = { afterTurn: number; text: string };

const MAX_STEPS = 12;
const tick = () => new Promise((resolve) => window.setTimeout(resolve, 40));

/**
 * Manual tool loop shared by every provider. Read tools run straight away;
 * action tools pause the loop until the user approves or declines them.
 */
export function useAgent({ connection, getContext, locale, strings }: { connection: Connection | null; getContext: () => AgentContext; locale: Locale; strings: AiStrings }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [reads, setReads] = useState<Record<string, ReadNote>>({});
  const [pending, setPending] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const turnsRef = useRef<ChatTurn[]>([]);
  const resolver = useRef<((decisions: Record<string, boolean>) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const commit = (next: ChatTurn[]) => { turnsRef.current = next; setTurns(next); };
  const patchAction = (id: string, patch: Partial<ActionState>) => setActions((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const describeError = useCallback((err: unknown) => {
    if (err instanceof ProviderError) {
      if (err.kind === "auth") return strings.errAuth;
      if (err.kind === "rate") return strings.errRate;
      if (err.kind === "network") return strings.errNetwork;
      return `${strings.errOther} ${err.message}`;
    }
    return `${strings.errOther} ${(err as Error)?.message ?? String(err)}`;
  }, [strings]);

  const send = useCallback(async (text: string) => {
    if (!connection || !text.trim() || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    let turns: ChatTurn[] = [...turnsRef.current, { role: "user", text: text.trim(), context: stateContext(getContext()) }];
    commit(turns);
    const note = (value: string) => setNotices((current) => [...current, { afterTurn: turns.length - 1, text: value }]);
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const result = await complete(connection, { system: systemPrompt(locale), turns, tools: toolDefs, signal: controller.signal });
        turns = [...turns, { role: "assistant", text: result.text, toolCalls: result.toolCalls, model: result.model, raw: result.raw }];
        commit(turns);
        if (result.stop === "refusal") note(strings.refused);
        if (result.stop === "length") note(strings.truncated);
        if (!result.toolCalls.length) break;

        const results: ToolResult[] = [];
        for (const call of result.toolCalls) {
          const spec = toolSpec(call.name);
          if (!spec) { results.push({ id: call.id, name: call.name, content: `Unknown tool "${call.name}".`, isError: true }); continue; }
          if (spec.kind !== "read") continue;
          let summary = call.name;
          try { summary = spec.summarize(call.input, getContext()); } catch { /* keep tool name */ }
          try {
            const outcome = await spec.run(call.input, getContext());
            results.push({ id: call.id, name: call.name, content: outcome.content });
            setReads((current) => ({ ...current, [call.id]: { summary } }));
          } catch (err) {
            results.push({ id: call.id, name: call.name, content: (err as Error).message, isError: true });
            setReads((current) => ({ ...current, [call.id]: { summary, error: true } }));
          }
        }

        const actionCalls = result.toolCalls.filter((call) => toolSpec(call.name)?.kind === "action");
        if (actionCalls.length) {
          const ctx = getContext();
          setActions((current) => ({ ...current, ...Object.fromEntries(actionCalls.map((call) => {
            let summary = call.name;
            try { summary = toolSpec(call.name)!.summarize(call.input, ctx); } catch { /* keep tool name */ }
            return [call.id, { status: "pending" as const, summary }];
          })) }));
          const decisions = await new Promise<Record<string, boolean>>((resolve) => { resolver.current = resolve; setPending(actionCalls.map((call) => call.id)); });
          for (const call of actionCalls) {
            if (!decisions[call.id]) {
              results.push({ id: call.id, name: call.name, content: "The user declined this action; it was not executed." });
              patchAction(call.id, { status: "declined" });
              continue;
            }
            patchAction(call.id, { status: "running" });
            try {
              const outcome = await toolSpec(call.name)!.run(call.input, getContext());
              results.push({ id: call.id, name: call.name, content: outcome.content });
              patchAction(call.id, { status: "done", undo: outcome.undo });
            } catch (err) {
              results.push({ id: call.id, name: call.name, content: (err as Error).message, isError: true });
              patchAction(call.id, { status: "error", error: (err as Error).message });
            }
            await tick(); // let React commit so the next action sees fresh state
          }
        }

        const ordered = result.toolCalls.map((call) => results.find((item) => item.id === call.id)).filter((item): item is ToolResult => Boolean(item));
        turns = [...turns, { role: "tool", results: ordered }];
        commit(turns);
        if (controller.signal.aborted) break;
        if (step === MAX_STEPS - 1) note(strings.stepLimit);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError" && !controller.signal.aborted) setError(describeError(err));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [connection, getContext, locale, strings, describeError]);

  const decide = useCallback((decisions: Record<string, boolean>) => {
    resolver.current?.(decisions);
    resolver.current = null;
    setPending(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (resolver.current) { resolver.current({}); resolver.current = null; setPending(null); }
  }, []);

  const undo = useCallback((id: string) => {
    const action = actions[id];
    if (!action?.undo || action.status !== "done") return;
    action.undo();
    setActions((current) => ({ ...current, [id]: { ...current[id], status: "undone", undo: undefined } }));
  }, [actions]);

  const reset = useCallback(() => {
    stop();
    commit([]);
    setActions({});
    setReads({});
    setNotices([]);
    setError(null);
  }, [stop]);

  return { turns, actions, reads, pending, busy, error, notices, send, decide, stop, undo, reset };
}
