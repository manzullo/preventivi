// Google Ads: mutazioni (port di PSF_Google_Ads_API, parte 3). Usate dai
// pannelli admin e dai tool dell'assistente dopo conferma dell'utente.

import { digits, gaqlEscape, mutate, n, pick, s, search, type MutateResult, type Row } from "./google-ads";

const matchType = (m: string) => (["BROAD", "PHRASE", "EXACT"].includes(m.toUpperCase()) ? m.toUpperCase() : "PHRASE");

export async function addNegativeKeyword(customerId: string, level: "campaign" | "ad_group", scopeId: string, text: string, match = "PHRASE"): Promise<MutateResult> {
  const cid = digits(customerId);
  const sid = digits(scopeId);
  const t = text.trim();
  if (!cid || !sid || !t) return { error: "Parametri mancanti" };
  if (level === "campaign") {
    return mutate(cid, "campaignCriteria:mutate", { operations: [{ create: { campaign: `customers/${cid}/campaigns/${sid}`, negative: true, keyword: { text: t, matchType: matchType(match) } } }] });
  }
  return mutate(cid, "adGroupCriteria:mutate", { operations: [{ create: { adGroup: `customers/${cid}/adGroups/${sid}`, status: "ENABLED", negative: true, keyword: { text: t, matchType: matchType(match) } } }] });
}

function criterionStatus(customerId: string, adGroupCriterionId: string, status: "PAUSED" | "ENABLED") {
  const cid = digits(customerId);
  if (!cid || !adGroupCriterionId) return Promise.resolve<MutateResult>({ error: "Parametri mancanti" });
  return mutate(cid, "adGroupCriteria:mutate", { operations: [{ update: { resourceName: `customers/${cid}/adGroupCriteria/${adGroupCriterionId}`, status }, updateMask: "status" }] });
}
export const pauseKeyword = (c: string, id: string) => criterionStatus(c, id, "PAUSED");
export const enableKeyword = (c: string, id: string) => criterionStatus(c, id, "ENABLED");

export async function addKeyword(customerId: string, adGroupId: string, text: string, match = "PHRASE", bidMicros?: number | null): Promise<MutateResult> {
  const cid = digits(customerId);
  const crit: Row = { adGroup: `customers/${cid}/adGroups/${digits(adGroupId)}`, status: "ENABLED", keyword: { text: text.trim(), matchType: matchType(match) } };
  if (bidMicros !== undefined && bidMicros !== null) crit.cpcBidMicros = Math.round(bidMicros);
  return mutate(cid, "adGroupCriteria:mutate", { operations: [{ create: crit }] });
}

/** Il match type non si modifica: si crea la nuova keyword e si pausa la vecchia. */
export async function changeKeywordMatchType(customerId: string, adGroupId: string, oldCriterionId: string, text: string, newMatch: string, bidMicros?: number | null) {
  const nm = newMatch.toUpperCase();
  if (!["BROAD", "PHRASE", "EXACT"].includes(nm)) return { error: "Match type non valido" } as MutateResult;
  const created = await addKeyword(customerId, adGroupId, text, nm, bidMicros);
  if ("error" in created) return { error: `Errore creazione nuova keyword: ${created.error}` } as MutateResult;
  const paused = await pauseKeyword(customerId, `${digits(adGroupId)}~${digits(oldCriterionId)}`);
  return { success: true, response: { created, paused, message: `Creata nuova keyword '${text}' come ${nm}, vecchia pausata.` } } as MutateResult;
}

export async function updateKeywordBid(customerId: string, adGroupCriterionId: string, bidMicros: number): Promise<MutateResult> {
  const cid = digits(customerId);
  return mutate(cid, "adGroupCriteria:mutate", { operations: [{ update: { resourceName: `customers/${cid}/adGroupCriteria/${adGroupCriterionId}`, cpcBidMicros: Math.round(bidMicros) }, updateMask: "cpc_bid_micros" }] });
}

export async function addCampaignLocation(customerId: string, campaignId: string, geoTargetId: string, bidModifier = 1, negative = false): Promise<MutateResult> {
  const cid = digits(customerId);
  const criterion: Row = { campaign: `customers/${cid}/campaigns/${digits(campaignId)}`, location: { geoTargetConstant: `geoTargetConstants/${digits(geoTargetId)}` } };
  if (negative) criterion.negative = true;
  else if (Math.abs(bidModifier - 1) > 0.001) criterion.bidModifier = bidModifier;
  return mutate(cid, "campaignCriteria:mutate", { operations: [{ create: criterion }] });
}

export async function removeCampaignLocation(customerId: string, campaignId: string, criterionId: string): Promise<MutateResult> {
  const cid = digits(customerId);
  return mutate(cid, "campaignCriteria:mutate", { operations: [{ remove: `customers/${cid}/campaignCriteria/${digits(campaignId)}~${digits(criterionId)}` }] });
}

export async function updateCampaignLocationBid(customerId: string, campaignId: string, criterionId: string, bidModifier: number): Promise<MutateResult> {
  const cid = digits(customerId);
  return mutate(cid, "campaignCriteria:mutate", { operations: [{ update: { resourceName: `customers/${cid}/campaignCriteria/${digits(campaignId)}~${digits(criterionId)}`, bidModifier }, updateMask: "bid_modifier" }] });
}

export async function suggestGeoTargets(customerId: string, text: string, countryCode = "IT", limit = 20) {
  const q = gaqlEscape(text);
  const rows = await search(customerId, `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.status FROM geo_target_constant WHERE geo_target_constant.country_code = '${gaqlEscape(countryCode)}' AND geo_target_constant.status = 'ENABLED' AND (geo_target_constant.name LIKE '%${q}%' OR geo_target_constant.canonical_name LIKE '%${q}%') LIMIT ${Math.max(1, Math.min(limit, 50))}`);
  return (rows ?? []).map((r) => ({ id: s(pick(r, "geoTargetConstant.id")), name: s(pick(r, "geoTargetConstant.name")), canonical: s(pick(r, "geoTargetConstant.canonicalName")), countryCode: s(pick(r, "geoTargetConstant.countryCode")), targetType: s(pick(r, "geoTargetConstant.targetType")) }));
}

export async function updateCampaignStatus(customerId: string, campaignId: string, status: string): Promise<MutateResult> {
  const st = status.toUpperCase();
  if (!["ENABLED", "PAUSED", "REMOVED"].includes(st)) return { error: "Status invalido" };
  const cid = digits(customerId);
  return mutate(cid, "campaigns:mutate", { operations: [{ update: { resourceName: `customers/${cid}/campaigns/${digits(campaignId)}`, status: st }, updateMask: "status" }] });
}

