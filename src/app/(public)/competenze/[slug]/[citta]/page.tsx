// La competenza dentro una città: "Riparazione caldaia a Roma". Prima chi la
// dichiara, poi (sulla prima pagina) gli altri professionisti della categoria
// in cui quella competenza sta di solito, perché la pagina serva anche quando
// chi la dichiara sono pochi.
//
// Esiste finché in quella città c'è almeno un professionista che la dichiara, ma si
// fa indicizzare solo sopra SKILL_CITY_MIN: con due schede sarebbe una copia
// magra della pagina nazionale, e i motori di ricerca quelle le scartano.
// Sotto soglia resta raggiungibile lo stesso, così nessun link porta a un muro.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgencyCard } from "@/components/AgencyCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { QuoteBox } from "@/components/QuoteCta";
import { Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { CURRENT_YEAR, PAGE_SIZE, fmt, paths, plural } from "@/lib/site";
import { agencyCardSelect, agencyOrder, cityScopeIds, parsePage } from "@/modules/directory/listing";
import { collectionPageJsonLd, pageMeta } from "@/modules/directory/seo";
import { SKILL_CITY_MIN, cittaDiCompetenza, competenzaDaSlug, servizioPrevalente, whereCompetenza } from "@/modules/directory/skills";

export const revalidate = 3600;

type Params = Promise<{ slug: string; citta: string }>;
type Search = Promise<{ page?: string }>;

async function dati(slug: string, cittaSlug: string) {
  const [c, city] = await Promise.all([
    competenzaDaSlug(slug),
    db.city.findUnique({
      where: { slug: cittaSlug },
      select: { id: true, slug: true, name: true, isCapital: true, region: { select: { name: true } } },
    }),
  ]);
  if (!c || !city) return null;
  const ids = await cityScopeIds(city);
  const where = { published: true, cityId: { in: ids }, ...whereCompetenza(c.nome) };
  const totale = await db.agency.count({ where });
  if (totale === 0) return null;
  return { c, city, where, totale };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, citta } = await params;
  const d = await dati(slug, citta);
  if (!d) return { robots: { index: false, follow: false } };
  const nome = d.c.nome;
  const meta = pageMeta({
    title: `${nome} a ${d.city.name}: ${fmt(d.totale)} ${plural(d.totale, "professionista", "professionisti")} a confronto (${CURRENT_YEAR})`,
    description: `${nome} a ${d.city.name}: ${fmt(d.totale)} ${plural(d.totale, "professionista che lo fa", "professionisti che lo fanno")}, ordinati per recensioni con la fonte e con i contatti diretti. Un modulo, fino a 3 preventivi gratis.`,
    path: paths.skillCity(d.c.slug, d.city.slug),
  });
  // Poche schede: la pagina serve a chi ci arriva, non ai motori di ricerca.
  return d.totale >= SKILL_CITY_MIN ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function CompetenzaCittaPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug, citta } = await params;
  const sp = await searchParams;
  const d = await dati(slug, citta);
  if (!d) notFound();
  const { c, city, where, totale } = d;

  const base = paths.skillCity(c.slug, city.slug);
  const pagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));
  const pagina = Math.min(parsePage(sp), pagine);

  const [items, altreCitta, servizio] = await Promise.all([
    db.agency.findMany({
      where,
      select: agencyCardSelect,
      orderBy: agencyOrder,
      skip: (pagina - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    cittaDiCompetenza(c.nome),
    servizioPrevalente(c.nome, await cityScopeIds(city)),
  ]);
  // Riserva: gli altri della stessa categoria in città, solo in prima pagina.
  const riserva =
    servizio && pagina === 1
      ? await db.agency.findMany({
          where: {
            published: true,
            cityId: { in: await cityScopeIds(city) },
            services: { some: { service: { slug: servizio.slug } } },
            // Non NOT(skills contiene ...): con skills vuoto il confronto dà
            // null e la riga sparirebbe; si escludono per id.
            id: { notIn: (await db.agency.findMany({ where, select: { id: true } })).map((x) => x.id) },
          },
          select: agencyCardSelect,
          orderBy: agencyOrder,
          take: PAGE_SIZE,
        })
      : [];
  const vicine = altreCitta.filter((x) => x.slug !== city.slug).slice(0, 11);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Competenze", href: "/competenze/" },
          { name: c.nome, href: paths.skill(c.slug) },
          { name: city.name, href: base },
        ]}
      />

      <p className="t-kicker mb-2">{city.region ? `${city.region.name} · ${city.name}` : city.name}</p>
      <h1 className="t-h1">
        {c.nome} a {city.name}
      </h1>
      <p className="t-lead mt-3 max-w-3xl">
        Chi fa {c.nome.toLowerCase()} a {city.name}, ordinato per recensioni con la fonte. Descrivi il lavoro e ricevi fino a 3
        preventivi gratis.
      </p>
      <p className="t-meta mt-3 max-w-3xl">
        {fmt(totale)} {plural(totale, "professionista dichiara", "professionisti dichiarano")} di fare {c.nome.toLowerCase()} a {city.name}.{" "}
        <Link href={paths.skill(c.slug)} className="font-semibold text-action hover:underline">
          {c.nome} in tutta Italia
        </Link>
        .
      </p>

      <div className="mb-5 mt-8 flex items-center justify-between border-b border-line pb-3">
        <p className="t-kicker">
          {fmt(totale)} {plural(totale, "professionista", "professionisti")}
        </p>
        <p className="t-kicker">Classifica per recensioni</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((a, i) => (
          <AgencyCard key={a.id} agency={a} position={(pagina - 1) * PAGE_SIZE + i + 1} />
        ))}
      </div>

      {pagine > 1 && (
        <nav aria-label="Pagine" className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {pagina > 1 && (
            <Link
              href={pagina - 1 === 1 ? base : `${base}?page=${pagina - 1}`}
              className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25"
            >
              ← indietro
            </Link>
          )}
          <span className="t-meta px-2">
            pagina {pagina} di {fmt(pagine)}
          </span>
          {pagina < pagine && (
            <Link
              href={`${base}?page=${pagina + 1}`}
              className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25"
            >
              avanti →
            </Link>
          )}
        </nav>
      )}

      {riserva.length > 0 && servizio && (
        <section className="mt-12">
          <div className="mb-5 flex items-center justify-between border-b border-line pb-3">
            <p className="t-kicker">Altri {servizio.plural.toLowerCase()} a {city.name}</p>
            <Link href={paths.serviceCity(servizio.slug, city.slug)} className="t-kicker text-action hover:underline">
              Tutti →
            </Link>
          </div>
          <p className="t-meta mb-4 max-w-3xl">
            Non scrivono di fare {c.nome.toLowerCase()}, ma lavorano nella stessa categoria: chiedi nel preventivo.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {riserva.map((a) => (
              <AgencyCard key={a.id} agency={a} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-12">
        <QuoteBox
          href={paths.quote({ citta: city.slug, ...(servizio ? { servizio: servizio.slug, lavoro: c.nome } : {}) })}
          position="end"
          context={`Ti serve ${c.nome.toLowerCase()} a ${city.name}?`}
        />
      </div>

      {vicine.length > 0 && (
        <section className="mt-12">
          <p className="t-kicker mb-3">{c.nome} nelle altre città</p>
          <div className="flex flex-wrap gap-2">
            {vicine.map((x) => (
              <Chip key={x.slug} href={paths.skillCity(c.slug, x.slug)} count={x.totale}>
                {x.name}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <JsonLd
        data={collectionPageJsonLd({
          name: `${c.nome} a ${city.name}`,
          description: `${totale} professionisti di ${city.name} che dichiarano di fare ${c.nome.toLowerCase()}, ordinati per recensioni.`,
          path: base,
          total: totale,
        })}
      />
    </div>
  );
}
