// Risoluzione degli slug, come routes/uno.tsx e due.tsx di guidalocation.
//
// Un segmento, in ordine:
//   1. prefisso "migliori-"      -> classifica nazionale del servizio
//   2. prefisso "alternative-a-" -> pagina concorrente
//   3. Service                   -> hub servizio
//   3b. ServiceAlias pubblicato  -> pagina dell'alias; se spento, 301 al servizio
//   4. City                      -> hub città
//   5. Region                    -> hub regione
//   6. Page pubblicata           -> pagina statica
//   7. Redirect                  -> 301 / 410
//   8. niente                    -> 404
// Gli slug di Service/City/Region sono globalmente unici (verificato al seed).
//
// Due segmenti: /{servizio}/{città}/ soltanto.

import { db } from "@/lib/db";
import { ALTERNATIVE_PREFIX, COMPARISON_PREFIX, RESERVED_SLUGS, paths } from "@/lib/site";
import type { City, Competitor, Page, Region, Service, ServiceAlias } from "@/generated/prisma";

export type RedirectHit = { kind: "redirect"; to: string | null; status: number };

export type OneResult =
  | { kind: "service"; service: Service }
  | { kind: "alias"; alias: ServiceAlias; service: Service }
  | { kind: "city"; city: City & { region: Region | null } }
  | { kind: "region"; region: Region }
  | { kind: "comparison"; service: Service }
  | { kind: "alternative"; competitor: Competitor }
  | { kind: "page"; page: Page }
  | RedirectHit
  | null;

export type TwoResult =
  | { kind: "service_city"; service: Service; city: City & { region: Region | null } }
  | { kind: "alias_city"; alias: ServiceAlias; service: Service; city: City & { region: Region | null } }
  | RedirectHit
  | null;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s) && s.length <= 120;
}

export async function findRedirect(path: string): Promise<RedirectHit | null> {
  const r = await db.redirect.findUnique({ where: { fromPath: path } });
  return r ? { kind: "redirect", to: r.toPath, status: r.status } : null;
}

export async function resolveOne(slug: string): Promise<OneResult> {
  if (!isValidSlug(slug) || RESERVED_SLUGS.has(slug)) return null;

  if (slug.startsWith(COMPARISON_PREFIX)) {
    const service = await db.service.findUnique({
      where: { slug: slug.slice(COMPARISON_PREFIX.length) },
    });
    if (service?.active) return { kind: "comparison", service };
  }

  if (slug.startsWith(ALTERNATIVE_PREFIX)) {
    const competitor = await db.competitor.findUnique({
      where: { slug: slug.slice(ALTERNATIVE_PREFIX.length) },
    });
    if (competitor) return { kind: "alternative", competitor };
  }

  const service = await db.service.findUnique({ where: { slug } });
  if (service?.active) return { kind: "service", service };

  // Un altro modo di chiamare lo stesso servizio: pagina sua se ha un testo
  // proprio, altrimenti si rimanda al servizio invece di mostrare un doppione.
  const alias = await db.serviceAlias.findUnique({ where: { slug }, include: { service: true } });
  if (alias?.service.active) {
    if (alias.published && alias.intro) return { kind: "alias", alias, service: alias.service };
    return { kind: "redirect", to: paths.service(alias.service.slug), status: 301 };
  }

  const city = await db.city.findUnique({ where: { slug }, include: { region: true } });
  if (city) return { kind: "city", city };

  const region = await db.region.findUnique({ where: { slug } });
  if (region) return { kind: "region", region };

  const page = await db.page.findUnique({ where: { slug } });
  if (page?.published && page.kind !== "blog") return { kind: "page", page };

  return findRedirect(`/${slug}/`);
}

export async function resolveTwo(uno: string, due: string): Promise<TwoResult> {
  if (!isValidSlug(uno) || !isValidSlug(due)) return null;
  if (RESERVED_SLUGS.has(uno)) return null;

  const [service, city] = await Promise.all([
    db.service.findUnique({ where: { slug: uno } }),
    db.city.findUnique({ where: { slug: due }, include: { region: true } }),
  ]);
  if (service?.active && city) return { kind: "service_city", service, city };

  // "Pubblicità su ChatGPT a Roma": lo stesso incrocio del servizio, chiamato
  // con le parole della gente. Vale solo per i modi di dire che hanno una
  // pagina propria; gli altri rimandano all'incrocio del servizio.
  if (city) {
    const alias = await db.serviceAlias.findUnique({ where: { slug: uno }, include: { service: true } });
    if (alias?.service.active) {
      if (alias.published && alias.intro) return { kind: "alias_city", alias, service: alias.service, city };
      return { kind: "redirect", to: paths.serviceCity(alias.service.slug, city.slug), status: 301 };
    }
  }

  return findRedirect(`/${uno}/${due}/`);
}
