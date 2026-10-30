// Pagine hub a un segmento: servizio, città, regione, classifica, alternativa,
// pagina statica. Ogni hub è un server component che interroga il DB.

import Link from "next/link";
import { AgencyCard } from "./AgencyCard";
import { Breadcrumbs } from "./Breadcrumbs";
import { JsonLd } from "./JsonLd";
import { ListingView } from "./ListingView";
import { Button, Chip, Kicker, SectionHead } from "@/design/ui";
import type { City, Competitor, Page, Region, Service, ServiceAlias } from "@/generated/prisma";
import { db } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { CURRENT_YEAR, fmt, minuscola, paths, plural } from "@/lib/site";
import { contaFiltri,
  agencyWhere,
  cityScopeIds,
  listAgencies,
  parseFilters,
  parsePage,
  topAgencies,
} from "@/modules/directory/listing";
import { aliasFaq, listingFaq, listingGuide, varianti } from "@/modules/directory/listingFaq";
import { landingIntro, publishedPages } from "@/modules/directory/pages";
import { budgetStats, recentRequests, relatedPosts } from "@/modules/directory/proof";
import { settings } from "@/lib/settings";
import { headings, itemListJsonLd, sottotitoli, titles } from "@/modules/directory/seo";

type SP = Record<string, string | string[] | undefined>;

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-5 py-10">{children}</div>;
}

/**
 * La riga che chiude la pagina di un modo di dire. Dice a chi legge che
 * l'elenco è lo stesso del servizio, e nomina gli altri modi di chiedere la
 * stessa cosa: una variante in più non merita un indirizzo suo, merita una
 * riga di testo dentro la pagina che già esiste.
 */
export function NotaAlias({
  alias,
  service,
  city,
}: {
  alias: ServiceAlias;
  service: Service;
  city?: { name: string; slug: string };
}) {
  const v = varianti(alias.variants);
  const href = city ? paths.serviceCity(service.slug, city.slug) : paths.service(service.slug);
  const testo = city ? `${service.plural} a ${city.name}` : service.plural;
  return (
    <p className="t-meta mt-8">
      I professionisti elencati qui sono le stesse della pagina{" "}
      <Link href={href} className="font-semibold text-action hover:underline">
        {testo}
      </Link>
      : stesso lavoro, parole diverse.
      {v.length > 0 && ` Si cerca anche come ${v.join(", ")}.`}
    </p>
  );
}

// ---------- Alias di servizio ----------

/**
 * "Pubblicità su ChatGPT" invece di "Professionisti LLM marketing": stessa lista di
 * professionisti, parole diverse. La pagina esiste solo se qualcuno le ha scritto un
 * testo suo, altrimenti l'indirizzo rimanda al servizio: una fotocopia con il
 * titolo cambiato non serve a chi legge e nemmeno ai motori di ricerca.
 */
export async function AliasHub({ alias, service, sp }: { alias: ServiceAlias; service: Service; sp: SP }) {
  const scope = agencyWhere({ serviceSlug: service.slug });
  const [cities, listing, conteggi, site, reviews, budget, recent] = await Promise.all([
    publishedPages({ kind: "service_city", serviceId: service.id, take: 24 }),
    listAgencies({ serviceSlug: service.slug, filters: parseFilters(sp), page: parsePage(sp) }),
    contaFiltri({ serviceSlug: service.slug, filters: parseFilters(sp) }),
    settings.site(),
    db.agency.aggregate({ where: scope, _sum: { reviewCount: true } }),
    budgetStats(scope),
    recentRequests({ serviceId: service.id }),
  ]);
  const ctx = {
    // Le domande generiche vanno scritte con il nome dei professionisti, non con il
    // nome del servizio: "quante pubblicità su chatgpt ci sono" non è italiano.
    servicePlural: alias.agencyLabel ?? service.plural,
    serviceName: service.name,
    serviceSingular: service.singular, serviceGender: service.gender,
    total: listing.total,
    reviewCount: reviews._sum.reviewCount ?? 0,
    budgetMedian: budget.median,
    budgetSamples: budget.samples,
  };
  return (
    <Shell>
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: service.plural, href: paths.service(service.slug) },
          { name: alias.label, href: `/${alias.slug}/` },
        ]}
      />
      {cities.length > 0 && (
        <section className="mb-8">
          <SectionHead kicker="Dove" title={`${alias.label} città per città`} />
          <div className="mt-4 flex flex-wrap gap-2">
            {cities.map((p) => (
              // Dentro un modo di dire si resta nel modo di dire: chi è arrivato
              // con quelle parole se le ritrova anche nella pagina della città.
              <Chip key={p.path} href={p.city ? `/${alias.slug}/${p.city.slug}/` : p.path} count={p.resultCount}>
                {p.city?.name}
              </Chip>
            ))}
          </div>
        </section>
      )}
      <ListingView
        kicker={`${fmt(listing.total)} ${plural(listing.total, "professionista", "professionisti")} in Italia`}
        heading={`${alias.label} ${CURRENT_YEAR}`}
        sottotitolo={`Confronta le migliori ${minuscola(alias.agencyLabel ?? service.plural)} italiane e scegli quella più adatta.`}
        intro={(await landingIntro(`/${alias.slug}/`)) ?? alias.intro}
        basePath={`/${alias.slug}/`}
        items={listing.items}
        total={listing.total}
        page={listing.page}
        pageCount={listing.pageCount}
        filters={parseFilters(sp)}
        conteggi={conteggi}
        servizioSlug={service.slug}
        quoteHref={paths.quote({ servizio: service.slug })}
        listName={alias.agencyLabel ?? service.plural}
        faq={[...aliasFaq(alias, service.plural), ...listingFaq(ctx)]}
        guide={listingGuide(ctx)}
        recent={recent}
        heroStile={site.heroStyle}
      />
      <NotaAlias alias={alias} service={service} />
    </Shell>
  );
}

// ---------- Servizio ----------

export async function ServiceHub({ service, sp }: { service: Service; sp: SP }) {
  const scope = agencyWhere({ serviceSlug: service.slug });
  const [cities, listing, conteggi, site, reviews, budget, recent, posts] = await Promise.all([
    publishedPages({ kind: "service_city", serviceId: service.id, take: 40 }),
    listAgencies({ serviceSlug: service.slug, filters: parseFilters(sp), page: parsePage(sp) }),
    contaFiltri({ serviceSlug: service.slug, filters: parseFilters(sp) }),
    settings.site(),
    db.agency.aggregate({ where: scope, _sum: { reviewCount: true } }),
    budgetStats(scope),
    recentRequests({ serviceId: service.id }),
    relatedPosts([service.name, service.plural]),
  ]);
  const ctx = { servicePlural: service.plural, serviceName: service.name, serviceSingular: service.singular, serviceGender: service.gender, total: listing.total, reviewCount: reviews._sum.reviewCount ?? 0, budgetMedian: budget.median, budgetSamples: budget.samples };
  return (
    <Shell>
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: service.plural, href: paths.service(service.slug) }]} />
      {cities.length > 0 && (
        <section className="mb-10">
          <SectionHead kicker="Per città" title={`${service.plural} vicino a te`} />
          <div className="flex flex-wrap gap-2">
            {cities.map((p) => (
              <Chip key={p.path} href={p.path} count={p.resultCount}>
                {p.city?.name}
              </Chip>
            ))}
          </div>
        </section>
      )}
      <ListingView
        kicker={`${fmt(listing.total)} ${plural(listing.total, "professionista", "professionisti")} in Italia`}
        heading={headings.service(service.plural)}
        sottotitolo={sottotitoli.service(service.plural)}
        intro={(await landingIntro(paths.service(service.slug))) ?? service.intro}
        basePath={paths.service(service.slug)}
        items={listing.items}
        total={listing.total}
        page={listing.page}
        pageCount={listing.pageCount}
        filters={parseFilters(sp)}
        conteggi={conteggi}
        servizioSlug={service.slug}
        quoteHref={paths.quote({ servizio: service.slug })}
        listName={service.plural}
        faq={listingFaq(ctx)}
        guide={listingGuide(ctx)}
        posts={posts}
        recent={recent}
        heroStile={site.heroStyle}
      />
    </Shell>
  );
}

// ---------- Città ----------

export async function CityHub({ city, sp }: { city: City & { region: Region | null }; sp: SP }) {
  const ids = await cityScopeIds(city);
  const scope = agencyWhere({ cityIds: ids });
  const [services, listing, conteggi, site, reviews, budget, recent] = await Promise.all([
    publishedPages({ kind: "service_city", cityId: city.id, take: 30 }),
    listAgencies({ cityIds: ids, filters: parseFilters(sp), page: parsePage(sp) }),
    contaFiltri({ cityIds: ids, filters: parseFilters(sp) }),
    settings.site(),
    db.agency.aggregate({ where: scope, _sum: { reviewCount: true } }),
    budgetStats(scope),
    recentRequests({ cityId: city.id }),
  ]);
  const ctx = { cityName: city.name, total: listing.total, reviewCount: reviews._sum.reviewCount ?? 0, budgetMedian: budget.median, budgetSamples: budget.samples };
  const crumbs = [{ name: "Home", href: "/" }];
  if (city.region) crumbs.push({ name: city.region.name, href: paths.region(city.region.slug) });
  crumbs.push({ name: city.name, href: paths.city(city.slug) });
  return (
    <Shell>
      <Breadcrumbs items={crumbs} />
      {services.length > 0 && (
        <section className="mb-10">
          <SectionHead kicker="Per servizio" title={`Cosa cerchi a ${city.name}`} />
          <div className="flex flex-wrap gap-2">
            {services.map((p) => (
              <Chip key={p.path} href={p.path} count={p.resultCount}>
                {p.service?.plural}
              </Chip>
            ))}
          </div>
        </section>
      )}
      <ListingView
        kicker={city.region ? `${city.region.name} · ${city.province}` : city.province}
        heading={headings.city(city.name)}
        sottotitolo={sottotitoli.city(city.name)}
        basePath={paths.city(city.slug)}
        items={listing.items}
        total={listing.total}
        page={listing.page}
        pageCount={listing.pageCount}
        filters={parseFilters(sp)}
        conteggi={conteggi}
        cittaSlug={city.slug}
        quoteHref={paths.quote({ citta: city.slug })}
        listName={`Professionisti a ${city.name}`}
        faq={listingFaq(ctx)}
        guide={listingGuide(ctx)}
        recent={recent}
        heroStile={site.heroStyle}
      />
    </Shell>
  );
}

// ---------- Regione ----------

export async function RegionHub({ region }: { region: Region }) {
  const cities = await db.city.findMany({
    where: { regionId: region.id, isCapital: true },
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
  const [pages, inRegion] = await Promise.all([
    publishedPages({ kind: "city", cityIds: cities.map((c) => c.id) }),
    db.agency.count({ where: { published: true, city: { regionId: region.id } } }),
  ]);
  return (
    <Shell>
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: region.name, href: paths.region(region.slug) }]} />
      <header className="mb-8">
        <Kicker className="mb-2">Regione</Kicker>
        <h1 className="t-h1">{headings.region(region.name)}</h1>
        <p className="t-lead mt-3 max-w-3xl">
          Le città della regione con almeno tre professionisti recensiti. Ogni città ha la sua classifica per servizio.
        </p>
      </header>
      {pages.length === 0 ? (
        <p className="t-body text-ink-2">Nessuna città con abbastanza professionisti in {region.name}, per ora.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <Link
              key={p.path}
              href={p.path}
              className="rounded-card border border-line bg-canvas p-5 shadow-card transition-colors hover:border-ink/25"
            >
              <p className="t-title">{p.city?.name}</p>
              <p className="t-meta mt-1">
                {fmt(p.resultCount)} {plural(p.resultCount, "professionista", "professionisti")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}

// ---------- Classifica nazionale ----------

export async function ComparisonPage({ service }: { service: Service }) {
  const [top, cities] = await Promise.all([
    topAgencies({ serviceSlug: service.slug, take: 10 }),
    publishedPages({ kind: "service_city", serviceId: service.id, take: 12 }),
  ]);
  return (
    <Shell>
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: service.plural, href: paths.service(service.slug) },
          { name: `Le migliori ${CURRENT_YEAR}`, href: paths.comparison(service.slug) },
        ]}
      />
      <header className="mb-8">
        <Kicker className="mb-2">Classifica {CURRENT_YEAR} · solo recensioni</Kicker>
        <h1 className="t-h1">{headings.comparison(service.plural)}</h1>
        <p className="t-lead mt-3 max-w-3xl">
          {service.intro} Le prime dieci in Italia per punteggio: media delle recensioni pesata sul
          numero e sulla data. Nessuna posizione è in vendita, la formula è in{" "}
          <Link href={paths.methodology()} className="font-semibold text-action">
            metodologia
          </Link>
          .
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {top.map((a, i) => (
          <AgencyCard key={a.id} agency={a} position={i + 1} />
        ))}
      </div>
      <JsonLd data={itemListJsonLd(titles.comparison(service.plural), top)} />
      {cities.length > 0 && (
        <section className="mt-12">
          <SectionHead kicker="Per città" title={`${service.plural} città per città`} />
          <div className="flex flex-wrap gap-2">
            {cities.map((p) => (
              <Chip key={p.path} href={p.path} count={p.resultCount}>
                {p.city?.name}
              </Chip>
            ))}
          </div>
        </section>
      )}
      <div className="mt-12 rounded-panel bg-tonal p-8 text-center">
        <p className="t-h2">Non vuoi confrontarle una a una?</p>
        <p className="t-body mt-2 text-ink-2">Chiedi un preventivo: selezioniamo noi i professionisti adatti e ti mettiamo in contatto.</p>
        <Button href={paths.quote({ servizio: service.slug })} arrow className="mt-6">
          Chiedi un preventivo
        </Button>
      </div>
    </Shell>
  );
}

// ---------- Alternativa a un concorrente ----------

export async function AlternativePage({ competitor }: { competitor: Competitor }) {
  const [services, total] = await Promise.all([
    publishedPages({ kind: "service", take: 12 }),
    db.agency.count({ where: { published: true } }),
  ]);
  const differences = [
    ["Il punteggio non si compra", "Viene dalle recensioni pubbliche. Una scheda può comparire in evidenza, ma lo dice: l'etichetta prende il posto del numero di posizione."],
    ["Contatti diretti", "Parli con il professionista, senza intermediari e senza commissioni sul contratto."],
    ["Metodologia pubblica", "La formula del punteggio è scritta, datata e uguale per tutti."],
    ["Recensioni con la fonte", "Ogni recensione riporta da dove viene e rimanda all'originale."],
  ];
  return (
    <Shell>
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: `Alternative a ${competitor.name}`, href: paths.alternative(competitor.slug) }]} />
      <header className="mb-8">
        <Kicker className="mb-2">Confronto</Kicker>
        <h1 className="t-h1">{headings.alternative(competitor.name)}</h1>
        {competitor.summary && <p className="t-lead mt-3 max-w-3xl">{competitor.name}: {competitor.summary}</p>}
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        {differences.map(([t, d]) => (
          <div key={t} className="rounded-card border border-line bg-canvas p-5 shadow-card">
            <p className="t-title">{t}</p>
            <p className="t-body mt-1 text-ink-2">{d}</p>
          </div>
        ))}
      </section>
      <p className="t-meta mt-6">
        Oggi in directory: {fmt(total)} {plural(total, "professionista", "professionisti")}.
      </p>
      {services.length > 0 && (
        <section className="mt-12">
          <SectionHead kicker="Parti da un servizio" title="Cosa cerchi" />
          <div className="flex flex-wrap gap-2">
            {services.map((p) => (
              <Chip key={p.path} href={p.path} count={p.resultCount}>
                {p.service?.plural}
              </Chip>
            ))}
          </div>
        </section>
      )}
      <div className="mt-12">
        <Button href={paths.quote()} arrow>
          Chiedi un preventivo
        </Button>
      </div>
    </Shell>
  );
}

// ---------- Pagina statica ----------

export function StaticPage({ page }: { page: Page }) {
  return (
    <Shell>
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: page.title, href: `/${page.slug}/` }]} />
      <h1 className="t-h1 mb-6">{page.title}</h1>
      <div className="prose-basic t-body max-w-3xl" dangerouslySetInnerHTML={{ __html: renderMarkdown(page.body) }} />
    </Shell>
  );
}
