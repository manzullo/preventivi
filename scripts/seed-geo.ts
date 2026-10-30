// Seed geografico da data/geo/*.json (export read-only del DB guidalocation).
// Idempotente: upsert per slug, non cancella nulla.
//
//   regions.json  { id, slug, name, order }
//   cities.json   { id, slug, name, province, latitude, longitude, order, region_id }
//   comuni.json   { id, slug, name, sigla, latitude, longitude, city_id, order }
//
// Le "cities" di guidalocation sono i capoluoghi (isCapital = true); i "comuni"
// sono gli altri comuni, agganciati al capoluogo via capitalSlug.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";

type Region = { id: string; slug: string; name: string; order: number | null };
type CityRow = {
  id: string;
  slug: string;
  name: string;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  order: number | null;
  region_id: string | null;
};
type ComuneRow = {
  id: string;
  slug: string;
  name: string;
  sigla: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  order: number | null;
};

const dir = join(process.cwd(), "data", "geo");
const load = <T>(name: string): T[] =>
  JSON.parse(readFileSync(join(dir, name), "utf8")) as T[];

async function main() {
  const regions = load<Region>("regions.json");
  const cities = load<CityRow>("cities.json");
  const comuni = load<ComuneRow>("comuni.json");

  // Regioni
  const regionIdBySource = new Map<string, string>();
  for (const r of regions) {
    const row = await db.region.upsert({
      where: { slug: r.slug },
      create: { slug: r.slug, name: r.name },
      update: { name: r.name },
    });
    regionIdBySource.set(r.id, row.id);
  }

  // Capoluoghi
  const capitalBySource = new Map<string, { slug: string; regionId?: string }>();
  const usedSlugs = new Set<string>();
  let capitals = 0;
  for (const c of cities) {
    const regionId = c.region_id ? regionIdBySource.get(c.region_id) : undefined;
    await db.city.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        province: c.province ?? "",
        lat: c.latitude,
        lng: c.longitude,
        isCapital: true,
        capitalSlug: c.slug,
        regionId,
      },
      update: {
        name: c.name,
        province: c.province ?? "",
        lat: c.latitude,
        lng: c.longitude,
        isCapital: true,
        capitalSlug: c.slug,
        regionId,
      },
    });
    capitalBySource.set(c.id, { slug: c.slug, regionId });
    usedSlugs.add(c.slug);
    capitals++;
  }

  // Comuni minori: ereditano regione e sigla dal capoluogo se mancano.
  const provinceByCapital = new Map(cities.map((c) => [c.slug, c.province ?? ""]));
  let minor = 0;
  let skipped = 0;
  for (const m of comuni) {
    if (usedSlugs.has(m.slug)) {
      skipped++; // lo slug è già un capoluogo: non si sovrascrive
      continue;
    }
    const cap = m.city_id ? capitalBySource.get(m.city_id) : undefined;
    const province = m.sigla ?? (cap ? provinceByCapital.get(cap.slug) ?? "" : "");
    await db.city.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        name: m.name,
        province,
        lat: m.latitude,
        lng: m.longitude,
        isCapital: false,
        capitalSlug: cap?.slug,
        regionId: cap?.regionId,
      },
      update: {
        name: m.name,
        province,
        lat: m.latitude,
        lng: m.longitude,
        capitalSlug: cap?.slug,
        regionId: cap?.regionId,
      },
    });
    usedSlugs.add(m.slug);
    minor++;
  }

  const total = await db.city.count();
  const withCoords = await db.city.count({ where: { lat: { not: null } } });
  console.log(
    `regioni ${regions.length} | capoluoghi ${capitals} | comuni ${minor} (saltati ${skipped}) | città totali ${total}, con coordinate ${withCoords}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
