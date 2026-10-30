// Coda upload conversioni offline (gclid → Google Ads) e arricchimento del
// lead da click_view / search_term_view. Stesse regole del plugin:
// order_id univoco per la deduplica, max 5 tentativi, Enhanced Conversions
// con email/telefono/nome hashati.

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { debug } from "@/lib/debug";
import { settings } from "@/lib/settings";
import { formatConversionDateTime, isConnected, uploadClickConversion } from "./google-ads";
import { enrichFromClickView, findSearchTermForConversion } from "./google-ads-reports";

export const MAX_ATTEMPTS = 5;

/** Al submit: una riga per ogni conversione del form con upload API attivo. */
export async function enqueueUploads(tx: Prisma.TransactionClient, leadId: string, formId: string, gclid: string, fallbackValue?: number | null) {
  const convs = await tx.formConversion.findMany({ where: { formId, enabled: true, apiUpload: true, NOT: [{ customerId: null }, { conversionActionId: null }] } });
  for (const c of convs) {
    if (!c.customerId || !c.conversionActionId) continue;
    await tx.conversionUpload.create({ data: { leadId, customerId: c.customerId, conversionActionId: c.conversionActionId, gclid, value: c.value ?? fallbackValue ?? null, currency: c.currency } });
  }
  return convs.length;
}

export type UploadSummary = { processed: number; sent: number; failed: number; skipped: number };

/** Processa la coda: pending o failed con tentativi rimasti. */
export async function processUploads(opts: { limit?: number; leadId?: string } = {}): Promise<UploadSummary> {
  const out: UploadSummary = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  if (!(await isConnected())) {
    out.skipped = await db.conversionUpload.count({ where: { status: { in: ["pending", "failed"] }, ...(opts.leadId ? { leadId: opts.leadId } : {}) } });
    return out;
  }
  const rows = await db.conversionUpload.findMany({
    where: { status: { in: ["pending", "failed"] }, attempts: { lt: MAX_ATTEMPTS }, gclid: { not: null }, ...(opts.leadId ? { leadId: opts.leadId } : {}) },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(opts.limit ?? 20, 50)),
    include: { lead: true },
  });
  for (const u of rows) {
    out.processed++;
    if (!u.customerId) {
      await db.conversionUpload.update({ where: { id: u.id }, data: { status: "failed", attempts: { increment: 1 }, lastError: "customerId mancante" } });
      out.failed++;
      continue;
    }
    const [firstName, ...rest] = (u.lead.name ?? "").trim().split(/\s+/);
    const r = await uploadClickConversion({
      customerId: u.customerId,
      conversionActionId: u.conversionActionId,
      gclid: u.gclid!,
      conversionDatetime: formatConversionDateTime(u.lead.createdAt),
      value: u.value ?? u.lead.value ?? 0,
      currency: u.currency,
      email: u.lead.email,
      phone: u.lead.phone,
      firstName: firstName || null,
      lastName: rest.join(" ") || null,
      orderId: `ma-${u.leadId}`,
    });
    if (r.success) {
      await db.conversionUpload.update({ where: { id: u.id }, data: { status: "sent", attempts: { increment: 1 }, lastError: null, sentAt: new Date() } });
      void debug.info("gads_conv_upload", `uploaded lead ${u.leadId}`, { customerId: u.customerId, action: u.conversionActionId });
      out.sent++;
    } else {
      await db.conversionUpload.update({ where: { id: u.id }, data: { status: "failed", attempts: { increment: 1 }, lastError: (r.error ?? "errore").slice(0, 500) } });
      void debug.error("gads_conv_upload", `fail lead ${u.leadId}`, { err: r.error });
      out.failed++;
    }
  }
  return out;
}

/** Arricchisce il lead con campagna/gruppo/rete/device e search term. */
export async function enrichLead(leadId: string): Promise<{ ok: boolean; message: string }> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { submission: { select: { visitId: true } }, form: { include: { conversions: { where: { enabled: true } } } } } });
  if (!lead) return { ok: false, message: "Lead non trovato" };
  if (!lead.gclid) return { ok: false, message: "Il lead non ha gclid" };
  if (!(await isConnected())) return { ok: false, message: "Google Ads non collegato" };
  const g = await settings.gads();
  const customerId = lead.form?.conversions.find((c) => c.customerId)?.customerId || g.defaultCustomerId;
  if (!customerId) return { ok: false, message: "Nessun account Google Ads di default" };

  const day = lead.createdAt.toISOString().slice(0, 10);
  const click = await enrichFromClickView(customerId, lead.gclid, day);
  if (!click) return { ok: false, message: "Click non trovato in click_view (ritardo 4-12h, o gclid di un altro account)" };
  const term = click.adGroupId ? await findSearchTermForConversion(customerId, click.adGroupId, click.date) : null;
  const meta = { ...click, ...(term ?? {}), customerId, enrichedAt: new Date().toISOString() };
  await db.lead.update({ where: { id: lead.id }, data: { adsMeta: meta as Prisma.InputJsonValue, adsEnrichedAt: new Date(), ...(term?.searchTerm && !lead.utmTerm ? { utmTerm: term.searchTerm } : {}) } });
  if (lead.submission?.visitId && term?.searchTerm) await db.visit.update({ where: { id: lead.submission.visitId }, data: { searchTerm: term.searchTerm } });
  return { ok: true, message: `Campagna ${click.campaignName || click.campaignId}${term ? `, termine "${term.searchTerm}" (${term.confidence})` : ""}` };
}
