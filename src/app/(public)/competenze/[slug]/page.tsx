// Professionisti che dichiarano una competenza precisa: "Riparazione caldaia",
// "Sblocco scarichi", "Foto di matrimonio". Sono i lavori dentro la categoria,
// quelli che una persona cerca quando sa già cosa le serve.
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
import { agencyCardSelect, agencyOrder, parsePage } from "@/modules/directory/listing";
import { collectionPageJsonLd, pageMeta } from "@/modules/directory/seo";
import { cittaDiCompetenza, competenzaDaSlug, competenze, whereCompetenza } from "@/modules/directory/skills";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;
type Search = Promise<{ page?: string }>;

export async function generateStaticParams() {
  return (await competenze()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const c = await competenzaDaSlug(slug);
  if (!c) return { robots: { index: false, follow: false } };
  return pageMeta({
    title: `${c.nome}: ${fmt(c.totale)} professionisti a confronto, città per città (${CURRENT_YEAR})`,
    description: `${c.nome}: ${fmt(c.totale)} professionisti in Italia che lo fanno, ordinati per recensioni con la fonte e con i contatti diretti. Preventivi gratis in due minuti.`,
    path: `/competenze/${c.slug}/`,
  });
}

export default async function CompetenzaPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const c = await competenzaDaSlug(slug);
  if (!c) notFound();

  const base = `/competenze/${c.slug}/`;
  const where = { published: true, ...whereCompetenza(c.nome) };
  const totale = await db.agency.count({ where });
  const pagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));
  const pagina = Math.min(parsePage(sp), pagine);

  const [items, altre, perCitta] = await Promise.all([
    db.agency.findMany({ where, select: agencyCardSelect, orderBy: agencyOrder, skip: (pagina - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    competenze(),
    // Solo le città che hanno una pagina loro, con il conteggio calcolato sullo
    // stesso perimetro che quella pagina userà: il numero sulla pillola e il
    // numero dopo il clic devono coincidere.
    cittaDiCompetenza(c.nome),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Competenze", href: "/competenze/" },
          { name: c.nome, href: base },
        ]}
      />

      <p className="t-kicker mb-2">Il lavoro che ti serve</p>
      <h1 className="t-h1">
        {c.nome}: chi lo fa, città per città
      </h1>
      <p className="t-lead mt-3 max-w-3xl">
        Scegli la città per vedere chi fa {c.nome.toLowerCase()} vicino a te, ordinato per recensioni con la fonte.
      </p>
      <p className="t-meta mt-3 max-w-3xl">
        {fmt(totale)} {plural(totale, "professionista dichiara", "professionisti dichiarano")} di fare {c.nome.toLowerCase()} in Italia.
      </p>

      {perCitta.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="t-kicker mr-1 self-center">Dove</span>
          {perCitta.slice(0, 12).map((x) => (
            <Chip key={x.slug} href={paths.skillCity(c.slug, x.slug)} count={x.totale}>
              {x.name}
            </Chip>
          ))}
        </div>
      )}

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
            <Link href={`${base}?page=${pagina + 1}`} className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25">
              avanti →
            </Link>
          )}
        </nav>
      )}

      <div className="mt-12">
        <QuoteBox href={paths.quote()} position="end" context={`Ti serve ${c.nome.toLowerCase()}?`} />
      </div>

      <section className="mt-12">
        <p className="t-kicker mb-3">Altre competenze</p>
        <div className="flex flex-wrap gap-2">
          {altre
            .filter((x) => x.slug !== c.slug)
            .slice(0, 24)
            .map((x) => (
              <Chip key={x.slug} href={`/competenze/${x.slug}/`} count={x.totale}>
                {x.nome}
              </Chip>
            ))}
        </div>
      </section>

      <JsonLd
        data={collectionPageJsonLd({
          name: c.nome,
          description: `${totale} professionisti in Italia che dichiarano di fare ${c.nome.toLowerCase()}, ordinati per recensioni.`,
          path: base,
          total: totale,
        })}
      />
    </div>
  );
}
