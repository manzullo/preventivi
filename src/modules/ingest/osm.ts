// OpenStreetMap via Overpass: le attività di una categoria dentro i confini
// di un comune. Licenza ODbL: si può usare e mostrare citando
// "© OpenStreetMap contributors" (la fonte "osm" la porta in scheda).
// Copre bene studi e negozi, meno gli artigiani che lavorano da casa.

import { politeGet } from "./http";
import type { IngestRecord } from "./types";

const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

/**
 * Filtri Overpass per categoria (chiave = slug del servizio). Una categoria
 * senza voce qui non si cerca su OSM. Riferimento dei tag:
 * https://wiki.openstreetmap.org/wiki/Map_features
 */
export const OSM_TAGS: Record<string, string[]> = {
  idraulici: ['["craft"="plumber"]'],
  elettricisti: ['["craft"="electrician"]'],
  imbianchini: ['["craft"="painter"]'],
  "imprese-edili": ['["craft"="builder"]', '["office"="construction_company"]'],
  muratori: ['["craft"="builder"]'],
  piastrellisti: ['["craft"="tiler"]', '["craft"="floorer"]'],
  falegnami: ['["craft"="carpenter"]', '["craft"="joiner"]'],
  fabbri: ['["craft"="locksmith"]', '["shop"="locksmith"]', '["craft"="metal_construction"]'],
  serramentisti: ['["craft"="window_construction"]'],
  termoidraulici: ['["craft"="hvac"]', '["craft"="heating_engineer"]'],
  "installatori-fotovoltaico": ['["craft"="photovoltaic"]'],
  giardinieri: ['["craft"="gardener"]'],
  "imprese-di-pulizie": ['["office"="cleaning"]', '["craft"="cleaning"]'],
  disinfestatori: ['["craft"="pest_control"]'],
  traslocatori: ['["office"="moving_company"]', '["shop"="moving"]'],
  architetti: ['["office"="architect"]'],
  geometri: ['["office"="surveyor"]'],
  "interior-designer": ['["office"="interior_design"]', '["shop"="interior_decoration"]'],
  "tecnici-elettrodomestici": ['["craft"="electronics_repair"]["electronics_repair"="appliance"]', '["shop"="appliance"]["service:repair"="yes"]'],
  fotografi: ['["craft"="photographer"]', '["shop"="photo"]["craft"]'],
  videomaker: ['["office"="video_production"]'],
  catering: ['["craft"="caterer"]', '["shop"="catering"]'],
  fioristi: ['["shop"="florist"]'],
  "personal-trainer": ['["leisure"="fitness_centre"]["personal_training"="yes"]'],
  nutrizionisti: ['["healthcare"="nutrition_counselling"]', '["healthcare:speciality"="dietetics"]'],
  psicologi: ['["healthcare"="psychotherapist"]', '["office"="psychologist"]'],
  fisioterapisti: ['["healthcare"="physiotherapist"]'],
  estetiste: ['["shop"="beauty"]'],
  parrucchieri: ['["shop"="hairdresser"]'],
  massaggiatori: ['["shop"="massage"]'],
  "insegnanti-inglese": ['["amenity"="language_school"]'],
  ripetizioni: ['["amenity"="prep_school"]'],
  "insegnanti-musica": ['["amenity"="music_school"]'],
  "istruttori-guida": ['["amenity"="driving_school"]'],
  commercialisti: ['["office"="accountant"]', '["office"="tax_advisor"]'],
  avvocati: ['["office"="lawyer"]'],
  notai: ['["office"="notary"]'],
  "consulenti-lavoro": ['["office"="consulting"]["consulting"="employment"]'],
  "web-designer": ['["office"="it"]["it"="web_design"]', '["craft"="web_design"]'],
  grafici: ['["craft"="graphic_design"]', '["office"="graphic_design"]'],
  traduttori: ['["office"="translator"]'],
  informatici: ['["shop"="computer"]["service:repair"="yes"]', '["craft"="computer_repair"]', '["office"="it"]'],
  meccanici: ['["shop"="car_repair"]'],
  carrozzerie: ['["shop"="car_repair"]["car_repair"="bodywork"]', '["craft"="car_bodywork"]'],
  "dog-sitter": ['["amenity"="animal_boarding"]'],
  toelettature: ['["shop"="pet_grooming"]'],
  "addestratori-cani": ['["amenity"="animal_training"]'],
};

type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** Query Overpass: tutti i filtri della categoria dentro il comune (admin_level 8). */
export function overpassQuery(cityName: string, filters: string[]): string {
  const nome = cityName.replace(/"/g, '\\"');
  const parts = filters.flatMap((f) => [`node${f}(area.a);`, `way${f}(area.a);`, `relation${f}(area.a);`]).join("\n  ");
  return `[out:json][timeout:120];
area["boundary"="administrative"]["admin_level"="8"]["name"="${nome}"]->.a;
(
  ${parts}
);
out center tags;`;
}

/** Elemento OSM → IngestRecord (null se manca il nome). */
export function mapOsmElement(el: OsmElement, serviceSlug: string, citySlug: string): IngestRecord | null {
  const t = el.tags ?? {};
  const name = t.name ?? t["name:it"] ?? t.operator;
  if (!name) return null;
  const via = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const website = t.website ?? t["contact:website"] ?? t.url;
  return {
    source: "osm",
    sourceRef: `${el.type}/${el.id}`,
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    name,
    website: website && !/^https?:/i.test(website) ? `https://${website}` : website,
    phone: t.phone ?? t["contact:phone"] ?? t["contact:mobile"],
    email: t.email ?? t["contact:email"],
    street: via || undefined,
    postalCode: t["addr:postcode"],
    cityName: t["addr:city"] ?? citySlug,
    lat: el.lat ?? el.center?.lat,
    lng: el.lon ?? el.center?.lon,
    serviceSlugs: [serviceSlug],
    reviews: [],
  };
}

export async function fetchOsm(opts: { serviceSlug: string; citySlug: string; cityName: string }): Promise<{ records: IngestRecord[]; raw: OsmElement[] }> {
  const filters = OSM_TAGS[opts.serviceSlug];
  if (!filters?.length) return { records: [], raw: [] };
  const q = overpassQuery(opts.cityName, filters);
  const body = await politeGet(`${OVERPASS}?data=${encodeURIComponent(q)}`, { minDelayMs: 2000, accept: "application/json", api: true });
  const raw = (JSON.parse(body) as { elements?: OsmElement[] }).elements ?? [];
  const records = raw.map((el) => mapOsmElement(el, opts.serviceSlug, opts.citySlug)).filter((x): x is IngestRecord => Boolean(x));
  return { records, raw };
}
