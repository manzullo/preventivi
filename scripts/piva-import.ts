// Riporta nel database le partite IVA già lette dai siti: data/raw/contatti/
// (contatti.ts) e data/raw/sites/ (enrich-sites.ts), per le schede con un
// sito (pubblicate e bozze) che non ce l'hanno. Non tocca la rete. Uso:
//   tsx scripts/piva-import.ts [--dry]
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { argomenti, DIR_CONTATTI, schedeConSito, sitiLetti } from "./lib/siti";

const { flag } = argomenti();
const DRY = flag("--dry");

async function main() {
  const schede = await schedeConSito({ extra: { vatNumber: null } });
  const archivio = sitiLetti();
  let scritte = 0, senza = 0;
  for (const a of schede) {
    const f = `${DIR_CONTATTI}/${a.host}.json`;
    const daContatti = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as { piva?: string }).piva : undefined;
    const piva = (daContatti ?? archivio.get(a.host)?.piva ?? "").replace(/\D/g, "");
    if (piva.length !== 11) { senza++; continue; }
    if (DRY && scritte < 10) console.log(`  ${a.name} (${a.host}) → ${piva}`);
    if (!DRY) await db.agency.update({ where: { id: a.id }, data: { vatNumber: piva } });
    scritte++;
  }
  console.log(JSON.stringify({ schedeSenzaPiva: schede.length, partiteIvaScritte: scritte, senzaPivaNeiFile: senza, dry: DRY }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
