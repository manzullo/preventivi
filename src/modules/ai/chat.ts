// Chat e advice: port di ajax_ai_chat / ajax_ai_advice / build_ai_system_prompt.
// Il prompt tiene la struttura del plugin; il contesto di settore è quello
// di Preventivi (lead per categorie di professionisti × città).

import { debug } from "@/lib/debug";
import { buildProvider, type ChatMessage, type ChatResult } from "./provider";
import { definitions, readTool } from "./tools";

export type ChatContext = { customerId?: string; customerName?: string; formId?: string; formName?: string; days?: number };

export function buildSystemPrompt(ctx: ChatContext): string {
  const base = `Sei un esperto Google Ads PPC integrato nell'admin di Preventivi, una directory italiana di professionisti e aziende (idraulici, elettricisti, fotografi, commercialisti...) con un motore di richiesta preventivi a form multi-step. Ti chiami "AI Assistant". Sei un consulente PPC competente, pratico e diretto. Rispondi in italiano.

Il settore: richieste di preventivo per servizi locali (casa, eventi, benessere, lezioni, professioni) in città italiane. I lead vengono smistati ai professionisti della zona e venduti.

QUANDO L'UTENTE NON SELEZIONA UN ACCOUNT/FORM (chat libera):
- Sei un assistente generico per Google Ads, marketing, lead generation
- Puoi rispondere a domande teoriche (Quality Score, match type, bidding, ad copy)
- Puoi aiutare a strutturare nuove campagne, scrivere annunci, suggerire negative di base
- Se serve un dato reale, suggerisci di selezionare un account o chiama list_gads_accounts / list_forms

QUANDO L'UTENTE SELEZIONA UN ACCOUNT/FORM:
- Usa i tool per leggere i dati reali e dare consigli mirati
- Cita numeri specifici (impr, click, cost, conv)

TOOL IN LETTURA (eseguiti automaticamente):
- list_forms, get_form_metrics
- list_gads_accounts, get_account_summary
- list_campaigns, list_ad_groups, list_keywords, list_ads
- get_search_terms, list_negative_keywords, get_daily_trend
- list_conversion_actions (verifica del tracking)
- list_campaign_locations, suggest_geo_targets (audit geografico)

TOOL IN SCRITTURA (chiedono conferma all'utente prima di eseguire):
- add_negative_keyword(level, scope_id, text, match_type)
- pause_keyword / enable_keyword
- add_keyword(ad_group_id, text, match_type, bid_eur)
- update_keyword_bid(ad_group_criterion_id, bid_eur), bid in EURO non in micros
- set_campaign_status(campaign_id, status) ENABLED o PAUSED
- add_campaign_location, remove_campaign_location, update_campaign_location_bid

STRATEGIA KEYWORD PER QUESTO PROGETTO:
Le keyword devono contenere SERVIZIO + CITTÀ, perché le pagine di atterraggio sono /{servizio}/{città}/:
- "professionista seo roma", "web agency milano", "professionista google ads torino", "professionista social media bologna"
- Per ogni servizio suggerisci varianti con OGNI città target e con i sinonimi ("consulente seo", "realizzazione siti web", "professionista ppc")
- Match type: PHRASE per la base, EXACT per le combinazioni che convertono
- Negative baseline: gratis, lavoro, stage, corso, tutorial, "come fare", software, plugin, template, wordpress gratis, freelance (se non target)

CONVERSION TRACKING, verifica sempre:
- list_conversion_actions: almeno 1 azione con primary_for_goal=true
- Se primary_for_goal=true ma conversions=0 negli ultimi 30 giorni → ALERT critical
- Il form spara la conversione sulla pagina /grazie/ con lead_id: se non arrivano conversioni, controlla il tag e l'upload offline

MATCH TYPE, strategia consigliata:
- BROAD: sconsigliato per nuove keyword
- PHRASE: default
- EXACT: per search term con conv ≥ 2 (promuovere)
- Keyword in BROAD già attive → suggerisci pausa o cambio match type

IMPORTANTE: per i tool di scrittura passa i bid in EUR (es. 0.80), non in micros.`;
  const lines: string[] = [];
  if (ctx.customerId) lines.push(`Account Google Ads selezionato: ${ctx.customerName ? `${ctx.customerName} (${ctx.customerId})` : ctx.customerId}. Usa questo customer_id nei tool senza chiederlo.`);
  if (ctx.formId) lines.push(`Form selezionato: ${ctx.formName ?? ctx.formId} (form_id ${ctx.formId}).`);
  if (ctx.days) lines.push(`Periodo di analisi: ultimi ${ctx.days} giorni.`);
  return lines.length ? `${base}\n\nCONTESTO ATTUALE:\n- ${lines.join("\n- ")}` : base;
}

/** Rimuove i messaggi assistant con tool_calls senza le risposte tool corrispondenti. */
export function cleanupOrphanToolCalls(messages: ChatMessage[]): ChatMessage[] {
  const clean: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "assistant" && m.tool_calls?.length) {
      const found = new Set<string>();
      for (let j = i + 1; j < messages.length; j++) {
        const nx = messages[j];
        if (nx.role === "tool" && nx.tool_call_id) found.add(nx.tool_call_id);
        else if (nx.role === "user" || (nx.role === "assistant" && !nx.tool_calls?.length)) break;
      }
      if (!m.tool_calls.every((tc) => tc.id && found.has(tc.id))) {
        while (i + 1 < messages.length && messages[i + 1].role === "tool") i++;
        continue;
      }
    }
    clean.push(m);
  }
  return clean;
}

export async function chat(messages: ChatMessage[], ctx: ChatContext): Promise<ChatResult> {
  const p = await buildProvider();
  if (!p.hasKey) return { error: "Provider AI non configurato. Vai in Impostazioni → AI Assistant." };
  const msgs = cleanupOrphanToolCalls(messages.filter((m) => m.role !== "system"));
  const r = await p.chat([{ role: "system", content: buildSystemPrompt(ctx) }, ...msgs], definitions());
  if ("error" in r) void debug.error("ai_chat", "chat failed", { provider: p.name, err: r.error });
  else void debug.info("ai_chat", "chat ok", { provider: p.name, usage: r.usage, tool_calls: r.tool_calls.length });
  return r;
}

// ---------- Advice ----------

export type AdviceLevel = "account" | "campaign" | "ad_group" | "keyword" | "search_term" | "form" | "cross";
export type Insight = { priority: "critical" | "warning" | "info"; category: string; title: string; description: string; action: string; impact: string };

const FOCUS: Record<AdviceLevel, (scope: string) => string> = {
  account: () => "Stai analizzando UN INTERO ACCOUNT Google Ads. Confronta campagne, identifica budget mal allocato, evidenzia campagne in dumping (alta spesa, basse conv) e quelle da scalare. Includi consigli sul mix campagne (brand vs non-brand).",
  campaign: (s) => `Stai analizzando UNA SINGOLA CAMPAGNA (id: ${s}). Confronta ad group, identifica quelli sottoperformanti, suggerisci azioni specifiche su keyword/bid/budget di questa campagna.`,
  ad_group: (s) => `Stai analizzando UN AD GROUP (id: ${s}). Concentrati su keyword e annunci di questo gruppo: quali keyword pausare, quali annunci riscrivere (cerca pattern nelle headline/description degli RSA esistenti), Quality Score.`,
  keyword: () => "Stai analizzando le KEYWORD. Identifica match type sbagliati, keyword da pausare, opportunità di promuovere search term in EXACT.",
  search_term: () => "Stai analizzando i SEARCH TERM. Per ognuno con click ≥5 e conv 0 → suggerisci come negativa. Per quelli con conv ≥2 e non già keyword → suggerisci come EXACT con bid stimato.",
  form: () => "Stai analizzando UN FORM. Identifica step con drop-off >30%, campi opzionali vs obbligatori, sorgenti che convertono meglio.",
  cross: () => "Vista completa: form + Google Ads. Cerca pattern cross-canale (es: il form riceve traffico dalla campagna Y a basso CPA → scalare).",
};
const GOALS: Record<string, string> = { lead: "GOAL UTENTE: massimizzare i lead (volume).", roas: "GOAL UTENTE: massimizzare il ROAS.", qs: "GOAL UTENTE: migliorare il Quality Score delle keyword.", budget: "GOAL UTENTE: ridurre la spesa irrilevante / ottimizzare l'allocazione del budget." };

const estimateTokens = (v: unknown) => Math.ceil(JSON.stringify(v).length / 4);

/** Riduzione del contesto a due giri come nel plugin, poi si tolgono annunci e negative. */
function shrink(ctx: Record<string, unknown>, budget: number) {
  const meta = { truncated: false, original: estimateTokens(ctx), budget, reductions: [] as string[] };
  if (meta.original <= budget) return { ctx, meta };
  const cut = (key: string, list: string, n: number, sortKey = "cost") => {
    const holder = ctx[key] as Record<string, unknown> | undefined;
    const items = holder?.[list] as Record<string, unknown>[] | undefined;
    if (!holder || !items) return;
    const sorted = [...items].sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0));
    if (sorted.length > n) {
      holder[list] = sorted.slice(0, n);
      holder._reduced_to = n;
      meta.reductions.push(`${key}: ${items.length}→${n}`);
    }
  };
  for (const [c, g, k, st] of [[30, 50, 100, 100], [15, 20, 40, 40]] as const) {
    cut("campaigns", "campaigns", c);
    cut("campaign_meta", "campaigns", c);
    cut("ad_groups", "ad_groups", g);
    cut("keywords", "keywords", k);
    cut("keywords_top", "keywords", k);
    cut("existing_keywords", "keywords", k);
    cut("search_terms", "search_terms", st);
    if (estimateTokens(ctx) <= budget) break;
  }
  if (estimateTokens(ctx) > budget) {
    for (const k of ["ads", "negatives"]) {
      if (k in ctx) {
        ctx[k] = undefined;
        meta.reductions.push(`${k}: tolto`);
      }
    }
  }
  meta.truncated = meta.reductions.length > 0;
  return { ctx, meta };
}

export async function advice(opts: { level?: AdviceLevel; customerId?: string; formId?: string; days?: number; scopeId?: string; goal?: string }) {
  const p = await buildProvider();
  if (!p.hasKey) return { error: "Provider AI non configurato. Vai in Impostazioni → AI Assistant." };
  const level: AdviceLevel = opts.level ?? "cross";
  const days = opts.days ?? 30;
  const cid = opts.customerId?.replace(/\D+/g, "") ?? "";
  const scope = opts.scopeId ?? "";
  const ctx: Record<string, unknown> = { level, scope_id: scope, days };
  const forms = await readTool("list_forms", { days });
  if (level === "form" && opts.formId) {
    ctx.form_detail = await readTool("get_form_metrics", { form_id: opts.formId, days });
    ctx.all_forms = forms;
  } else if (level === "account" && cid) {
    ctx.account_summary = await readTool("get_account_summary", { customer_id: cid, days });
    ctx.campaigns = await readTool("list_campaigns", { customer_id: cid, days });
    ctx.keywords_top = await readTool("list_keywords", { customer_id: cid, days });
    ctx.search_terms = await readTool("get_search_terms", { customer_id: cid, days });
    ctx.negatives = await readTool("list_negative_keywords", { customer_id: cid, level: "campaign" });
  } else if (level === "campaign" && cid && scope) {
    ctx.campaign_meta = await readTool("list_campaigns", { customer_id: cid, days });
    ctx.ad_groups = await readTool("list_ad_groups", { customer_id: cid, campaign_id: scope, days });
    ctx.keywords = await readTool("list_keywords", { customer_id: cid, campaign_id: scope, days });
    ctx.search_terms = await readTool("get_search_terms", { customer_id: cid, campaign_id: scope, days });
    ctx.negatives = await readTool("list_negative_keywords", { customer_id: cid, level: "campaign", scope_id: scope });
  } else if (level === "ad_group" && cid && scope) {
    ctx.keywords = await readTool("list_keywords", { customer_id: cid, ad_group_id: scope, days });
    ctx.ads = await readTool("list_ads", { customer_id: cid, ad_group_id: scope, days });
    ctx.negatives = await readTool("list_negative_keywords", { customer_id: cid, level: "ad_group", scope_id: scope });
  } else if (level === "keyword" && cid) {
    ctx.keywords = await readTool("list_keywords", { customer_id: cid, days });
    ctx.search_terms = await readTool("get_search_terms", { customer_id: cid, days });
  } else if (level === "search_term" && cid) {
    ctx.search_terms = await readTool("get_search_terms", { customer_id: cid, days });
    ctx.existing_keywords = await readTool("list_keywords", { customer_id: cid, days });
    ctx.negatives = await readTool("list_negative_keywords", { customer_id: cid, level: "campaign" });
  } else {
    ctx.forms = forms;
    if (opts.formId) ctx.form_detail = await readTool("get_form_metrics", { form_id: opts.formId, days });
    if (cid) {
      ctx.account_summary = await readTool("get_account_summary", { customer_id: cid, days });
      ctx.campaigns = await readTool("list_campaigns", { customer_id: cid, days });
      ctx.keywords_top = await readTool("list_keywords", { customer_id: cid, days });
      ctx.search_terms = await readTool("get_search_terms", { customer_id: cid, days });
    }
  }
  const system = `Sei un esperto Google Ads PPC con focus su lead generation. ${FOCUS[level](scope)}
${GOALS[opts.goal ?? ""] ?? ""}
Analizza i dati forniti e produci consigli concreti, prioritizzati e azionabili.
Output rigorosamente in JSON con questa struttura:
{"insights":[{"priority":"critical|warning|info","category":"keywords|campaigns|forms|landing|bidding|quality|competitor|ads|budget","title":"breve titolo (max 60 char)","description":"2-4 righe con numeri specifici presi dai dati","action":"azione concreta (1-2 righe), con ID/nome di campagna o keyword quando serve","impact":"impatto stimato (es. '-30% spesa irrilevante', '+20% lead')"}]}
Critical = blocca conversioni o spreca budget. Warning = ottimizzazione importante. Info = nice-to-have.
Massimo 8 insight, ordinati per priorità. Nessun testo fuori dal JSON.`;
  const budget = Math.floor(p.contextWindow * 0.8) - (1500 + p.maxTokens);
  const { ctx: final, meta } = shrink(ctx, budget);
  if (meta.truncated) void debug.warn("ai_advice", `context reduced for ${p.name}`, meta);
  const r = await p.chat([{ role: "system", content: system }, { role: "user", content: `Periodo: ultimi ${days} giorni. Livello: ${level}. Dati:\n\n${JSON.stringify(final, null, 1)}` }]);
  if ("error" in r) {
    void debug.error("ai_advice", "advice failed", { provider: p.name, level, err: r.error });
    return { error: r.error };
  }
  const text = r.text.trim().replace(/^```(?:json)?\s*|\s*```$/gm, "");
  let insights: Insight[] = [];
  try {
    const parsed = JSON.parse(text) as { insights?: Insight[] };
    insights = parsed.insights ?? [];
  } catch {
    /* output non strutturato: si mostra il testo grezzo */
  }
  void debug.info("ai_advice", `advice ok (${level})`, { provider: p.name, usage: r.usage, truncation: meta });
  return { insights, raw: insights.length ? undefined : text, usage: r.usage, truncation: meta, provider: p.name, model: p.model };
}
