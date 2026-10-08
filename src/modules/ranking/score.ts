// Ranking: media bayesiana delle recensioni con decadimento temporale.
//
//   score = [ v/(v+m) · R + m/(v+m) · C ] · decay
//   v = numero recensioni, R = media del professionista, C = media globale,
//   m = soglia di confidenza, decay = 0.5^(mesi dall'ultima recensione / 24)
//   con pavimento 0.25.
//
// Nessun campo che un pagamento possa muovere entra nel calcolo. La formula
// è pubblicata in /metodologia/: se cambia qui, cambia anche lì.

import { db } from "@/lib/db";

export const CONFIDENCE_M = 10;
export const HALF_LIFE_MONTHS = 24;
export const DECAY_FLOOR = 0.25;
export const DEFAULT_GLOBAL_MEAN = 4.3;

const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44;

type ReviewLike = { rating: number; publishedAt: Date | null };
export type ExternalRating = { source: string; rating: number; count: number; url?: string; fetchedAt?: string };

/**
 * Voto delle fonti senza numero di recensioni (Google Maps senza login mostra
 * solo le stelle): nel punteggio vale come questo numero di recensioni, così
 * ordina ma pesa poco e lascia passare avanti chi ha recensioni vere.
 */
export const EXTERNAL_NOMINAL_COUNT = 3;

/** Rating esterni validi (fonte, media 1-5); count 0 = numero non noto. */
export function parseExternal(raw: unknown): ExternalRating[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is ExternalRating => Boolean(x) && typeof x === "object" && typeof (x as ExternalRating).rating === "number" && (x as ExternalRating).rating > 0 && (x as ExternalRating).rating <= 5)
    .map((x) => ({ ...x, count: Number(x.count) > 0 ? Number(x.count) : 0 }))
    // Lo stesso posto Google letto due volte: dallo scraper di Maps (solo
    // stelle) e da Apify con il numero di recensioni. Vale il secondo.
    .filter((x, _i, all) => x.source !== "google_maps" || !all.some((y) => y.source === "google" && Number(y.count) > 0));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeScore(
  reviews: ReviewLike[],
  globalMean: number,
  now: Date = new Date(),
  externals: ExternalRating[] = [],
): { score: number; rating: number | null; reviewCount: number } {
  // Le fonti esterne entrano come aggregati: count recensioni alla loro media,
  // datate al momento della lettura (sono fresche per definizione).
  // Senza numero noto il voto pesa EXTERNAL_NOMINAL_COUNT, ma non si conta
  // fra le recensioni mostrate.
  const peso = (e: ExternalRating) => (e.count > 0 ? e.count : EXTERNAL_NOMINAL_COUNT);
  const extCount = externals.reduce((a, e) => a + e.count, 0);
  const v = reviews.length + externals.reduce((a, e) => a + peso(e), 0);
  if (v === 0) return { score: 0, rating: null, reviewCount: 0 };

  const sum = reviews.reduce((acc, r) => acc + r.rating, 0) + externals.reduce((a, e) => a + e.rating * peso(e), 0);
  const mean = sum / v;
  const bayes = (v / (v + CONFIDENCE_M)) * mean + (CONFIDENCE_M / (v + CONFIDENCE_M)) * globalMean;

  const dates: (Date | null)[] = [...reviews.map((r) => r.publishedAt), ...externals.map((e) => (e.fetchedAt ? new Date(e.fetchedAt) : null))];
  const last = dates.reduce<Date | null>((acc, d) => (d && !Number.isNaN(d.getTime()) && (!acc || d > acc) ? d : acc), null);
  // Senza data si assume "vecchia": pesa come due emivite.
  const months = last
    ? Math.max(0, (now.getTime() - last.getTime()) / MONTH_MS)
    : HALF_LIFE_MONTHS * 2;
  const decay = Math.max(DECAY_FLOOR, Math.pow(0.5, months / HALF_LIFE_MONTHS));

  return { score: round(bayes * decay), rating: round(mean), reviewCount: reviews.length + extCount };
}

export async function globalMean(): Promise<number> {
  const agg = await db.review.aggregate({ _avg: { rating: true } });
  return agg._avg.rating ?? DEFAULT_GLOBAL_MEAN;
}

/**
 * Ricalcola score, rating e reviewCount di tutti i professionisti.
 * Il punteggio nasce solo dalle recensioni: nessuna leva commerciale lo tocca.
 * Chi paga entra nella corsia in evidenza, che è un'altra cosa e si vede.
 */
export async function recalcAllScores(): Promise<{ agencies: number; globalMean: number }> {
  const C = await globalMean();
  const now = new Date();
  const agencies = await db.agency.findMany({
    select: { id: true, externalRatings: true, reviews: { select: { rating: true, publishedAt: true, createdAt: true } } },
  });

  const CHUNK = 200;
  for (let i = 0; i < agencies.length; i += CHUNK) {
    const slice = agencies.slice(i, i + CHUNK);
    await db.$transaction(
      slice.map((a) => {
        // Recensione importata senza data: vale la data in cui l'abbiamo letta dalla fonte.
        const s = computeScore(a.reviews.map((r) => ({ rating: r.rating, publishedAt: r.publishedAt ?? r.createdAt })), C, now, parseExternal(a.externalRatings));
        return db.agency.update({
          where: { id: a.id },
          data: { score: s.score, rating: s.rating, reviewCount: s.reviewCount, scoredAt: now },
        });
      }),
    );
  }
  return { agencies: agencies.length, globalMean: round(C) };
}
