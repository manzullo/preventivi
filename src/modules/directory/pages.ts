// Materializzazione delle LandingPage. Un job conta i professionisti per ogni
// combinazione e decide cosa esiste: sotto PUBLISH_THRESHOLD la pagina non
// si pubblica. Sitemap e footer leggono da qui, i listing contano dal vivo.

import { db } from "@/lib/db";
import { pageMeta } from "./seo";
import { PUBLISH_THRESHOLD, paths } from "@/lib/site";
import { descriptions, titles } from "./seo";

type Upsert = {
  path: string;
  kind: string;
  serviceId?: string;
  cityId?: string;
  competitorId?: string;
  title: string;
  description: string;
  resultCount: number;
  published: boolean;
};

export async function rebuildLandingPages(): Promise<{
  total: number;
  published: number;
}> {
  const [services, cities, regions, competitors, agencies] = await Promise.all([
    db.service.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    db.city.findMany({
      select: { id: true, slug: true, name: true, isCapital: true, capitalSlug: true, regionId: true },
    }),
    db.region.findMany(),
    db.competitor.findMany(),
    db.agency.findMany({
      where: { published: true },
      select: { id: true, cityId: true, services: { select: { serviceId: true } } },
    }),
  ]);

  // Perimetro: l'id di ogni città + gli id dei comuni sotto un capoluogo.
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const capitalIdBySlug = new Map(cities.filter((c) => c.isCapital).map((c) => [c.slug, c.id]));

  // professionisti per "scope city id" (città propria + capoluogo di riferimento)
  const byScope = new Map<string, { total: number; byService: Map<string, number> }>();
  const byRegion = new Map<string, number>();
  const byService = new Map<string, number>();
  const bump = (scopeId: string, serviceIds: string[]) => {
    const s = byScope.get(scopeId) ?? { total: 0, byService: new Map() };
    s.total++;
    for (const sid of serviceIds) s.byService.set(sid, (s.byService.get(sid) ?? 0) + 1);
    byScope.set(scopeId, s);
  };

  for (const a of agencies) {
    const serviceIds = a.services.map((s) => s.serviceId);
    for (const sid of serviceIds) byService.set(sid, (byService.get(sid) ?? 0) + 1);
    if (!a.cityId) continue;
    const city = cityById.get(a.cityId);
    if (!city) continue;
    bump(city.id, serviceIds);
    if (!city.isCapital && city.capitalSlug) {
      const capId = capitalIdBySlug.get(city.capitalSlug);
      if (capId) bump(capId, serviceIds);
    }
    if (city.regionId) byRegion.set(city.regionId, (byRegion.get(city.regionId) ?? 0) + 1);
  }

  const rows: Upsert[] = [];

  for (const s of services) {
    const n = byService.get(s.id) ?? 0;
    rows.push({
      path: paths.service(s.slug),
      kind: "service",
      serviceId: s.id,
      title: titles.service(s.plural),
      description: descriptions.service(s.plural, n),
      resultCount: n,
      published: n >= PUBLISH_THRESHOLD,
    });
    rows.push({
      path: paths.comparison(s.slug),
      kind: "comparison",
      serviceId: s.id,
      title: titles.comparison(s.plural),
      description: descriptions.comparison(s.plural, n),
      resultCount: n,
      published: n >= PUBLISH_THRESHOLD,
    });
  }

  for (const [scopeId, agg] of byScope) {
    const city = cityById.get(scopeId);
    if (!city) continue;
    rows.push({
      path: paths.city(city.slug),
      kind: "city",
      cityId: city.id,
      title: titles.city(city.name),
      description: descriptions.city(city.name, agg.total),
      resultCount: agg.total,
      published: agg.total >= PUBLISH_THRESHOLD,
    });
    for (const s of services) {
      const n = agg.byService.get(s.id) ?? 0;
      if (n === 0) continue;
      rows.push({
        path: paths.serviceCity(s.slug, city.slug),
        kind: "service_city",
        serviceId: s.id,
        cityId: city.id,
        title: titles.serviceCity(s.plural, city.name),
        description: descriptions.serviceCity(s.plural, city.name, n),
        resultCount: n,
        published: n >= PUBLISH_THRESHOLD,
      });
    }
  }

  for (const r of regions) {
    const n = byRegion.get(r.id) ?? 0;
    rows.push({
      path: paths.region(r.slug),
      kind: "region",
      title: titles.region(r.name, n),
      description: descriptions.region(r.name, n),
      resultCount: n,
      published: n >= PUBLISH_THRESHOLD,
    });
  }

  for (const c of competitors) {
    rows.push({
      path: paths.alternative(c.slug),
      kind: "alternative",
      competitorId: c.id,
      title: titles.alternative(c.name),
      description: descriptions.alternative(c.name),
      resultCount: agencies.length,
      published: true,
    });
  }

  // Pagine non più calcolate (es. città rimasta senza professionisti) → spubblicate.
  const keep = new Set(rows.map((r) => r.path));
  await db.landingPage.updateMany({
    where: { path: { notIn: [...keep] }, published: true },
    data: { published: false, resultCount: 0 },
  });

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.$transaction(
      rows.slice(i, i + CHUNK).map((r) =>
        db.landingPage.upsert({
          where: { path: r.path },
          create: r,
          update: r,
        }),
      ),
    );
  }

  return { total: rows.length, published: rows.filter((r) => r.published).length };
}

export const landingPageSelect = {
  path: true,
  kind: true,
  title: true,
  resultCount: true,
  service: { select: { slug: true, name: true, plural: true } },
  city: { select: { slug: true, name: true } },
  competitor: { select: { slug: true, name: true } },
};

export async function publishedPages(where: {
  kind?: string;
  serviceId?: string;
  cityId?: string;
  cityIds?: string[];
  take?: number;
}) {
  return db.landingPage.findMany({
    where: {
      published: true,
      ...(where.kind ? { kind: where.kind } : {}),
      ...(where.serviceId ? { serviceId: where.serviceId } : {}),
      ...(where.cityId ? { cityId: where.cityId } : {}),
      ...(where.cityIds ? { cityId: { in: where.cityIds } } : {}),
    },
    select: landingPageSelect,
    orderBy: [{ resultCount: "desc" }, { path: "asc" }],
    take: where.take,
  });
}

/**
 * Quali di questi indirizzi esistono davvero.
 *
 * Le combinazioni sotto PUBLISH_THRESHOLD non vengono generate: linkarle manda
 * la gente su un 404 (22/09/2026: la scheda di un professionista di Frosinone puntava
 * a `/agenzie-seo/frosinone/`, che non esiste perché a Frosinone di professionisti SEO
 * pubblicate ce n'è una). La tabella LandingPage è l'elenco di ciò che esiste:
 * si chiede a lei prima di scrivere un link.
 */
export async function pagineEsistenti(percorsi: string[]): Promise<Set<string>> {
  const unici = [...new Set(percorsi)];
  if (unici.length === 0) return new Set();
  const righe = await db.landingPage.findMany({
    where: { published: true, path: { in: unici } },
    select: { path: true },
  });
  return new Set(righe.map((r) => r.path));
}

/** Override manuale di title/description di una LandingPage (admin "SEO pagine"). */
export async function landingMeta(path: string) {
  return db.landingPage.findUnique({ where: { path }, select: { metaTitle: true, metaDescription: true } });
}

/**
 * Testo scritto a mano per una pagina precisa, dal pannello "SEO pagine".
 * Serve dove il testo del servizio non basta: "ChatGPT Ads a Roma" merita un
 * paragrafo che parli di Roma, non lo stesso identico paragrafo di Milano.
 */
export async function landingIntro(path: string): Promise<string | null> {
  const r = await db.landingPage.findUnique({ where: { path }, select: { intro: true } });
  return r?.intro?.trim() || null;
}

export async function pageMetaWithOverride(o: { title: string; description: string; path: string; noindex?: boolean }) {
  const ov = await landingMeta(o.path);
  return pageMeta({ ...o, title: ov?.metaTitle?.trim() || o.title, description: ov?.metaDescription?.trim() || o.description });
}
