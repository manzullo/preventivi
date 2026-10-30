// AI provider: port di PSF_AI_Provider (Claude, OpenAI, Gemini, DeepSeek,
// kie.ai). Risposta unificata { text, tool_calls, usage }. I messaggi
// viaggiano nel formato OpenAI (role user/assistant/tool + tool_calls) e
// vengono convertiti per Claude e Gemini.

import { debug } from "@/lib/debug";
import { settings, type AiSettings } from "@/lib/settings";

export type ProviderName = AiSettings["activeProvider"];
export type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };
export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string };
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
export type ChatOk = { text: string; tool_calls: ToolCall[]; usage: { in: number; out: number }; raw: unknown };
export type ChatResult = ChatOk | { error: string };

type Row = Record<string, unknown>;

export const PROVIDERS: Record<ProviderName, { label: string; defaultModel: string; models: Record<string, string>; contextWindow: (model: string) => number }> = {
  claude: {
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5",
    models: { "claude-sonnet-5": "Claude Sonnet 5 (consigliato)", "claude-opus-5": "Claude Opus 5", "claude-fable-5-1": "Claude Fable 5.1", "claude-haiku-4-5-20251001": "Claude Haiku 4.5 (veloce)", "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5", "claude-opus-4-1-20250805": "Claude Opus 4.1" },
    contextWindow: () => 200_000,
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    defaultModel: "gpt-4o-mini",
    models: { "gpt-4o": "GPT-4o", "gpt-4o-mini": "GPT-4o mini (veloce ed economico)", "gpt-4-turbo": "GPT-4 Turbo", o1: "o1 (reasoning)", "o1-mini": "o1-mini", "o3-mini": "o3-mini (reasoning)" },
    contextWindow: (m) => ({ o1: 200_000, "o3-mini": 200_000 })[m] ?? 128_000,
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    models: { "gemini-2.0-flash": "Gemini 2.0 Flash (consigliato)", "gemini-2.0-flash-lite": "Gemini 2.0 Flash Lite", "gemini-1.5-pro": "Gemini 1.5 Pro", "gemini-1.5-flash": "Gemini 1.5 Flash" },
    contextWindow: (m) => (m === "gemini-1.5-pro" ? 2_097_152 : 1_048_576),
  },
  deepseek: {
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    models: { "deepseek-chat": "DeepSeek Chat (V3)", "deepseek-reasoner": "DeepSeek Reasoner (R1)" },
    contextWindow: () => 64_000,
  },
  kieai: {
    label: "kie.ai (gateway multi-modello)",
    defaultModel: "deepseek-chat",
    models: { "deepseek-chat": "DeepSeek V3", "deepseek-reasoner": "DeepSeek R1", "gpt-4o": "GPT-4o (via kie.ai)", "gpt-4o-mini": "GPT-4o mini", "claude-3-5-sonnet": "Claude 3.5 Sonnet", "gemini-2.0-flash": "Gemini 2.0 Flash", "qwen-max": "Qwen Max", "llama-3.3-70b": "Llama 3.3 70B" },
    contextWindow: (m) => ({ "gpt-4o": 128_000, "gpt-4o-mini": 128_000, "claude-3-5-sonnet": 200_000, "gemini-2.0-flash": 1_048_576, "qwen-max": 32_000, "llama-3.3-70b": 128_000 })[m] ?? 64_000,
  },
};

export type Provider = { name: ProviderName; label: string; model: string; hasKey: boolean; contextWindow: number; maxTokens: number; chat: (messages: ChatMessage[], tools?: ToolDef[]) => Promise<ChatResult> };

const empty = (): ChatOk => ({ text: "", tool_calls: [], usage: { in: 0, out: 0 }, raw: null });
const str = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? ""));

async function httpPost(url: string, headers: Record<string, string>, body: unknown, provider: string): Promise<Row | { error: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) }).catch((e) => ({ status: 0, text: async () => String(e) }) as Response);
  const raw = await res.text();
  let json: Row = {};
  try {
    json = JSON.parse(raw);
  } catch {
    /* corpo non JSON */
  }
  if (res.status === 0 || res.status >= 400) {
    const msg = (json.error as Row | undefined)?.message?.toString() || (json.message as string | undefined) || `HTTP ${res.status}: ${raw.slice(0, 300)}`;
    void debug.error("ai_provider", `HTTP ${res.status} from ${url}`, { provider, msg, snippet: raw.slice(0, 500) });
    return { error: msg };
  }
  return json;
}

function parseOpenAiCompatible(resp: Row): ChatOk {
  const out = empty();
  out.raw = resp;
  const usage = resp.usage as Row | undefined;
  if (usage) out.usage = { in: Number(usage.prompt_tokens ?? 0), out: Number(usage.completion_tokens ?? 0) };
  const msg = ((resp.choices as Row[] | undefined)?.[0]?.message as Row | undefined) ?? {};
  out.text = String(msg.content ?? "");
  for (const tc of (msg.tool_calls as Row[] | undefined) ?? []) {
    const fn = (tc.function as Row | undefined) ?? {};
    let args: Record<string, unknown> = {};
    try {
      args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : ((fn.arguments as Record<string, unknown>) ?? {});
    } catch {
      args = {};
    }
    out.tool_calls.push({ id: String(tc.id ?? ""), name: String(fn.name ?? ""), arguments: args });
  }
  return out;
}

function toOpenAiMessage(m: ChatMessage): Row {
  if (m.role === "tool") return { role: "tool", tool_call_id: m.tool_call_id ?? "", content: str(m.content) };
  if (m.role === "assistant" && m.tool_calls?.length) {
    return { role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } })) };
  }
  return { role: m.role, content: str(m.content) };
}

function openAiCompatible(name: ProviderName, endpoint: string, key: string, model: string, temperature: number, maxTokens: number) {
  return async (messages: ChatMessage[], tools: ToolDef[] = []): Promise<ChatResult> => {
    if (!key) return { error: `API key ${PROVIDERS[name].label} non configurata` };
    const body: Row = { model, messages: messages.map(toOpenAiMessage), temperature, max_tokens: maxTokens };
    if (/^o\d/.test(model)) {
      delete body.temperature;
      delete body.max_tokens;
      body.max_completion_tokens = maxTokens;
    }
    if (tools.length) {
      body.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
      body.tool_choice = "auto";
    }
    const resp = await httpPost(endpoint, { Authorization: `Bearer ${key}` }, body, name);
    if ("error" in resp) return resp as { error: string };
    return parseOpenAiCompatible(resp);
  };
}

function claude(key: string, model: string, temperature: number, maxTokens: number) {
  return async (messages: ChatMessage[], tools: ToolDef[] = []): Promise<ChatResult> => {
    if (!key) return { error: "API key Claude non configurata" };
    const sys: string[] = [];
    const msgs: Row[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        sys.push(m.content);
        continue;
      }
      if (m.role === "tool") {
        msgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: str(m.content) }] });
        continue;
      }
      if (m.role === "assistant" && m.tool_calls?.length) {
        const blocks: Row[] = [];
        if (m.content?.trim()) blocks.push({ type: "text", text: m.content.trim() });
        for (const tc of m.tool_calls) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments ?? {} });
        msgs.push({ role: "assistant", content: blocks });
        continue;
      }
      msgs.push({ role: m.role, content: m.content });
    }
    const body: Row = { model, max_tokens: maxTokens, temperature, messages: msgs };
    if (sys.length) body.system = sys.join("\n\n");
    if (tools.length) body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    const resp = await httpPost("https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" }, body, "claude");
    if ("error" in resp) return resp as { error: string };
    const out = empty();
    out.raw = resp;
    const usage = resp.usage as Row | undefined;
    if (usage) out.usage = { in: Number(usage.input_tokens ?? 0), out: Number(usage.output_tokens ?? 0) };
    for (const block of (resp.content as Row[] | undefined) ?? []) {
      if (block.type === "text") out.text += String(block.text ?? "");
      else if (block.type === "tool_use") out.tool_calls.push({ id: String(block.id ?? ""), name: String(block.name ?? ""), arguments: (block.input as Record<string, unknown>) ?? {} });
    }
    return out;
  };
}

function gemini(key: string, model: string, temperature: number, maxTokens: number) {
  return async (messages: ChatMessage[], tools: ToolDef[] = []): Promise<ChatResult> => {
    if (!key) return { error: "API key Gemini non configurata" };
    const sys: string[] = [];
    const contents: Row[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        sys.push(m.content);
        continue;
      }
      if (m.role === "tool") {
        contents.push({ role: "user", parts: [{ functionResponse: { name: m.name ?? "unknown", response: { text: str(m.content) } } }] });
        continue;
      }
      if (m.role === "assistant" && m.tool_calls?.length) {
        contents.push({ role: "model", parts: m.tool_calls.map((tc) => ({ functionCall: { name: tc.name, args: tc.arguments ?? {} } })) });
        continue;
      }
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
    }
    const body: Row = { contents, generationConfig: { temperature, maxOutputTokens: maxTokens } };
    if (sys.length) body.systemInstruction = { parts: [{ text: sys.join("\n\n") }] };
    if (tools.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
    const resp = await httpPost(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {}, body, "gemini");
    if ("error" in resp) return resp as { error: string };
    const out = empty();
    out.raw = resp;
    const usage = resp.usageMetadata as Row | undefined;
    if (usage) out.usage = { in: Number(usage.promptTokenCount ?? 0), out: Number(usage.candidatesTokenCount ?? 0) };
    const parts = (((resp.candidates as Row[] | undefined)?.[0]?.content as Row | undefined)?.parts as Row[] | undefined) ?? [];
    for (const p of parts) {
      if (typeof p.text === "string") out.text += p.text;
      const fc = p.functionCall as Row | undefined;
      if (fc) out.tool_calls.push({ id: `gem_${Math.random().toString(36).slice(2, 12)}`, name: String(fc.name ?? ""), arguments: (fc.args as Record<string, unknown>) ?? {} });
    }
    return out;
  };
}

export async function buildProvider(name?: ProviderName): Promise<Provider> {
  const a = await settings.ai();
  const n = name ?? a.activeProvider;
  const key = a[`${n}Key` as const];
  const model = a[`${n}Model` as const] || PROVIDERS[n].defaultModel;
  const chat =
    n === "claude"
      ? claude(key, model, a.temperature, a.maxTokens)
      : n === "gemini"
        ? gemini(key, model, a.temperature, a.maxTokens)
        : openAiCompatible(n, n === "openai" ? "https://api.openai.com/v1/chat/completions" : n === "deepseek" ? "https://api.deepseek.com/v1/chat/completions" : "https://api.kie.ai/v1/chat/completions", key, model, a.temperature, a.maxTokens);
  return { name: n, label: PROVIDERS[n].label, model, hasKey: Boolean(key), contextWindow: PROVIDERS[n].contextWindow(model), maxTokens: a.maxTokens, chat };
}

export async function testConnection(name?: ProviderName): Promise<{ ok: boolean; message: string }> {
  const p = await buildProvider(name);
  if (!p.hasKey) return { ok: false, message: "API key non configurata" };
  const r = await p.chat([{ role: "user", content: "Reply with the single word OK and nothing else." }]);
  if ("error" in r) return { ok: false, message: r.error };
  return { ok: Boolean(r.text.trim()), message: r.text.trim() || "Risposta vuota" };
}
