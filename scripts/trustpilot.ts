// Trustpilot: si legge solo con l'API ufficiale. Il loro robots.txt vieta tutto
// (`User-agent: * → Disallow: /`), quindi niente lettura delle pagine.
// Serve una chiave: creala su developers.trustpilot.com e mettila in .env come
// TRUSTPILOT_API_KEY. Il voto finisce in Agency.externalRatings. Uso:
//   tsx scripts/trustpilot.ts [--city roma] [--limit 200] [--dry] --confirm
// Serve INGEST_ENABLED=1 e --confirm, come per ogni ingest di rete.
import "./lib/env";
import { db } from "../src/lib/db";
import { ingestAllowed } from "../src/modules/ingest/types";
import { recalcAllScores } from "../src/modules/ranking/score";
import { argomenti } from "./lib/siti";

const { opt, flag } = argomenti();
const CITY = opt("--city");
const LIMIT = Number(opt("--limit", "0"));
const DRY = flag("--dry");
const API = "https://api.trustpilot.com/v1";

type Unit = { id: string; displayName: string; identifyingName: string; websiteUrl: string; score?: { trustScore?: number; stars?: number }; numberOfReviews?: { total?: number } };

async function cercaPerDominio(key: string, dominio: string): Promise<Unit | null> {
  const r = await fetch(`${API}/business-units/find?name=${encodeURIComponent(dominio)}`, { headers: { apikey: key } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Trustpilot HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Unit;
}

async function main() {
  ingestAllowed(flag("--confirm"));
  const rows = await db.agency.findMany({
    where: { published: true, optedOutAt: null, domain: { not: null }, ...(CITY ? { city: { slug: CITY } } : {}) },
    select: { id: true, name: true, domain: true, externalRatings: true },
    orderBy: [{ score: "desc" }],
    take: LIMIT || undefined,
  });
  console.log(`professionisti da cercare su Trustpilot: ${rows.length}`);
  if (DRY) { console.log(JSON.stringify({ daCercare: rows.length, dry: true })); return; }
  const KEY = process.env.TRUSTPILOT_API_KEY ?? "";
  if (!KEY) throw new Error("Manca TRUSTPILOT_API_KEY in .env: creala su developers.trustpilot.com");

  let trovati = 0, assenti = 0;
  for (const a of rows) {
    let u: Unit | null = null;
    try {
      u = await cercaPerDominio(KEY, a.domain!);
    } catch (e) {
      console.log(`errore su ${a.domain}: ${String(e).slice(0, 120)}`);
      break;
    }
    if (!u || !u.score?.trustScore) { assenti++; await new Promise((r) => setTimeout(r, 250)); continue; }
    const ext = (Array.isArray(a.externalRatings) ? (a.externalRatings as { source: string }[]) : []).filter((e) => e.source !== "trustpilot");
    ext.push({
      source: "trustpilot",
      // Il TrustScore va da 1 a 5 come le nostre stelle.
      rating: Number(u.score.stars ?? u.score.trustScore),
      count: u.numberOfReviews?.total ?? 0,
      url: `https://it.trustpilot.com/review/${u.identifyingName}`,
      fetchedAt: new Date().toISOString(),
    } as { source: string });
    await db.agency.update({ where: { id: a.id }, data: { externalRatings: ext as never } });
    trovati++;
    await new Promise((r) => setTimeout(r, 250));
  }
  const s = await recalcAllScores();
  console.log(JSON.stringify({ trovati, senzaProfilo: assenti, ricalcolate: s.agencies }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
