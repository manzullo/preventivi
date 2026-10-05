// Importa le descrizioni scritte (data/generati/testi/*.json: [{slug, testo}])
// nel campo description dei professionisti che non ce l'hanno. Rifiuta testi
// troppo corti o che ricalcano la fonte. Prova a vuoto se manca --confirm. Uso:
//   tsx scripts/testi-import.ts [--dry] --confirm
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { argomenti } from "./lib/siti";

const { flag } = argomenti();
const DRY = flag("--dry") || !flag("--confirm");
const DIR = "data/generati/testi";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Quanto il testo nuovo ricalca quello della fonte (0-1) sulle sequenze di 6 parole. */
function sovrapposizione(nuovo: string, fonte: string): number {
  const a = norm(nuovo).split(" ");
  const b = new Set<string>();
  const bw = norm(fonte).split(" ");
  for (let i = 0; i + 6 <= bw.length; i++) b.add(bw.slice(i, i + 6).join(" "));
  if (!b.size || a.length < 6) return 0;
  let hit = 0, tot = 0;
  for (let i = 0; i + 6 <= a.length; i++) { tot++; if (b.has(a.slice(i, i + 6).join(" "))) hit++; }
  return tot ? hit / tot : 0;
}

async function main() {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];
  if (!files.length) console.log(`nessun file in ${DIR}`);
  let scritti = 0, saltati = 0, copiati = 0, corti = 0, assenti = 0;
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")) as { slug: string; testo: string }[];
    for (const r of rows) {
      const testo = (r.testo ?? "").trim();
      if (testo.split(/\s+/).length < 35) { corti++; continue; }
      const a = await db.agency.findUnique({ where: { slug: r.slug }, select: { id: true, sourceDescription: true, description: true } });
      if (!a) { assenti++; continue; }
      if (a.description) { saltati++; continue; }
      if (a.sourceDescription && sovrapposizione(testo, a.sourceDescription) > 0.25) { copiati++; continue; }
      if (!DRY) await db.agency.update({ where: { id: a.id }, data: { description: testo } });
      scritti++;
    }
  }
  console.log(JSON.stringify({ file: files.length, scritti, giaPresenti: saltati, scartatiPerCopia: copiati, scartatiPerLunghezza: corti, slugSconosciuti: assenti, dry: DRY }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
