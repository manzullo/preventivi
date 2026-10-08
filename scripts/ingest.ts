// CLI ingest. Esempi:
//   npm run ingest -- --source=fixture --dry-run
//   npm run ingest -- --source=csv --file=data/agenzie.csv --dry-run
//   INGEST_ENABLED=1 npm run ingest -- --source=apify --service=agenzie-seo --city=roma --limit=20 --confirm
// Senza --dry-run i record entrano nel DB come NON pubblicati (--publish per pubblicarli).

import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { GooglePlacesApify, mapApifyItem } from "../src/modules/ingest/apify";
import { csvToRecords } from "../src/modules/ingest/csv";
import { importRecords } from "../src/modules/ingest/import";
import type { IngestRecord } from "../src/modules/ingest/types";
import { rebuildLandingPages } from "../src/modules/directory/pages";
import { recalcAllScores } from "../src/modules/ranking/score";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const flag = (k: string) => process.argv.includes(`--${k}`);

async function main() {
  const source = arg("source") ?? "fixture";
  const dryRun = flag("dry-run");
  let records: IngestRecord[] = [];
  if (source === "fixture") {
    const items = JSON.parse(readFileSync("tests/fixtures/apify-sample.json", "utf8")) as Parameters<typeof mapApifyItem>[0][];
    records = items.map((it) => mapApifyItem(it, arg("service") ?? "agenzie-seo", arg("city") ?? "roma")).filter((x): x is IngestRecord => Boolean(x));
  } else if (source === "csv") {
    const file = arg("file");
    if (!file) throw new Error("--file mancante");
    records = csvToRecords(readFileSync(file, "utf8"));
  } else if (source === "apify") {
    const src = new GooglePlacesApify(flag("confirm"));
    records = await src.fetch({ serviceSlug: arg("service") ?? "agenzie-seo", citySlug: arg("city") ?? "roma", limit: Number(arg("limit") ?? 20) });
  } else throw new Error(`sorgente sconosciuta: ${source}`);

  const stats = await importRecords(records, { dryRun, publish: flag("publish"), log: (l) => console.log("  " + l) });
  console.log(`${dryRun ? "[dry-run] " : ""}record ${stats.total} · creati ${stats.created} · aggiornati ${stats.updated} · saltati ${stats.skipped} · recensioni ${stats.reviews} · città non risolte ${stats.unresolvedCity}`);
  if (!dryRun && stats.created + stats.updated > 0) {
    await recalcAllScores();
    const p = await rebuildLandingPages();
    console.log(`score ricalcolato · pagine ${p.published}/${p.total}`);
  }
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
