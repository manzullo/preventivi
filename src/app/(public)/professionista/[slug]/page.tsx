import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgencyCard } from "@/components/AgencyCard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AgencyReviews } from "@/components/AgencyReviews";
import { JsonLd } from "@/components/JsonLd";
import { Logo } from "@/components/Logo";
import { SedeMappa } from "@/components/SedeMappa";
import { Badge, Button, Kicker, Rating, SectionHead } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt, paths } from "@/lib/site";
import { topAgencies } from "@/modules/directory/listing";
import { agencyJsonLd, descriptions, pageMeta, titles } from "@/modules/directory/seo";
import { factSummary } from "@/modules/directory/summary";
import { agencyFaq, faqJsonLd } from "@/modules/directory/faq";
import { publishedPages } from "@/modules/directory/pages";
import { settings } from "@/lib/settings";
import { parseExternal } from "@/modules/ranking/score";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

async function getAgency(slug: string) {
  return db.agency.findUnique({
    where: { slug },
    include: {
      city: { include: { region: true } },
      services: { include: { service: true }, orderBy: { weight: "desc" } },
      reviews: { orderBy: { publishedAt: "desc" }, take: 20 },
      photos: { orderBy: { position: "asc" }, take: 6 },
    },
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAgency(slug);
  if (!a || !a.published) return {};
  return pageMeta({
    title: a.metaTitle?.trim() || titles.agency(a.name, a.city?.name),
    description: a.metaDescription?.trim() || descriptions.agency(a.name, a.city?.name, a.services.map((s) => s.service.name)),
    path: paths.agency(a.slug),
  });
}


export default async function AgencyPage({ params, searchParams }: { params: Params; searchParams: Promise<{ fonte?: string; ordina?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await getAgency(slug);
  if (!a || !a.published) notFound();

  const primary = a.services[0]?.service;
  const similar = a.city
    ? await topAgencies({
        serviceSlug: primary?.slug,
        cityIds: [a.city.id],
        take: 3,
        excludeId: a.id,
      })
    : [];

  // Link interni keyword-rich solo verso pagine servizio × città pubblicate.
  const cityPages = a.city ? await publishedPages({ kind: "service_city", cityId: a.city.id }) : [];
  const hasPair = (serviceSlug: string) => cityPages.some((p) => p.service?.slug === serviceSlug);
  const bodyLinks = a.city ? a.services.filter((s) => hasPair(s.service.slug)).slice(0, 3) : [];

  const crumbs = [{ name: "Home", href: "/" }];
  if (primary) crumbs.push({ name: primary.plural, href: paths.service(primary.slug) });
  if (a.city && primary) {
    // La pagina servizio × città esiste solo sopra PUBLISH_THRESHOLD: dove non
    // c'è, la briciola porta alla pagina della città, che esiste sempre.
    crumbs.push({
      name: a.city.name,
      href: hasPair(primary.slug) ? paths.serviceCity(primary.slug, a.city.slug) : paths.city(a.city.slug),
    });
  }
  crumbs.push({ name: a.name, href: paths.agency(a.slug) });

  const quoteHref = paths.quote({ professionista: a.slug, servizio: primary?.slug, citta: a.city?.slug });
  const site = await settings.site();
  const skills = (Array.isArray(a.skills) ? (a.skills as string[]) : []).slice(0, 24);
  const externals = parseExternal(a.externalRatings);
  // Sedi in più della stessa azienda: una scheda sola, gli indirizzi elencati qui.
  const sediInPiu = (Array.isArray(a.locations) ? (a.locations as { via?: string; cap?: string; citta?: string }[]) : []).filter((l) => l && (l.via || l.citta));
  const social = Object.entries((a.social as Record<string, string | null> | null) ?? {}).filter((e): e is [string, string] => Boolean(e[1]));
  const SOURCE_NAME: Record<string, string> = { google: "Google", google_maps: "Google", osm: "OpenStreetMap", prontopro: "ProntoPro", paginegialle: "PagineGialle" };
  const faq = agencyFaq(a, { auto: site.faqAuto });
  const waHref =
    site.whatsappCta && a.whatsapp
      ? `https://wa.me/${a.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Ciao ${a.name}, vi ho trovato su Preventivi e vorrei un preventivo.`)}`
      : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs items={crumbs} />
      <JsonLd data={agencyJsonLd({ ...a, description: a.description ?? factSummary(a) })} />

      <header className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div>
          <Kicker className="mb-2">
            {[a.city?.name, a.city?.region?.name].filter(Boolean).join(" · ") || "Italia"}
          </Kicker>
          <div className="flex items-center gap-4">
            {a.logoUrl && (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-canvas">
                <Logo src={a.logoUrl} alt={`Logo ${a.name}`} size={64} className="h-full w-full" />
              </span>
            )}
            <h1 className="t-h1">{a.name}</h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Rating value={a.rating} count={a.reviewCount} size="lg" />
            {a.verified && <Badge>Verificata</Badge>}
            {a.claimed && !a.verified && <Badge tone="neutral">Rivendicata</Badge>}
          </div>
          {externals.length > 0 && (
            <p className="t-meta mt-2">
              Recensioni con fonte:{" "}
              {externals.map((e, i) => (
                <span key={e.source}>
                  {i > 0 && " · "}
                  <a href={e.url} rel="noopener" target="_blank" className="font-semibold text-action">
                    {fmt(e.count)} su {SOURCE_NAME[e.source] ?? e.source} ({e.rating.toFixed(1)}) ↗
                  </a>
                </span>
              ))}
            </p>
          )}
          {a.services.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {a.services.map((s) => (
                <Link
                  key={s.service.slug}
                  href={a.city && hasPair(s.service.slug) ? paths.serviceCity(s.service.slug, a.city.slug) : paths.service(s.service.slug)}
                  className="rounded-pill bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink hover:bg-tonal hover:text-action"
                >
                  {s.service.name}
                </Link>
              ))}
            </div>
          )}
          {(a.description ?? factSummary(a)) && (
            <p className="t-body mt-6 max-w-3xl whitespace-pre-line text-ink-2">{a.description ?? factSummary(a)}</p>
          )}
          {skills.length > 0 && (
            <div className="mt-6">
              <p className="t-kicker mb-2">Competenze</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((sk) => (
                  <span key={sk} className="rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-ink-2">{sk}</span>
                ))}
              </div>
            </div>
          )}
          {bodyLinks.length > 0 && a.city && (
            <p className="t-meta mt-5 max-w-3xl">
              Confronta {a.name} con le altre{" "}
              {bodyLinks.map((s, i) => (
                <span key={s.service.slug}>
                  {i > 0 && (i === bodyLinks.length - 1 ? " e " : ", ")}
                  <Link href={paths.serviceCity(s.service.slug, a.city!.slug)} className="font-semibold text-action">
                    {s.service.plural.toLowerCase()} a {a.city!.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
        </div>

        <aside className="h-fit rounded-card border border-line bg-canvas p-5 shadow-card" data-agency={a.slug}>
          <p className="t-title">Contatta {a.name}</p>
          <p className="t-meta mt-1">Preventivo gratuito, risposta diretta dal professionista.</p>
          <div data-track="contact_click">
            <Button href={quoteHref} arrow className="mt-4 w-full">
              Chiedi un preventivo
            </Button>
          </div>
          <Link
            href={paths.quote({ servizio: primary?.slug, citta: a.city?.slug })}
            data-track="cta_click"
            data-cta="agency"
            className="t-meta mt-3 block text-center font-bold text-action"
          >
            Oppure ricevi fino a 3 preventivi da professionisti simili →
          </Link>
          {a.website && (
            <a
              href={a.website}
              rel="nofollow noopener"
              target="_blank"
              data-track="contact_click"
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-pill border-[1.5px] border-ink/15 px-6 py-3 text-[15px] font-bold text-ink hover:border-ink/35"
            >
              Vai al sito ↗
            </a>
          )}
          {waHref && (
            <a
              href={waHref}
              rel="nofollow noopener"
              target="_blank"
              data-track="contact_click"
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-pill bg-[#25D366] px-6 py-3 text-[15px] font-bold text-white hover:brightness-95"
            >
              Scrivi su WhatsApp
            </a>
          )}
          <dl className="t-meta mt-5 space-y-2">
            {a.phone && (
              <div className="flex justify-between gap-3">
                <dt>Telefono</dt>
                <dd className="text-ink">{a.phone}</dd>
              </div>
            )}
            {a.minBudget && (
              <div className="flex justify-between gap-3">
                <dt>Budget minimo</dt>
                <dd className="text-ink">da {fmt(a.minBudget)} €</dd>
              </div>
            )}
            {a.teamSize && (
              <div className="flex justify-between gap-3">
                <dt>Team</dt>
                <dd className="text-ink">{a.teamSize} persone</dd>
              </div>
            )}
            {a.foundedYear && (
              <div className="flex justify-between gap-3">
                <dt>Fondata</dt>
                <dd className="text-ink">{a.foundedYear}</dd>
              </div>
            )}
            {(a.street || a.city) && (
              <div className="flex justify-between gap-3">
                <dt>Indirizzo</dt>
                <dd className="text-right text-ink">{[a.street, a.postalCode, a.city?.name].filter(Boolean).join(", ")}</dd>
              </div>
            )}
            {sediInPiu.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt>{sediInPiu.length === 1 ? "Altra sede" : "Altre sedi"}</dt>
                <dd className="text-right text-ink">
                  {sediInPiu.map((l, i) => (
                    <span key={i} className="block">
                      {[l.via, l.cap, l.citta].filter(Boolean).join(", ")}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {a.vatNumber && (
              <div className="flex justify-between gap-3">
                <dt>Partita IVA</dt>
                <dd className="text-right text-ink">{a.vatNumber}</dd>
              </div>
            )}
          </dl>
          <SedeMappa lat={a.lat} lng={a.lng} nome={a.name} indirizzo={[a.street, a.city?.name].filter(Boolean).join(", ") || null} />
          {social.length > 0 && (
            <p className="t-meta mt-4 flex flex-wrap gap-3">
              {social.map(([k, url]) => (
                <a key={k} href={url} rel="nofollow noopener" target="_blank" className="font-semibold text-action capitalize">{k} ↗</a>
              ))}
            </p>
          )}
          {a.source === "osm" && a.sourceUrl && (
            // ODbL: chi mostra dati di OpenStreetMap deve citarne la fonte.
            <p className="t-meta mt-4">
              Dati della scheda:{" "}
              <a href={a.sourceUrl} rel="nofollow noopener" target="_blank" className="font-semibold text-action">© OpenStreetMap contributors ↗</a>
            </p>
          )}
          {!a.verified && (
            <p className="t-meta mt-4">
              Sei il titolare?{" "}
              <Link href={`/rivendica/${a.slug}/`} className="font-bold text-action">
                Rivendica la scheda
              </Link>
              {" · "}
              <Link href="/area/" className="font-bold text-action">
                Entra nell&apos;area
              </Link>
            </p>
          )}
        </aside>
      </header>

      <AgencyReviews
        agencyId={a.id}
        path={paths.agency(a.slug)}
        nome={a.name}
        params={sp}
        totaleDichiarato={a.reviewCount}
        mediaDichiarata={a.rating}
        esterni={externals}
      />

      {faq.length > 0 && (
        <section className="mt-14">
          <SectionHead kicker="Domande frequenti" title={`Domande su ${a.name}`} />
          <div className="max-w-3xl divide-y divide-line rounded-card border border-line bg-canvas">
            {faq.map((f) => (
              <details key={f.q} className="px-5 py-4">
                <summary className="t-title cursor-pointer">{f.q}</summary>
                <p className="t-body mt-2 text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
          <JsonLd data={faqJsonLd(faq)} />
        </section>
      )}

      {similar.length > 0 && a.city && (
        <section className="mt-14">
          <SectionHead
            kicker="Stessa città, stesso servizio"
            title={`Professionisti simili a ${a.city.name}`}
            action={
              // Senza la pagina servizio × città il link non si mostra: le
              // professionisti simili restano, il rimando a una pagina che non esiste no.
              primary && hasPair(primary.slug) && (
                <Link href={paths.serviceCity(primary.slug, a.city.slug)} className="t-meta font-bold text-action">
                  Tutte le {primary.plural.toLowerCase()} a {a.city.name} →
                </Link>
              )
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((s) => (
              <AgencyCard key={s.id} agency={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
