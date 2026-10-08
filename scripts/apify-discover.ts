// Scoperta via Google Maps per una città (scraperlink): la prima query di
// ogni categoria + città, N risultati a query, recensioni incluse. Abbina ai
// record esistenti (place_id, dominio, nome) e crea bozze per i posti nuovi la
// cui categoria Google rientra nella regex `googleMatch` della categoria.
// `--service` limita la scoperta a una categoria. Uso:
//   INGEST_ENABLED=1 tsx scripts/apify-discover.ts --city milano [--service idraulici] [--num 50] [--reviews 10] [--budget 1.5] [--token-env APIFY_TOKEN_2] [--dry] --confirm
import fs from "node:fs";
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
import { db } from "../src/lib/db";
import { importRecords } from "../src/modules/ingest/import";
import { applyPlace, normalizePlace, pickToken, runScraperlink, type SlPlace } from "../src/modules/ingest/scraperlink";
import type { IngestRecord } from "../src/modules/ingest/types";
import { ingestAllowed } from "../src/modules/ingest/types";
import { recalcAllScores } from "../src/modules/ranking/score";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CITY = opt("--city", "roma");
const NUM = Number(opt("--num", "50"));
const MAX_REVIEWS = Number(opt("--reviews", "10"));
const BUDGET = Number(opt("--budget", "1.5"));
const TOKEN_ENV = opt("--token-env", "auto");
const DRY = args.includes("--dry");
const SERVICE = opt("--service", "");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(srls?|s\.r\.l\.?|spa|snc|sas|agency|professionista|studio|web agency|digital agency|group)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const domainOf = (u?: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : null; } catch { return null; } };

async function main() {
  const city = await db.city.findUnique({ where: { slug: CITY } });
  if (!city) throw new Error(`città ${CITY} non trovata`);
  const services = await db.service.findMany({ where: { active: true, ...(SERVICE ? { slug: SERVICE } : {}) }, orderBy: { position: "asc" }, select: { slug: true, queries: true, googleMatch: true } });
  const queryToService = new Map<string, string>();
  const matchOf = new Map<string, RegExp | null>();
  for (const s of services) {
    const q = ((s.queries as string[]) ?? [])[0];
    if (q) queryToService.set(`${q} ${city.name}`, s.slug);
    matchOf.set(s.slug, s.googleMatch ? new RegExp(s.googleMatch, "i") : null);
  }
  const queries = [...queryToService.keys()];
  console.log(`città ${city.name} · ${queries.length} keyword × ${NUM} risultati (max ${queries.length * NUM} prima della deduplica) · stima ≈ ${(queries.length * NUM * 0.0005).toFixed(2)} $ · tetto ${BUDGET} $`);
  if (DRY) return;
  ingestAllowed(args.includes("--confirm"));
  const picked = TOKEN_ENV === "auto" ? await pickToken(0.3) : { token: process.env[TOKEN_ENV] ?? "", name: TOKEN_ENV, residuo: NaN };
  const TOKEN = picked.token;
  if (!TOKEN) throw new Error("token Apify mancante");
  console.log(`account: ${picked.name}` + (Number.isFinite(picked.residuo) ? ` · credito residuo ${picked.residuo.toFixed(2)} $` : ""));
  const raw = `data/raw/google/${CITY}${SERVICE ? `-${SERVICE}` : ""}-scraperlink.json`;
  fs.mkdirSync("data/raw/google", { recursive: true });
  let places: SlPlace[];
  if (fs.existsSync(raw)) { places = (JSON.parse(fs.readFileSync(raw, "utf8")) as Record<string, unknown>[]).map(normalizePlace).filter((x): x is SlPlace => Boolean(x)); console.log(`riuso dataset salvato: ${places.length}`); }
  else {
    const res = await runScraperlink({ query: queries, num: NUM, gl: "it", hl: "it", reviews: MAX_REVIEWS > 0, maxReviews: MAX_REVIEWS, reviewsSort: "newest" }, { token: TOKEN, budgetUsd: BUDGET, log: console.log });
    places = res.places;
    fs.writeFileSync(raw, JSON.stringify(places, null, 0));
  }
  const agencies = await db.agency.findMany({ where: { cityId: city.id, optedOutAt: null }, select: { id: true, name: true, domain: true, googlePlaceId: true } });
  const byPlace = new Map(agencies.filter((a) => a.googlePlaceId).map((a) => [a.googlePlaceId as string, a]));
  const byDomain = new Map(agencies.filter((a) => a.domain).map((a) => [a.domain as string, a]));
  const byName = new Map(agencies.map((a) => [norm(a.name), a]));
  let matched = 0, skippedCategory = 0, reviews = 0;
  const fresh: IngestRecord[] = [];
  const seen = new Set<string>();
  for (const p of places) {
    if (seen.has(p.placeId)) continue;
    seen.add(p.placeId);
    const d = domainOf(p.website);
    const a = byPlace.get(p.placeId) ?? (d ? byDomain.get(d) : undefined) ?? byName.get(norm(p.name));
    if (a) { reviews += await applyPlace(a.id, p, { keepPhoneFromSite: true }); matched++; continue; }
    const serviceSlug = p.searchString ? queryToService.get(p.searchString) : undefined;
    // Un posto entra solo se la sua categoria Google è quella cercata: chi
    // cerca "idraulico" su Maps trova anche ferramenta e negozi di sanitari.
    const match = serviceSlug ? matchOf.get(serviceSlug) : null;
    if (match && !match.test(`${p.category ?? ""} ${p.categories.join(" ")}`)) { skippedCategory++; continue; }
    fresh.push({ source: "google_places", sourceRef: p.placeId, sourceUrl: p.url, name: p.name, website: p.website ?? undefined, phone: p.phone ?? undefined, street: p.street ?? undefined, postalCode: p.postalCode ?? undefined, cityName: city.slug, lat: p.lat ?? undefined, lng: p.lng ?? undefined, serviceSlugs: serviceSlug ? [serviceSlug] : [], reviews: [] });
  }
  const stats = await importRecords(fresh, { publish: false });
  // place_id, rating e recensioni anche sulle bozze nuove
  for (const p of places) {
    const a = await db.agency.findFirst({ where: { source: "google_places", sourceRef: p.placeId, googlePlaceId: null }, select: { id: true } });
    if (a) reviews += await applyPlace(a.id, p);
  }
  const s = await recalcAllScores();
  console.log(JSON.stringify({ posti: seen.size, abbinati: matched, nuove_bozze: stats.created, scartati_categoria: skippedCategory, recensioni: reviews, scored: s.agencies }));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
