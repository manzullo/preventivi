// Google Business Profile per i professionisti che già abbiamo (scraperlink,
// 0,0005 $ a risultato; le ricerche puntuali rendono 2-5 risultati, con le
// recensioni ~7): cerca "nome città", tiene il candidato con dominio o nome
// uguale, salva place_id, contatti mancanti, coordinate, rating Google,
// recensioni singole (con meta completo) e lo snapshot grezzo. Uso:
//   tsx scripts/apify-places.ts [--city roma] [--limit 500] [--reviews 5] [--budget 2] [--batch 250] [--token-env auto|all|APIFY_TOKEN_2] [--reuse] [--dry] --confirm
import fs from "node:fs";
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
import { db } from "../src/lib/db";
import { applyPlace, normalizePlace, pickToken, runScraperlink, samePlace, type SlPlace } from "../src/modules/ingest/scraperlink";
import { recalcAllScores } from "../src/modules/ranking/score";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CITY = opt("--city", "");
const LIMIT = Number(opt("--limit", "0"));
const MAX_REVIEWS = Number(opt("--reviews", "10"));
const BUDGET = Number(opt("--budget", "2"));
const BATCH = Number(opt("--batch", "300"));
const TOKEN_ENV = opt("--token-env", "auto");
const ACTOR_ARG = opt("--actor", "scraperlink"); // scraperlink (quota mensile gratuita) | compass (si paga a risultato)
const DRY = args.includes("--dry");
const REUSE = args.includes("--reuse"); // applica i dataset già salvati in raw/google/places, niente spesa
// Nome pulito per la ricerca: via slogan dopo | — - e lunghezze eccessive.
const q = (name: string, city: string) => `${name.split(/\s+[|—–]\s+|\s+-\s+/)[0].replace(/[®™]/g, "").trim().slice(0, 60)} ${city}`;
const costoStimato = MAX_REVIEWS > 0 ? 0.0036 : 0.001;

type Account = { token: string; name: string; residuo: number };

/** Account Apify con credito: la quota gratuita del fornitore e il credito sono per account. */
async function accountsWithCredit(): Promise<Account[]> {
  const out: Account[] = [];
  for (const k of Object.keys(process.env).filter((n) => /^APIFY_TOKEN(_\d+)?$/.test(n)).sort()) {
    const token = process.env[k]!;
    const lim = (await fetch("https://api.apify.com/v2/users/me/limits", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null)) as { data?: { current?: { monthlyUsageUsd?: number }; limits?: { maxMonthlyUsageUsd?: number } } } | null;
    const residuo = (lim?.data?.limits?.maxMonthlyUsageUsd ?? 5) - (lim?.data?.current?.monthlyUsageUsd ?? 0);
    if (residuo > 0.03) out.push({ token, name: k, residuo });
  }
  return out.sort((a, b) => b.residuo - a.residuo);
}

async function main() {
  const agencies = await db.agency.findMany({
    where: { googleSyncedAt: null, cityId: { not: null }, source: { not: "fixture" }, ...(CITY ? { city: { slug: CITY } } : {}) },
    select: { id: true, name: true, domain: true, city: { select: { name: true, province: true } } },
    orderBy: [{ published: "desc" }, { reviewCount: "desc" }],
    take: LIMIT || undefined,
  });
  console.log(`professionisti da cercare: ${agencies.length} · costo stimato ${(agencies.length * costoStimato).toFixed(2)} $ · tetto ${BUDGET} $ · recensioni ${MAX_REVIEWS}`);
  if (DRY) { console.log(agencies.slice(0, 5).map((a) => q(a.name, a.city!.name)).join(" | ")); return; }
  if (!args.includes("--confirm")) throw new Error("serve --confirm");

  // Riuso: applica i dataset già pagati, senza lanciare nulla.
  if (REUSE) {
    const dir = "data/raw/google/places";
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(`${CITY || "italia"}-`)) : [];
    const rawAll = files.flatMap((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")) as Record<string, unknown>[]);
    const places = rawAll.map(normalizePlace).filter((x): x is SlPlace => Boolean(x));
    const byQuery = new Map<string, SlPlace[]>();
    for (const pl of places) { const k = pl.searchString ?? ""; byQuery.set(k, [...(byQuery.get(k) ?? []), pl]); }
    let matched = 0, unmatched = 0, reviews = 0;
    const now = new Date();
    for (const a of agencies) {
      const candidates = byQuery.get(q(a.name, a.city!.name));
      if (!candidates) continue; // ricerca mai fatta in quei file
      const pl = candidates.find((c) => samePlace({ ...a, province: a.city?.province ?? null }, c));
      if (pl) { reviews += await applyPlace(a.id, pl, { keepPhoneFromSite: true }); matched++; }
      else { unmatched++; await db.agency.update({ where: { id: a.id }, data: { googleSyncedAt: now, importNote: "google: nessuna corrispondenza" } }); }
    }
    const s = await recalcAllScores();
    console.log(JSON.stringify({ reuse: files.length, matched, unmatched, reviews, scored: s.agencies }));
    return;
  }

  const accounts = TOKEN_ENV === "all"
    ? await accountsWithCredit()
    : [TOKEN_ENV === "auto" ? await pickToken(0.3) : { token: process.env[TOKEN_ENV] ?? "", name: TOKEN_ENV, residuo: Number.NaN }];
  if (!accounts.length || !accounts[0].token) throw new Error("nessun account Apify con credito");
  console.log("account: " + accounts.map((a) => `${a.name}${Number.isFinite(a.residuo) ? " " + a.residuo.toFixed(2) + " $" : ""}`).join(" · "));

  let acc = 0, matched = 0, unmatched = 0, reviews = 0, spent = 0, rimandate = 0;
  for (let i = 0; i < agencies.length; i += BATCH) {
    if (acc >= accounts.length) { console.log("account esauriti: il resto si riprende dopo"); break; }
    const account = accounts[acc];
    const slice = agencies.slice(i, i + BATCH);
    const queries = slice.map((a) => q(a.name, a.city!.name));
    const tetto = Math.min(Math.max(0.05, BUDGET - spent), Number.isFinite(account.residuo) ? Math.max(0.05, account.residuo - 0.02) : 99);
    // Apify rifiuta i run sotto il minimo di credito: si cambia account invece di morire.
    if (Number.isFinite(account.residuo) && account.residuo < 0.55) {
      console.log(`credito insufficiente su ${account.name} (${account.residuo.toFixed(2)} $): passo al prossimo account`);
      acc++; i -= BATCH; continue;
    }
    const input = ACTOR_ARG === "compass"
      ? { searchStringsArray: queries, maxCrawledPlacesPerSearch: 2, language: "it", countryCode: "it", maxReviews: MAX_REVIEWS, scrapeReviewsPersonalData: false, skipClosedPlaces: false }
      : { query: queries, num: 10, gl: "it", hl: "it", reviews: MAX_REVIEWS > 0, maxReviews: MAX_REVIEWS, reviewsSort: "newest" };
    const esito = await runScraperlink(input, {
      token: account.token, budgetUsd: tetto, actor: ACTOR_ARG === "compass" ? "compass~crawler-google-places" : undefined,
      log: (m) => console.log("[" + account.name + "] " + m),
    }).catch((e: Error) => { console.log(`run non avviato su ${account.name}: ${e.message.slice(0, 120)}`); return null; });
    if (!esito) { acc++; i -= BATCH; continue; }
    const { places, usd, raw, blocked, empty } = esito;
    fs.mkdirSync("data/raw/google/places", { recursive: true });
    fs.writeFileSync(`data/raw/google/places/${CITY || "italia"}-${Date.now()}.json`, JSON.stringify(raw, null, 0));
    spent += usd;
    account.residuo -= usd;

    const byQuery = new Map<string, typeof places>();
    for (const p of places) { const k = p.searchString ?? ""; byQuery.set(k, [...(byQuery.get(k) ?? []), p]); }
    const now = new Date();
    // Se il fornitore non ha risposto per niente, l'account è bruciato: niente marcature, si cambia account.
    if (!places.length && !empty.size && ACTOR_ARG !== "compass") {
      console.log(`nessuna risposta con ${account.name}: batch rimandato`);
      acc++; i -= BATCH; continue;
    }
    let fatteQui = 0;
    for (const a of slice) {
      const key = q(a.name, a.city!.name);
      // Si marca solo ciò che è stato davvero cercato: risultati presenti o "nessun risultato" nel log.
      if (ACTOR_ARG !== "compass" && !byQuery.has(key) && !empty.has(key)) { rimandate++; continue; }
      fatteQui++;
      const candidates = byQuery.get(key) ?? [];
      const p = candidates.find((c) => samePlace({ ...a, province: a.city?.province ?? null }, c));
      if (p) { reviews += await applyPlace(a.id, p, { keepPhoneFromSite: true }); matched++; }
      else { unmatched++; await db.agency.update({ where: { id: a.id }, data: { googleSyncedAt: now, importNote: "google: nessuna corrispondenza" + (candidates[0] ? ' (trovato "' + candidates[0].name + '")' : "") } }); }
    }
    console.log(`batch ${i / BATCH + 1}: cercate ${fatteQui} · trovate ${matched} · non trovate ${unmatched} · rimandate ${rimandate} · recensioni ${reviews} · spesa ${spent.toFixed(2)} $`);

    // Quota del fornitore finita o credito esaurito: si passa al prossimo account e si rifà il batch.
    if (blocked.size > queries.length / 4 || account.residuo < 0.04) { acc++; i -= BATCH; continue; }
    if (spent >= BUDGET) { console.log("tetto di spesa raggiunto"); break; }
  }
  const s = await recalcAllScores();
  console.log(JSON.stringify({ matched, unmatched, rimandate, reviews, spentUsd: Number(spent.toFixed(3)), scored: s.agencies }));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
