// La competenza dentro una città: "professionisti food marketing a Roma".
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
import { SKILL_CITY_MIN, cittaDiCompetenza, competenzaDaSlug, whereCompetenza } from "@/modules/directory/skills";

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
    title: `Le migliori professionisti ${nome} di ${d.city.name}: classifica ${CURRENT_YEAR}`,
    description: `Le ${fmt(d.totale)} professionisti di ${d.city.name} che lavorano su ${nome}: recensioni con la fonte, budget minimo e contatti diretti. Un modulo, fino a 3 preventivi gratis.`,
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

  const [items, altreCitta] = await Promise.all([
    db.agency.findMany({
      where,
      select: agencyCardSelect,
      orderBy: agencyOrder,
      skip: (pagina - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    cittaDiCompetenza(c.nome),
  ]);
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
        Professionisti {c.nome} a {city.name} {CURRENT_YEAR}
      </h1>
      <p className="t-lead mt-3 max-w-3xl">
        Confronta le migliori professionisti {c.nome} di {city.name} e scegli quella più adatta.
      </p>
      <p className="t-meta mt-3 max-w-3xl">
        Trovate {fmt(totale)} professionisti {c.nome} a {city.name} ordinate per recensioni pubbliche verificabili.{" "}
        <Link href={paths.skill(c.slug)} className="font-semibold text-action hover:underline">
          Vedi tutte i professionisti {c.nome} in Italia
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

      <div className="mt-12">
        <QuoteBox
          href={paths.quote({ citta: city.slug })}
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
          name: `Professionisti ${c.nome.toLowerCase()} a ${city.name}`,
          description: `${totale} professionisti di ${city.name} che dichiarano ${c.nome.toLowerCase()}, ordinate per recensioni.`,
          path: base,
          total: totale,
        })}
      />
    </div>
  );
}
