"use server";

// Server action per Google Ads / GTM / debug. Ogni mutazione finisce in
// Cronologia (ChangelogEntry) con l'esito.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { clearCache, disconnect, testConnection, type MutateResult } from "@/modules/ads/google-ads";
import { addCampaignLocation, addKeyword, addNegativeKeyword, changeKeywordMatchType, enableKeyword, pauseKeyword, removeCampaignLocation, updateCampaignStatus, updateKeywordBid } from "@/modules/ads/google-ads-mutations";
import { bulkApplyTrackingTemplate } from "@/modules/ads/google-ads-reports";
import { clearGtmCache } from "@/modules/ads/gtm";
import { enrichLead, processUploads } from "@/modules/ads/uploads";

async function guard() {
  if (!(await isAdmin())) throw new Error("Non autorizzato");
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function log(action: string, subject: string, diff?: unknown) {
  await db.changelogEntry.create({ data: { area: "ads", action, subject, diff: diff as Prisma.InputJsonValue | undefined, actor: "admin" } });
}

function back(fd: FormData, msg: string) {
  const to = str(fd, "back") || "/admin/ads/";
  redirect(`${to}${to.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}

async function outcome(fd: FormData, action: string, subject: string, r: MutateResult) {
  await log(action, subject, "error" in r ? { error: r.error } : { ok: true });
  back(fd, "error" in r ? `Errore: ${r.error}` : `${action}: fatto`);
}

// ---------- Credenziali e connessione ----------

export async function saveGads(fd: FormData) {
  await guard();
  const prev = await settings.gads();
  await settings.patchGads({
    developerToken: str(fd, "developerToken") || prev.developerToken,
    clientId: str(fd, "clientId"),
    clientSecret: str(fd, "clientSecret") || prev.clientSecret,
    loginCustomerId: str(fd, "loginCustomerId").replace(/\D+/g, ""),
    defaultCustomerId: str(fd, "defaultCustomerId").replace(/\D+/g, ""),
  });
  await db.changelogEntry.create({ data: { area: "settings", action: "gads_credentials", actor: "admin" } });
  revalidatePath("/admin/impostazioni/");
}

export async function gadsDisconnect() {
  await guard();
  await disconnect();
  await db.changelogEntry.create({ data: { area: "settings", action: "gads_disconnect", actor: "admin" } });
  revalidatePath("/admin/impostazioni/");
}

export async function gadsTest() {
  await guard();
  const r = await testConnection();
  redirect(`/admin/impostazioni/?gads=${r.success ? `test-ok-${r.customers.length}` : `test-err-${encodeURIComponent((r.error ?? "").slice(0, 120))}`}`);
}

export async function setDefaultCustomer(fd: FormData) {
  await guard();
  await settings.patchGads({ defaultCustomerId: str(fd, "customerId").replace(/\D+/g, "") });
  revalidatePath("/admin/impostazioni/");
  revalidatePath("/admin/ads/");
}

export async function clearGadsCache() {
  await guard();
  clearCache();
  clearGtmCache();
  await settings.patchGads({ lastError: "" });
  revalidatePath("/admin/ads/");
  revalidatePath("/admin/keywords/");
}

// ---------- Upload e arricchimento ----------

export async function retryUploads(fd: FormData) {
  await guard();
  const leadId = str(fd, "leadId") || undefined;
  const r = await processUploads({ limit: 50, leadId });
  await log("retry_uploads", leadId ?? "tutti", r);
  back(fd, `Upload: ${r.sent} inviati, ${r.failed} falliti, ${r.skipped} in attesa`);
}

export async function enrichLeadAction(fd: FormData) {
  await guard();
  const leadId = str(fd, "leadId");
  const r = await enrichLead(leadId);
  await log("enrich_lead", leadId, r);
  revalidatePath(`/admin/lead/${leadId}/`);
  back(fd, r.message);
}

// ---------- Campagne, keyword, località ----------

export async function applyTrackingTemplate(fd: FormData) {
  await guard();
  const r = await bulkApplyTrackingTemplate(str(fd, "customerId"), undefined, fd.get("force") === "on");
  await log("tracking_template", str(fd, "customerId"), { applied: r.applied.length, skipped: r.skipped.length, errors: r.errors.length });
  back(fd, "error" in r && r.error ? `Errore: ${r.error}` : `Template: ${r.applied.length} applicati, ${r.skipped.length} già presenti, ${r.errors.length} errori`);
}

export async function campaignStatusAction(fd: FormData) {
  await guard();
  const r = await updateCampaignStatus(str(fd, "customerId"), str(fd, "campaignId"), str(fd, "status"));
  await outcome(fd, `campagna ${str(fd, "status").toLowerCase()}`, str(fd, "campaignId"), r);
}

export async function keywordStatusAction(fd: FormData) {
  await guard();
  const id = str(fd, "adGroupCriterionId");
  const r = str(fd, "status") === "ENABLED" ? await enableKeyword(str(fd, "customerId"), id) : await pauseKeyword(str(fd, "customerId"), id);
  await outcome(fd, `keyword ${str(fd, "status").toLowerCase()}`, id, r);
}

export async function keywordBidAction(fd: FormData) {
  await guard();
  const eur = Number(str(fd, "bid").replace(",", "."));
  if (!eur || eur <= 0) back(fd, "Offerta non valida");
  const r = await updateKeywordBid(str(fd, "customerId"), str(fd, "adGroupCriterionId"), eur * 1_000_000);
  await outcome(fd, `bid ${eur} €`, str(fd, "adGroupCriterionId"), r);
}

export async function addNegativeAction(fd: FormData) {
  await guard();
  const level = str(fd, "level") === "ad_group" ? "ad_group" : "campaign";
  const r = await addNegativeKeyword(str(fd, "customerId"), level, str(fd, "scopeId"), str(fd, "text"), str(fd, "matchType") || "PHRASE");
  await outcome(fd, `negativa "${str(fd, "text")}"`, `${level} ${str(fd, "scopeId")}`, r);
}

export async function addKeywordAction(fd: FormData) {
  await guard();
  const bid = str(fd, "bid") ? Number(str(fd, "bid").replace(",", ".")) * 1_000_000 : null;
  const r = await addKeyword(str(fd, "customerId"), str(fd, "adGroupId"), str(fd, "text"), str(fd, "matchType") || "PHRASE", bid);
  await outcome(fd, `keyword "${str(fd, "text")}"`, `gruppo ${str(fd, "adGroupId")}`, r);
}

export async function changeMatchAction(fd: FormData) {
  await guard();
  const r = await changeKeywordMatchType(str(fd, "customerId"), str(fd, "adGroupId"), str(fd, "criterionId"), str(fd, "text"), str(fd, "matchType"));
  await outcome(fd, `match type → ${str(fd, "matchType")}`, str(fd, "text"), r);
}

export async function addLocationAction(fd: FormData) {
  await guard();
  const r = await addCampaignLocation(str(fd, "customerId"), str(fd, "campaignId"), str(fd, "geoTargetId"), Number(str(fd, "bidModifier") || 1), fd.get("negative") === "on");
  await outcome(fd, "località aggiunta", `${str(fd, "campaignId")} geo ${str(fd, "geoTargetId")}`, r);
}

export async function removeLocationAction(fd: FormData) {
  await guard();
  const r = await removeCampaignLocation(str(fd, "customerId"), str(fd, "campaignId"), str(fd, "criterionId"));
  await outcome(fd, "località rimossa", `${str(fd, "campaignId")} ${str(fd, "criterionId")}`, r);
}

// ---------- Debug ----------

export async function clearDebugLog() {
  await guard();
  await db.debugLog.deleteMany({});
  revalidatePath("/admin/debug/");
}

// ---------- Visite: backfill e verifica template ----------

/** Arricchisce tutti i lead con gclid non ancora arricchiti (max 30 a chiamata). */
export async function backfillSearchTerms(fd: FormData) {
  await guard();
  const leads = await db.lead.findMany({ where: { gclid: { not: null }, adsEnrichedAt: null }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true } });
  let ok = 0;
  for (const l of leads) {
    const r = await enrichLead(l.id);
    if (r.ok) ok++;
  }
  await log("backfill_search_terms", `${leads.length} lead`, { ok });
  back(fd, `Backfill: ${ok}/${leads.length} lead arricchiti`);
}

/** Campagne attive senza tracking template (senza template mancano utm/keyword/device). */
export async function checkTrackingTemplate(fd: FormData) {
  await guard();
  const customerId = str(fd, "customerId");
  const { search } = await import("@/modules/ads/google-ads");
  const rows = await search(customerId, "SELECT campaign.id, campaign.name, campaign.tracking_url_template FROM campaign WHERE campaign.status = 'ENABLED'");
  if (!rows) back(fd, "Lettura campagne fallita");
  const missing = rows!.filter((r) => !((r.campaign as Record<string, unknown> | undefined)?.trackingUrlTemplate)).map((r) => String((r.campaign as Record<string, unknown>).name));
  back(fd, missing.length ? `Senza template: ${missing.join(", ")}` : "Tutte le campagne attive hanno il tracking template");
}
