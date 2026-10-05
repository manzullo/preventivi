// Doppioni: lo stesso professionista entrato due volte da fonti diverse
// (google_maps, osm, paginegialle, prontopro). Una sola scheda per
// professionista: le sedi in più restano dentro la scheda, non diventano
// schede nuove. Sicuri: stesso place_id Google, stesso dominio, stesso
// telefono con nome simile, stesso nome nella stessa città. Da guardare a
// mano (finiscono in data/raw/doppioni-da-controllare.txt, per
// dubbi-doppioni.ts): stessa partita IVA o stesso telefono con nomi diversi.
// Non si cancella mai una scheda con recensioni, richieste o assegnazioni.
// Di norma è una prova a vuoto: per fondere davvero serve --confirm. Uso:
//   tsx scripts/fondi-doppioni.ts [--fonti google_maps,osm,...] [--limit 50] [--confirm]
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { normalizeDomain } from "../src/modules/ingest/normalize";
import { recalcAllScores } from "../src/modules/ranking/score";
import { chiTiene, type Doppione, FILE_DUBBI, fondi, selectDoppione } from "./lib/doppioni";
import { argomenti } from "./lib/siti";

const { opt, flag } = argomenti();
const APPLICA = flag("--confirm") && !flag("--dry");
const LIMIT = Number(opt("--limit", "0"));
const FONTI = opt("--fonti", "google_maps,osm,paginegialle,prontopro").split(",").map((s) => s.trim()).filter(Boolean);

const tel = (t: string | null) => (t ?? "").replace(/[^0-9]/g, "").replace(/^0039/, "").replace(/^39(?=\d{9,})/, "");
// Forme giuridiche e parole di mestiere non distinguono due professionisti:
// "Idraulica Rossi" e "Rossi Mario idraulico" devono potersi somigliare.
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(srls?|s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|ditta|impresa|studio|di|del|della|e|figli|f\.?lli|fratelli|group|service|servizi)\b/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

/** Nomi che si somigliano abbastanza da essere lo stesso professionista. */
function stessoNome(a: string, b: string): boolean {
  const x = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const y = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!x.size || !y.size) return false;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.min(x.size, y.size) >= 0.6;
}

const dominio = (r: Doppione) => normalizeDomain(r.domain ?? r.website) ?? null;

/** Sicuri: stesso professionista, si fondono. */
function stessaScheda(a: Doppione, b: Doppione): string | null {
  if (a.googlePlaceId && a.googlePlaceId === b.googlePlaceId) return "stesso place_id Google";
  const da = dominio(a), db_ = dominio(b);
  if (da && da === db_) return "stesso dominio";
  // Due domini diversi vogliono dire due attività diverse: telefono e sede
  // possono essere condivisi (stesso studio, stesso stabile, stessa famiglia).
  if (da && db_) return null;
  const t = tel(a.phone);
  if (t.length >= 8 && t === tel(b.phone) && stessoNome(a.name, b.name)) return "stesso telefono e nome simile";
  if (a.cityId && a.cityId === b.cityId && norm(a.name).length >= 6 && norm(a.name) === norm(b.name)) return "stesso nome nella stessa città";
  return null;
}

/** Da guardare a mano: indizi forti ma non decisivi. */
function daControllare(a: Doppione, b: Doppione): string | null {
  if (a.vatNumber && a.vatNumber === b.vatNumber) return "stessa partita IVA, nomi diversi";
  const t = tel(a.phone);
  if (t.length >= 8 && t === tel(b.phone)) return "stesso telefono, nomi diversi";
  return null;
}

async function main() {
  const rows = (await db.agency.findMany({ where: { optedOutAt: null, source: { in: FONTI } }, select: selectDoppione })) as Doppione[];
  console.log(`schede delle fonti ${FONTI.join(", ")}: ${rows.length}`);

  // Si confrontano solo le schede che condividono almeno una chiave: niente giro n².
  const gruppi = new Map<string, Doppione[]>();
  const metti = (k: string | null | undefined, r: Doppione) => { if (k) gruppi.set(k, [...(gruppi.get(k) ?? []), r]); };
  for (const r of rows) {
    metti(r.googlePlaceId && `g:${r.googlePlaceId}`, r);
    metti(dominio(r) && `d:${dominio(r)}`, r);
    const t = tel(r.phone);
    if (t.length >= 8) metti(`t:${t}`, r);
    if (r.vatNumber) metti(`p:${r.vatNumber}`, r);
    if (r.cityId && norm(r.name).length >= 6) metti(`n:${r.cityId}:${norm(r.name)}`, r);
  }

  const assorbite = new Set<string>();
  const coppieViste = new Set<string>();
  const coppie: { tieni: Doppione; assorbi: Doppione; motivo: string }[] = [];
  const dubbi: string[] = [];
  const aMano: string[] = [];
  for (const [chiave, g] of gruppi) {
    // Un centralino o una partita IVA condivisi da decine di schede non dicono niente.
    if (g.length > 12) { dubbi.push(`# chiave ${chiave} condivisa da ${g.length} schede: non si fonde niente`); continue; }
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const a = g[i], b = g[j];
      const id = [a.id, b.id].sort().join("|");
      if (coppieViste.has(id) || assorbite.has(a.id) || assorbite.has(b.id)) continue;
      coppieViste.add(id);
      const motivo = stessaScheda(a, b);
      if (!motivo) {
        const sospetto = daControllare(a, b);
        if (sospetto) dubbi.push(`${a.slug} · ${b.slug} · ${sospetto}`);
        continue;
      }
      const scelta = chiTiene(a, b);
      if (!scelta) { aMano.push(`${a.slug} · ${b.slug} · ${motivo} · tutte e due con recensioni, richieste o titolare`); continue; }
      coppie.push({ tieni: scelta[0], assorbi: scelta[1], motivo });
      assorbite.add(scelta[1].id);
    }
  }

  const lista = LIMIT ? coppie.slice(0, LIMIT) : coppie;
  console.log(`doppioni sicuri: ${coppie.length} · da guardare a mano: ${dubbi.length} · sicuri ma intoccabili tutti e due: ${aMano.length}`);
  if (dubbi.length || aMano.length) {
    fs.mkdirSync("data/raw", { recursive: true });
    fs.writeFileSync(FILE_DUBBI, [...dubbi, ...aMano.map((x) => `# a mano: ${x}`)].join("\n") + "\n");
    console.log(`elenco dei dubbi in ${FILE_DUBBI}`);
  }
  for (const c of lista.slice(0, 20)) {
    console.log(`  ${c.tieni.slug} (${c.tieni.source}, ${c.tieni.city?.name ?? "senza città"}, ${c.tieni._count.reviews} rec) ← ${c.assorbi.slug} (${c.assorbi.source}, ${c.assorbi.city?.name ?? "senza città"}) · ${c.motivo}`);
  }
  if (!APPLICA) { console.log(JSON.stringify({ doppioni: coppie.length, dubbi: dubbi.length, aMano: aMano.length, dry: true })); console.log("prova a vuoto: rilancia con --confirm per fondere"); return; }

  let fusi = 0;
  for (const { tieni, assorbi, motivo } of lista) {
    if (await fondi(tieni, assorbi, motivo)) fusi++;
  }
  const sc = await recalcAllScores();
  console.log(JSON.stringify({ fusi, ricalcolate: sc.agencies }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
