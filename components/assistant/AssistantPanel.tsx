import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, Bot, Check, CircleAlert, ExternalLink, Eye, EyeOff, KeyRound, LogIn, LogOut, MessageSquarePlus, Search, Settings2, ShieldCheck, Sparkles, Square, Undo2, X } from "lucide-react";
import type { Locale } from "../../lib/catalog";
import { DURATION, usePresence } from "../../lib/motion";
import { listModels, pickModel, PROVIDERS, providerInfo, ProviderError, verifyKey, type Connection, type ModelOption, type ProviderId } from "../../lib/ai/providers";
import { finishOpenRouterLogin, readConnection, readSettings, saveConnection, saveSettings, startOpenRouterLogin, type AiSettings, type Sharing } from "../../lib/ai/session";
import { aiStrings, type AiStrings } from "../../lib/ai/strings";
import type { AgentContext } from "../../lib/ai/tools";
import { Segmented, Switch } from "../ui/Controls";
import { Select } from "../ui/Select";
import { Markdown } from "./Markdown";
import { useAgent, type ActionState } from "./useAgent";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  getContext: () => Omit<AgentContext, "sharing">;
  /** Id of the panel, which the launcher button points at with aria-controls. */
  panelId: string;
  /** The launcher button, where focus returns when the panel closes. */
  fabRef: RefObject<HTMLButtonElement | null>;
  /** Tells the launcher an action is waiting for approval (it shows a dot). */
  onPendingChange: (pending: boolean) => void;
};

const DEFAULT_SETTINGS: AiSettings = { acknowledged: false, sharing: "schema", remember: false };

/** The AI assistant panel: disclosure → provider connection → chat with approvals. Loaded on first use;
 *  it stays mounted afterwards so the conversation survives closing and reopening. */
export default function AssistantPanel({ open, onOpenChange, locale, getContext, panelId, fabRef, onPendingChange }: Props) {
  const s = aiStrings(locale);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { mounted, closing } = usePresence(open, DURATION.base);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  const updateSettings = useCallback((patch: Partial<AiSettings>) => setSettings((current) => { const next = { ...current, ...patch }; saveSettings(next); return next; }), []);

  // Restore saved settings/connection and finish an OpenRouter sign-in if we are returning from it.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client-only storage hydration */
    const stored = readSettings();
    setSettings(stored);
    setConnection(readConnection());
    /* eslint-enable react-hooks/set-state-in-effect */
    finishOpenRouterLogin().then(async (login) => {
      if (!login) return;
      const list = await listModels({ provider: "openrouter", key: login.key }).catch(() => []);
      const next: Connection = { mode: "oauth", provider: "openrouter", key: login.key, model: pickModel("openrouter", list) };
      setModels(list);
      setConnection(next);
      saveConnection(next, stored.remember);
      onOpenChange(true);
    }).catch(() => { setNotice(aiStrings(locale).oauthFailed); onOpenChange(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on page load
  }, []);

  // Load the model list for an existing connection.
  useEffect(() => {
    if (!connection || models.length) return;
    let cancelled = false;
    listModels(connection).then((list) => { if (!cancelled) setModels(list); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [connection, models.length]);

  const agentContext = useCallback((): AgentContext => ({ ...getContext(), sharing: settings.sharing }), [getContext, settings.sharing]);
  const agent = useAgent({ connection, getContext: agentContext, locale, strings: s });
  const waiting = Boolean(agent.pending);
  useEffect(() => { onPendingChange(waiting); }, [waiting, onPendingChange]);

  const setConnected = (next: Connection | null) => {
    setConnection(next);
    saveConnection(next, settings.remember);
  };

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("textarea, [data-autofocus], button:not(.assistant-icon)")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, settings.acknowledged, connection]);

  const close = () => { onOpenChange(false); fabRef.current?.focus({ preventScroll: true }); };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); } };

  const step = !settings.acknowledged ? "intro" : !connection ? "connect" : "chat";
  const provider = connection ? providerInfo(connection.provider) : null;

  return (
    <>
      {mounted && (
        <aside ref={panelRef} id={panelId} className="assistant" data-state={closing ? "closed" : "open"} role="dialog" aria-labelledby={titleId} onKeyDown={onKey}>
          <header className="assistant-head">
            <span className="assistant-mark" aria-hidden="true"><Bot size={17} /></span>
            <div className="assistant-heading">
              <h2 id={titleId}>{s.title} <span className="ai-badge">{s.aiBadge}</span></h2>
              {connection && provider && <small>{provider.label} · {connection.model}</small>}
            </div>
            {step === "chat" && <button type="button" className="assistant-icon" onClick={agent.reset} aria-label={s.newChat} data-tip={s.newChat}><MessageSquarePlus size={16} /></button>}
            {step === "chat" && <button type="button" className="assistant-icon" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)} aria-label={s.settings} data-tip={s.settings}><Settings2 size={16} /></button>}
            <button type="button" className="assistant-icon" onClick={close} aria-label={s.close} data-tip={s.close}><X size={17} /></button>
          </header>

          {notice && <p className="assistant-error" role="alert"><CircleAlert size={15} />{notice}<button type="button" onClick={() => setNotice(null)} aria-label={s.close}><X size={13} /></button></p>}

          {step === "intro" && <Intro s={s} onAccept={() => updateSettings({ acknowledged: true })} />}
          {step === "connect" && <Connect s={s} remember={settings.remember} onRemember={(remember) => updateSettings({ remember })} onConnected={(next, list) => { setModels(list); setConnected(next); }} onError={setNotice} />}
          {step === "chat" && connection && (
            <>
              <div className={showSettings ? "assistant-settings is-open" : "assistant-settings"} aria-hidden={!showSettings} inert={!showSettings}>
                <div className="assistant-settings-inner">
                  <ModelField s={s} value={connection.model} models={models} onChange={(model) => setConnected({ ...connection, model })} />
                  <Segmented<Sharing> label={s.sharing} value={settings.sharing} onChange={(sharing) => updateSettings({ sharing })} options={[{ value: "none", label: s.sharingNone }, { value: "schema", label: s.sharingSchema }, { value: "full", label: s.sharingFull }]} />
                  <p className="assistant-hint">{settings.sharing === "none" ? s.sharingNoneHint : settings.sharing === "schema" ? s.sharingSchemaHint : s.sharingFullHint}</p>
                  <div className="assistant-settings-foot">
                    <small>{s.connectedVia} {provider?.label}{connection.mode === "oauth" ? " (OAuth)" : " (BYOK)"}</small>
                    <button type="button" className="launch-link" onClick={() => { agent.reset(); setModels([]); setConnected(null); setShowSettings(false); }}>{s.disconnect}<span><LogOut size={14} /></span></button>
                  </div>
                </div>
              </div>
              <Chat s={s} agent={agent} provider={provider?.label ?? ""} sharing={settings.sharing} />
            </>
          )}
        </aside>
      )}
    </>
  );
}

function Intro({ s, onAccept }: { s: AiStrings; onAccept: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="assistant-scroll assistant-intro">
      <p className="kicker">{s.introKicker}</p>
      <h3>{s.introTitle}</h3>
      <section className="notice notice-ai"><h4><Bot size={15} />{s.aiNoticeTitle}</h4><p>{s.aiNotice}</p></section>
      <section className="notice"><h4><ShieldCheck size={15} />{s.dataNoticeTitle}</h4><p>{s.dataNotice}</p></section>
      <section className="notice"><h4><Check size={15} />{s.actionsNoticeTitle}</h4><p>{s.actionsNotice}</p></section>
      <p className="assistant-hint"><KeyRound size={13} />{s.keyNotice}</p>
      <label className="check-row"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} data-autofocus /><span>{s.acknowledge}</span></label>
      <button type="button" className="button button-primary" disabled={!checked} onClick={onAccept}>{s.continue}<ArrowUp size={16} style={{ transform: "rotate(90deg)" }} /></button>
    </div>
  );
}

function Connect({ s, remember, onRemember, onConnected, onError }: { s: AiStrings; remember: boolean; onRemember: (value: boolean) => void; onConnected: (connection: Connection, models: ModelOption[]) => void; onError: (message: string) => void }) {
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerLabelId = useId();
  const info = providerInfo(provider);

  const connect = async () => {
    setBusy(true);
    setError(null);
    const base = { provider, key: key.trim() };
    try {
      await verifyKey(base);
      let list: ModelOption[] = [];
      try { list = await listModels(base); } catch (err) { if (!(err instanceof ProviderError && err.kind === "network")) throw err; }
      onConnected({ mode: "byok", ...base, model: pickModel(provider, list) }, list);
    } catch (err) {
      setError(err instanceof ProviderError ? (err.kind === "auth" ? s.errAuth : err.kind === "network" ? s.errNetwork : err.kind === "rate" ? s.errRate : `${s.errOther} ${err.message}`) : `${s.errOther} ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    try { await startOpenRouterLogin(location.hash); } catch { onError(s.insecure); }
  };

  return (
    <div className="assistant-scroll assistant-connect">
      <p className="kicker">{s.connectKicker}</p>
      <h3>{s.connectTitle}</h3>
      <section className="connect-card">
        <h4><LogIn size={15} />{s.oauthTitle}</h4>
        <p>{s.oauthText}</p>
        <button type="button" className="button button-primary" onClick={login} data-autofocus>{s.oauthButton}<ExternalLink size={15} /></button>
      </section>
      <section className="connect-card">
        <h4><KeyRound size={15} />{s.byokTitle}</h4>
        <p>{s.byokText}</p>
        <div className="field"><span id={providerLabelId}>{s.provider}</span><Select labelledBy={providerLabelId} value={provider} onChange={(value) => { setProvider(value as ProviderId); setError(null); }} options={PROVIDERS.map((item) => ({ value: item.id, label: item.label }))} searchPlaceholder={s.provider} /></div>
        <label className="field">{s.apiKey}
          <span className="key-input">
            <input type={showKey ? "text" : "password"} value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="sk-…" onKeyDown={(event) => { if (event.key === "Enter" && key.trim()) connect(); }} />
            <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? s.hideKey : s.showKey} data-tip={showKey ? s.hideKey : s.showKey}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </span>
        </label>
        <a className="key-link" href={info.keysUrl} target="_blank" rel="noreferrer">{s.getKey} · {info.label}<ExternalLink size={12} /></a>
        {error && <p className="assistant-error" role="alert"><CircleAlert size={15} />{error}</p>}
        <button type="button" className="button button-outline" disabled={!key.trim() || busy} onClick={connect}>{busy ? s.connecting : s.connect}<ArrowUp size={16} style={{ transform: "rotate(90deg)" }} /></button>
      </section>
      <Switch label={s.remember} hint={s.rememberHint} checked={remember} onChange={onRemember} />
      <p className="assistant-hint"><KeyRound size={13} />{s.keyNotice}</p>
    </div>
  );
}

function ModelField({ s, value, models, onChange }: { s: AiStrings; value: string; models: ModelOption[]; onChange: (model: string) => void }) {
  const labelId = useId();
  const [draft, setDraft] = useState(value);
  const options = useMemo(() => {
    const list = models.map((model) => ({ value: model.id, label: model.label, hint: model.label !== model.id ? model.id : undefined }));
    return list.some((model) => model.value === value) ? list : [{ value, label: value }, ...list];
  }, [models, value]);
  if (!models.length) {
    return <label className="field">{s.model}<input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft.trim() && onChange(draft.trim())} /></label>;
  }
  return <div className="field"><span id={labelId}>{s.model}</span><Select labelledBy={labelId} value={value} onChange={onChange} options={options} searchPlaceholder={s.searchModels} /></div>;
}

type AgentApi = ReturnType<typeof useAgent>;

function Chat({ s, agent, provider, sharing }: { s: AiStrings; agent: AgentApi; provider: string; sharing: Sharing }) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { turns, actions, reads, pending, busy, error, notices } = agent;

  useEffect(() => {
    const list = listRef.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [turns.length, actions, busy, pending, error]);

  const submit = (text = draft) => {
    if (!text.trim() || busy) return;
    agent.send(text);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "";
  };

  const sharingLabel = sharing === "none" ? s.sharingNone : sharing === "schema" ? s.sharingSchema : s.sharingFull;

  return (
    <>
      <div ref={listRef} className="assistant-scroll assistant-messages" aria-live="polite">
        {!turns.length && (
          <div className="assistant-empty">
            <span className="assistant-orb" aria-hidden="true"><Sparkles size={22} /></span>
            <h3>{s.emptyTitle}</h3>
            <p>{s.emptyText}</p>
            <div className="assistant-suggestions">{s.suggestions.map((text) => <button key={text} type="button" onClick={() => submit(text)}>{text}</button>)}</div>
          </div>
        )}
        {turns.map((turn, index) => {
          if (turn.role === "user") return <div key={index} className="msg msg-user"><p>{turn.text}</p></div>;
          if (turn.role === "tool") return null;
          const readCalls = turn.toolCalls.filter((call) => reads[call.id]);
          const actionCalls = turn.toolCalls.filter((call) => actions[call.id]);
          return (
            <div key={index} className="msg msg-ai">
              <span className="msg-label"><Sparkles size={11} />{s.generatedBy}{turn.model ? ` · ${turn.model}` : ""}</span>
              {turn.text && <Markdown text={turn.text} />}
              {readCalls.map((call) => <p key={call.id} className={reads[call.id].error ? "tool-note is-error" : "tool-note"}><Search size={12} />{reads[call.id].summary}</p>)}
              {actionCalls.length > 0 && <ActionCard s={s} ids={actionCalls.map((call) => call.id)} actions={actions} pending={pending} onDecide={agent.decide} onUndo={agent.undo} />}
              {notices.filter((item) => item.afterTurn === index - 1 || item.afterTurn === index).map((item, n) => <p key={n} className="tool-note is-error"><CircleAlert size={12} />{item.text}</p>)}
            </div>
          );
        })}
        {busy && !pending && <div className="msg msg-ai msg-thinking"><span className="thinking-dots" aria-label={s.thinking}><i /><i /><i /></span>{s.thinking}</div>}
        {error && <p className="assistant-error" role="alert"><CircleAlert size={15} />{error}</p>}
      </div>
      <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <textarea ref={inputRef} rows={1} value={draft} placeholder={s.placeholder} aria-label={s.placeholder} onChange={(event) => { setDraft(event.target.value); event.target.style.height = ""; event.target.style.height = `${Math.min(160, event.target.scrollHeight)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} />
        {busy
          ? <button type="button" className="composer-send is-stop" onClick={agent.stop} aria-label={s.stop} data-tip={s.stop}><Square size={14} /></button>
          : <button type="submit" className="composer-send" disabled={!draft.trim()} aria-label={s.send} data-tip={s.send}><ArrowUp size={17} /></button>}
      </form>
      <p className="assistant-footer"><Sparkles size={11} />{s.footer} {provider} · {s.sharing}: {sharingLabel}</p>
    </>
  );
}

const statusLabel = (s: AiStrings, status: ActionState["status"]) => ({ pending: s.statusPending, running: s.statusRunning, done: s.statusDone, declined: s.statusDeclined, error: s.statusError, undone: s.statusUndone })[status];

function ActionCard({ s, ids, actions, pending, onDecide, onUndo }: { s: AiStrings; ids: string[]; actions: Record<string, ActionState>; pending: string[] | null; onDecide: (decisions: Record<string, boolean>) => void; onUndo: (id: string) => void }) {
  const awaiting = Boolean(pending && ids.some((id) => pending.includes(id)));
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(ids.map((id) => [id, true])));
  const chosen = ids.filter((id) => selected[id] !== false);
  return (
    <div className={awaiting ? "action-card is-pending" : "action-card"}>
      <p className="action-card-title"><ShieldCheck size={14} />{awaiting ? s.confirmTitle : s.actionsTitle}</p>
      <ul>
        {ids.map((id) => {
          const action = actions[id];
          return (
            <li key={id} data-status={action.status}>
              {awaiting
                ? <label className="check-row"><input type="checkbox" checked={selected[id] !== false} onChange={(event) => setSelected((current) => ({ ...current, [id]: event.target.checked }))} /><span>{action.summary}</span></label>
                : <span className="action-summary">{action.summary}</span>}
              {!awaiting && <span className="action-status">{statusLabel(s, action.status)}</span>}
              {action.status === "done" && action.undo && <button type="button" className="action-undo" onClick={() => onUndo(id)}><Undo2 size={12} />{s.undo}</button>}
              {action.error && <small className="action-error">{action.error}</small>}
            </li>
          );
        })}
      </ul>
      {awaiting && (
        <div className="action-buttons">
          <button type="button" className="button button-primary" disabled={!chosen.length} onClick={() => onDecide(Object.fromEntries(ids.map((id) => [id, selected[id] !== false])))}>{s.confirmAll}{chosen.length < ids.length ? ` (${chosen.length})` : ""}<Check size={15} /></button>
          <button type="button" className="button button-quiet" onClick={() => onDecide({})}>{s.declineAll}</button>
        </div>
      )}
    </div>
  );
}
