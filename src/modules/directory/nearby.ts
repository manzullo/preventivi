// Blocco "Nei dintorni" dei listing (guidalocation): card dei professionisti
// delle città vicine per lo stesso servizio, N gruppi × M card, con tetto.

import { settings } from "@/lib/settings";
import { paths } from "@/lib/site";
import { nearestCapitals } from "./geo";
import { pagineEsistenti } from "./pages";
import { cityScopeIds, topAgencies, type AgencyCardData } from "./listing";

export type NearbyGroup = { city: { slug: string; name: string }; path: string; distKm: number; items: AgencyCardData[] };

export async function nearbyGroups(opts: {
  service: { slug: string; plural: string };
  city: { slug: string; lat: number | null; lng: number | null };
}): Promise<NearbyGroup[]> {
  const site = await settings.site();
  if (!site.nearbyBlock) return [];
  // 20 candidati: nelle regioni con poche schede i primi 8 capoluoghi possono essere vuoti.
  const near = await nearestCapitals(opts.city, 20);
  // Solo le città la cui pagina servizio × città esiste davvero: una città con
  // una o due professionisti resta sotto PUBLISH_THRESHOLD e la sua pagina non viene
  // generata, quindi il titolo del gruppo porterebbe a un 404. Il controllo sta
  // prima delle query pesanti: scarta il candidato senza pagarlo.
  const esistenti = await pagineEsistenti(near.map((c) => paths.serviceCity(opts.service.slug, c.slug)));
  const groups: NearbyGroup[] = [];
  let total = 0;
  for (const c of near) {
    if (groups.length >= site.nearbyGroups || total >= site.nearbyCap) break;
    const path = paths.serviceCity(opts.service.slug, c.slug);
    if (!esistenti.has(path)) continue;
    const ids = await cityScopeIds({ id: c.id, slug: c.slug, isCapital: true });
    const items = await topAgencies({ serviceSlug: opts.service.slug, cityIds: ids, take: Math.min(site.nearbyPerGroup, site.nearbyCap - total) });
    if (items.length === 0) continue;
    groups.push({ city: { slug: c.slug, name: c.name }, path, distKm: Math.round(c.distKm), items });
    total += items.length;
  }
  return groups;
}
