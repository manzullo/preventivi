// Sitemap partizionata a SITEMAP_CHUNK URL per file (/sitemap/N.xml), con
// indice in /sitemap-index.xml. Le URL vengono dalle LandingPage pubblicate e
// dai professionisti pubblicati: mai una pagina che risponde 404.

import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITEMAP_CHUNK, absoluteUrl, paths } from "@/lib/site";
import { competenze, coppieCompetenzaCitta } from "@/modules/directory/skills";

export const revalidate = 3600;

const STATIC = [paths.home(), paths.methodology(), "/cerca/", "/per-agenzie/", "/chi-siamo/", "/rivendica/", "/recensioni/", "/mappa/", "/competenze/"];

/** Statiche + pagine CMS pubblicate (statiche a /slug/, blog a /blog/slug/). */
async function staticUrls(): Promise<{ url: string; lastModified?: Date }[]> {
  const cms = await db.page.findMany({ where: { published: true }, select: { slug: true, kind: true, updatedAt: true }, orderBy: { slug: "asc" } });
  // Una pagina per competenza: sono elenchi veri, non pagine vuote.
  const skills = await competenze();
  // E l'incrocio con la città dove ha abbastanza professionisti da reggersi in piedi.
  // Sotto soglia la pagina esiste lo stesso ma si dichiara noindex, quindi qui
  // non ci deve entrare: segnalarla sarebbe un invito a scartarla.
  const skillCitta = (await coppieCompetenzaCitta()).map((x) => `/competenze/${x.skill}/${x.citta}/`);
  // Gli altri modi di chiamare un servizio, quelli che hanno un testo proprio.
  const alias = await db.serviceAlias.findMany({
    where: { published: true, intro: { not: null }, service: { active: true } },
    select: { slug: true, updatedAt: true, serviceId: true },
  });
  const aliasCitta = alias.length
    ? await db.landingPage.findMany({
        where: { kind: "service_city", published: true, serviceId: { in: alias.map((a) => a.serviceId) } },
        select: { serviceId: true, city: { select: { slug: true } }, updatedAt: true },
      })
    : [];
  const hasBlog = cms.some((p) => p.kind === "blog");
  return [
    ...STATIC.map((url) => ({ url })),
    ...skills.map((c) => ({ url: `/competenze/${c.slug}/` })),
    ...skillCitta.map((url) => ({ url })),
    ...alias.map((a) => ({ url: `/${a.slug}/`, lastModified: a.updatedAt })),
    ...aliasCitta.flatMap((p) =>
      alias
        .filter((a) => a.serviceId === p.serviceId && p.city)
        .map((a) => ({ url: `/${a.slug}/${p.city!.slug}/`, lastModified: p.updatedAt })),
    ),
    ...(hasBlog ? [{ url: "/blog/" }] : []),
    ...cms.map((p) => ({ url: p.kind === "blog" ? `/blog/${p.slug}/` : `/${p.slug}/`, lastModified: p.updatedAt })),
  ];
}

export async function sitemapChunkCount(): Promise<number> {
  const [statics, pages, agencies] = await Promise.all([
    staticUrls(),
    db.landingPage.count({ where: { published: true } }),
    db.agency.count({ where: { published: true } }),
  ]);
  return Math.max(1, Math.ceil((statics.length + pages + agencies) / SITEMAP_CHUNK));
}

export async function generateSitemaps() {
  const n = await sitemapChunkCount();
  return Array.from({ length: n }, (_, id) => ({ id }));
}

export default async function sitemap(props: { id: Promise<string> | string }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id) || 0;
  const start = id * SITEMAP_CHUNK;
  const end = start + SITEMAP_CHUNK;
  const out: MetadataRoute.Sitemap = [];
  const statics = await staticUrls();

  // Sezione 1: statiche e pagine CMS
  for (let i = start; i < Math.min(end, statics.length); i++) {
    out.push({ url: absoluteUrl(statics[i].url), lastModified: statics[i].lastModified, changeFrequency: "weekly", priority: i === 0 ? 1 : 0.6 });
  }

  // Sezione 2: landing page pubblicate
  const pagesTotal = await db.landingPage.count({ where: { published: true } });
  const pStart = Math.max(0, start - statics.length);
  const pEnd = Math.max(0, end - statics.length);
  if (pStart < pagesTotal && pEnd > 0) {
    const rows = await db.landingPage.findMany({
      where: { published: true },
      select: { path: true, updatedAt: true, kind: true },
      orderBy: { path: "asc" },
      skip: pStart,
      take: pEnd - pStart,
    });
    for (const r of rows) {
      out.push({
        url: absoluteUrl(r.path),
        lastModified: r.updatedAt,
        changeFrequency: "weekly",
        priority: r.kind === "service_city" ? 0.8 : 0.7,
      });
    }
  }

  // Sezione 3: professionisti pubblicati
  const aStart = Math.max(0, start - statics.length - pagesTotal);
  const aEnd = Math.max(0, end - statics.length - pagesTotal);
  if (aEnd > 0) {
    const rows = await db.agency.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true, reviewCount: true },
      orderBy: { slug: "asc" },
      skip: aStart,
      take: aEnd - aStart,
    });
    for (const r of rows) {
      out.push({
        url: absoluteUrl(paths.agency(r.slug)),
        lastModified: r.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      });
      // Le recensioni della singolo professionista hanno pagina propria solo se ce ne
      // sono: una URL in più per scheda, il file resta molto sotto le 50.000.
      if (r.reviewCount > 0) {
        out.push({
          url: absoluteUrl(`${paths.agency(r.slug)}recensioni/`),
          lastModified: r.updatedAt,
          changeFrequency: "monthly",
          priority: 0.4,
        });
      }
    }
  }

  return out;
}
