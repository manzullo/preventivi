// Vocabolario delle competenze per categoria, preso dalle ricerche vere:
// ProntoPro ha una pagina per ogni lavoro specifico ("Roma Riparazione
// Caldaia", "Roma Sturare WC") e dalla pagina di una categoria linka quelle
// vicine. Si legge una pagina per categoria e si salva in data/competenze.json:
// { "idraulici": ["Riparazione caldaia", "Sturare WC", ...], ... }.
// Il file si rivede a mano: è la lista da cui scripts/competenze.ts sceglie.
//
//   tsx scripts/vocabolario-competenze.ts --confirm
//   tsx scripts/vocabolario-competenze.ts --service idraulici,fabbri --confirm
import fs from "node:fs";
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
import { db } from "../src/lib/db";
import { politeGet } from "../src/modules/ingest/http";
import { slugify } from "../src/modules/ingest/normalize";
import { ingestAllowed } from "../src/modules/ingest/types";

const FILE = "data/competenze.json";
const CITTA = "roma"; // la città più grande ha l'elenco più lungo
const args = process.argv.slice(2);
const opt = (k: string, d = "") => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
/** "Roma Sturare WC" → "Sturare WC" (maiuscola solo all'inizio, sigle intatte). */
const nome = (t: string) =>
  t
    .replace(/^roma\s+/i, "")
    .split(" ")
    .map((w, i) => (/^[A-Z]{2,4}$/.test(w) ? w : i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");

async function main() {
  ingestAllowed(args.includes("--confirm"));
  const filtro = opt("--service");
  const services = await db.service.findMany({
    where: { active: true, ...(filtro ? { slug: { in: filtro.split(",") } } : {}) },
    orderBy: { position: "asc" },
    select: { slug: true, name: true, queries: true },
  });
  const out: Record<string, string[]> = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
  for (const s of services) {
    // ProntoPro scrive la categoria al singolare ("roma-idraulico"): si prova
    // con le ricerche della categoria e poi con il nome.
    const prove = [...new Set([...((s.queries as string[]) ?? []), s.name].map(slugify))];
    let trovate: string[] = [];
    for (const p of prove) {
      try {
        const html = await politeGet(`https://www.prontopro.it/${CITTA}-${p}`, { minDelayMs: 3000 });
        const voci = [...html.matchAll(new RegExp(`<a[^>]+href="/?${CITTA}-[a-z0-9-]+"[^>]*>([\\s\\S]*?)</a>`, "g"))].map((m) => nome(decode(m[1])));
        trovate = [...new Set(voci.filter((v) => v.length >= 3 && v.length <= 50))];
        if (trovate.length) {
          console.log(`${s.slug}: ${trovate.length} voci da ${CITTA}-${p}`);
          break;
        }
      } catch (e) {
        if (!String(e).startsWith("Error: 404")) console.log(`${s.slug}: ${String(e).slice(0, 100)}`);
      }
    }
    if (!trovate.length) console.log(`${s.slug}: nessuna pagina ProntoPro`);
    else out[s.slug] = trovate;
    fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
  }
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
