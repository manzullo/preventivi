// Scraper dei professionisti, senza servizi a pagamento. Una fonte, una città,
// una o più categorie: scarica, salva il grezzo in data/raw/{fonte}/, scarta
// i fuori tema e importa come bozze (published = false).
//
//   tsx scripts/scrape.ts --fonte osm  --city roma --service idraulici,elettricisti --confirm
//   tsx scripts/scrape.ts --fonte maps --city roma --service idraulici --max 40 --confirm
//   tsx scripts/scrape.ts --fonte sito:esempio --city milano --service all --confirm
//
// --service all       tutte le categorie attive
// --dry               scarica e mostra cosa importerebbe, senza scrivere nel DB
// --reuse             rilegge il grezzo già salvato invece di riscaricare
// --publish           pubblica subito (di norma no: prima si controlla)
// Serve INGEST_ENABLED=1 e --confirm, come per ogni ingest di rete.
//
// Fonti: "maps" (Google Maps con un browser vero, vedi src/modules/ingest/gmaps.ts),
// "osm" (OpenStreetMap, Overpass), "sito:{nome}" (directory con JSON-LD,
// configurata in data/siti/{nome}.json, vedi src/modules/ingest/sito.ts).
import fs from "node:fs";
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
import { db } from "../src/lib/db";
import { rebuildLandingPages } from "../src/modules/directory/pages";
import { launchBrowser, mapsToRecord, searchMaps, type MapsPlace } from "../src/modules/ingest/gmaps";
import { importRecords } from "../src/modules/ingest/import";
import { fetchOsm, OSM_TAGS } from "../src/modules/ingest/osm";
import { scrapeSite, type SiteConfig } from "../src/modules/ingest/sito";
import type { IngestRecord } from "../src/modules/ingest/types";
import { ingestAllowed } from "../src/modules/ingest/types";
import { recalcAllScores } from "../src/modules/ranking/score";

const args = process.argv.slice(2);
const opt = (k: string, d = "") => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k: string) => args.includes(k);
const FONTE = opt("--fonte");
const CITY = opt("--city");
const SERVICE = opt("--service", "all");
const MAX = Number(opt("--max", "60"));
const DRY = flag("--dry");
const REUSE = flag("--reuse");

async function main() {
  if (!FONTE || !CITY) throw new Error("servono --fonte (maps | osm | sito:nome) e --city");
  ingestAllowed(flag("--confirm"));
  const city = await db.city.findUnique({ where: { slug: CITY } });
  if (!city) throw new Error(`città ${CITY} non trovata`);
  const services = await db.service.findMany({
    where: { active: true, ...(SERVICE === "all" ? {} : { slug: { in: SERVICE.split(",") } }) },
    orderBy: { position: "asc" },
    select: { slug: true, name: true, queries: true, googleMatch: true },
  });
  if (!services.length) throw new Error(`nessuna categoria per --service ${SERVICE}`);

  const nomeFonte = FONTE.replace(/^sito:/, "");
  const dir = `data/raw/${nomeFonte}`;
  fs.mkdirSync(dir, { recursive: true });
  const site: SiteConfig | null = FONTE.startsWith("sito:") ? JSON.parse(fs.readFileSync(`data/siti/${nomeFonte}.json`, "utf8")) : null;
  const browser = FONTE === "maps" && !REUSE ? await launchBrowser() : null;

  const tutti: IngestRecord[] = [];
  let fuoriTema = 0;
  const falliti: string[] = [];
  try {
    for (const s of services) {
      const file = `${dir}/${city.slug}-${s.slug}.json`;
      let records: IngestRecord[];
      try {
        if (REUSE && fs.existsSync(file)) {
          records = JSON.parse(fs.readFileSync(file, "utf8"));
        } else if (FONTE === "osm") {
          if (!OSM_TAGS[s.slug]) { console.log(`${s.slug}: nessun tag OSM, salto`); continue; }
          const r = await fetchOsm({ serviceSlug: s.slug, citySlug: city.slug, cityName: city.name });
          records = r.records;
          fs.writeFileSync(file, JSON.stringify(records));
        } else if (FONTE === "maps") {
          const query = `${((s.queries as string[]) ?? [s.name])[0]} ${city.name}`;
          const places: MapsPlace[] = await searchMaps(browser!, query, { max: MAX, log: console.log });
          records = places.map((p) => mapsToRecord(p, s.slug, city.slug));
          fs.writeFileSync(file, JSON.stringify(records));
        } else if (site) {
          records = await scrapeSite(site, { serviceSlug: s.slug, citySlug: city.slug, limit: MAX, log: console.log });
          fs.writeFileSync(file, JSON.stringify(records));
        } else throw new Error(`fonte sconosciuta: ${FONTE}`);
      } catch (e) {
        // Una categoria che fallisce (Overpass 504, pagina che non carica)
        // non deve far perdere le altre: si segnala e si va avanti.
        if (String(e).includes("fonte sconosciuta")) throw e;
        console.log(`${s.slug}: ERRORE, salto (${String(e).slice(0, 120)})`);
        falliti.push(s.slug);
        continue;
      }

      // Fuori tema: chi cerca "idraulico" su Maps trova anche ferramenta e negozi.
      const match = s.googleMatch ? new RegExp(s.googleMatch, "i") : null;
      const buoni = records.filter((r) => !match || !r.categories?.length || match.test(r.categories.join(" ")));
      fuoriTema += records.length - buoni.length;
      console.log(`${s.slug}: ${records.length} trovati, ${buoni.length} dopo il filtro categoria`);
      tutti.push(...buoni);
    }
  } finally {
    await browser?.close();
  }

  const stats = await importRecords(tutti, { dryRun: DRY, publish: flag("--publish"), log: DRY ? (l) => console.log("  " + l) : undefined });
  console.log(`${DRY ? "[dry] " : ""}record ${stats.total} · nuovi ${stats.created} · aggiornati ${stats.updated} · saltati ${stats.skipped} · fuori tema ${fuoriTema} · città non risolte ${stats.unresolvedCity}`);
  if (falliti.length) console.log(`categorie fallite (rilanciare con --reuse): ${falliti.join(",")}`);
  if (!DRY && stats.created + stats.updated > 0) {
    await recalcAllScores();
    const p = await rebuildLandingPages();
    console.log(`pagine ${p.published}/${p.total}`);
  }
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
