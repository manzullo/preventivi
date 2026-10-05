// Registro dei tool per l'AI: port di PSF_AI_Tools. Stessi nomi e stessi
// parametri; i tool in lettura girano da soli, quelli in scrittura tornano
// `requires_confirmation` con un'anteprima e partono solo dopo conferma.

import { db } from "@/lib/db";
import { isConnected, listAccessibleCustomers, micros, n, pick, s, search } from "@/modules/ads/google-ads";
import { addCampaignLocation, addKeyword, addNegativeKeyword, enableKeyword, pauseKeyword, removeCampaignLocation, suggestGeoTargets, updateCampaignLocationBid, updateCampaignStatus, updateKeywordBid } from "@/modules/ads/google-ads-mutations";
import { getAccessibleAccountsWithInfo, getDailyMetrics, getSearchTerms, listAdGroupsForCampaign, listAdsForAdGroup, listCampaignLocations, listConversionActions, listNegativeKeywords } from "@/modules/ads/google-ads-reports";
import type { ToolDef } from "./provider";

type Args = Record<string, unknown>;
type Handler = (a: Args) => Promise<unknown>;
type Tool = ToolDef & { category: "read" | "write"; handler: Handler };

const digits = (v: unknown) => String(v ?? "").replace(/\D+/g, "");
const days = (a: Args) => Math.max(1, Number(a.days ?? 30) || 30);
const today = () => new Date().toISOString().slice(0, 10);
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const needAds = async () => (await isConnected()) ? null : { error: "Google Ads non connesso" };

const P = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const cid = { customer_id: { type: "string", description: "Google Ads customer ID (senza trattini)" } };
const dd = { days: { type: "integer", default: 30 } };

const REGISTRY: Record<string, Tool> = {
  list_forms: {
    name: "list_forms", category: "read",
    description: "Lista tutti i form con metriche aggregate (visite, lead, conversion rate).",
    parameters: P({ days: { type: "integer", description: "Giorni di lookback (default 30)", default: 30 } }),
    handler: async (a) => {
      const d = days(a);
      const since = new Date(Date.now() - d * 864e5);
      const forms = await db.form.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, slug: true } });
      const out = [];
      for (const f of forms) {
        const [leads, visits] = await Promise.all([
          db.submission.count({ where: { formId: f.id, createdAt: { gte: since }, testMode: false } }),
          db.analyticsEvent.findMany({ where: { formId: f.id, type: "step_view", createdAt: { gte: since } }, distinct: ["sessionId"], select: { sessionId: true } }).then((r) => r.length),
        ]);
        out.push({ form_id: f.id, name: f.name, slug: f.slug, visits, leads, conv_rate: visits ? Math.round((leads / visits) * 10000) / 100 : 0 });
      }
      return { days: d, forms: out };
    },
  },
  get_form_metrics: {
    name: "get_form_metrics", category: "read",
    description: "Metriche dettagliate di un form: lead, visite, conversion rate per step, drop-off, fonte traffico.",
    parameters: P({ form_id: { type: "string", description: "ID del form" }, ...dd }, ["form_id"]),
    handler: async (a) => {
      const d = days(a);
      const since = new Date(Date.now() - d * 864e5);
      const form = await db.form.findUnique({ where: { id: String(a.form_id ?? "") }, select: { id: true, name: true, slug: true, steps: { orderBy: { position: "asc" }, select: { id: true, key: true, position: true } } } });
      if (!form) return { error: "Form non trovato" };
      const rows = await db.stepAnalytics.groupBy({ by: ["stepId"], where: { formId: form.id, day: { gte: since } }, _sum: { views: true, completions: true } });
      const steps = form.steps.map((st) => { const r = rows.find((x) => x.stepId === st.id); return { step_index: st.position, key: st.key, visits: r?._sum.views ?? 0, completions: r?._sum.completions ?? 0 }; });
      const total_leads = await db.submission.count({ where: { formId: form.id, createdAt: { gte: since }, testMode: false } });
      const src = await db.lead.groupBy({ by: ["utmSource", "utmMedium"], where: { formId: form.id, createdAt: { gte: since } }, _count: true, orderBy: { _count: { utmSource: "desc" } }, take: 10 });
      return { form: { id: form.id, name: form.name, slug: form.slug }, days: d, total_leads, steps, top_sources: src.map((x) => ({ utm_source: x.utmSource, utm_medium: x.utmMedium, c: x._count })) };
    },
  },
  list_gads_accounts: {
    name: "list_gads_accounts", category: "read",
    description: "Lista account Google Ads accessibili (incluso info MCC).",
    parameters: P({}),
    handler: async () => (await needAds()) ?? { customers: await listAccessibleCustomers(), accounts: await getAccessibleAccountsWithInfo() },
  },
  get_account_summary: {
    name: "get_account_summary", category: "read",
    description: "KPI riassuntivi di un account Google Ads (impressions, clicks, cost, conv, CTR, CPC, CPA).",
    parameters: P({ ...cid, ...dd }, ["customer_id"]),
    handler: async (a) => {
      const err = await needAds(); if (err) return err;
      const c = digits(a.customer_id); const d = days(a);
      if (!c) return { error: "customer_id mancante" };
      const rows = await search(c, `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc FROM customer WHERE segments.date BETWEEN '${ago(d)}' AND '${today()}'`);
      if (!rows) return { error: "Lettura fallita" };
      const sum = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conv_value: 0, ctr: 0, cpc: 0, cpa: 0 };
      for (const r of rows) { sum.impressions += n(pick(r, "metrics.impressions")); sum.clicks += n(pick(r, "metrics.clicks")); sum.cost += micros(pick(r, "metrics.costMicros")); sum.conversions += n(pick(r, "metrics.conversions")); sum.conv_value += n(pick(r, "metrics.conversionsValue")); }
      sum.ctr = sum.impressions ? Math.round((sum.clicks / sum.impressions) * 10000) / 100 : 0;
      sum.cpc = sum.clicks ? Math.round((sum.cost / sum.clicks) * 100) / 100 : 0;
      sum.cpa = sum.conversions ? Math.round((sum.cost / sum.conversions) * 100) / 100 : 0;
      return { customer_id: c, days: d, summary: sum };
    },
  },
  list_campaigns: {
    name: "list_campaigns", category: "read",
    description: "Lista campagne di un account Google Ads con metriche per campagna.",
    parameters: P({ ...cid, ...dd }, ["customer_id"]),
    handler: async (a) => {
      const err = await needAds(); if (err) return err;
      const c = digits(a.customer_id); const d = days(a);
      if (!c) return { error: "customer_id mancante" };
      const rows = await search(c, `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date BETWEEN '${ago(d)}' AND '${today()}' ORDER BY metrics.cost_micros DESC`);
      if (!rows) return { error: "Lettura fallita" };
      const agg = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        const id = s(pick(r, "campaign.id"));
        const x = (agg.get(id) as Record<string, number | string> | undefined) ?? { id, name: s(pick(r, "campaign.name")), status: s(pick(r, "campaign.status")), type: s(pick(r, "campaign.advertisingChannelType")), budget_daily: micros(pick(r, "campaignBudget.amountMicros")), impressions: 0, clicks: 0, cost: 0, conversions: 0 };
        x.impressions = Number(x.impressions) + n(pick(r, "metrics.impressions")); x.clicks = Number(x.clicks) + n(pick(r, "metrics.clicks")); x.cost = Number(x.cost) + micros(pick(r, "metrics.costMicros")); x.conversions = Number(x.conversions) + n(pick(r, "metrics.conversions"));
        agg.set(id, x);
      }
      return { customer_id: c, days: d, campaigns: [...agg.values()].map((x) => ({ ...x, ctr: Number(x.impressions) ? Math.round((Number(x.clicks) / Number(x.impressions)) * 10000) / 100 : 0, cpc: Number(x.clicks) ? Math.round((Number(x.cost) / Number(x.clicks)) * 100) / 100 : 0 })) };
    },
  },
  list_keywords: {
    name: "list_keywords", category: "read",
    description: "Lista keyword con metriche e quality score (filtrabile per campagna o ad group).",
    parameters: P({ ...cid, campaign_id: { type: "string", description: "Filtro opzionale" }, ad_group_id: { type: "string", description: "Filtro opzionale" }, ...dd }, ["customer_id"]),
    handler: async (a) => {
      const err = await needAds(); if (err) return err;
      const c = digits(a.customer_id); const d = days(a);
      if (!c) return { error: "customer_id mancante" };
      let where = `segments.date BETWEEN '${ago(d)}' AND '${today()}'`;
      if (a.campaign_id) where += ` AND campaign.id = ${digits(a.campaign_id)}`;
      if (a.ad_group_id) where += ` AND ad_group.id = ${digits(a.ad_group_id)}`;
      const rows = await search(c, `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, ad_group.id, ad_group.name, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM keyword_view WHERE ${where} ORDER BY metrics.cost_micros DESC`);
      if (!rows) return { error: "Lettura fallita" };
      const kws = rows.map((r) => { const cost = micros(pick(r, "metrics.costMicros")); const conv = n(pick(r, "metrics.conversions")); return { criterion_id: s(pick(r, "adGroupCriterion.criterionId")), ad_group_criterion_id: `${s(pick(r, "adGroup.id"))}~${s(pick(r, "adGroupCriterion.criterionId"))}`, text: s(pick(r, "adGroupCriterion.keyword.text")), match_type: s(pick(r, "adGroupCriterion.keyword.matchType")), status: s(pick(r, "adGroupCriterion.status")), quality_score: n(pick(r, "adGroupCriterion.qualityInfo.qualityScore")), campaign_id: s(pick(r, "campaign.id")), campaign_name: s(pick(r, "campaign.name")), ad_group_id: s(pick(r, "adGroup.id")), ad_group_name: s(pick(r, "adGroup.name")), impressions: n(pick(r, "metrics.impressions")), clicks: n(pick(r, "metrics.clicks")), cost, conversions: conv, ctr: Math.round(n(pick(r, "metrics.ctr")) * 10000) / 100, cpc: micros(pick(r, "metrics.averageCpc")), cpa: conv > 0 ? Math.round((cost / conv) * 100) / 100 : null }; });
      return { customer_id: c, days: d, count: kws.length, keywords: kws };
    },
  },
  get_search_terms: {
    name: "get_search_terms", category: "read",
    description: "Search terms (query reali degli utenti) con click, conv, cost, e la keyword che li ha attivati.",
    parameters: P({ ...cid, campaign_id: { type: "string", description: "Filtro opzionale" }, ...dd }, ["customer_id"]),
    handler: async (a) => { const err = await needAds(); if (err) return err; const c = digits(a.customer_id); const r = await getSearchTerms(c, days(a), 200, a.campaign_id ? digits(a.campaign_id) : undefined); return r ? { customer_id: c, days: days(a), count: r.length, search_terms: r } : { error: "Lettura fallita" }; },
  },
  list_ad_groups: { name: "list_ad_groups", category: "read", description: "Lista ad group di un account o di una campagna con metriche.", parameters: P({ ...cid, campaign_id: { type: "string" }, ...dd }, ["customer_id"]), handler: async (a) => { const err = await needAds(); if (err) return err; const r = await listAdGroupsForCampaign(digits(a.customer_id), a.campaign_id ? digits(a.campaign_id) : undefined, days(a)); return { customer_id: digits(a.customer_id), days: days(a), count: r.length, ad_groups: r }; } },
  list_ads: { name: "list_ads", category: "read", description: "Lista annunci RSA di un ad group con headline, description e performance.", parameters: P({ ...cid, ad_group_id: { type: "string" }, ...dd }, ["customer_id", "ad_group_id"]), handler: async (a) => { const err = await needAds(); if (err) return err; const r = await listAdsForAdGroup(digits(a.customer_id), digits(a.ad_group_id), days(a)); return { customer_id: digits(a.customer_id), ad_group_id: digits(a.ad_group_id), count: r.length, ads: r }; } },
  list_negative_keywords: { name: "list_negative_keywords", category: "read", description: "Lista negative keyword a livello campagna o ad group.", parameters: P({ ...cid, level: { type: "string", enum: ["campaign", "ad_group"], default: "campaign" }, scope_id: { type: "string", description: "Opzionale: campaign_id o ad_group_id" } }, ["customer_id"]), handler: async (a) => { const err = await needAds(); if (err) return err; const level = a.level === "ad_group" ? "ad_group" : "campaign"; const r = await listNegativeKeywords(digits(a.customer_id), level, a.scope_id ? digits(a.scope_id) : undefined); return { customer_id: digits(a.customer_id), level, count: r.length, negatives: r }; } },
  get_daily_trend: { name: "get_daily_trend", category: "read", description: "Trend giornaliero (impressions, clicks, cost, conversions).", parameters: P({ ...cid, campaign_id: { type: "string" }, ...dd }, ["customer_id"]), handler: async (a) => { const err = await needAds(); if (err) return err; return { customer_id: digits(a.customer_id), days: days(a), trend: await getDailyMetrics(digits(a.customer_id), days(a), a.campaign_id ? digits(a.campaign_id) : undefined) }; } },
  list_campaign_locations: { name: "list_campaign_locations", category: "read", description: "Geo-targeting (località incluse ed escluse) di una o tutte le campagne: name, canonical, target_type, bid_modifier, negative.", parameters: P({ ...cid, campaign_id: { type: "string" } }, ["customer_id"]), handler: async (a) => { const err = await needAds(); if (err) return err; const r = await listCampaignLocations(digits(a.customer_id), a.campaign_id ? digits(a.campaign_id) : undefined); return { customer_id: digits(a.customer_id), count: r.length, campaigns: r }; } },
  suggest_geo_targets: { name: "suggest_geo_targets", category: "read", description: "Cerca geo target constant per nome (es. \"Monterotondo\"). Ritorna ID usabili con add_campaign_location.", parameters: P({ ...cid, query: { type: "string" }, country_code: { type: "string", default: "IT" } }, ["customer_id", "query"]), handler: async (a) => { const err = await needAds(); if (err) return err; const r = await suggestGeoTargets(digits(a.customer_id), String(a.query ?? ""), String(a.country_code ?? "IT").toUpperCase(), 20); return { query: a.query, count: r.length, results: r }; } },
  list_conversion_actions: { name: "list_conversion_actions", category: "read", description: "Azioni di conversione dell'account (stato, tipo, primary_for_goal, conversioni nel periodo): verifica se il tracking funziona.", parameters: P({ ...cid, ...dd }, ["customer_id"]), handler: async (a) => { const err = await needAds(); if (err) return err; const r = await listConversionActions(digits(a.customer_id), days(a)); return { customer_id: digits(a.customer_id), count: r.length, conversion_actions: r }; } },

  add_negative_keyword: { name: "add_negative_keyword", category: "write", description: "Aggiunge una negative keyword a livello campagna o ad group.", parameters: P({ ...cid, level: { type: "string", enum: ["campaign", "ad_group"] }, scope_id: { type: "string" }, text: { type: "string" }, match_type: { type: "string", enum: ["BROAD", "PHRASE", "EXACT"], default: "PHRASE" } }, ["customer_id", "level", "scope_id", "text"]), handler: (a) => addNegativeKeyword(digits(a.customer_id), a.level === "ad_group" ? "ad_group" : "campaign", digits(a.scope_id), String(a.text ?? ""), String(a.match_type ?? "PHRASE")) },
  pause_keyword: { name: "pause_keyword", category: "write", description: "Mette in pausa una keyword (riattivabile).", parameters: P({ ...cid, ad_group_criterion_id: { type: "string", description: "{ad_group_id}~{criterion_id}" } }, ["customer_id", "ad_group_criterion_id"]), handler: (a) => pauseKeyword(digits(a.customer_id), String(a.ad_group_criterion_id ?? "")) },
  enable_keyword: { name: "enable_keyword", category: "write", description: "Riattiva una keyword in pausa.", parameters: P({ ...cid, ad_group_criterion_id: { type: "string" } }, ["customer_id", "ad_group_criterion_id"]), handler: (a) => enableKeyword(digits(a.customer_id), String(a.ad_group_criterion_id ?? "")) },
  add_keyword: { name: "add_keyword", category: "write", description: "Aggiunge una keyword positiva a un ad group con match type e bid CPC opzionale (in euro).", parameters: P({ ...cid, ad_group_id: { type: "string" }, text: { type: "string" }, match_type: { type: "string", enum: ["BROAD", "PHRASE", "EXACT"], default: "PHRASE" }, bid_eur: { type: "number", description: "Bid massimo CPC in euro (es. 0.80)" } }, ["customer_id", "ad_group_id", "text"]), handler: (a) => addKeyword(digits(a.customer_id), digits(a.ad_group_id), String(a.text ?? ""), String(a.match_type ?? "PHRASE"), a.bid_eur ? Number(a.bid_eur) * 1_000_000 : null) },
  update_keyword_bid: { name: "update_keyword_bid", category: "write", description: "Modifica il bid massimo CPC di una keyword (in euro).", parameters: P({ ...cid, ad_group_criterion_id: { type: "string" }, bid_eur: { type: "number" } }, ["customer_id", "ad_group_criterion_id", "bid_eur"]), handler: async (a) => (Number(a.bid_eur) > 0 ? updateKeywordBid(digits(a.customer_id), String(a.ad_group_criterion_id ?? ""), Number(a.bid_eur) * 1_000_000) : { error: "bid_eur deve essere > 0" }) },
  set_campaign_status: { name: "set_campaign_status", category: "write", description: "Cambia lo stato di una campagna: ENABLED o PAUSED.", parameters: P({ ...cid, campaign_id: { type: "string" }, status: { type: "string", enum: ["ENABLED", "PAUSED"] } }, ["customer_id", "campaign_id", "status"]), handler: (a) => updateCampaignStatus(digits(a.customer_id), digits(a.campaign_id), String(a.status ?? "PAUSED")) },
  add_campaign_location: { name: "add_campaign_location", category: "write", description: "Aggiunge un geo target a una campagna, positivo (con bid_modifier) o negativo (esclusione).", parameters: P({ ...cid, campaign_id: { type: "string" }, geo_target_id: { type: "string" }, bid_modifier: { type: "number", default: 1 }, negative: { type: "boolean", default: false } }, ["customer_id", "campaign_id", "geo_target_id"]), handler: (a) => addCampaignLocation(digits(a.customer_id), digits(a.campaign_id), digits(a.geo_target_id), Number(a.bid_modifier ?? 1) || 1, Boolean(a.negative)) },
  remove_campaign_location: { name: "remove_campaign_location", category: "write", description: "Rimuove un geo target da una campagna (criterion_id da list_campaign_locations).", parameters: P({ ...cid, campaign_id: { type: "string" }, criterion_id: { type: "string" } }, ["customer_id", "campaign_id", "criterion_id"]), handler: (a) => removeCampaignLocation(digits(a.customer_id), digits(a.campaign_id), digits(a.criterion_id)) },
  update_campaign_location_bid: { name: "update_campaign_location_bid", category: "write", description: "Modifica il bid_modifier di un geo target (1.2 = +20%, 0.7 = -30%).", parameters: P({ ...cid, campaign_id: { type: "string" }, criterion_id: { type: "string" }, bid_modifier: { type: "number" } }, ["customer_id", "campaign_id", "criterion_id", "bid_modifier"]), handler: (a) => updateCampaignLocationBid(digits(a.customer_id), digits(a.campaign_id), digits(a.criterion_id), Number(a.bid_modifier)) },
};

export function definitions(): ToolDef[] {
  return Object.values(REGISTRY).map(({ name, description, parameters }) => ({ name, description, parameters }));
}

function previewWrite(name: string, a: Args): string {
  const eur = (v: unknown) => Number(v ?? 0).toFixed(2);
  switch (name) {
    case "add_negative_keyword": return `Aggiungerò «${a.text}» (${a.match_type ?? "PHRASE"}) come negativa a livello ${a.level ?? "campaign"} (id ${a.scope_id}) dell'account ${a.customer_id}.`;
    case "pause_keyword": return `Metterò in PAUSA la keyword (${a.ad_group_criterion_id}) dell'account ${a.customer_id}. Riattivabile in qualsiasi momento.`;
    case "enable_keyword": return `RIATTIVERÒ la keyword (${a.ad_group_criterion_id}) dell'account ${a.customer_id}.`;
    case "add_keyword": return `Aggiungerò la keyword «${a.text}» (${a.match_type ?? "PHRASE"})${a.bid_eur ? ` con bid CPC ${eur(a.bid_eur)} €` : " con bid di default del gruppo"} all'ad group ${a.ad_group_id}.`;
    case "update_keyword_bid": return `Cambierò il bid CPC della keyword (${a.ad_group_criterion_id}) a ${eur(a.bid_eur)} €.`;
    case "set_campaign_status": return `${a.status === "PAUSED" ? "METTERÒ IN PAUSA" : "RIATTIVERÒ"} la campagna ${a.campaign_id} dell'account ${a.customer_id}.`;
    case "add_campaign_location": { const bm = Number(a.bid_modifier ?? 1); return `${a.negative ? "ESCLUDERÒ" : "AGGIUNGERÒ"} il geo target ${a.geo_target_id} alla campagna ${a.campaign_id}${bm !== 1 ? ` con bid modifier ${bm > 1 ? "+" : ""}${Math.round((bm - 1) * 100)}%` : ""}.`; }
    case "remove_campaign_location": return `RIMUOVERÒ il geo target (criterion ${a.criterion_id}) dalla campagna ${a.campaign_id}.`;
    case "update_campaign_location_bid": { const bm = Number(a.bid_modifier ?? 1); return `Cambierò il bid modifier del geo target (criterion ${a.criterion_id}) a ${bm} (${bm > 1 ? "+" : ""}${Math.round((bm - 1) * 100)}%).`; }
  }
  return "Conferma per procedere.";
}

export type ExecResult = { result: unknown } | { requires_confirmation: true; tool: string; arguments: Args; description: string; preview: string } | { error: string };

export async function execute(name: string, args: Args, force = false): Promise<ExecResult> {
  const t = REGISTRY[name];
  if (!t) return { error: `Tool ${name} non trovato` };
  if (t.category === "write" && !force) return { requires_confirmation: true, tool: name, arguments: args, description: t.description, preview: previewWrite(name, args) };
  try {
    return { result: await t.handler(args) };
  } catch (e) {
    return { error: String(e).slice(0, 500) };
  }
}

export const readTool = (name: string, args: Args) => REGISTRY[name]?.handler(args);
