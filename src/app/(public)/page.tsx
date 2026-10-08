import Link from "next/link";
import { AgencyCard } from "@/components/AgencyCard";
import { HeroSearch } from "@/components/HeroSearch";
import { QuoteButton } from "@/components/QuoteCta";
import { NearYou } from "@/components/NearYou";
import { Button, Chip, Kicker, SectionHead } from "@/design/ui";
import { HOW_IT_WORKS, PRO_CTA_LABEL, PRO_CTA_QUESTION } from "@/lib/cta";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/markdown";
import { fmt, paths, plural } from "@/lib/site";
import { agencyCardSelect, topAgencies } from "@/modules/directory/listing";
import { publishedPages } from "@/modules/directory/pages";
import { competenze } from "@/modules/directory/skills";

export const revalidate = 3600;

export default async function Home() {
  const [agencies, reviews, cities, services, cityPages, pairPages, top, fresh, posts] = await Promise.all([
    db.agency.count({ where: { published: true } }),
    db.review.count(),
    db.landingPage.count({ where: { kind: "city", published: true } }),
    db.service.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    publishedPages({ kind: "city" }),
    publishedPages({ kind: "service_city" }),
    topAgencies({ take: 6 }),
    db.agency.findMany({ where: { published: true, publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, take: 6, select: agencyCardSelect }),
    db.page.findMany({ where: { kind: "blog", published: true }, orderBy: { publishedAt: "desc" }, take: 3, select: { slug: true, title: true, description: true, body: true, publishedAt: true } }),
  ]);
  const [servicePagesRaw, skills, aliasServizi, comuniConAgenzie] = await Promise.all([
    publishedPages({ kind: "service" }),
    competenze(),
    db.serviceAlias.findMany({
      where: { service: { active: true } },
      select: { slug: true, label: true, published: true, intro: true, service: { select: { slug: true } } },
      orderBy: { position: "asc" },
    }),
    db.city.findMany({
      where: { isCapital: false, agencies: { some: { published: true } } },
      select: { slug: true, name: true, capitalSlug: true },
      orderBy: { name: "asc" },
      take: 400,
    }),
  ]);
  const servicePages = new Map(servicePagesRaw.map((p) => [p.service?.slug, p.resultCount]));

  // Ricerca "Dove": capoluoghi con pagina, comuni minori come parole chiave
  // del loro capoluogo (chi scrive "Fiumicino" trova Roma).
  const capitalSlugs = cityPages.map((p) => p.city?.slug).filter((s): s is string => Boolean(s));
  const minors = await db.city.findMany({ where: { isCapital: false, capitalSlug: { in: capitalSlugs } }, select: { name: true, capitalSlug: true } });
  const keywords = new Map<string, string[]>();
  for (const m of minors) {
    const list = keywords.get(m.capitalSlug as string) ?? [];
    list.push(m.name);
    keywords.set(m.capitalSlug as string, list);
  }
  // Primo campo: le tipologie di professionista (i servizi con pagina) e sotto le
  // competenze, che sono il mestiere preciso e hanno una pagina loro.
  const searchServices = [
    ...services.filter((s) => servicePages.has(s.slug)).map((s) => ({ value: s.slug, label: s.plural, gruppo: "tipologia" })),
    ...skills.map((c) => ({
      value: `skill:${c.slug}`,
      label: c.nome,
      gruppo: "competenza",
      hint: `${c.totale}`,
      href: paths.skill(c.slug),
      // Con la città scelta si va sull'incrocio, che ora esiste.
      base: paths.skill(c.slug),
    })),
    // Come lo chiede la gente. Chi ha una pagina sua la usa anche in coppia con
    // la città ("Professionisti GEO" + "Roma" porta a /agenzie-geo/roma/); chi non ce
    // l'ha si appoggia al servizio, che è dove sta la stessa lista di professionisti.
    // Niente "href" qui dentro: fermerebbe la ricerca al primo campo e la città
    // scelta verrebbe buttata via.
    ...aliasServizi.map((a) => ({
      value: `alias:${a.slug}`,
      label: a.label,
      gruppo: "modo di dire",
      pair: a.service.slug,
      base: a.published && a.intro ? `/${a.slug}/` : undefined,
    })),
  ];

  // Secondo campo: le città con pagina propria e, sotto, i comuni che hanno
  // professionisti ma non una pagina: portano al capoluogo, dove quelle schede stanno.
  const conPagina = new Set(cityPages.map((p) => p.city?.slug).filter(Boolean) as string[]);
  const searchCities = [
    ...cityPages
      .filter((p) => p.city)
      .map((p) => ({ value: p.city!.slug, label: p.city!.name, hint: `${p.resultCount}`, keywords: keywords.get(p.city!.slug) })),
    ...comuniConAgenzie
      .filter((x) => !conPagina.has(x.slug) && x.capitalSlug && conPagina.has(x.capitalSlug))
      .map((x) => ({
        value: `comune:${x.slug}`,
        label: x.name,
        gruppo: `vedi ${x.capitalSlug}`,
        href: paths.city(x.capitalSlug as string),
      })),
  ];
  // Le categorie raggruppate per area, nell'ordine in cui le aree compaiono.
  const gruppi = [...services.reduce((m, s) => m.set(s.group ?? "Altro", [...(m.get(s.group ?? "Altro") ?? []), s]), new Map<string, typeof services>())];
  const pairs = pairPages.map((p) => `${p.service?.slug}|${p.city?.slug}`);

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-12 text-center">
        <Kicker className="mb-4">Professionisti e aziende · classifica per recensioni</Kicker>
        <h1 className="t-display mx-auto max-w-4xl">
          Trova il professionista giusto vicino a te e confronta i preventivi.
        </h1>
        <p className="t-lead mx-auto mt-5 max-w-2xl">
          Idraulici, elettricisti, fotografi, commercialisti e molti altri, città per città. L'ordine
          nasce dalle recensioni con la fonte; i preventivi sono gratis e senza impegno.
        </p>
        <HeroSearch services={searchServices} cities={searchCities} pairs={pairs} />
        <p className="t-meta mt-4">
          Hai già un nome in mente?{" "}
          <Link href="/cerca/" className="font-semibold text-action hover:underline">
            Cerca il professionista per nome
          </Link>
        </p>
        <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            [fmt(agencies), plural(agencies, "professionista", "professionisti")],
            [fmt(reviews), plural(reviews, "recensione", "recensioni")],
            [fmt(cities), plural(cities, "città", "città")],
            ["0 €", "per entrare in elenco"],
          ].map(([v, l]) => (
            <div key={l} className="flex flex-col-reverse">
              <dt className="t-kicker">{l}</dt>
              <dd className="t-h2">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="servizi" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-10">
        <SectionHead kicker="Per categoria" title="Cosa cerchi" />
        {gruppi.map(([gruppo, lista]) => (
        <div key={gruppo} className="mb-6">
        <p className="t-kicker mb-3">{gruppo}</p>
        <div className="flex flex-wrap gap-2">
          {lista.map((s) => {
            const n = servicePages.get(s.slug);
            return n ? (
              <Chip key={s.slug} href={paths.service(s.slug)} count={n}>
                {s.plural}
              </Chip>
            ) : (
              <span
                key={s.slug}
                className="inline-flex items-center rounded-pill border border-dashed border-ink/20 px-4 py-2 text-sm font-semibold text-ink-3"
                title="In arrivo"
              >
                {s.plural}
              </span>
            );
          })}
        </div>
        </div>
        ))}
      </section>

      {cityPages.length > 0 && (
        <section id="citta" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-10">
          <SectionHead kicker="Per città" title="Dove" />
          <div className="flex flex-wrap gap-2">
            {cityPages.slice(0, 24).map((p) => (
              <Chip key={p.path} href={p.path} count={p.resultCount}>
                {p.city?.name}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {top.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-10">
          <SectionHead
            kicker="In evidenza per recensioni"
            title="I più recensiti in Italia"
            action={
              <Link href={paths.methodology()} className="t-meta font-bold text-action">
                Come calcoliamo il punteggio →
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {top.map((a, i) => (
              <AgencyCard key={a.id} agency={a} position={i + 1} />
            ))}
          </div>
        </section>
      )}

      {fresh.length >= 3 && (
        <section className="mx-auto max-w-6xl px-5 py-10">
          <SectionHead kicker="Nuove schede" title="Appena arrivati" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fresh.map((a) => (
              <AgencyCard key={a.id} agency={a} />
            ))}
          </div>
        </section>
      )}

      {cityPages.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-10">
          <SectionHead kicker="Vicino a te" title="I professionisti della tua zona" />
          <NearYou />
        </section>
      )}

      {posts.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-10">
          <SectionHead
            kicker="Dal blog"
            title="Guide per scegliere bene"
            action={
              <Link href="/blog/" className="t-meta font-bold text-action">
                Tutti gli articoli →
              </Link>
            }
          />
          <div className="grid gap-4 md:grid-cols-3">
            {posts.map((p) => (
              <article key={p.slug} className="rounded-card border border-line bg-canvas p-5">
                <p className="t-kicker">{p.publishedAt?.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</p>
                <h3 className="t-title mt-2">
                  <Link href={`/blog/${p.slug}/`} className="hover:text-action">
                    {p.title}
                  </Link>
                </h3>
                <p className="t-body mt-2 line-clamp-3 text-ink-2">{p.description ?? excerpt(p.body)}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-panel bg-surface p-8 sm:p-12">
          <SectionHead kicker="Come funziona" title="Tre passi, zero commissioni" />
          <ol className="grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map(([t, d], i) => (
              <li key={t}>
                <p className="t-kicker mb-2">0{i + 1}</p>
                <p className="t-title">{t}</p>
                <p className="t-body mt-1 text-ink-2">{d}</p>
              </li>
            ))}
          </ol>
          <QuoteButton href={paths.quote()} position="end" className="mt-8" />
        </div>
      </section>

      {/* Il secondo pubblico, come nella home di Instapro: chi lavora deve
          capire in una riga che entrare è gratis e che le richieste arrivano. */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="flex flex-col gap-6 rounded-panel border border-line p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <Kicker className="mb-2">{PRO_CTA_QUESTION}</Kicker>
            <h2 className="t-h2">Fai crescere la tua attività con Mister Wolf</h2>
            <p className="t-body mt-2 text-ink-2">
              Iscrizione gratuita. Ricevi richieste di lavoro nella tua zona e per i lavori che fai davvero, scegli tu a quali rispondere.
              In classifica si sale solo con le recensioni.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 md:items-center">
            <Button href="/candidatura/" arrow>
              {PRO_CTA_LABEL}
            </Button>
            <Link href="/per-professionisti/" className="t-meta font-bold text-action">
              Come funziona per i professionisti →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
