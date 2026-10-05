// Dataset di PROVA per verificare il motore pagine senza scraping: 50 professionisti
// dichiaratamente finti (source = "fixture", nomi "Professionista Demo NN", siti
// example.com) su Roma, Milano, Torino, con recensioni sintetiche.
//
//   npm run fixture         crea/aggiorna (deterministico, idempotente)
//   npm run fixture:clear   cancella tutto ciò che ha source = "fixture"

import { db } from "../src/lib/db";
import { rebuildLandingPages } from "../src/modules/directory/pages";
import { recalcAllScores } from "../src/modules/ranking/score";

const FIXTURE = "fixture";
const CITIES = ["roma", "milano", "torino"] as const;
const PER_CITY: Record<(typeof CITIES)[number], number> = { roma: 20, milano: 18, torino: 12 };
const SERVICES = ["idraulici", "elettricisti", "imbianchini", "fotografi", "commercialisti", "traslocatori"];
const TEAM = ["1-10", "11-50", "51-200", "200+"];

// PRNG deterministico: stessi dati a ogni esecuzione.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function clear() {
  const r = await db.agency.deleteMany({ where: { source: FIXTURE } });
  console.log(`fixture: cancellate ${r.count} professionisti (e a cascata recensioni/servizi)`);
}

async function seed() {
  const cities = await db.city.findMany({ where: { slug: { in: [...CITIES] } } });
  const services = await db.service.findMany({ where: { slug: { in: SERVICES } } });
  const cityBySlug = new Map(cities.map((c) => [c.slug, c]));
  const rand = rng(20260909);
  let n = 0;

  for (const citySlug of CITIES) {
    const city = cityBySlug.get(citySlug);
    if (!city) throw new Error(`città mancante: ${citySlug}`);
    for (let i = 0; i < PER_CITY[citySlug]; i++) {
      n++;
      const num = String(n).padStart(2, "0");
      const slug = `professionista-demo-${num}-${citySlug}`;
      const nServices = 2 + Math.floor(rand() * 2);
      const picked = [...services].sort(() => rand() - 0.5).slice(0, nServices);
      const reviewCount = Math.floor(rand() * 26); // 0..25
      const agency = await db.agency.upsert({
        where: { slug },
        create: {
          slug,
          name: `Professionista Demo ${num}`,
          website: `https://demo-${num}.example.com`,
          domain: `demo-${num}.example.com`,
          phone: `+39 06 ${String(1000000 + n).slice(0, 7)}`,
          cityId: city.id,
          description: `Dato di prova ${num}: professionista fittizio usato per verificare il motore delle pagine. Non esiste.`,
          teamSize: TEAM[Math.floor(rand() * TEAM.length)],
          minBudget: [50, 80, 150, 300][Math.floor(rand() * 4)],
          foundedYear: 2005 + Math.floor(rand() * 18),
          source: FIXTURE,
          sourceRef: `fixture-${num}`,
          published: true,
        },
        update: { cityId: city.id, published: true },
      });

      await db.agencyService.deleteMany({ where: { agencyId: agency.id } });
      await db.agencyService.createMany({
        data: picked.map((s, idx) => ({ agencyId: agency.id, serviceId: s.id, weight: 1 - idx * 0.1 })),
      });

      await db.review.deleteMany({ where: { agencyId: agency.id } });
      const reviews = Array.from({ length: reviewCount }, (_, k) => {
        const monthsAgo = Math.floor(rand() * 36);
        const d = new Date();
        d.setMonth(d.getMonth() - monthsAgo);
        return {
          agencyId: agency.id,
          author: `Cliente ${k + 1}`,
          rating: 3 + Math.floor(rand() * 3), // 3..5
          text: "Recensione di prova, generata per il dataset di test.",
          publishedAt: d,
          source: FIXTURE,
          sourceRef: `fixture-${num}-${k}`,
        };
      });
      if (reviews.length) await db.review.createMany({ data: reviews });
    }
  }
  console.log(`fixture: ${n} professionisti su ${CITIES.join(", ")}`);
}

async function main() {
  if (process.argv.includes("--clear")) {
    await clear();
  } else {
    await seed();
  }
  const s = await recalcAllScores();
  const p = await rebuildLandingPages();
  console.log(`score: ${s.agencies} professionisti | pagine: ${p.published}/${p.total} pubblicate`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
