// Numeri di prova sociale, solo veri: richieste reali degli ultimi 30 giorni
// (niente test, niente scartati) e articoli correlati al servizio.

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { SOCIAL_PROOF_MIN } from "@/lib/cta";

export async function recentRequests(opts: { serviceId?: string; cityId?: string } = {}): Promise<number | null> {
  const since = new Date(Date.now() - 30 * 864e5);
  const n = await db.lead.count({
    where: {
      createdAt: { gte: since },
      status: { not: "rejected" },
      submission: { is: { testMode: false } },
      ...(opts.serviceId ? { serviceId: opts.serviceId } : {}),
      ...(opts.cityId ? { cityId: opts.cityId } : {}),
    },
  });
  return n >= SOCIAL_PROOF_MIN ? n : null;
}

export async function relatedPosts(terms: string[], take = 3) {
  const words = terms.map((t) => t.trim()).filter((t) => t.length > 2);
  if (words.length === 0) return [];
  return db.page.findMany({
    where: {
      kind: "blog",
      published: true,
      OR: words.flatMap((w) => [{ title: { contains: w, mode: "insensitive" as const } }, { body: { contains: w, mode: "insensitive" as const } }]),
    },
    orderBy: { publishedAt: "desc" },
    take,
    select: { slug: true, title: true, description: true, publishedAt: true },
  });
}

/** Mediana e campione dei budget minimi dei professionisti di un perimetro. */
export async function budgetStats(where: Prisma.AgencyWhereInput): Promise<{ median: number | null; samples: number }> {
  const rows = await db.agency.findMany({ where: { ...where, minBudget: { not: null } }, select: { minBudget: true } });
  const v = rows.map((r) => r.minBudget as number).filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 3) return { median: null, samples: v.length };
  const mid = Math.floor(v.length / 2);
  return { median: v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2), samples: v.length };
}
