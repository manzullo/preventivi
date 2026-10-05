// Ingest: ogni fonte produce IngestRecord; l'import li porta su Agency/Review
// con deduplica. NESSUNA fonte di rete parte senza INGEST_ENABLED=1 e --confirm.

export type IngestReview = { author?: string; rating: number; text?: string; publishedAt?: string; sourceUrl?: string; sourceRef: string };

export type IngestRecord = {
  source: string; // google_places | csv | application
  sourceRef: string; // place_id, riga csv, ...
  sourceUrl?: string;
  name: string;
  website?: string;
  phone?: string;
  email?: string;
  street?: string;
  postalCode?: string;
  cityName?: string; // nome o slug: viene risolto su City
  lat?: number;
  lng?: number;
  description?: string;
  serviceSlugs: string[];
  reviews?: IngestReview[];
};

export type IngestStats = { total: number; created: number; updated: number; skipped: number; reviews: number; unresolvedCity: number };

export interface IngestSource {
  name: string;
  fetch(opts: { serviceSlug: string; citySlug: string; limit: number }): Promise<IngestRecord[]>;
}

export function ingestAllowed(confirm: boolean): void {
  if (process.env.INGEST_ENABLED !== "1" || !confirm) {
    throw new Error("Ingest di rete bloccato: serve INGEST_ENABLED=1 nell'ambiente e il flag --confirm. Scraping sospeso per decisione del 2026-09-08.");
  }
}
