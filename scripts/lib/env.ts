// Carica .env senza sovrascrivere l'ambiente, come in scripts/scrape.ts.
// Va importato per primo: INGEST_ENABLED, chiavi e token arrivano da qui.
import fs from "node:fs";

for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
