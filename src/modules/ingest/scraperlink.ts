// Google Maps via Apify, actor scraperlink~google-maps-scraper: 0,0005 $ a
// risultato, recensioni incluse nello stesso item, place_id in formato ChIJ.
// Scelto il 2026-09-09 al posto di compass (8× più caro) dopo il confronto
// già fatto per guidalocation. Nessuna chiamata senza token e senza tetto.
import { db } from "@/lib/db";

export type SlReview = { reviewId: string; reviewUrl?: string; author: string; rating: number; text: string | null; publishedAt: string | null; meta: Record<string, unknown> };
export type SlPlace = {
  placeId: string; name: string; category: string | null; categories: string[]; website: string | null; phone: string | null;
  street: string | null; postalCode: string | null; city: string | null; lat: number | null; lng: number | null;
  rating: number | null; reviewsCount: number | null; url: string; logoUrl: string | null; searchString: string | null; reviews: SlReview[];
  raw: Record<string, unknown>;
};

type Raw = Record<string, unknown> & { reviews?: Record<string, unknown>[] };

export function normalizePlace(it: Raw): SlPlace | null {
  const placeId = String(it.placeId ?? "");
  const name = String(it.title ?? "").trim();
  if (!placeId || !name) return null;
  const street = [it.street, it.streetNumber].filter(Boolean).join(" ").trim() || (typeof it.address === "string" ? String(it.address).split(",")[0].trim() : null) || null;
  const reviews: SlReview[] = (it.reviews ?? []).map((r) => ({
    reviewId: String(r.reviewId ?? ""), reviewUrl: (r.reviewUrl as string) ?? undefined, author: String(r.name ?? r.author ?? "Utente Google"),
    rating: Number(r.stars ?? r.rating ?? 0), text: String(r.text ?? "").trim() || null, publishedAt: (r.publishedAtDate as string) ?? (r.publishedAt as string) ?? null,
    // Tutto il resto: profilo e foto dell'autore, like, risposta del titolare, lingua, immagini.
    meta: { reviewerId: r.reviewerId, reviewerUrl: r.reviewerUrl ?? r.authorProfileUrl, reviewerPhotoUrl: r.reviewerPhotoUrl ?? r.authorAvatar, reviewerNumberOfReviews: r.reviewerNumberOfReviews ?? r.authorTotalReviews, isLocalGuide: r.isLocalGuide ?? r.authorIsLocalGuide, likesCount: r.likesCount, language: r.language ?? r.originalLanguage, responseFromOwnerText: r.responseFromOwnerText, responseFromOwnerDate: r.responseFromOwnerDate, reviewImageUrls: r.reviewImageUrls ?? r.photos, lastEditedAtDate: r.lastEditedAtDate },
  })).filter((r) => r.reviewId && r.rating >= 1 && r.rating <= 5);
  return {
    placeId, name, category: (it.categoryName as string) ?? null, categories: Array.isArray(it.categories) ? (it.categories as string[]) : [],
    website: (it.website as string) ?? null, phone: (it.phone as string) ?? (it.phoneNumber as string) ?? null,
    street, postalCode: (it.postalCode as string) ?? null, city: (it.city as string) ?? null,
    // compass mette le coordinate in location{lat,lng}, scraperlink in latitude/longitude.
    lat: typeof it.latitude === "number" ? (it.latitude as number) : typeof (it.location as { lat?: number })?.lat === "number" ? (it.location as { lat: number }).lat : null,
    lng: typeof it.longitude === "number" ? (it.longitude as number) : typeof (it.location as { lng?: number })?.lng === "number" ? (it.location as { lng: number }).lng : null,
    rating: typeof it.totalScore === "number" ? (it.totalScore as number) : typeof it.rating === "number" ? (it.rating as number) : null,
    reviewsCount: typeof it.reviewsCount === "number" ? (it.reviewsCount as number) : null,
    url: (it.googleMapsUrl as string) ?? (it.url as string) ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    logoUrl: (it.logoUrl as string) ?? (it.imageUrl as string) ?? null, searchString: (it.searchString as string) ?? (it.query as string) ?? null, reviews,
    raw: it,
  };
}

const ACTOR = "scraperlink~google-maps-scraper";

/** Avvia un run, aspetta la fine, restituisce gli item normalizzati e la spesa. */
export async function runScraperlink(input: Record<string, unknown>, opts: { token: string; budgetUsd: number; actor?: string; log?: (s: string) => void }): Promise<{ places: SlPlace[]; usd: number; status: string; raw: Raw[]; blocked: Set<string>; empty: Set<string> }> {
  const log = opts.log ?? (() => undefined);
  const actor = opts.actor ?? ACTOR;
  const start = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?token=${encodeURIComponent(opts.token)}&maxTotalChargeUsd=${opts.budgetUsd}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!start.ok) throw new Error(`Apify avvio HTTP ${start.status}: ${(await start.text()).slice(0, 300)}`);
  const run = (await start.json()).data as { id: string; defaultDatasetId: string };
  log(`run avviato: ${run.id}`);
  let status = "RUNNING"; let usd = 0;
  for (let i = 0; i < 720; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    // Un errore di rete non deve buttare via un run già pagato: si riprova al giro dopo.
    // Senza timeout una connessione appesa blocca il polling all'infinito.
    const st = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${encodeURIComponent(opts.token)}`, { signal: AbortSignal.timeout(20000) })
      .then((r) => r.json())
      .then((j) => j.data as { status: string; usageTotalUsd?: number })
      .catch(() => null);
    if (!st) { log("rete instabile: riprovo tra 10 secondi"); continue; }
    status = st.status; usd = st.usageTotalUsd ?? 0;
    if (i % 6 === 5) log(`… ${status} · spesa finora ${usd.toFixed(2)} $`);
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
  }
  const raw = (await (await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(opts.token)}&clean=true`)).json()) as Raw[];
  // Il fornitore scrive nel log quali ricerche ha rifiutato: quelle non sono state fatte, non vanno marcate.
  const runLog = await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}/log?token=${encodeURIComponent(opts.token)}`)).text();
  const blocked = new Set<string>();
  for (const m of runLog.matchAll(/(?:Free monthly limit reached[^(]*|Rate limit exceeded[^(]*)\(source: (.+?)\)/g)) blocked.add(m[1]);
  // "No results returned": la ricerca è stata fatta davvero e Google non ha restituito niente.
  const empty = new Set<string>();
  for (const m of runLog.matchAll(/No results returned\.\s*\(source: (.+?)\)/g)) empty.add(m[1]);
  if (blocked.size) log(`ricerche rifiutate dal fornitore (quota o limite): ${blocked.size}`);
  log(`run ${status} · item ${raw.length} · spesa ${usd.toFixed(2)} $`);
  return { places: raw.map(normalizePlace).filter((x): x is SlPlace => Boolean(x)), usd, status, raw, blocked, empty };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(srls?|s\.r\.l\.?|spa|snc|sas|agency|professionista|studio|web agency|digital agency|group|roma|milano|torino|napoli|firenze|bologna|palermo)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const domainOf = (u?: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : null; } catch { return null; } };

/** Vero se il posto Google è la stesso professionista (dominio, altrimenti nome). */
/** Categorie Google che non sono professionisti: servono a scartare gli omonimi. */
let FUORI_TEMA: Set<string> | null = null;
function categorieFuoriTema(): Set<string> {
  if (FUORI_TEMA) return FUORI_TEMA;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const j = JSON.parse(fs.readFileSync("data/google-categorie.json", "utf8")) as { fuoriTema?: string[] };
    FUORI_TEMA = new Set((j.fuoriTema ?? []).map((x) => x.toLowerCase()));
  } catch {
    FUORI_TEMA = new Set<string>();
  }
  return FUORI_TEMA;
}

/** Sigla della provincia dentro un indirizzo italiano: "00177 Roma RM" -> RM. */
export function provinciaDaIndirizzo(addr: string | null | undefined): string | null {
  if (!addr) return null;
  return addr.match(/\b\d{5}\s+[^,]*?\b([A-Z]{2})\b/)?.[1] ?? null;
}

/**
 * Il posto Google è la stessa azienda della scheda?
 * Il sito uguale è la prova più forte. Senza sito ci si fida del nome, ma solo
 * se il posto sta nella stessa provincia e non è un'attività di altro genere:
 * il professionista "Lapa" di Roma non è "La Lapa - Osteria Siciliana" di Palermo.
 */
export function samePlace(a: { name: string; domain: string | null; province?: string | null }, p: SlPlace): boolean {
  const d = domainOf(p.website);
  if (a.domain && d) return a.domain === d;
  const x = new Set(norm(a.name).split(" ").filter((w) => w.length > 2));
  const y = new Set(norm(p.name).split(" ").filter((w) => w.length > 2));
  if (!x.size || !y.size) return false;
  let inter = 0; for (const w of x) if (y.has(w)) inter++;
  if (inter / Math.min(x.size, y.size) < 0.6) return false;
  const cat = (p.category ?? "").toLowerCase();
  if (cat && categorieFuoriTema().has(cat)) return false;
  const prov = provinciaDaIndirizzo(typeof p.raw?.address === "string" ? (p.raw.address as string) : null);
  if (prov && a.province && prov !== a.province) return false;
  return true;
}

/** Scrive su un professionista esistente: place_id, contatti mancanti, coordinate, rating Google, recensioni singole. */
export async function applyPlace(agencyId: string, p: SlPlace, opts: { keepPhoneFromSite?: boolean } = {}): Promise<number> {
  const cur = await db.agency.findUnique({ where: { id: agencyId }, select: { phone: true, street: true, postalCode: true, website: true, externalRatings: true, logoUrl: true } });
  if (!cur) return 0;
  const now = new Date();
  // Stesso place_id già su un'altra scheda: se è una bozza nata da Google la assorbiamo
  // (recensioni e snapshot passano qui), altrimenti lasciamo il place_id a chi ce l'ha.
  const other = await db.agency.findUnique({ where: { googlePlaceId: p.placeId }, select: { id: true, slug: true, source: true, published: true, _count: { select: { leads: true, assignments: true } } } });
  let placeId: string | null = p.placeId;
  if (other && other.id !== agencyId) {
    if (other.source === "google_places" && !other.published && !other._count.leads && !other._count.assignments) {
      await db.review.updateMany({ where: { agencyId: other.id }, data: { agencyId } });
      await db.sourceSnapshot.deleteMany({ where: { agencyId: other.id, source: "google" } });
      await db.agencyService.deleteMany({ where: { agencyId: other.id } });
      await db.agency.deleteMany({ where: { id: other.id } });
    } else {
      placeId = null;
      await db.agency.update({ where: { id: agencyId }, data: { importNote: `google: place_id già usato dalla scheda ${other.slug}` } });
    }
  }
  const ext = (Array.isArray(cur.externalRatings) ? (cur.externalRatings as { source: string }[]) : []).filter((e) => e.source !== "google");
  if (p.rating && p.reviewsCount) ext.push({ source: "google", rating: p.rating, count: p.reviewsCount, url: p.url, fetchedAt: now.toISOString() } as { source: string });
  await db.agency.update({ where: { id: agencyId }, data: {
    ...(placeId ? { googlePlaceId: placeId } : {}), googleUrl: p.url, googleSyncedAt: now,
    phone: (opts.keepPhoneFromSite && cur.phone) ? cur.phone : (p.phone ?? cur.phone), street: cur.street ?? p.street, postalCode: cur.postalCode ?? p.postalCode,
    website: cur.website ?? p.website, lat: p.lat, lng: p.lng, externalRatings: ext as never,
  } });
  // Copia integrale dell'item Google: niente va perso.
  await db.sourceSnapshot.upsert({ where: { agencyId_source: { agencyId, source: "google" } }, create: { agencyId, source: "google", ref: p.placeId, data: p.raw as never }, update: { ref: p.placeId, data: p.raw as never, fetchedAt: now } });
  let n = 0;
  for (const r of p.reviews) {
    const ref = `google:${r.reviewId}`;
    await db.review.upsert({ where: { sourceRef: ref }, create: { agencyId, author: r.author, rating: Math.round(r.rating), text: r.text, publishedAt: r.publishedAt ? new Date(r.publishedAt) : null, source: "google", sourceUrl: r.reviewUrl ?? p.url, sourceRef: ref, meta: r.meta as never }, update: { agencyId, text: r.text, rating: Math.round(r.rating), meta: r.meta as never } });
    n++;
  }
  return n;
}

/**
 * Sceglie fra i token in .env (APIFY_TOKEN, APIFY_TOKEN_2, _3, …) quello con
 * più credito residuo nel mese, così i run si spostano da soli sull'account
 * giusto. Restituisce anche il residuo stimato.
 */
export async function pickToken(minUsd = 0.3): Promise<{ token: string; name: string; residuo: number }> {
  const keys = Object.keys(process.env).filter((k) => /^APIFY_TOKEN(_\d+)?$/.test(k));
  const found: { token: string; name: string; residuo: number }[] = [];
  for (const k of keys) {
    const token = process.env[k] ?? "";
    if (!token) continue;
    try {
      const me = (await (await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`)).json()).data as { username?: string } | undefined;
      const lim = (await (await fetch(`https://api.apify.com/v2/users/me/limits?token=${encodeURIComponent(token)}`)).json()).data as { limits?: { monthlyUsageUsd?: number }; current?: { monthlyUsageUsd?: number } } | undefined;
      if (!me?.username) continue;
      const limit = lim?.limits?.monthlyUsageUsd ?? 5; // piano FREE: 5 $ al mese
      const used = lim?.current?.monthlyUsageUsd ?? 0;
      found.push({ token, name: `${k} (${me.username})`, residuo: Math.max(0, limit - used) });
    } catch { /* token non valido: si salta */ }
  }
  found.sort((a, b) => b.residuo - a.residuo);
  const best = found[0];
  if (!best || best.residuo < minUsd) throw new Error(`nessun account Apify con almeno ${minUsd} $ di credito (trovati: ${found.map((f) => `${f.name} ${f.residuo.toFixed(2)} $`).join(", ") || "nessuno"})`);
  return best;
}
