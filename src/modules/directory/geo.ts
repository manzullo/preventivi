// Geografia: distanza haversine e capoluoghi vicini (il "Nei dintorni" di
// guidalocation, portato da zone a città).

import { db } from "@/lib/db";

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type NearCity = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  distKm: number;
};

/**
 * Capoluoghi con coordinate ordinati per distanza da `from`, escluso `from`.
 * Restituisce i primi `limit` (di default 8, poi chi chiama filtra su ciò
 * che ha davvero una pagina pubblicata).
 */
export async function nearestCapitals(
  from: { slug: string; lat: number | null; lng: number | null },
  limit = 8,
): Promise<NearCity[]> {
  if (from.lat === null || from.lng === null) return [];
  const capitals = await db.city.findMany({
    where: { isCapital: true, lat: { not: null }, lng: { not: null }, slug: { not: from.slug } },
    select: { id: true, slug: true, name: true, lat: true, lng: true },
  });
  return capitals
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      lat: c.lat as number,
      lng: c.lng as number,
      distKm: haversineKm(from.lat as number, from.lng as number, c.lat as number, c.lng as number),
    }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, limit);
}
