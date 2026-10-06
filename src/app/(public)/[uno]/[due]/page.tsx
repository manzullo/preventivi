import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ListingView } from "@/components/ListingView";
import { NotaAlias } from "@/components/Hubs";
import { Chip, SectionHead } from "@/design/ui";
import { CURRENT_YEAR, PUBLISH_THRESHOLD, fmt, minuscola, paths, plural } from "@/lib/site";
import { nearestCapitals } from "@/modules/directory/geo";
import { contaFiltri,
  agencyWhere,
  cityScopeIds,
  countAgencies,
  listAgencies,
  parseFilters,
  parsePage,
} from "@/modules/directory/listing";
import { aliasFaq, listingFaq, listingGuide } from "@/modules/directory/listingFaq";
import { nearbyGroups } from "@/modules/directory/nearby";
import { budgetStats, recentRequests, relatedPosts } from "@/modules/directory/proof";
import { settings } from "@/lib/settings";
import { db } from "@/lib/db";
import { landingIntro, pageMetaWithOverride, publishedPages } from "@/modules/directory/pages";
import { resolveTwo } from "@/modules/directory/resolve";
import { descriptions, headings, sottotitoli, titles } from "@/modules/directory/seo";

export const revalidate = 3600;

type Params = Promise<{ uno: string; due: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { uno, due } = await params;
  const r = await resolveTwo(uno, due);
  if (!r || r.kind === "redirect") return {};
  const n = await countAgencies({ serviceSlug: r.service.slug, cityIds: await cityScopeIds(r.city) });
  if (r.kind === "alias_city") {
    // Nel titolo il modo in cui si chiede la cosa, nella descrizione il modo in
    // cui si cercano i professionisti che la fanno: due frasi vicine, una pagina.
    const chi = r.alias.agencyLabel ?? `professionisti ${r.alias.label.toLowerCase()}`;
    return pageMetaWithOverride({
      title: `${r.alias.label} a ${r.city.name}: ${fmt(n)} professionisti a confronto`,
      description: `${chi} a ${r.city.name}: ${fmt(n)} professionisti ordinati per recensioni pubbliche, con fonte e link. Preventivi gratis.`,
      path: `/${r.alias.slug}/${r.city.slug}/`,
    });
  }
  return pageMetaWithOverride({
    title: titles.serviceCity(r.service.plural, r.city.name),
    description: descriptions.serviceCity(r.service.plural, r.city.name, n),
    path: paths.serviceCity(r.service.slug, r.city.slug),
  });
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { uno, due } = await params;
  const r = await resolveTwo(uno, due);
  if (!r) notFound();
  if (r.kind === "redirect") {
    if (r.status === 410 || !r.to) notFound();
    permanentRedirect(r.to);
  }
  const { service, city } = r;
  // Quando l'indirizzo è un modo di dire, cambiano titolo, testo e indirizzo di
  // base; i professionisti e i numeri restano quelli del servizio.
  const alias = r.kind === "alias_city" ? r.alias : null;
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const ids = await cityScopeIds(city);

  const unfiltered = await countAgencies({ serviceSlug: service.slug, cityIds: ids });
  if (unfiltered < PUBLISH_THRESHOLD) notFound();

  const [listing, conteggi] = await Promise.all([
    listAgencies({ serviceSlug: service.slug, cityIds: ids, filters, page: parsePage(sp) }),
    contaFiltri({ serviceSlug: service.slug, cityIds: ids, filters }),
  ]);
  const nearby = listing.page === 1 ? await nearbyGroups({ service, city }) : [];

  // Blocchi che convertono (PIANO 3d): numeri veri, FAQ, guida corta, articoli.
  const scope = agencyWhere({ serviceSlug: service.slug, cityIds: ids });
  const [site, reviews, budget, recent, posts] = await Promise.all([
    settings.site(),
    db.agency.aggregate({ where: scope, _sum: { reviewCount: true } }),
    budgetStats(scope),
    recentRequests({ serviceId: service.id, cityId: city.id }),
    relatedPosts([service.name, service.plural]),
  ]);
  // Su un modo di dire le domande vanno scritte con il suo nome dei professionisti,
  // altrimenti la pagina ripete parola per parola quella del servizio e i
  // motori di ricerca ne tengono una sola delle due.
  const ctx = { servicePlural: alias?.agencyLabel ?? service.plural, serviceName: service.name, serviceSingular: service.singular, serviceGender: service.gender, cityName: city.name, total: unfiltered, reviewCount: reviews._sum.reviewCount ?? 0, budgetMedian: budget.median, budgetSamples: budget.samples };

  // Link interno: città vicine con la stessa pagina pubblicata, altri servizi
  // nella stessa città.
  const near = await nearestCapitals(city, 8);
  const [nearPages, otherServices] = await Promise.all([
    near.length
      ? publishedPages({ kind: "service_city", serviceId: service.id, cityIds: near.map((c) => c.id) })
      : Promise.resolve([]),
    publishedPages({ kind: "service_city", cityId: city.id, take: 8 }),
  ]);
  const nearOrdered = near
    .map((c) => nearPages.find((p) => p.city?.slug === c.slug))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 3);
  const others = otherServices.filter((p) => p.service?.slug !== service.slug).slice(0, 5);

  const basePath = alias ? `/${alias.slug}/${city.slug}/` : paths.serviceCity(service.slug, city.slug);
  // Il testo scritto a mano per questa città vince su quello del servizio: è
  // l'unico modo perché "a Roma" dica qualcosa di Roma.
  const introPagina = (await landingIntro(basePath)) ?? alias?.intro ?? service.intro;
  const crumbs = alias
    ? [
        { name: "Home", href: "/" },
        { name: alias.label, href: `/${alias.slug}/` },
        { name: city.name, href: basePath },
      ]
    : [
        { name: "Home", href: "/" },
        { name: service.plural, href: paths.service(service.slug) },
        { name: city.name, href: basePath },
      ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs items={crumbs} />
      <ListingView
        kicker={city.region ? `${city.region.name} · ${city.name}` : city.name}
        heading={alias ? `${alias.label} a ${city.name} ${CURRENT_YEAR}` : headings.serviceCity(service.plural, city.name)}
        sottotitolo={
          alias
            ? `Confronta le migliori ${minuscola(alias.agencyLabel ?? service.plural)} di ${city.name} e scegli quella più adatta.`
            : sottotitoli.serviceCity(service.plural, city.name)
        }
        intro={introPagina}
        basePath={basePath}
        items={listing.items}
        total={listing.total}
        page={listing.page}
        pageCount={listing.pageCount}
        filters={filters}
        conteggi={conteggi}
        servizioSlug={service.slug}
        cittaSlug={city.slug}
        quoteHref={paths.quote({ servizio: service.slug, citta: city.slug, lavoro: alias?.label })}
        listName={alias ? `${alias.agencyLabel ?? service.plural} a ${city.name}` : `${service.plural} a ${city.name}`}
        nearby={nearby}
        serviceLabel={service.plural}
        faq={[...(alias ? aliasFaq(alias, service.plural, city.name) : []), ...listingFaq(ctx)]}
        guide={listingGuide(ctx)}
        posts={posts}
        recent={recent}
        heroStile={site.heroStyle}
      />

      {(nearOrdered.length > 0 || others.length > 0) && (
        <section className="mt-14 grid gap-10 md:grid-cols-2">
          {nearOrdered.length > 0 && (
            <div>
              <SectionHead
                kicker="Nei dintorni"
                title={`${alias ? alias.label : service.plural} nelle città vicine`}
              />
              <ul className="space-y-2">
                {nearOrdered.map((p) => (
                  <li key={p.path}>
                    {/* Dentro un modo di dire si resta nel modo di dire: chi è
                        arrivato con quelle parole le ritrova anche a Milano. */}
                    <Link
                      href={alias && p.city ? `/${alias.slug}/${p.city.slug}/` : p.path}
                      className="t-body font-semibold text-action hover:text-action-hover"
                    >
                      {alias ? alias.label : service.plural} a {p.city?.name}
                    </Link>
                    <span className="t-meta">
                      {" "}
                      · {fmt(p.resultCount)} {plural(p.resultCount, "professionista", "professionisti")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <SectionHead kicker="Stessa città" title={`Altri servizi a ${city.name}`} />
              <div className="flex flex-wrap gap-2">
                {others.map((p) => (
                  <Chip key={p.path} href={p.path} count={p.resultCount}>
                    {p.service?.plural}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {alias && <NotaAlias alias={alias} service={service} city={city} />}
    </div>
  );
}
