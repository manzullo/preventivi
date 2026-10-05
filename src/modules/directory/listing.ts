// Query dei listing: professionisti pubblicati filtrate per servizio e città.
// L'ordine è il punteggio delle recensioni, che nessun pagamento tocca. Davanti
// all'elenco c'è una corsia a parte: le schede con priorità maggiore di zero,
// valida ovunque (Agency.priority) o su una singola pagina (Placement). Più il
// numero è alto più si sta in alto, e a parità di numero contano le recensioni.
// Le schede in quella corsia portano un'etichetta che lo dichiara.
// Una città capoluogo include i comuni della sua provincia (capitalSlug), come
// la zona di guidalocation include le location taggate.

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/site";

export const agencyCardSelect = {
  id: true,
  slug: true,
  name: true,
  website: true,
  rating: true,
  reviewCount: true,
  score: true,
  minBudget: true,
  teamSize: true,
  description: true,
  updatedAt: true,
  lat: true,
  lng: true,
  skills: true,
  foundedYear: true,
  verified: true,
  claimed: true,
  logoUrl: true,
  priority: true,
  city: { select: { slug: true, name: true } },
  services: {
    select: { service: { select: { slug: true, name: true } } },
    orderBy: { weight: "desc" as const },
    take: 4,
  },
} satisfies Prisma.AgencySelect;

export type AgencyCardData = Prisma.AgencyGetPayload<{ select: typeof agencyCardSelect }>;

export type CityLike = { id: string; slug: string; isCapital: boolean };

/** Id delle città che rientrano nel perimetro di `city`. */
export async function cityScopeIds(city: CityLike): Promise<string[]> {
  if (!city.isCapital) return [city.id];
  const rows = await db.city.findMany({
    where: { OR: [{ id: city.id }, { capitalSlug: city.slug }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type ListingFilters = {
  minReviews?: number;
  team?: string;
  minRating?: number;
  budget?: string;
  verified?: boolean;
};

export const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;
export const MIN_REVIEWS_OPTIONS = [5, 10, 25] as const;
export const RATING_OPTIONS = [4, 4.5, 4.8] as const;

/** Fasce di spesa minima dichiarata dai professionisti, in euro. */
export const BUDGET_RANGES = [
  { key: "fino-1000", label: "fino a 1.000 €", max: 1000 },
  { key: "1000-5000", label: "1.000 - 5.000 €", min: 1000, max: 5000 },
  { key: "oltre-5000", label: "oltre 5.000 €", min: 5000 },
] as const;

export function parseFilters(sp: Record<string, string | string[] | undefined>): ListingFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const minRaw = Number(first(sp.recensioni));
  const team = first(sp.team);
  const votoRaw = Number(first(sp.voto));
  const budget = first(sp.budget);
  return {
    minReviews: MIN_REVIEWS_OPTIONS.includes(minRaw as (typeof MIN_REVIEWS_OPTIONS)[number])
      ? minRaw
      : undefined,
    team: team && (TEAM_SIZES as readonly string[]).includes(team) ? team : undefined,
    minRating: RATING_OPTIONS.includes(votoRaw as (typeof RATING_OPTIONS)[number]) ? votoRaw : undefined,
    budget: budget && BUDGET_RANGES.some((b) => b.key === budget) ? budget : undefined,
    verified: first(sp.verificate) === "1" ? true : undefined,
  };
}

export function parsePage(sp: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

export function agencyWhere(opts: {
  serviceSlug?: string;
  cityIds?: string[];
  regionId?: string;
  filters?: ListingFilters;
}): Prisma.AgencyWhereInput {
  const { serviceSlug, cityIds, regionId, filters } = opts;
  return {
    published: true,
    ...(serviceSlug ? { services: { some: { service: { slug: serviceSlug } } } } : {}),
    ...(cityIds ? { cityId: { in: cityIds } } : {}),
    ...(regionId ? { city: { regionId } } : {}),
    ...(filters?.minReviews ? { reviewCount: { gte: filters.minReviews } } : {}),
    ...(filters?.team ? { teamSize: filters.team } : {}),
    ...(filters?.minRating ? { rating: { gte: filters.minRating } } : {}),
    ...(filters?.verified ? { verified: true } : {}),
    ...(() => {
      const b = BUDGET_RANGES.find((x) => x.key === filters?.budget);
      if (!b) return {};
      const min = "min" in b ? b.min : undefined;
      const max = "max" in b ? b.max : undefined;
      return { minBudget: { ...(min ? { gte: min } : {}), ...(max ? { lt: max } : {}) } };
    })(),
  };
}

export const agencyOrder: Prisma.AgencyOrderByWithRelationInput[] = [
  // Prima la priorità dal numero più alto, che è zero per quasi tutte, poi il
  // merito delle recensioni. A parità di numero decide di nuovo il punteggio.
  { priority: "desc" },
  { score: "desc" },
  { reviewCount: "desc" },
  { name: "asc" },
];

/** Scheda con l'etichetta da mostrare quando la posizione è decisa da noi. */
export type AgencyCardConEvidenza = AgencyCardData & { evidenza?: string | null };

/**
 * Posizioni comprate o decise per una pagina precisa, valide adesso.
 * Ordine di specificità: prima servizio + città, poi solo città, poi solo
 * servizio, infine quelle che valgono ovunque.
 */
export async function placementsAttivi(opts: { serviceSlug?: string; cityIds?: string[] }): Promise<{ agencyId: string; priority: number; label: string | null }[]> {
  const adesso = new Date();
  const righe = await db.placement.findMany({
    where: {
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: adesso } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: adesso } }] },
        { OR: [{ serviceId: null }, ...(opts.serviceSlug ? [{ service: { slug: opts.serviceSlug } }] : [])] },
        { OR: [{ cityId: null }, ...(opts.cityIds?.length ? [{ cityId: { in: opts.cityIds } }] : [])] },
      ],
      agency: { published: true },
      priority: { gt: 0 },
    },
    select: { agencyId: true, priority: true, label: true, serviceId: true, cityId: true },
    orderBy: { priority: "desc" },
  });
  // Una riga che nomina servizio e città batte quella che ne nomina uno solo,
  // che a sua volta batte quella valida ovunque: la più mirata vince.
  const specificita = (r: { serviceId: string | null; cityId: string | null }) => (r.serviceId ? 2 : 0) + (r.cityId ? 1 : 0);
  const migliore = new Map<string, { agencyId: string; priority: number; label: string | null; peso: number }>();
  for (const r of righe) {
    const attuale = migliore.get(r.agencyId);
    const peso = specificita(r);
    if (!attuale || peso > attuale.peso) migliore.set(r.agencyId, { agencyId: r.agencyId, priority: r.priority, label: r.label, peso });
  }
  return [...migliore.values()].sort((a, b) => b.priority - a.priority || b.peso - a.peso);
}

/**
 * Quanti professionisti resterebbero scegliendo ciascuna opzione, tenendo fermi gli
 * altri filtri già attivi. Serve a mostrare il numero accanto a ogni pillola e
 * a nascondere le scelte che non porterebbero da nessuna parte.
 */
export type ConteggiFiltri = {
  recensioni: Record<number, number>;
  team: Record<string, number>;
  voto: Record<number, number>;
  budget: Record<string, number>;
  verificate: number;
};

export async function contaFiltri(opts: {
  serviceSlug?: string;
  cityIds?: string[];
  regionId?: string;
  filters?: ListingFilters;
}): Promise<ConteggiFiltri> {
  const base = { serviceSlug: opts.serviceSlug, cityIds: opts.cityIds, regionId: opts.regionId };
  const f = opts.filters ?? {};
  const conta = (extra: ListingFilters) => db.agency.count({ where: agencyWhere({ ...base, filters: { ...f, ...extra } }) });

  const [recensioni, team, voto, budget, verificate] = await Promise.all([
    Promise.all(MIN_REVIEWS_OPTIONS.map((n) => conta({ minReviews: n }))),
    Promise.all(TEAM_SIZES.map((x) => conta({ team: x }))),
    Promise.all(RATING_OPTIONS.map((v) => conta({ minRating: v }))),
    Promise.all(BUDGET_RANGES.map((b) => conta({ budget: b.key }))),
    conta({ verified: true }),
  ]);

  return {
    recensioni: Object.fromEntries(MIN_REVIEWS_OPTIONS.map((n, i) => [n, recensioni[i]])),
    team: Object.fromEntries(TEAM_SIZES.map((x, i) => [x, team[i]])),
    voto: Object.fromEntries(RATING_OPTIONS.map((v, i) => [v, voto[i]])),
    budget: Object.fromEntries(BUDGET_RANGES.map((b, i) => [b.key, budget[i]])),
    verificate,
  };
}

export async function listAgencies(opts: {
  serviceSlug?: string;
  cityIds?: string[];
  regionId?: string;
  filters?: ListingFilters;
  page?: number;
  pageSize?: number;
}): Promise<{ items: AgencyCardConEvidenza[]; total: number; page: number; pageCount: number }> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const where = agencyWhere(opts);
  const total = await db.agency.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);

  // Le posizioni decise a mano stanno solo sulla prima pagina: più in là
  // sarebbero invisibili e sballerebbero il conteggio.
  const messi = page === 1 && !opts.filters?.minReviews && !opts.filters?.team
    ? await placementsAttivi({ serviceSlug: opts.serviceSlug, cityIds: opts.cityIds })
    : [];

  const inCima: AgencyCardConEvidenza[] = [];
  if (messi.length) {
    const schede = await db.agency.findMany({
      where: { ...where, id: { in: messi.map((m) => m.agencyId) } },
      select: agencyCardSelect,
    });
    const perId = new Map(schede.map((s) => [s.id, s]));
    for (const m of messi) {
      const s = perId.get(m.agencyId);
      if (s) inCima.push({ ...s, evidenza: m.label?.trim() || "In evidenza" });
    }
    // A parità di priorità vince chi ha il punteggio più alto: anche dentro la
    // corsia a pagamento l'ordine lo fanno le recensioni.
    const prio = new Map(messi.map((m) => [m.agencyId, m.priority]));
    inCima.sort((a, b) => (prio.get(b.id) ?? 0) - (prio.get(a.id) ?? 0) || b.score - a.score);
  }

  const esclusi = inCima.map((s) => s.id);
  const resto = await db.agency.findMany({
    where: esclusi.length ? { ...where, id: { notIn: esclusi } } : where,
    select: agencyCardSelect,
    orderBy: agencyOrder,
    skip: (page - 1) * pageSize,
    take: pageSize - inCima.length,
  });

  return { items: [...inCima, ...resto], total, page, pageCount };
}

export async function countAgencies(opts: {
  serviceSlug?: string;
  cityIds?: string[];
  regionId?: string;
}): Promise<number> {
  return db.agency.count({ where: agencyWhere(opts) });
}

export async function topAgencies(opts: {
  serviceSlug?: string;
  cityIds?: string[];
  take?: number;
  excludeId?: string;
}): Promise<AgencyCardData[]> {
  return db.agency.findMany({
    where: {
      ...agencyWhere(opts),
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
    select: agencyCardSelect,
    orderBy: agencyOrder,
    take: opts.take ?? 3,
  });
}
