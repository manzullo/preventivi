// Import dei record: deduplica per (source, sourceRef), poi dominio, poi
// nome+città. Le recensioni entrano solo con fonte e riferimento.

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { normalizeDomain, resolveCity, uniqueAgencySlug } from "./normalize";
import type { IngestRecord, IngestStats } from "./types";

export async function findExisting(r: IngestRecord, domain?: string, cityId?: string) {
  const sel = { id: true, optedOutAt: true } as const;
  const bySource = await db.agency.findUnique({ where: { source_sourceRef: { source: r.source, sourceRef: r.sourceRef } }, select: sel });
  if (bySource) return { ...bySource, via: "sourceRef" as const };
  if (domain) {
    const byDomain = await db.agency.findFirst({ where: { domain }, select: sel });
    if (byDomain) return { ...byDomain, via: "domain" as const };
  }
  if (cityId) {
    const byName = await db.agency.findFirst({ where: { cityId, name: { equals: r.name.trim(), mode: "insensitive" } }, select: sel });
    if (byName) return { ...byName, via: "name" as const };
  }
  return null;
}

export async function importRecords(records: IngestRecord[], opts: { dryRun?: boolean; publish?: boolean; log?: (line: string) => void } = {}): Promise<IngestStats> {
  const log = opts.log ?? (() => undefined);
  const stats: IngestStats = { total: records.length, created: 0, updated: 0, skipped: 0, reviews: 0, unresolvedCity: 0 };
  const services = new Map((await db.service.findMany({ select: { id: true, slug: true } })).map((s) => [s.slug, s.id]));

  for (const r of records) {
    if (!r.name?.trim() || !r.sourceRef) {
      stats.skipped++;
      continue;
    }
    const domain = normalizeDomain(r.website);
    const city = await resolveCity(r.cityName);
    if (!city) stats.unresolvedCity++;
    const existing = await findExisting(r, domain, city?.id);
    // Chi ha chiesto la rimozione non rientra da nessuna fonte.
    if (existing?.optedOutAt) {
      log(`salta (rimozione chiesta): ${r.name}`);
      stats.skipped++;
      continue;
    }
    const serviceIds = r.serviceSlugs.map((s) => services.get(s)).filter((x): x is string => Boolean(x));
    const data = {
      name: r.name.trim(),
      website: r.website,
      domain,
      phone: r.phone,
      email: r.email,
      street: r.street,
      postalCode: r.postalCode,
      lat: r.lat,
      lng: r.lng,
      description: r.description,
      sourceDescription: r.sourceDescription,
      cityId: city?.id,
      source: r.source,
      sourceRef: r.sourceRef,
      sourceUrl: r.sourceUrl,
    };
    log(`${existing ? `aggiorna (${existing.via})` : "crea"}: ${r.name} · ${city?.slug ?? "città?"} · ${domain ?? "-"} · ${r.reviews?.length ?? 0} recensioni`);
    if (opts.dryRun) {
      existing ? stats.updated++ : stats.created++;
      stats.reviews += r.reviews?.length ?? 0;
      continue;
    }
    const agency = existing
      ? await db.agency.update({ where: { id: existing.id }, data: { ...data, sourceRef: existing.via === "sourceRef" ? r.sourceRef : undefined, source: existing.via === "sourceRef" ? r.source : undefined } })
      : await db.agency.create({ data: { ...data, slug: await uniqueAgencySlug(r.name, city?.slug), published: Boolean(opts.publish) } });
    existing ? stats.updated++ : stats.created++;

    // Google Maps senza login dà il voto ma non il numero di recensioni:
    // il voto si tiene lo stesso, con count null.
    if (r.rating) {
      const cur = existing ? await db.agency.findUnique({ where: { id: agency.id }, select: { externalRatings: true } }) : null;
      const altre = (Array.isArray(cur?.externalRatings) ? (cur.externalRatings as { source: string }[]) : []).filter((e) => e.source !== r.source);
      const voto = { source: r.source, rating: r.rating, count: r.reviewCount ?? null, url: r.sourceUrl, fetchedAt: new Date().toISOString() };
      await db.agency.update({ where: { id: agency.id }, data: { externalRatings: [...altre, voto] as never } });
    }

    for (const sid of serviceIds) {
      await db.agencyService.upsert({ where: { agencyId_serviceId: { agencyId: agency.id, serviceId: sid } }, create: { agencyId: agency.id, serviceId: sid }, update: {} });
    }
    for (const rv of r.reviews ?? []) {
      if (!rv.sourceRef || !rv.rating) continue;
      const row: Prisma.ReviewUncheckedCreateInput = { agencyId: agency.id, author: rv.author, rating: Math.max(1, Math.min(5, Math.round(rv.rating))), text: rv.text, publishedAt: rv.publishedAt ? new Date(rv.publishedAt) : undefined, source: r.source === "google_places" ? "google" : r.source, sourceUrl: rv.sourceUrl, sourceRef: rv.sourceRef };
      await db.review.upsert({ where: { sourceRef: rv.sourceRef }, create: row, update: { rating: row.rating, text: row.text, publishedAt: row.publishedAt } });
      stats.reviews++;
    }
  }
  return stats;
}
