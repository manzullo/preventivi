import type { Metadata } from "next";
import Link from "next/link";
import { AgencyMap, type MapPoint } from "@/components/AgencyMap";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { QuoteBox } from "@/components/QuoteCta";
import { Rating } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt, paths } from "@/lib/site";
import { agencyOrder } from "@/modules/directory/listing";
import { pageMeta } from "@/modules/directory/seo";

export const revalidate = 3600;
const MAX_PUNTI = 400;

export const metadata: Metadata = pageMeta({
  title: "I professionisti sulla mappa",
  description: "Dove sono i professionisti e le aziende in elenco: sedi dalla scheda Google, filtrabili per città e categoria.",
  path: "/mappa/",
});

type Search = Promise<{ citta?: string; servizio?: string }>;

export default async function Mappa({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const citta = sp.citta;
  const servizio = sp.servizio;

  const where = {
    published: true,
    lat: { not: null },
    lng: { not: null },
    ...(citta ? { city: { slug: citta } } : {}),
    ...(servizio ? { services: { some: { service: { slug: servizio } } } } : {}),
  };

  const [totale, righe, citte, servizi] = await Promise.all([
    db.agency.count({ where }),
    db.agency.findMany({
      where,
      // Stesso ordine degli elenchi: prima la priorità decisa da noi.
      orderBy: agencyOrder,
      take: MAX_PUNTI,
      select: { slug: true, name: true, lat: true, lng: true, rating: true, reviewCount: true, street: true, city: { select: { name: true, slug: true } } },
    }),
    db.city.findMany({ where: { agencies: { some: { published: true, lat: { not: null } } } }, select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    db.service.findMany({ where: { active: true, agencies: { some: { agency: { published: true, lat: { not: null } } } } }, select: { slug: true, plural: true }, orderBy: { position: "asc" }, take: 14 }),
  ]);

  const punti: MapPoint[] = righe
    .filter((a): a is typeof a & { lat: number; lng: number } => typeof a.lat === "number" && typeof a.lng === "number")
    .map((a) => ({ slug: a.slug, name: a.name, lat: a.lat, lng: a.lng, rating: a.rating, reviewCount: a.reviewCount, city: a.city?.name ?? null }));

  const link = (patch: { citta?: string; servizio?: string }) => {
    const q = new URLSearchParams();
    const f = { citta, servizio, ...patch };
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    const s = q.toString();
    return `/mappa/${s ? `?${s}` : ""}`;
  };
  const Chip = ({ href, attivo, children }: { href: string; attivo: boolean; children: React.ReactNode }) => (
    <Link href={href} className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${attivo ? "border-action bg-tonal text-action" : "border-line text-ink hover:border-ink/25"}`}>
      {children}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Mappa", href: "/mappa/" }]} />
      <h1 className="t-h1 mt-4">I professionisti sulla mappa</h1>
      <p className="t-lead mt-3 max-w-3xl">
        Le sedi arrivano dalla scheda Google dell&apos;professionista, quindi sono verificabili. Comparire qui non dipende da
        quanto un&apos;professionista paga: chi non ha una sede pubblica non ha un punto sulla mappa, e resta comunque in elenco.
      </p>
      <p className="t-meta mt-2">
        {fmt(totale)} sedi con questi filtri
        {totale > punti.length ? `, sulla mappa le prime ${fmt(punti.length)} per punteggio` : ""}.
      </p>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-meta w-16">Città</span>
          <Chip href={link({ citta: undefined })} attivo={!citta}>tutte</Chip>
          {citte.map((c) => <Chip key={c.slug} href={link({ citta: c.slug })} attivo={citta === c.slug}>{c.name}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-meta w-16">Servizio</span>
          <Chip href={link({ servizio: undefined })} attivo={!servizio}>tutti</Chip>
          {servizi.map((s) => <Chip key={s.slug} href={link({ servizio: s.slug })} attivo={servizio === s.slug}>{s.plural}</Chip>)}
        </div>
      </div>

      <div className="mt-6">
        {punti.length === 0 ? (
          <p className="t-body text-ink-2">
            Nessuna sede con questi filtri. <Link href="/mappa/" className="font-semibold text-action">Togli i filtri</Link>.
          </p>
        ) : (
          <AgencyMap points={punti} height={520} />
        )}
      </div>

      {punti.length > 0 && (
        <>
          <h2 className="t-h3 mt-10">Le prime venti in mappa</h2>
          <ul className="mt-4 divide-y divide-line rounded-card border border-line">
            {righe.slice(0, 20).map((a, i) => (
              <li key={a.slug}>
                <Link href={paths.agency(a.slug)} className="flex items-center gap-4 px-4 py-3 hover:bg-surface">
                  <span className="t-meta w-6 shrink-0 text-right font-semibold text-ink-2">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{a.name}</span>
                    <span className="t-meta block truncate">{[a.street, a.city?.name].filter(Boolean).join(", ")}</span>
                  </span>
                  <Rating value={a.rating} count={a.reviewCount} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-12">
        <QuoteBox href={paths.quote()} position="end" />
      </div>
    </div>
  );
}
