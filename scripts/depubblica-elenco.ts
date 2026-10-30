// Toglie dalla directory i professionisti elencati in data/fuori-tema-slug.txt
// (una riga per scheda, formato: slug|motivo; le righe con # si saltano). Non
// cancella: mette published a false e scrive il motivo in importNote. Uso:
//   tsx scripts/depubblica-elenco.ts [--file data/fuori-tema-slug.txt] [--dry]
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { recalcAllScores } from "../src/modules/ranking/score";
import { argomenti } from "./lib/siti";

const { opt, flag } = argomenti();
const DRY = flag("--dry");
const FILE = opt("--file", "data/fuori-tema-slug.txt");

async function main() {
  if (!fs.existsSync(FILE)) { console.log(`nessun file ${FILE}: una riga per scheda, slug|motivo`); return; }
  const righe = fs.readFileSync(FILE, "utf8").split("\n").map((r) => r.trim()).filter((r) => r && !r.startsWith("#"));
  let fatte = 0, giaFuori = 0, mancanti = 0;
  for (const r of righe) {
    const [slug, motivo] = r.split("|").map((x) => x.trim());
    const a = await db.agency.findUnique({ where: { slug }, select: { id: true, published: true, importNote: true } });
    if (!a) { mancanti++; if (DRY) console.log(`  slug non trovato: ${slug}`); continue; }
    if (!a.published) { giaFuori++; continue; }
    if (!DRY) await db.agency.update({ where: { id: a.id }, data: { published: false, importNote: [a.importNote, `non pubblicata: ${motivo || "fuori tema"}`].filter(Boolean).join(" · ") } });
    fatte++;
  }
  if (!DRY && fatte) await recalcAllScores();
  console.log(JSON.stringify({ elencate: righe.length, depubblicate: fatte, giaNonPubblicate: giaFuori, slugNonTrovati: mancanti, dry: DRY }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
