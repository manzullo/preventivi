// Fusione di due schede dello stesso professionista, usata da fondi-doppioni.ts
// e dubbi-doppioni.ts. Regola fissa: una scheda con recensioni, richieste
// (lead), assegnazioni, rivendicazioni o accessi del titolare non si cancella
// mai. Se entrambe ne hanno, la coppia resta da fondere a mano.
import { db } from "../../src/lib/db";

export const FILE_DUBBI = "data/raw/doppioni-da-controllare.txt";
export const FILE_DECISI = "data/raw/doppioni-decisi.txt";

export const selectDoppione = {
  id: true, slug: true, name: true, source: true, domain: true, website: true, phone: true, email: true, street: true, postalCode: true,
  lat: true, lng: true, googlePlaceId: true, cityId: true, description: true, sourceDescription: true, skills: true, industries: true,
  externalRatings: true, locations: true, logoUrl: true, social: true, vatNumber: true, whatsapp: true, claimed: true, importNote: true,
  city: { select: { name: true } },
  _count: { select: { reviews: true, services: true, leads: true, assignments: true, claims: true, ownerLogins: true, placements: true } },
} as const;

export type Doppione = {
  id: string; slug: string; name: string; source: string; domain: string | null; website: string | null; phone: string | null; email: string | null;
  street: string | null; postalCode: string | null; lat: number | null; lng: number | null; googlePlaceId: string | null; cityId: string | null;
  description: string | null; sourceDescription: string | null; skills: unknown; industries: unknown; externalRatings: unknown; locations: unknown;
  logoUrl: string | null; social: unknown; vatNumber: string | null; whatsapp: string | null; claimed: boolean; importNote: string | null;
  city: { name: string } | null;
  _count: { reviews: number; services: number; leads: number; assignments: number; claims: number; ownerLogins: number; placements: number };
};

/** Vero se la scheda porta qualcosa che non si può perdere cancellandola. */
export const intoccabile = (x: Doppione) =>
  x.claimed || x._count.reviews > 0 || x._count.leads > 0 || x._count.assignments > 0 || x._count.claims > 0 || x._count.ownerLogins > 0 || x._count.placements > 0;

/**
 * Quale resta e quale viene assorbita: resta quella intoccabile, poi quella con
 * più recensioni, più categorie, un sito, una descrizione. Null se tutte e due
 * sono intoccabili.
 */
export function chiTiene(a: Doppione, b: Doppione): [Doppione, Doppione] | null {
  if (intoccabile(a) && intoccabile(b)) return null;
  if (intoccabile(a)) return [a, b];
  if (intoccabile(b)) return [b, a];
  const punti = (x: Doppione) => x._count.reviews * 100 + x._count.services * 10 + (x.domain ? 5 : 0) + (x.description ? 2 : 0) + (x.googlePlaceId ? 1 : 0);
  return punti(a) >= punti(b) ? [a, b] : [b, a];
}

const lista = (x: unknown) => (Array.isArray(x) ? (x as unknown[]) : []);
const unione = (x: unknown, y: unknown) => [...new Set([...lista(x), ...lista(y)].map(String))].slice(0, 30);
const viaNorm = (s: string | null) => (s ?? "").toLowerCase().replace(/\b(via|viale|corso|piazza|largo|vicolo|strada)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 24);

/**
 * Fonde la scheda `assorbi` dentro `tieni` in una transazione. Rilegge tutte e
 * due dal database (una fusione precedente può averle cambiate) e rifiuta se
 * quella da cancellare è intoccabile. Falso se una delle due non c'è più.
 */
export async function fondi(tieni: { id: string }, assorbi: { id: string }, motivo: string): Promise<boolean> {
  const [t, s] = (await Promise.all([
    db.agency.findUnique({ where: { id: tieni.id }, select: selectDoppione }),
    db.agency.findUnique({ where: { id: assorbi.id }, select: selectDoppione }),
  ])) as [Doppione | null, Doppione | null];
  if (!t || !s) return false;
  if (intoccabile(s)) throw new Error(`${s.slug} ha recensioni, richieste o un titolare: non si cancella`);

  // Le valutazioni delle fonti: una per fonte, la più ricca.
  const ext = new Map<string, { source: string; count?: number }>();
  for (const e of [...lista(t.externalRatings), ...lista(s.externalRatings)] as { source: string; count?: number }[]) {
    const vecchia = ext.get(e.source);
    if (!vecchia || (e.count ?? 0) > (vecchia.count ?? 0)) ext.set(e.source, e);
  }
  // La sede dell'altra scheda diventa una sede in più, se è diversa.
  const sedi = [...lista(t.locations)];
  if (s.street && viaNorm(s.street) !== viaNorm(t.street)) {
    sedi.push({ via: s.street, cap: s.postalCode, citta: s.city?.name ?? null, lat: s.lat, lng: s.lng, placeId: s.googlePlaceId, telefono: s.phone });
  }
  // Le categorie e le foto passano alla scheda che resta; le copie grezze delle
  // fonti pure, tranne quelle di una fonte che la scheda che resta ha già.
  const [servizi, snapshot] = await Promise.all([
    db.agencyService.findMany({ where: { agencyId: s.id } }),
    db.sourceSnapshot.findMany({ where: { agencyId: { in: [s.id, t.id] } }, select: { id: true, agencyId: true, source: true } }),
  ]);
  const fontiTenute = new Set(snapshot.filter((x) => x.agencyId === t.id).map((x) => x.source));

  await db.$transaction([
    ...servizi.map((x) => db.agencyService.upsert({ where: { agencyId_serviceId: { agencyId: t.id, serviceId: x.serviceId } }, create: { agencyId: t.id, serviceId: x.serviceId, weight: x.weight }, update: {} })),
    db.photo.updateMany({ where: { agencyId: s.id }, data: { agencyId: t.id } }),
    db.sourceSnapshot.deleteMany({ where: { agencyId: s.id, source: { in: [...fontiTenute] } } }),
    db.sourceSnapshot.updateMany({ where: { agencyId: s.id }, data: { agencyId: t.id } }),
    // Prima si libera la scheda assorbita (place_id e source/sourceRef sono unici), poi si aggiorna l'altra.
    db.agency.delete({ where: { id: s.id } }),
    db.agency.update({
      where: { id: t.id },
      data: {
        cityId: t.cityId ?? s.cityId,
        phone: t.phone ?? s.phone,
        email: t.email ?? s.email,
        whatsapp: t.whatsapp ?? s.whatsapp,
        website: t.website ?? s.website,
        domain: t.domain ?? s.domain,
        street: t.street ?? s.street,
        postalCode: t.postalCode ?? s.postalCode,
        lat: t.lat ?? s.lat,
        lng: t.lng ?? s.lng,
        googlePlaceId: t.googlePlaceId ?? s.googlePlaceId,
        vatNumber: t.vatNumber ?? s.vatNumber,
        logoUrl: t.logoUrl ?? s.logoUrl,
        description: t.description ?? s.description,
        sourceDescription: [t.sourceDescription, s.sourceDescription].filter(Boolean).join("\n\n") || null,
        social: (t.social ?? s.social ?? undefined) as never,
        skills: unione(t.skills, s.skills),
        industries: unione(t.industries, s.industries),
        externalRatings: [...ext.values()] as never,
        locations: sedi.length ? (sedi as never) : undefined,
        importNote: [t.importNote, `unita con la scheda doppia ${s.slug} (${s.source}): ${motivo}`].filter(Boolean).join(" · "),
      },
    }),
  ]);
  return true;
}
