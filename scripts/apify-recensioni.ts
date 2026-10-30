// Recensioni Google con il testo, per i professionisti che hanno già il
// place_id (o una scheda Google Maps dal nostro scraper, che lo porta nella URL). Interroga l'actor per placeIds: niente ricerca da rifare, quindi
// meno spesa e nessun rischio di abbinare la scheda sbagliata. Importa autore,
// voto, data, testo e link alla recensione. Fonte a pagamento (Apify). Uso:
//   tsx scripts/apify-recensioni.ts [--limit 200] [--reviews 10] [--budget 0.3]
//     [--batch 50] [--city roma] [--token-env all|auto|APIFY_TOKEN_2] [--actor scraperlink|compass] [--dry] --confirm
// Serve INGEST_ENABLED=1 e --confirm, come per ogni ingest di rete.
//
// Solo account Apify sul piano gratuito (niente carta: finiti i 5 $ del mese
// Apify si ferma, non addebita). Un account a pagamento si usa solo con
// --anche-a-pagamento, scritto apposta: in passato il credito è sfuggito.
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { applyPlace, normalizePlace, pickToken, provinciaDaIndirizzo, runScraperlink, type SlPlace } from "../src/modules/ingest/scraperlink";
import { ingestAllowed } from "../src/modules/ingest/types";
import { recalcAllScores } from "../src/modules/ranking/score";
import { argomenti } from "./lib/siti";

const { opt, flag } = argomenti();
const CITY = opt("--city");
const LIMIT = Number(opt("--limit", "0"));
const MAX_REVIEWS = Number(opt("--reviews", "10"));
const BUDGET = Number(opt("--budget", "0.3"));
const BATCH = Number(opt("--batch", "50"));
const TOKEN_ENV = opt("--token-env", "all");
const DRY = flag("--dry");
// scraperlink fattura 0,0005 $ per riga di risultato (il posto più le sue
// recensioni): con dieci recensioni sono circa 0,0055 $ a scheda, contro i
// ~0,009 $ di compass. compass resta come riserva se scraperlink non risponde.
const ACTOR_ARG = opt("--actor", "scraperlink");
const ACTOR = ACTOR_ARG === "compass" ? "compass~crawler-google-places" : "scraperlink~google-maps-scraper";
const costoStimato = ACTOR_ARG === "compass" ? 0.004 + MAX_REVIEWS * 0.0005 : (1 + MAX_REVIEWS) * 0.0005;
const DIR = "data/raw/google/recensioni";
const FATTE = "data/raw/google/recensioni-fatte.txt";
// Categorie Google sicuramente fuori tema (stesso file letto da scraperlink.ts):
// un posto così si stacca invece di riempire la scheda di recensioni sbagliate.
const FUORI = new Set(
  fs.existsSync("data/google-categorie.json")
    ? ((JSON.parse(fs.readFileSync("data/google-categorie.json", "utf8")) as { fuoriTema?: string[] }).fuoriTema ?? []).map((x) => x.toLowerCase())
    : [],
);

type Account = { token: string; name: string; residuo: number };
const ANCHE_A_PAGAMENTO = flag("--anche-a-pagamento");

/** Il piano dell'account: "FREE" per il gratuito. Se non si legge, si tratta come a pagamento. */
async function piano(token: string): Promise<string> {
  const me = (await fetch("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null)) as { data?: { plan?: { id?: string } } } | null;
  return String(me?.data?.plan?.id ?? "sconosciuto").toUpperCase();
}

async function accountsWithCredit(): Promise<Account[]> {
  const out: Account[] = [];
  for (const k of Object.keys(process.env).filter((n) => /^APIFY_TOKEN(_\w+)?$/.test(n)).sort()) {
    const token = process.env[k]!;
    if (!token) continue;
    const p = await piano(token);
    if (p !== "FREE" && !ANCHE_A_PAGAMENTO) {
      console.log(`${k}: piano ${p}, non gratuito: lo salto (serve --anche-a-pagamento)`);
      continue;
    }
    const lim = (await fetch("https://api.apify.com/v2/users/me/limits", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null)) as { data?: { current?: { monthlyUsageUsd?: number }; limits?: { maxMonthlyUsageUsd?: number } } } | null;
    const residuo = (lim?.data?.limits?.maxMonthlyUsageUsd ?? 5) - (lim?.data?.current?.monthlyUsageUsd ?? 0);
    if (residuo > 0.03) out.push({ token, name: `${k} (${p})`, residuo });
  }
  return out.sort((a, b) => b.residuo - a.residuo);
}

/**
 * place_id della scheda: quello salvato o, per le schede del nostro scraper di
 * Maps, quello scritto nella URL del posto (…!19sChIJ…).
 */
function placeIdDi(a: { googlePlaceId: string | null; sourceUrl: string | null }): string | null {
  if (a.googlePlaceId) return a.googlePlaceId;
  const m = /!19s(ChIJ[\w-]+)/.exec(decodeURIComponent(a.sourceUrl ?? ""));
  return m ? m[1] : null;
}

/** Place già interrogati: senza questo elenco i posti senza testi tornerebbero a ogni giro. */
function giaFatti(): Set<string> {
  if (!fs.existsSync(FATTE)) return new Set();
  return new Set(fs.readFileSync(FATTE, "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
}

async function main() {
  ingestAllowed(flag("--confirm"));
  const fatti = giaFatti();
  const tutte = await db.agency.findMany({
    where: {
      published: true,
      optedOutAt: null,
      // Il numero di recensioni spesso non c'è (Maps senza accesso dà solo le
      // stelle): basta avere un posto Google a cui chiederle.
      OR: [{ googlePlaceId: { not: null } }, { source: "google_maps", sourceUrl: { not: null } }],
      source: { not: "fixture" },
      ...(CITY ? { city: { slug: CITY } } : {}),
      // Chi ha già almeno una recensione Google con il testo è a posto.
      NOT: { reviews: { some: { source: "google", text: { not: null } } } },
    },
    select: { id: true, name: true, googlePlaceId: true, sourceUrl: true, reviewCount: true, score: true, city: { select: { name: true, province: true } } },
    orderBy: [{ score: "desc" }],
  });
  const conPid = tutte.map((a) => ({ ...a, googlePlaceId: placeIdDi(a) })).filter((a): a is typeof a & { googlePlaceId: string } => Boolean(a.googlePlaceId));
  const agencies = conPid.filter((a) => !fatti.has(a.googlePlaceId)).slice(0, LIMIT || undefined);
  if (tutte.length > conPid.length) console.log(`senza place_id (né salvato né nella URL di Maps): ${tutte.length - conPid.length}, saltati`);
  console.log(`professionisti senza testi Google: ${conPid.length} · da interrogare ora: ${agencies.length} · costo stimato ${(agencies.length * costoStimato).toFixed(2)} $ · tetto ${BUDGET} $ · fino a ${MAX_REVIEWS} recensioni a scheda`);
  if (DRY) { console.log(agencies.slice(0, 8).map((a) => `${a.name} (${a.city?.name}) ${a.reviewCount}`).join(" | ")); console.log(JSON.stringify({ daInterrogare: agencies.length, dry: true })); return; }
  if (!agencies.length) return;

  const accounts = TOKEN_ENV === "all"
    ? await accountsWithCredit()
    : [TOKEN_ENV === "auto" ? await pickToken(0.3) : { token: process.env[TOKEN_ENV] ?? "", name: TOKEN_ENV, residuo: Number.NaN }];
  if (!accounts.length || !accounts[0].token) throw new Error("nessun account Apify gratuito con credito");
  // Anche un token scelto a mano deve essere sul piano gratuito.
  for (const a of accounts) {
    const p = await piano(a.token);
    if (p !== "FREE" && !ANCHE_A_PAGAMENTO) throw new Error(`${a.name}: piano ${p}, non gratuito. Fermo (serve --anche-a-pagamento)`);
  }
  console.log("account: " + accounts.map((a) => `${a.name}${Number.isFinite(a.residuo) ? " " + a.residuo.toFixed(2) + " $" : ""}`).join(" · "));

  fs.mkdirSync(DIR, { recursive: true });
  let acc = 0, spesa = 0, importate = 0, posti = 0, senzaTesti = 0, staccate = 0;
  for (let i = 0; i < agencies.length; i += BATCH) {
    if (acc >= accounts.length) { console.log("account esauriti: il resto si riprende al rinnovo del credito"); break; }
    const account = accounts[acc];
    const slice = agencies.slice(i, i + BATCH);
    const tetto = Math.min(Math.max(0.05, BUDGET - spesa), Number.isFinite(account.residuo) ? Math.max(0.05, account.residuo - 0.02) : 99);
    if (Number.isFinite(account.residuo) && account.residuo < 0.55) {
      console.log(`credito insufficiente su ${account.name} (${account.residuo.toFixed(2)} $): passo al prossimo account`);
      acc++; i -= BATCH; continue;
    }
    const input = ACTOR_ARG === "compass"
      ? { placeIds: slice.map((a) => `place_id:${a.googlePlaceId}`), language: "it", maxReviews: MAX_REVIEWS, reviewsSort: "newest", scrapeReviewsPersonalData: true, skipClosedPlaces: false }
      : { placeIds: slice.map((a) => a.googlePlaceId), gl: "it", hl: "it", reviews: MAX_REVIEWS > 0, maxReviews: MAX_REVIEWS, reviewsSort: "newest" };
    let esito;
    try {
      esito = await runScraperlink(input, { token: account.token, budgetUsd: tetto, actor: ACTOR, log: (s) => console.log(`  ${s}`) });
    } catch (e) {
      console.log(`run rifiutato su ${account.name}: ${(e as Error).message.slice(0, 200)}`);
      acc++; i -= BATCH; continue;
    }
    spesa += esito.usd;
    fs.writeFileSync(`${DIR}/${Date.now()}.json`, JSON.stringify(esito.raw));
    const perPlace = new Map<string, SlPlace>();
    for (const raw of esito.raw) { const p = normalizePlace(raw); if (p) perPlace.set(p.placeId, p); }
    for (const a of slice) {
      const p = perPlace.get(a.googlePlaceId!);
      if (!p) continue;
      posti++;
      fs.appendFileSync(FATTE, `${a.googlePlaceId}\n`);
      // Rete di sicurezza: il place_id può essere stato agganciato male in
      // passato. Se il posto è un'altra attività o sta in un'altra provincia,
      // si stacca invece di riempire la scheda di recensioni sbagliate.
      const cat = (p.category ?? "").toLowerCase();
      const prov = provinciaDaIndirizzo(typeof p.raw?.address === "string" ? (p.raw.address as string) : null);
      const fuoriProvincia = Boolean(prov && a.city?.province && prov !== a.city.province);
      if (FUORI.has(cat) || fuoriProvincia) {
        await db.review.deleteMany({ where: { agencyId: a.id, source: "google" } });
        await db.sourceSnapshot.deleteMany({ where: { agencyId: a.id, source: "google" } });
        const cur = await db.agency.findUnique({ where: { id: a.id }, select: { externalRatings: true, importNote: true } });
        const ext = (Array.isArray(cur?.externalRatings) ? cur!.externalRatings : []).filter((e) => (e as { source?: string })?.source !== "google");
        await db.agency.update({ where: { id: a.id }, data: { googlePlaceId: null, googleUrl: null, googleSyncedAt: null, externalRatings: ext as never, importNote: [cur?.importNote, `google staccato: ${FUORI.has(cat) ? `attività ${cat}` : `provincia ${prov}`}`].filter(Boolean).join(" · ") } });
        staccate++;
        continue;
      }
      const n = await applyPlace(a.id, p, { keepPhoneFromSite: true });
      importate += n;
      if (n === 0) senzaTesti++;
    }
    console.log(`lotto ${i / BATCH + 1}: ${posti} posti · ${importate} recensioni importate · spesa ${spesa.toFixed(2)} $`);
    if (spesa >= BUDGET) { console.log("tetto di spesa raggiunto"); break; }
  }
  const s = await recalcAllScores();
  console.log(JSON.stringify({ posti, importate, senzaTesti, staccate, spesa: Number(spesa.toFixed(3)), ricalcolate: s.agencies }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
