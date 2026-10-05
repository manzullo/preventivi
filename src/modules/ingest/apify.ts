// Fonte Google Places via Apify (attore compass/crawler-google-places, già
// usato per guidalocation). Parte solo con INGEST_ENABLED=1 e --confirm.

import { db } from "@/lib/db";
import type { IngestRecord, IngestSource } from "./types";
import { ingestAllowed } from "./types";

type ApifyItem = {
  placeId?: string; title?: string; website?: string; phone?: string; street?: string; postalCode?: string; city?: string; url?: string;
  location?: { lat?: number; lng?: number }; totalScore?: number; reviewsCount?: number; description?: string;
  reviews?: { name?: string; stars?: number; text?: string; publishedAtDate?: string; reviewUrl?: string; reviewId?: string }[];
};

/** Mappa un item Apify su IngestRecord (usato anche dal test su fixture). */
export function mapApifyItem(it: ApifyItem, serviceSlug: string, citySlug: string): IngestRecord | null {
  if (!it.placeId || !it.title) return null;
  return {
    source: "google_places",
    sourceRef: it.placeId,
    sourceUrl: it.url,
    name: it.title,
    website: it.website,
    phone: it.phone,
    street: it.street,
    postalCode: it.postalCode,
    cityName: it.city || citySlug,
    lat: it.location?.lat,
    lng: it.location?.lng,
    description: it.description,
    serviceSlugs: [serviceSlug],
    reviews: (it.reviews ?? []).filter((r) => r.stars).map((r, i) => ({ author: r.name, rating: Number(r.stars), text: r.text, publishedAt: r.publishedAtDate, sourceUrl: r.reviewUrl, sourceRef: r.reviewId ?? `${it.placeId}-${i}` })),
  };
}

export class GooglePlacesApify implements IngestSource {
  name = "google_places_apify";
  constructor(private readonly confirm: boolean, private readonly maxReviews = 20) {}

  async fetch({ serviceSlug, citySlug, limit }: { serviceSlug: string; citySlug: string; limit: number }): Promise<IngestRecord[]> {
    ingestAllowed(this.confirm);
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN mancante");
    const [service, city] = await Promise.all([db.service.findUnique({ where: { slug: serviceSlug } }), db.city.findUnique({ where: { slug: citySlug } })]);
    if (!service || !city) throw new Error("servizio o città non trovati");
    const queries = ((service.queries as string[]) ?? [service.name]).map((q) => `${q} ${city.name}`);
    const res = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=300`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchStringsArray: queries, maxCrawledPlacesPerSearch: Math.max(1, Math.min(limit, 60)), language: "it", maxReviews: this.maxReviews, scrapeReviewsPersonalData: false }),
      signal: AbortSignal.timeout(330_000),
    });
    if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const items = (await res.json()) as ApifyItem[];
    return items.map((it) => mapApifyItem(it, serviceSlug, citySlug)).filter((x): x is IngestRecord => Boolean(x));
  }
}
