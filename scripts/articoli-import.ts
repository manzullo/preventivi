// Importa gli articoli scritti in data/generati/articoli/*.json come pagine
// blog ([{slug, title, description?, body}], body in markdown). Controlla che
// gli shortcode ([professionisti servizio="idraulici" citta="roma"], vedi
// src/modules/content/blocks.tsx) puntino a categorie e città esistenti. Uso:
//   tsx scripts/articoli-import.ts [--dry] [--pubblica]
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { argomenti } from "./lib/siti";

const { flag } = argomenti();
const DRY = flag("--dry");
const PUBBLICA = flag("--pubblica");
const DIR = "data/generati/articoli";

type Articolo = { slug: string; title: string; description?: string; body: string };

async function main() {
  const servizi = new Set((await db.service.findMany({ select: { slug: true } })).map((s) => s.slug));
  const citta = new Set((await db.city.findMany({ select: { slug: true } })).map((c) => c.slug));

  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "dati.json") : [];
  if (!files.length) console.log(`nessun articolo in ${DIR}`);
  let scritti = 0, aggiornati = 0, articoli = 0;
  const problemi: string[] = [];
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")) as Articolo[];
    for (const a of rows) {
      articoli++;
      // Uno shortcode con slug sbagliato non stampa niente: meglio saperlo prima.
      for (const m of a.body.matchAll(/servizio="([^"]+)"/g)) if (!servizi.has(m[1])) problemi.push(`${a.slug}: categoria "${m[1]}" inesistente`);
      for (const m of a.body.matchAll(/citta="([^"]+)"/g)) if (!citta.has(m[1])) problemi.push(`${a.slug}: città "${m[1]}" inesistente`);
      if (DRY) continue;
      const esiste = await db.page.findUnique({ where: { slug: a.slug }, select: { id: true } });
      if (esiste) {
        await db.page.update({ where: { slug: a.slug }, data: { title: a.title, description: a.description ?? null, body: a.body, ...(PUBBLICA ? { published: true, publishedAt: new Date() } : {}) } });
        aggiornati++;
      } else {
        await db.page.create({ data: { slug: a.slug, kind: "blog", title: a.title, description: a.description ?? null, body: a.body, published: PUBBLICA, publishedAt: PUBBLICA ? new Date() : null } });
        scritti++;
      }
    }
  }
  console.log(JSON.stringify({ file: files.length, articoli, nuovi: scritti, aggiornati, problemi: problemi.slice(0, 10), totaleProblemi: problemi.length, dry: DRY }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
