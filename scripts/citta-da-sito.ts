// Schede senza città (pubblicate o in bozza, con un sito): si prova a dedurla
// dall'archivio dei siti letti da enrich-sites (data/raw/sites/: indirizzo,
// titolo, descrizione e testo della home) cercando il nome di un comune
// italiano. Vince il comune citato più volte; a parità, quello con più
// abitanti. Non tocca la rete. Uso:
//   tsx scripts/citta-da-sito.ts [--dry]
import "./lib/env";
import { db } from "../src/lib/db";
import { argomenti, schedeConSito, sitiLetti } from "./lib/siti";

const { flag } = argomenti();
const DRY = flag("--dry");

const pulisci = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function main() {
  const senza = await schedeConSito({ extra: { cityId: null } });
  const strade = new Map((await db.agency.findMany({ where: { id: { in: senza.map((s) => s.id) } }, select: { id: true, street: true } })).map((x) => [x.id, x.street]));
  const citta = await db.city.findMany({ select: { id: true, name: true, population: true, isCapital: true } });
  // Nomi di comune che sono anche parole comuni: senza filtro "Candida" o "Sale"
  // trasformerebbero qualsiasi testo in una sede.
  const AMBIGUI = new Set(["candida", "sale", "pace", "riva", "rocca", "torre", "bagno", "villa", "monte", "campo", "porto", "prato", "certosa", "quinto", "sesto", "sala", "corte", "chiesa", "casale", "forte", "premio", "sereno", "salice", "vittoria", "rossa", "bianco", "media", "centro", "castello", "fiume", "isola", "lago", "marina", "piano", "ponte", "roccia", "valle", "grande", "nuova", "santo", "santa", "pietra", "calcio", "carbone", "cento"]);
  // Solo comuni con nome abbastanza lungo: "Ala" o "Ne" darebbero falsi positivi.
  const elenco = citta.filter((c) => c.name.length >= 5 && !AMBIGUI.has(pulisci(c.name))).map((c) => ({ ...c, ago: pulisci(c.name) }));
  const archivio = sitiLetti();

  let risolte = 0, senzaFonte = 0, nessuno = 0;
  for (const a of senza) {
    const j = archivio.get(a.host);
    const testo = pulisci([strade.get(a.id), j?.address, j?.title, j?.description, j?.textSample].filter(Boolean).join(" "));
    if (!j || !testo) { senzaFonte++; continue; }
    const punteggi = elenco
      .map((c) => ({ c, n: (testo.match(new RegExp(`(^|[^a-z0-9])${c.ago.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "g")) ?? []).length }))
      // Una citazione sola non basta: può essere un cliente o un cantiere altrove.
      .filter((x) => x.n >= 2 || (x.c.isCapital && x.n >= 1))
      .sort((x, y) => y.n - x.n || (y.c.population ?? 0) - (x.c.population ?? 0));
    if (!punteggi.length) { nessuno++; continue; }
    if (DRY && risolte < 12) console.log(`  ${a.name} (${a.host}) → ${punteggi[0].c.name} (${punteggi[0].n} citazioni)`);
    if (!DRY) await db.agency.update({ where: { id: a.id }, data: { cityId: punteggi[0].c.id, importNote: `città dedotta dal sito: ${punteggi[0].c.name}` } });
    risolte++;
  }
  console.log(JSON.stringify({ senzaCitta: senza.length, risolte, nessunComuneCitato: nessuno, senzaDatiDelSito: senzaFonte, dry: DRY }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
