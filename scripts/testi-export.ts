// Prepara i lotti per la scrittura delle descrizioni dei professionisti: i dati
// veri della scheda più il testo grezzo della fonte come traccia. I lotti
// vanno in data/generati/input/, i testi scritti si riportano con
// testi-import.ts. Non scrive nel database. Uso:
//   tsx scripts/testi-export.ts [--city roma] [--size 40] [--limit 0]
//   tsx scripts/testi-export.ts --resto     tutte le città fuori dalle grandi
//   tsx scripts/testi-export.ts --bozze     le schede non ancora pubblicate
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { argomenti } from "./lib/siti";

const { opt, flag } = argomenti();
const CITY = opt("--city", "roma");
const SIZE = Number(opt("--size", "40"));
const LIMIT = Number(opt("--limit", "0"));
const RESTO = flag("--resto");
const BOZZE = flag("--bozze");
const GRANDI = ["roma", "milano", "torino", "napoli", "firenze", "bologna", "palermo"];

async function main() {
  const rows = await db.agency.findMany({
    where: BOZZE
      ? { description: null, published: false, optedOutAt: null }
      : { published: true, description: null, ...(RESTO ? { city: { slug: { notIn: GRANDI } } } : { city: { slug: CITY } }) },
    select: {
      slug: true, name: true, foundedYear: true, rating: true, reviewCount: true,
      skills: true, sourceDescription: true, website: true,
      city: { select: { name: true } },
      services: { select: { service: { select: { name: true, singular: true } } }, orderBy: { weight: "desc" }, take: 5 },
      externalRatings: true,
    },
    orderBy: [{ score: "desc" }, { reviewCount: "desc" }],
    take: LIMIT || undefined,
  });
  const items = rows.map((a) => ({
    slug: a.slug,
    nome: a.name,
    citta: a.city?.name ?? null,
    // Il mestiere al singolare ("idraulico") aiuta a scrivere frasi giuste.
    mestieri: a.services.map((s) => s.service.singular ?? s.service.name),
    servizi: a.services.map((s) => s.service.name),
    competenze: Array.isArray(a.skills) ? (a.skills as string[]).slice(0, 8) : [],
    anno: a.foundedYear,
    media: a.rating,
    recensioni: a.reviewCount,
    fonti: Array.isArray(a.externalRatings) ? (a.externalRatings as { source: string; rating: number; count: number }[]).map((e) => `${e.source} ${e.rating} su ${e.count}`) : [],
    sito: a.website,
    // Traccia dalla fonte: si usa per capire cosa fa, non si copia.
    tracciaFonte: (a.sourceDescription ?? "").replace(/\s+/g, " ").slice(0, 700) || null,
  }));
  fs.mkdirSync("data/generati/input", { recursive: true });
  let n = 0;
  for (let i = 0; i < items.length; i += SIZE) {
    n++;
    fs.writeFileSync(`data/generati/input/${BOZZE ? "bozze" : RESTO ? "resto" : CITY}-${String(n).padStart(2, "0")}.json`, JSON.stringify(items.slice(i, i + SIZE), null, 1));
  }
  console.log(JSON.stringify({ professionisti: items.length, lotti: n, cartella: "data/generati/input" }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
