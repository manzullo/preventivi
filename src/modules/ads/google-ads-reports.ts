// Google Ads: report e letture (port di PSF_Google_Ads_API, parte 2).
// Stesse query GAQL del plugin: statistiche, search term, keyword, gruppi,
// annunci, negative, località, azioni di conversione, trend giornaliero.

import { settings } from "@/lib/settings";
import { HOUR, MINUTE, cacheGet, cacheSet, dateClause, daysAgo, digits, gaqlEscape, listAccessibleCustomers, micros, mutate, n, pick, s, search, today, type CustomerInfo, type Row } from "./google-ads";

export function defaultTrackingTemplate(): string {
  return "{lpurl}?utm_source=google_ads&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={adgroupid}&matchtype={matchtype}&device={device}&network={network}&gclid={gclid}";
}

export async function setCampaignTrackingTemplate(customerId: string, campaignId: string, template = defaultTrackingTemplate()) {
  const cid = digits(customerId);
  return mutate(cid, "campaigns:mutate", { operations: [{ update: { resourceName: `customers/${cid}/campaigns/${digits(campaignId)}`, trackingUrlTemplate: template }, updateMask: "tracking_url_template" }] });
}

export async function bulkApplyTrackingTemplate(customerId: string, template = defaultTrackingTemplate(), force = false) {
  const cid = digits(customerId);
  const rows = await search(cid, "SELECT campaign.id, campaign.name, campaign.tracking_url_template, campaign.status FROM campaign WHERE campaign.status = 'ENABLED'");
  if (!rows) return { error: "Search failed", applied: [], skipped: [], errors: [], template };
  const applied: Row[] = [];
  const skipped: Row[] = [];
  const errors: Row[] = [];
  for (const r of rows) {
    const id = s(pick(r, "campaign.id"));
    const name = s(pick(r, "campaign.name"));
    const existing = s(pick(r, "campaign.trackingUrlTemplate"));
    if (!id) continue;
    if (existing && !force) {
      skipped.push({ id, name, reason: "has_template", existing });
      continue;
    }
    const res = await setCampaignTrackingTemplate(cid, id, template);
    if ("error" in res) errors.push({ id, name, error: res.error });
    else applied.push({ id, name });
  }
  return { applied, skipped, errors, template };
}

export function mapNetworkType(t: string): string {
  const u = t.toUpperCase();
  if (u === "SEARCH") return "g";
  if (u === "SEARCH_PARTNERS") return "s";
  if (u === "CONTENT") return "d";
  if (["YOUTUBE_SEARCH", "YOUTUBE_WATCH", "YOUTUBE"].includes(u)) return "y";
  if (u === "MIXED") return "x";
  return "";
}

/** Metadati del click da click_view (ritardo 4-12h). Prova oggi, ieri, l'altro ieri. */
export async function enrichFromClickView(customerId: string, gclid: string, date?: string) {
  if (!gclid) return null;
  const cid = digits(customerId);
  const dates = date ? [date] : [today(), daysAgo(1), daysAgo(2)];
  for (const d of dates) {
    const rows = await search(cid, `SELECT click_view.gclid, segments.ad_network_type, segments.device, campaign.id, campaign.name, ad_group.id, ad_group.name FROM click_view WHERE segments.date = '${d}' AND click_view.gclid = '${gaqlEscape(gclid)}'`);
    if (rows && rows.length) {
      const r = rows[0];
      return {
        campaignId: s(pick(r, "campaign.id")),
        campaignName: s(pick(r, "campaign.name")),
        adGroupId: s(pick(r, "adGroup.id")),
        adGroupName: s(pick(r, "adGroup.name")),
        network: mapNetworkType(s(pick(r, "segments.adNetworkType"))),
        device: s(pick(r, "segments.device")).toLowerCase(),
        date: d,
      };
    }
  }
  return null;
}

/** Search term della conversione: deterministico se c'è una sola conv nel gruppo quel giorno. */
export async function findSearchTermForConversion(customerId: string, adGroupId: string, date: string) {
  if (!adGroupId || !date) return null;
  const rows = await search(digits(customerId), `SELECT search_term_view.search_term, segments.keyword.info.text, segments.keyword.info.match_type, metrics.clicks, metrics.conversions FROM search_term_view WHERE segments.date = '${date}' AND ad_group.id = ${digits(adGroupId)} AND metrics.conversions > 0`);
  if (!rows) return null;
  const cands = rows.filter((r) => n(pick(r, "metrics.conversions")) >= 1);
  if (cands.length === 0) return null;
  cands.sort((a, b) => n(pick(b, "metrics.clicks")) - n(pick(a, "metrics.clicks")));
  const r = cands[0];
  return {
    searchTerm: s(pick(r, "searchTermView.searchTerm")),
    keyword: s(pick(r, "segments.keyword.info.text")),
    matchType: s(pick(r, "segments.keyword.info.matchType")),
    confidence: cands.length === 1 ? "high" : "low",
    candidates: cands.length,
  };
}

export async function getCustomerInfo(customerId: string): Promise<CustomerInfo | null> {
  const key = `gads:cust:${customerId}`;
  const c = cacheGet<CustomerInfo>(key);
  if (c) return c;
  const rows = await search(customerId, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1");
  if (!rows || !rows.length) return null;
  const info: CustomerInfo = {
    id: s(pick(rows[0], "customer.id"), customerId),
    name: s(pick(rows[0], "customer.descriptiveName"), "(senza nome)"),
    currency: s(pick(rows[0], "customer.currencyCode"), "EUR"),
    timezone: s(pick(rows[0], "customer.timeZone"), "Europe/Rome"),
    manager: Boolean(pick(rows[0], "customer.manager")),
  };
  cacheSet(key, info, HOUR);
  return info;
}

export type ConvStat = { date: string; actionId: string; actionName: string; conversions: number; allConversions: number; value: number };

export async function getConversionStats(customerId: string, days = 30): Promise<ConvStat[] | null> {
  const key = `gads:conv:${customerId}:${days}`;
  const c = cacheGet<ConvStat[]>(key);
  if (c) return c;
  const rows = await search(customerId, `SELECT segments.date, segments.conversion_action, segments.conversion_action_name, metrics.conversions, metrics.all_conversions, metrics.all_conversions_value FROM customer WHERE segments.date DURING LAST_${days}_DAYS ORDER BY segments.date DESC`);
  if (!rows) return null;
  const out = rows.map((r) => ({
    date: s(pick(r, "segments.date")),
    actionId: s(pick(r, "segments.conversionAction")).match(/conversionActions\/(\d+)/)?.[1] ?? "",
    actionName: s(pick(r, "segments.conversionActionName")),
    conversions: n(pick(r, "metrics.conversions")),
    allConversions: n(pick(r, "metrics.allConversions")),
    value: n(pick(r, "metrics.allConversionsValue")),
  }));
  cacheSet(key, out, 5 * MINUTE);
  return out;
}

export type CampaignStat = { id: string; name: string; status: string; type: string; clicks: number; impressions: number; cost: number; conversions: number; allConversions: number };

export async function getCampaignStats(customerId: string, days = 30): Promise<CampaignStat[] | null> {
  const key = `gads:camp:${customerId}:${days}`;
  const c = cacheGet<CampaignStat[]>(key);
  if (c) return c;
  const rows = await search(customerId, `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.all_conversions, metrics.ctr FROM campaign WHERE segments.date DURING LAST_${days}_DAYS ORDER BY metrics.cost_micros DESC`);
  if (!rows) return null;
  const agg = new Map<string, CampaignStat>();
  for (const r of rows) {
    const id = s(pick(r, "campaign.id"));
    const a = agg.get(id) ?? { id, name: s(pick(r, "campaign.name")), status: s(pick(r, "campaign.status")), type: s(pick(r, "campaign.advertisingChannelType")), clicks: 0, impressions: 0, cost: 0, conversions: 0, allConversions: 0 };
    a.clicks += n(pick(r, "metrics.clicks"));
    a.impressions += n(pick(r, "metrics.impressions"));
    a.cost += micros(pick(r, "metrics.costMicros"));
    a.conversions += n(pick(r, "metrics.conversions"));
    a.allConversions += n(pick(r, "metrics.allConversions"));
    agg.set(id, a);
  }
  const out = [...agg.values()].sort((a, b) => b.cost - a.cost);
  cacheSet(key, out, 5 * MINUTE);
  return out;
}

/** Account accessibili + sub-account sotto l'MCC (fix 3.22.2). */
export async function getAccessibleAccountsWithInfo(force = false): Promise<CustomerInfo[]> {
  const key = "gads:accounts";
  if (!force) {
    const c = cacheGet<CustomerInfo[]>(key);
    if (c && c.length) return c;
  }
  const out: CustomerInfo[] = [];
  for (const id of await listAccessibleCustomers()) {
    const info = await getCustomerInfo(id);
    if (info) out.push(info);
  }
  const mcc = digits((await settings.gads()).loginCustomerId);
  if (mcc) {
    if (!out.some((x) => x.id === mcc)) {
      const info = await getCustomerInfo(mcc);
      if (info) out.push(info);
    }
    const subs = await search(mcc, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.status = 'ENABLED'");
    for (const r of subs ?? []) {
      const sid = s(pick(r, "customerClient.id"));
      if (!sid || out.some((x) => x.id === sid)) continue;
      if (n(pick(r, "customerClient.level")) === 0 && sid === mcc) continue;
      out.push({ id: sid, name: s(pick(r, "customerClient.descriptiveName"), "(senza nome)"), currency: s(pick(r, "customerClient.currencyCode"), "EUR"), timezone: "", manager: Boolean(pick(r, "customerClient.manager")) });
    }
  }
  if (out.length) cacheSet(key, out, HOUR);
  return out;
}

export type SearchTerm = { searchTerm: string; keyword: string; matchType: string; campaign: string; campaignId: string; adGroup: string; adGroupId: string; clicks: number; impressions: number; cost: number; conversions: number; allConversions: number };

export async function getSearchTerms(customerId: string, days = 30, limit = 200, campaignId?: string, allTime = false, from?: string, to?: string): Promise<SearchTerm[] | null> {
  const key = `gads:st:${customerId}:${allTime ? "all" : from && to ? `${from}_${to}` : days}:${campaignId ?? ""}`;
  const c = cacheGet<SearchTerm[]>(key);
  if (c) return c;
  const rows = await search(customerId, `SELECT search_term_view.search_term, campaign.id, campaign.name, ad_group.id, ad_group.name, segments.keyword.info.text, segments.keyword.info.match_type, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.all_conversions FROM search_term_view WHERE ${dateClause(days, allTime, from, to)}${campaignId ? ` AND campaign.id = ${digits(campaignId)}` : ""}`);
  if (!rows) return null;
  const agg = new Map<string, SearchTerm>();
  for (const r of rows) {
    const term = s(pick(r, "searchTermView.searchTerm")).trim().toLowerCase();
    if (!term) continue;
    const a = agg.get(term) ?? { searchTerm: term, keyword: s(pick(r, "segments.keyword.info.text")), matchType: s(pick(r, "segments.keyword.info.matchType")), campaign: s(pick(r, "campaign.name")), campaignId: s(pick(r, "campaign.id")), adGroup: s(pick(r, "adGroup.name")), adGroupId: s(pick(r, "adGroup.id")), clicks: 0, impressions: 0, cost: 0, conversions: 0, allConversions: 0 };
    a.clicks += n(pick(r, "metrics.clicks"));
    a.impressions += n(pick(r, "metrics.impressions"));
    a.cost += micros(pick(r, "metrics.costMicros"));
    a.conversions += n(pick(r, "metrics.conversions"));
    a.allConversions += n(pick(r, "metrics.allConversions"));
    agg.set(term, a);
  }
  const out = [...agg.values()].sort((a, b) => b.cost - a.cost).slice(0, limit);
  if (out.length) cacheSet(key, out, 10 * MINUTE);
  return out;
}

export type ConvTerm = { searchTerm: string; keyword: string; matchType: string; campaign: string; campaignId: string; adGroup: string; adGroupId: string; date: string; clicks: number; impressions: number; cost: number; conversions: number; conversionsValue: number; allConversions: number };

export async function getConvertingSearchTerms(customerId: string, days = 30, campaignId?: string, allTime = false): Promise<ConvTerm[] | null> {
  const key = `gads:convst:${customerId}:${allTime ? "all" : days}:${campaignId ?? ""}`;
  const c = cacheGet<ConvTerm[]>(key);
  if (c) return c;
  const rows = await search(customerId, `SELECT search_term_view.search_term, campaign.id, campaign.name, ad_group.id, ad_group.name, segments.keyword.info.text, segments.keyword.info.match_type, segments.date, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM search_term_view WHERE ${allTime ? `segments.date BETWEEN '2018-01-01' AND '${today()}'` : `segments.date DURING LAST_${days}_DAYS`} AND metrics.conversions > 0${campaignId ? ` AND campaign.id = ${digits(campaignId)}` : ""} ORDER BY metrics.conversions DESC`);
  if (!rows) return null;
  const out = rows
    .map((r) => ({
      searchTerm: s(pick(r, "searchTermView.searchTerm")).trim().toLowerCase(),
      keyword: s(pick(r, "segments.keyword.info.text")),
      matchType: s(pick(r, "segments.keyword.info.matchType")),
      campaign: s(pick(r, "campaign.name")),
      campaignId: s(pick(r, "campaign.id")),
      adGroup: s(pick(r, "adGroup.name")),
      adGroupId: s(pick(r, "adGroup.id")),
      date: s(pick(r, "segments.date")),
      clicks: n(pick(r, "metrics.clicks")),
      impressions: n(pick(r, "metrics.impressions")),
      cost: micros(pick(r, "metrics.costMicros")),
      conversions: n(pick(r, "metrics.conversions")),
      conversionsValue: n(pick(r, "metrics.conversionsValue")),
      allConversions: n(pick(r, "metrics.allConversions")),
    }))
    .filter((x) => x.searchTerm);
  if (out.length) cacheSet(key, out, 10 * MINUTE);
  return out;
}

export type KeywordStat = { criterionId: string; adGroupCriterionId: string; adGroupId: string; campaignId: string; keyword: string; matchType: string; status: string; adGroupStatus: string; campaignStatus: string; effectiveStatus: string; qualityScore: number; campaign: string; adGroup: string; cpcBidMax: number; cpcBidSource: string; effectiveCpcBid: number; avgCpc: number; clicks: number; impressions: number; cost: number; conversions: number; allConversions: number };

export async function getKeywordStats(customerId: string, days = 30, campaignId?: string, adGroupId?: string, allTime = false, from?: string, to?: string): Promise<KeywordStat[] | null> {
  const key = `gads:kw:${customerId}:${allTime ? "all" : from && to ? `${from}_${to}` : days}:${campaignId ?? ""}:${adGroupId ?? ""}`;
  const c = cacheGet<KeywordStat[]>(key);
  if (c) return c;
  let extra = "";
  if (campaignId) extra += ` AND campaign.id = ${digits(campaignId)}`;
  if (adGroupId) extra += ` AND ad_group.id = ${digits(adGroupId)}`;
  const rows = await search(customerId, `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.cpc_bid_micros, ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.quality_info.quality_score, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros, campaign.id, campaign.name, campaign.status, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.all_conversions, metrics.ctr, metrics.average_cpc FROM keyword_view WHERE ${dateClause(days, allTime, from, to)} AND ad_group_criterion.status != 'REMOVED'${extra}`);
  if (!rows) return null;
  const agg = new Map<string, KeywordStat>();
  for (const r of rows) {
    const critId = s(pick(r, "adGroupCriterion.criterionId"));
    const agId = s(pick(r, "adGroup.id"));
    const key2 = `${agId}~${critId}`;
    if (!agg.has(key2)) {
      const kwStatus = s(pick(r, "adGroupCriterion.status"));
      const agStatus = s(pick(r, "adGroup.status"));
      const cmStatus = s(pick(r, "campaign.status"));
      const kwCpc = n(pick(r, "adGroupCriterion.cpcBidMicros"));
      const agCpc = n(pick(r, "adGroup.cpcBidMicros"));
      const bid = kwCpc > 0 ? kwCpc : agCpc;
      agg.set(key2, {
        criterionId: critId,
        adGroupCriterionId: key2,
        adGroupId: agId,
        campaignId: s(pick(r, "campaign.id")),
        keyword: s(pick(r, "adGroupCriterion.keyword.text")),
        matchType: s(pick(r, "adGroupCriterion.keyword.matchType")),
        status: kwStatus,
        adGroupStatus: agStatus,
        campaignStatus: cmStatus,
        effectiveStatus: kwStatus === "ENABLED" && agStatus === "ENABLED" && cmStatus === "ENABLED" ? "ENABLED" : "INACTIVE",
        qualityScore: n(pick(r, "adGroupCriterion.qualityInfo.qualityScore")),
        campaign: s(pick(r, "campaign.name")),
        adGroup: s(pick(r, "adGroup.name")),
        cpcBidMax: bid / 1_000_000,
        cpcBidSource: kwCpc > 0 ? "keyword" : agCpc > 0 ? "ad_group" : "default",
        effectiveCpcBid: micros(pick(r, "adGroupCriterion.effectiveCpcBidMicros")),
        avgCpc: 0,
        clicks: 0,
        impressions: 0,
        cost: 0,
        conversions: 0,
        allConversions: 0,
      });
    }
    const a = agg.get(key2)!;
    a.clicks += n(pick(r, "metrics.clicks"));
    a.impressions += n(pick(r, "metrics.impressions"));
    a.cost += micros(pick(r, "metrics.costMicros"));
    a.conversions += n(pick(r, "metrics.conversions"));
    a.allConversions += n(pick(r, "metrics.allConversions"));
    const avg = micros(pick(r, "metrics.averageCpc"));
    if (avg > 0) a.avgCpc = avg;
  }
  const out = [...agg.values()].sort((a, b) => b.cost - a.cost);
  if (out.length) cacheSet(key, out, 10 * MINUTE);
  return out;
}


// ---------- Letture per le dashboard ----------

export async function listAdGroupsForCampaign(customerId: string, campaignId?: string, days = 30) {
  let where = `segments.date BETWEEN '${daysAgo(days)}' AND '${today()}' AND ad_group.status != 'REMOVED'`;
  if (campaignId) where += ` AND campaign.id = ${digits(campaignId)}`;
  const rows = await search(customerId, `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM ad_group WHERE ${where} ORDER BY metrics.cost_micros DESC`);
  return (rows ?? []).map((r) => {
    const cost = micros(pick(r, "metrics.costMicros"));
    const conv = n(pick(r, "metrics.conversions"));
    return { id: s(pick(r, "adGroup.id")), name: s(pick(r, "adGroup.name")), status: s(pick(r, "adGroup.status")), cpcBid: micros(pick(r, "adGroup.cpcBidMicros")), campaignId: s(pick(r, "campaign.id")), campaignName: s(pick(r, "campaign.name")), impressions: n(pick(r, "metrics.impressions")), clicks: n(pick(r, "metrics.clicks")), cost, conversions: conv, ctr: Math.round(n(pick(r, "metrics.ctr")) * 10000) / 100, cpa: conv > 0 ? Math.round((cost / conv) * 100) / 100 : null };
  });
}

export async function listAdsForAdGroup(customerId: string, adGroupId?: string, days = 30) {
  let where = `segments.date BETWEEN '${daysAgo(days)}' AND '${today()}' AND ad_group_ad.status != 'REMOVED'`;
  if (adGroupId) where += ` AND ad_group.id = ${digits(adGroupId)}`;
  const rows = await search(customerId, `SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2, ad_group_ad.ad.final_urls, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM ad_group_ad WHERE ${where} ORDER BY metrics.impressions DESC`);
  return (rows ?? []).map((r) => ({
    id: s(pick(r, "adGroupAd.ad.id")),
    type: s(pick(r, "adGroupAd.ad.type")),
    status: s(pick(r, "adGroupAd.status")),
    headlines: ((pick(r, "adGroupAd.ad.responsiveSearchAd.headlines") as Row[] | undefined) ?? []).map((h) => s(h.text)),
    descriptions: ((pick(r, "adGroupAd.ad.responsiveSearchAd.descriptions") as Row[] | undefined) ?? []).map((d) => s(d.text)),
    path1: s(pick(r, "adGroupAd.ad.responsiveSearchAd.path1")),
    path2: s(pick(r, "adGroupAd.ad.responsiveSearchAd.path2")),
    finalUrls: (pick(r, "adGroupAd.ad.finalUrls") as string[] | undefined) ?? [],
    adGroupId: s(pick(r, "adGroup.id")),
    adGroupName: s(pick(r, "adGroup.name")),
    impressions: n(pick(r, "metrics.impressions")),
    clicks: n(pick(r, "metrics.clicks")),
    cost: micros(pick(r, "metrics.costMicros")),
    conversions: n(pick(r, "metrics.conversions")),
    ctr: Math.round(n(pick(r, "metrics.ctr")) * 10000) / 100,
  }));
}

export async function listNegativeKeywords(customerId: string, level: "campaign" | "ad_group" = "campaign", scopeId?: string) {
  if (level === "campaign") {
    let where = "campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'";
    if (scopeId) where += ` AND campaign.id = ${digits(scopeId)}`;
    const rows = await search(customerId, `SELECT campaign.id, campaign.name, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE ${where}`);
    return (rows ?? []).map((r) => ({ criterionId: s(pick(r, "campaignCriterion.criterionId")), text: s(pick(r, "campaignCriterion.keyword.text")), matchType: s(pick(r, "campaignCriterion.keyword.matchType")), scopeId: s(pick(r, "campaign.id")), scopeName: s(pick(r, "campaign.name")) }));
  }
  let where = "ad_group_criterion.negative = TRUE AND ad_group_criterion.type = 'KEYWORD'";
  if (scopeId) where += ` AND ad_group.id = ${digits(scopeId)}`;
  const rows = await search(customerId, `SELECT ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ${where}`);
  return (rows ?? []).map((r) => ({ criterionId: s(pick(r, "adGroupCriterion.criterionId")), text: s(pick(r, "adGroupCriterion.keyword.text")), matchType: s(pick(r, "adGroupCriterion.keyword.matchType")), scopeId: s(pick(r, "adGroup.id")), scopeName: s(pick(r, "adGroup.name")) }));
}

const geoCache = new Map<string, { name: string; canonical: string; countryCode: string; targetType: string }>();

export async function resolveGeoTargetNames(customerId: string, resourceNames: string[]) {
  const out = new Map<string, { name: string; canonical: string; countryCode: string; targetType: string }>();
  const toFetch: string[] = [];
  for (const rn of resourceNames) {
    const c = geoCache.get(rn);
    if (c) out.set(rn, c);
    else toFetch.push(rn);
  }
  if (toFetch.length) {
    const ids = toFetch.map((r) => `'${gaqlEscape(r.replace("geoTargetConstants/", ""))}'`).join(",");
    const rows = await search(customerId, `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.resource_name FROM geo_target_constant WHERE geo_target_constant.id IN (${ids})`);
    for (const r of rows ?? []) {
      const rn = s(pick(r, "geoTargetConstant.resourceName"));
      if (!rn) continue;
      const info = { name: s(pick(r, "geoTargetConstant.name")), canonical: s(pick(r, "geoTargetConstant.canonicalName")), countryCode: s(pick(r, "geoTargetConstant.countryCode")), targetType: s(pick(r, "geoTargetConstant.targetType")) };
      out.set(rn, info);
      geoCache.set(rn, info);
    }
  }
  return out;
}

export async function listCampaignLocations(customerId: string, campaignId?: string) {
  let where = "campaign_criterion.type = 'LOCATION' AND campaign.status != 'REMOVED'";
  if (campaignId) where += ` AND campaign.id = ${digits(campaignId)}`;
  const rows = await search(customerId, `SELECT campaign.id, campaign.name, campaign.status, campaign_criterion.criterion_id, campaign_criterion.location.geo_target_constant, campaign_criterion.bid_modifier, campaign_criterion.negative, campaign_criterion.status FROM campaign_criterion WHERE ${where}`);
  if (!rows) return [];
  type Loc = { criterionId: string; geoTargetConstant: string; geoTargetId: string; bidModifier: number; negative: boolean; status: string; name?: string; countryCode?: string; targetType?: string; canonical?: string };
  const byCampaign = new Map<string, { campaignId: string; campaignName: string; campaignStatus: string; locations: Loc[] }>();
  const geo = new Set<string>();
  for (const r of rows) {
    const rn = s(pick(r, "campaignCriterion.location.geoTargetConstant"));
    if (!rn) continue;
    geo.add(rn);
    const id = s(pick(r, "campaign.id"));
    const c = byCampaign.get(id) ?? { campaignId: id, campaignName: s(pick(r, "campaign.name")), campaignStatus: s(pick(r, "campaign.status")), locations: [] };
    c.locations.push({ criterionId: s(pick(r, "campaignCriterion.criterionId")), geoTargetConstant: rn, geoTargetId: rn.replace("geoTargetConstants/", ""), bidModifier: n(pick(r, "campaignCriterion.bidModifier")) || 1, negative: Boolean(pick(r, "campaignCriterion.negative")), status: s(pick(r, "campaignCriterion.status"), "ENABLED") });
    byCampaign.set(id, c);
  }
  const names = await resolveGeoTargetNames(customerId, [...geo]);
  for (const c of byCampaign.values()) for (const l of c.locations) Object.assign(l, names.get(l.geoTargetConstant) ?? {});
  return [...byCampaign.values()];
}

export async function listConversionActions(customerId: string, days = 30) {
  let rows = await search(customerId, `SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category, conversion_action.primary_for_goal, conversion_action.click_through_lookback_window_days, conversion_action.value_settings.default_value, conversion_action.attribution_model_settings.attribution_model, metrics.all_conversions, metrics.conversions, metrics.cost_per_conversion FROM conversion_action WHERE conversion_action.status = 'ENABLED' AND segments.date BETWEEN '${daysAgo(days)}' AND '${today()}'`);
  if (!rows) {
    rows = await search(customerId, "SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category, conversion_action.primary_for_goal, conversion_action.click_through_lookback_window_days, conversion_action.value_settings.default_value FROM conversion_action WHERE conversion_action.status != 'REMOVED'");
  }
  return (rows ?? []).map((r) => ({ id: s(pick(r, "conversionAction.id")), name: s(pick(r, "conversionAction.name")), status: s(pick(r, "conversionAction.status")), type: s(pick(r, "conversionAction.type")), category: s(pick(r, "conversionAction.category")), primaryForGoal: Boolean(pick(r, "conversionAction.primaryForGoal")), lookbackDays: n(pick(r, "conversionAction.clickThroughLookbackWindowDays")), defaultValue: n(pick(r, "conversionAction.valueSettings.defaultValue")), allConversions: n(pick(r, "metrics.allConversions")), conversions: n(pick(r, "metrics.conversions")), costPerConversion: micros(pick(r, "metrics.costPerConversion")) }));
}

export async function getDailyMetrics(customerId: string, days = 30, campaignId?: string) {
  let where = `segments.date BETWEEN '${daysAgo(days)}' AND '${today()}'`;
  if (campaignId) where += ` AND campaign.id = ${digits(campaignId)}`;
  const rows = await search(customerId, `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM ${campaignId ? "campaign" : "customer"} WHERE ${where} ORDER BY segments.date`);
  return (rows ?? []).map((r) => ({ date: s(pick(r, "segments.date")), impressions: n(pick(r, "metrics.impressions")), clicks: n(pick(r, "metrics.clicks")), cost: micros(pick(r, "metrics.costMicros")), conversions: n(pick(r, "metrics.conversions")) }));
}
