import Anthropic from "@anthropic-ai/sdk";

/* ---------------------------------------------------------------------------
 * AI providers. Requests go straight from the browser to the chosen provider:
 * DataVizLab has no server, so keys and conversations never pass through us.
 * Anthropic uses the official SDK; the others share the OpenAI-compatible
 * chat-completions shape.
 * ------------------------------------------------------------------------- */

export type ProviderId = "openrouter" | "anthropic" | "openai" | "gemini" | "deepseek" | "mistral" | "groq" | "xai";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  kind: "anthropic" | "openai";
  baseUrl: string;
  defaultModel: string;
  /** Preferred models, in order, when the live model list contains them. */
  preferred: string[];
  keysUrl: string;
};

export const PROVIDERS: ProviderInfo[] = [
  { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "anthropic/claude-opus-5", preferred: ["anthropic/claude-opus-5", "anthropic/claude-sonnet-5", "openai/gpt-5", "google/gemini-2.5-pro"], keysUrl: "https://openrouter.ai/keys" },
  { id: "anthropic", label: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", defaultModel: "claude-opus-5", preferred: ["claude-opus-5"], keysUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1", preferred: ["gpt-5", "gpt-4.1", "gpt-4o"], keysUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash", preferred: ["gemini-2.5-pro", "gemini-2.5-flash"], keysUrl: "https://aistudio.google.com/apikey" },
  { id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat", preferred: ["deepseek-chat"], keysUrl: "https://platform.deepseek.com/api_keys" },
  { id: "mistral", label: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-large-latest", preferred: ["mistral-large-latest", "mistral-medium-latest"], keysUrl: "https://console.mistral.ai/api-keys" },
  { id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", preferred: ["llama-3.3-70b-versatile"], keysUrl: "https://console.groq.com/keys" },
  { id: "xai", label: "xAI (Grok)", kind: "openai", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-4", preferred: ["grok-4", "grok-3"], keysUrl: "https://console.x.ai" },
];

export const providerInfo = (id: ProviderId) => PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];

export type Connection = { mode: "oauth" | "byok"; provider: ProviderId; model: string; key: string };

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { id: string; name: string; content: string; isError?: boolean };
export type ChatTurn =
  | { role: "user"; text: string; context?: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; model?: string; raw?: Anthropic.Beta.BetaContentBlock[] }
  | { role: "tool"; results: ToolResult[] };
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
export type Completion = { text: string; toolCalls: ToolCall[]; stop: "end" | "tool" | "length" | "refusal" | "other"; model: string; raw?: Anthropic.Beta.BetaContentBlock[] };

export class ProviderError extends Error {
  constructor(message: string, readonly kind: "auth" | "rate" | "network" | "refused" | "other") { super(message); }
}

type CompleteArgs = { system: string; turns: ChatTurn[]; tools: ToolDef[]; signal?: AbortSignal };

const userText = (turn: Extract<ChatTurn, { role: "user" }>) => (turn.context ? `${turn.context}\n\n${turn.text}` : turn.text);

/* ---------- Anthropic (official SDK) ---------- */

const anthropicClient = (key: string) => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });

async function completeAnthropic(connection: Connection, { system, turns, tools, signal }: CompleteArgs): Promise<Completion> {
  const client = anthropicClient(connection.key);
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((turn) => {
    if (turn.role === "user") return { role: "user", content: userText(turn) };
    if (turn.role === "tool") return { role: "user", content: turn.results.map((result) => ({ type: "tool_result" as const, tool_use_id: result.id, content: result.content, is_error: result.isError })) };
    // Echo Anthropic's own content back unchanged (keeps thinking blocks valid).
    if (turn.raw) return { role: "assistant", content: turn.raw };
    return { role: "assistant", content: [...(turn.text ? [{ type: "text" as const, text: turn.text }] : []), ...turn.toolCalls.map((call) => ({ type: "tool_use" as const, id: call.id, name: call.name, input: call.input }))] };
  });
  // Server-side refusal fallbacks for the models that support them.
  const fallbacks = connection.model === "claude-opus-5" || connection.model === "claude-fable-5-1";
  try {
    const response = await client.beta.messages.create({
      model: connection.model,
      max_tokens: 16000,
      system,
      messages,
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters as Anthropic.Beta.BetaTool.InputSchema })),
      cache_control: { type: "ephemeral" },
      ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    }, { signal });
    const text = response.content.filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text").map((block) => block.text).join("\n\n");
    const toolCalls = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use").map((block) => ({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> }));
    const stop = response.stop_reason === "tool_use" ? "tool" : response.stop_reason === "end_turn" ? "end" : response.stop_reason === "max_tokens" ? "length" : response.stop_reason === "refusal" ? "refusal" : "other";
    return { text, toolCalls, stop, model: response.model, raw: response.content };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new ProviderError(error.message, "auth");
    if (error instanceof Anthropic.RateLimitError) throw new ProviderError(error.message, "rate");
    if (error instanceof Anthropic.APIConnectionError) throw new ProviderError(error.message, "network");
    if (error instanceof Anthropic.APIError) throw new ProviderError(error.message, "other");
    throw error;
  }
}

/* ---------- OpenAI-compatible providers ---------- */

const openAiHeaders = (connection: Connection): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${connection.key}`,
  ...(connection.provider === "openrouter" ? { "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://datavizlab.site", "X-Title": "DataVizLab" } : {}),
});

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string } | string; message?: string };
    return (typeof body.error === "string" ? body.error : body.error?.message) ?? body.message ?? response.statusText;
  } catch { return response.statusText; }
}

const errorKind = (status: number): ProviderError["kind"] => (status === 401 || status === 403 ? "auth" : status === 429 ? "rate" : "other");

const parseArgs = (raw: string | undefined) => {
  try { const value = JSON.parse(raw || "{}"); return value && typeof value === "object" ? value as Record<string, unknown> : {}; } catch { return {}; }
};

async function completeOpenAi(connection: Connection, { system, turns, tools, signal }: CompleteArgs): Promise<Completion> {
  const provider = providerInfo(connection.provider);
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  turns.forEach((turn) => {
    if (turn.role === "user") messages.push({ role: "user", content: userText(turn) });
    else if (turn.role === "assistant") messages.push({ role: "assistant", content: turn.text || null, ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : {}) });
    else turn.results.forEach((result) => messages.push({ role: "tool", tool_call_id: result.id, content: result.content }));
  });
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: openAiHeaders(connection),
      body: JSON.stringify({ model: connection.model, messages, tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: "auto" }),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ProviderError((error as Error).message, "network");
  }
  if (!response.ok) throw new ProviderError(await readError(response), errorKind(response.status));
  const body = await response.json() as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments?: string } }> } }> };
  const choice = body.choices?.[0];
  const message = choice?.message;
  const toolCalls = (message?.tool_calls ?? []).map((call, index) => ({ id: call.id || `call_${Date.now()}_${index}`, name: call.function.name, input: parseArgs(call.function.arguments) }));
  const finish = choice?.finish_reason;
  const stop = toolCalls.length ? "tool" : finish === "length" ? "length" : message?.refusal ? "refusal" : finish === "stop" ? "end" : "other";
  return { text: message?.content ?? message?.refusal ?? "", toolCalls, stop, model: body.model ?? connection.model };
}

export function complete(connection: Connection, args: CompleteArgs) {
  return providerInfo(connection.provider).kind === "anthropic" ? completeAnthropic(connection, args) : completeOpenAi(connection, args);
}

/* ---------- Model lists (also validate the key) ---------- */

export type ModelOption = { id: string; label: string };

const NOT_CHAT = /(embed|whisper|tts|dall-e|image|moderation|audio|realtime|transcribe|search|computer-use|davinci|babbage|guard|rerank|ocr)/i;

export async function listModels(connection: Pick<Connection, "provider" | "key">): Promise<ModelOption[]> {
  const provider = providerInfo(connection.provider);
  if (provider.kind === "anthropic") {
    try {
      const models: ModelOption[] = [];
      for await (const model of anthropicClient(connection.key).models.list({ limit: 100 })) models.push({ id: model.id, label: model.display_name || model.id });
      return models;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new ProviderError(error.message, "auth");
      if (error instanceof Anthropic.APIConnectionError) throw new ProviderError(error.message, "network");
      if (error instanceof Anthropic.APIError) throw new ProviderError(error.message, "other");
      throw error;
    }
  }
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/models`, { headers: connection.provider === "openrouter" ? {} : { Authorization: `Bearer ${connection.key}` } });
  } catch (error) { throw new ProviderError((error as Error).message, "network"); }
  if (!response.ok) throw new ProviderError(await readError(response), errorKind(response.status));
  const body = await response.json() as { data?: Array<{ id: string; name?: string; supported_parameters?: string[] }> };
  return (body.data ?? [])
    .filter((model) => provider.id !== "openrouter" || (model.supported_parameters ?? []).includes("tools"))
    .map((model) => ({ id: model.id.replace(/^models\//, ""), label: model.name || model.id.replace(/^models\//, "") }))
    .filter((model) => !NOT_CHAT.test(model.id))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** OpenRouter's model list is public, so the key is validated with a cheap authenticated call. */
export async function verifyKey(connection: Pick<Connection, "provider" | "key">) {
  if (connection.provider !== "openrouter") return;
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${connection.key}` } }).catch((error: Error) => { throw new ProviderError(error.message, "network"); });
  if (!response.ok) throw new ProviderError(await readError(response), errorKind(response.status));
}

export const pickModel = (providerId: ProviderId, models: ModelOption[], current?: string) => {
  const provider = providerInfo(providerId);
  if (current && models.some((model) => model.id === current)) return current;
  return provider.preferred.find((id) => models.some((model) => model.id === id)) ?? models[0]?.id ?? provider.defaultModel;
};
