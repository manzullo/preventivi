// Tutte le recensioni di una singolo professionista: filtri per fonte e voto,
// ordinamento e pagine da 20. Ogni stato è un indirizzo, così la pagina resta
// condivisibile; il canonical però punta sempre alla versione senza filtri.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SOURCE_LABEL } from "@/components/AgencyReviews";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { numeriPagina } from "@/components/ListingView";
import { Logo } from "@/components/Logo";
import { QuoteBox } from "@/components/QuoteCta";
import { Rating } from "@/design/ui";
import { db } from "@/lib/db";
import { absoluteUrl, fmt, paths, plural } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";
import { parseExternal } from "@/modules/ranking/score";

export const revalidate = 1800;
const PER_PAGINA = 20;

type Params = Promise<{ slug: string }>;
type Search = Promise<{ fonte?: string; voto?: string; ordina?: string; pagina?: string }>;

const etichetta = (s: string) => SOURCE_LABEL[s] ?? s;

async function getAgenzia(slug: string) {
  return db.agency.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      published: true,
      rating: true,
      reviewCount: true,
      logoUrl: true,
      externalRatings: true,
      city: { select: { name: true, slug: true } },
      services: {
        select: { service: { select: { name: true, slug: true, plural: true } } },
        orderBy: { weight: "desc" },
        take: 3,
      },
    },
  });
}

function percorso(slug: string) {
  return `${paths.agency(slug)}recensioni/`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAgenzia(slug);
  if (!a || !a.published) return { robots: { index: false, follow: false } };
  const n = Math.max(a.reviewCount, 0);
  const dove = a.city ? ` a ${a.city.name}` : "";
  return pageMeta({
    title: n
      ? `${a.name}: ${fmt(n)} ${plural(n, "recensione", "recensioni")} con fonte e data`
      : `${a.name}: recensioni dei clienti`,
    description: n
      ? `Tutte le ${fmt(n)} recensioni di ${a.name}${dove}: voto, autore, mese e link all'originale. Filtra per fonte e per stelle.`
      : `Recensioni di ${a.name}${dove}. Nessuna recensione pubblica registrata finora: qui compaiono appena arrivano, con la fonte.`,
    path: percorso(a.slug),
  });
}

export default async function RecensioniAgenzia({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await getAgenzia(slug);
  if (!a || !a.published) notFound();

  const base = percorso(a.slug);
  const fonte = sp.fonte;
  const voto = Number(sp.voto) >= 1 && Number(sp.voto) <= 5 ? Number(sp.voto) : undefined;
  const ordina = sp.ordina === "alto" || sp.ordina === "basso" || sp.ordina === "lunghe" ? sp.ordina : "recenti";
  const paginaChiesta = Math.max(1, Number(sp.pagina) || 1);

  const where = {
    agencyId: a.id,
    ...(fonte ? { source: fonte } : {}),
    ...(voto ? { rating: voto } : {}),
  };

  const [totaleFiltrate, perVoto, perFonte] = await Promise.all([
    db.review.count({ where }),
    db.review.groupBy({ by: ["rating"], where: { agencyId: a.id }, _count: { _all: true } }),
    db.review.groupBy({ by: ["source"], where: { agencyId: a.id }, _count: { _all: true } }),
  ]);

  const pagine = Math.max(1, Math.ceil(totaleFiltrate / PER_PAGINA));
  const pagina = Math.min(paginaChiesta, pagine);

  const righe = await db.review.findMany({
    where,
    orderBy:
      ordina === "alto"
        ? [{ rating: "desc" }, { publishedAt: { sort: "desc", nulls: "last" } }]
        : ordina === "basso"
          ? [{ rating: "asc" }, { publishedAt: { sort: "desc", nulls: "last" } }]
          : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (pagina - 1) * PER_PAGINA,
    take: PER_PAGINA,
    select: { id: true, author: true, rating: true, text: true, publishedAt: true, source: true, sourceUrl: true },
  });

  const conDettaglio = perVoto.reduce((n, v) => n + v._count._all, 0);
  const totaleTutte = Math.max(a.reviewCount ?? 0, conDettaglio);
  const soloConteggiate = Math.max(0, totaleTutte - conDettaglio);
  const esterni = parseExternal(a.externalRatings);
  const somma = perVoto.reduce((n, v) => n + v.rating * v._count._all, 0);
  const media = a.rating ?? (conDettaglio ? somma / conDettaglio : 0);
  const conteggio = (v: number) => perVoto.find((p) => p.rating === v)?._count._all ?? 0;
  const servizi = a.services.map((s) => s.service);
  const quoteHref = paths.quote({ professionista: a.slug, servizio: servizi[0]?.slug, citta: a.city?.slug });

  const link = (patch: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const finale: Record<string, string | number | undefined> = {
      fonte,
      voto,
      ordina: ordina === "recenti" ? undefined : ordina,
      pagina: undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(finale)) if (v !== undefined && v !== "") q.set(k, String(v));
    const s = q.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };

  const Chip = ({ href, attivo, children }: { href: string; attivo: boolean; children: React.ReactNode }) => (
    <Link
      href={href}
      className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${attivo ? "border-action bg-tonal text-action" : "border-line text-ink hover:border-ink/25"}`}
    >
      {children}
    </Link>
  );

  const crumbs = [
    { name: "Home", href: "/" },
    ...(a.city ? [{ name: a.city.name, href: paths.city(a.city.slug) }] : []),
    { name: a.name, href: paths.agency(a.slug) },
    { name: "Recensioni", href: base },
  ];

  // Dati strutturati: le recensioni di questa pagina, appese al professionista.
  // Serve a farsi citare con il voto anche quando in SERP compare questa pagina.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: a.name,
    url: absoluteUrl(paths.agency(a.slug)),
    ...(a.city ? { address: { "@type": "PostalAddress", addressLocality: a.city.name, addressCountry: "IT" } } : {}),
    ...(media && totaleTutte
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(media.toFixed(1)),
            reviewCount: totaleTutte,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(righe.length
      ? {
          review: righe.slice(0, 10).map((r) => ({
            "@type": "Review",
            ...(r.author ? { author: { "@type": "Person", name: r.author } } : {}),
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            ...(r.text ? { reviewBody: r.text.slice(0, 600) } : {}),
            ...(r.publishedAt ? { datePublished: r.publishedAt.toISOString().slice(0, 10) } : {}),
            ...(r.sourceUrl ? { url: r.sourceUrl } : {}),
            publisher: { "@type": "Organization", name: etichetta(r.source) },
          })),
        }
      : {}),
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Breadcrumbs items={crumbs} />

      <div className="flex items-start gap-4">
        {a.logoUrl && (
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-canvas p-1.5">
            <Logo src={a.logoUrl} alt={a.name} size={44} />
          </span>
        )}
        <div className="min-w-0">
          <p className="t-kicker mb-1">Recensioni con la fonte</p>
          <h1 className="t-h1">Recensioni di {a.name}</h1>
          <p className="t-meta mt-2">
            {[a.city?.name, ...servizi.map((s) => s.name)].filter(Boolean).join(" · ")}
            {" · "}
            <Link href={paths.agency(a.slug)} className="font-semibold text-action hover:underline">
              torna alla scheda
            </Link>
          </p>
        </div>
      </div>

      {totaleTutte === 0 ? (
        <>
          <p className="t-lead mt-6 max-w-3xl">
            Nessuna recensione pubblica registrata per {a.name}. Non ne scriviamo noi: appena i clienti ne pubblicano
            su Google o sui portali, compaiono qui con autore, data e link all&apos;originale.
          </p>
          <div className="mt-10">
            <QuoteBox href={quoteHref} position="end" context={`Vuoi lavorare con ${a.name}?`} />
          </div>
        </>
      ) : (
        <>
          <p className="t-lead mt-4 max-w-3xl">
            {fmt(totaleTutte)} {plural(totaleTutte, "recensione", "recensioni")} in totale
            {conDettaglio > 0 && `, ${fmt(conDettaglio)} ${plural(conDettaglio, "leggibile", "leggibili")} qui sotto`}.
            Ognuna riporta chi l&apos;ha scritta, quando e su quale sito.
          </p>
          {soloConteggiate > 0 && (
            <p className="t-body mt-2 max-w-3xl text-ink-2">
              Le altre {fmt(soloConteggiate)} arrivano dalle valutazioni complessive delle fonti
              {esterni.length
                ? ` (${esterni.map((e) => (e.count > 0 ? `${etichetta(e.source)} ${e.rating.toFixed(1)} su ${fmt(e.count)}` : `${etichetta(e.source)} ${e.rating.toFixed(1)}`)).join(", ")})`
                : ""}
              : contano nella media, ma il testo resta sul sito della fonte.
            </p>
          )}

          <div className="mt-6 grid gap-6 rounded-card border border-line bg-surface p-6 sm:grid-cols-[auto_1fr]">
            <div className="text-center sm:pr-6">
              <p className="text-[44px] font-extrabold leading-none tracking-[-0.02em] text-ink">{media.toFixed(1)}</p>
              <div className="mt-2 flex justify-center">
                <Rating value={media} count={totaleTutte} />
              </div>
              {soloConteggiate > 0 && <p className="t-meta mt-2">barre sulle {fmt(conDettaglio)} con dettaglio</p>}
            </div>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((v) => {
                const n = conteggio(v);
                const perc = conDettaglio ? Math.round((n / conDettaglio) * 100) : 0;
                const attivo = voto === v;
                return (
                  <Link
                    key={v}
                    href={link({ voto: attivo ? undefined : v })}
                    aria-label={`Mostra solo le recensioni da ${v} stelle`}
                    className={`flex items-center gap-3 rounded-slot px-1 py-0.5 hover:bg-tonal/60 ${attivo ? "bg-tonal" : ""}`}
                  >
                    <span className="t-meta w-3 text-right">{v}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-pill bg-tonal">
                      <span className="block h-full rounded-pill bg-action" style={{ width: `${perc}%` }} />
                    </span>
                    <span className="t-meta w-16 text-right">{fmt(n)}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {perFonte.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-meta w-14">Fonte</span>
                <Chip href={link({ fonte: undefined })} attivo={!fonte}>
                  tutte
                </Chip>
                {perFonte
                  .sort((x, y) => y._count._all - x._count._all)
                  .map((f) => (
                    <Chip key={f.source} href={link({ fonte: f.source })} attivo={fonte === f.source}>
                      {etichetta(f.source)} <span className="text-ink-3">{fmt(f._count._all)}</span>
                    </Chip>
                  ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-meta w-14">Voto</span>
              <Chip href={link({ voto: undefined })} attivo={!voto}>
                tutti
              </Chip>
              {[5, 4, 3, 2, 1].map((v) => {
                const n = conteggio(v);
                if (!n) return null;
                return (
                  <Chip key={v} href={link({ voto: v })} attivo={voto === v}>
                    {v} {plural(v, "stella", "stelle")} <span className="text-ink-3">{fmt(n)}</span>
                  </Chip>
                );
              })}
            </div>
            <div className="t-meta flex flex-wrap items-center gap-3">
              <span className="w-14">Ordine</span>
              {[
                { k: "recenti", l: "più recenti" },
                { k: "alto", l: "voto alto" },
                { k: "basso", l: "voto basso" },
              ].map((o) => (
                <Link
                  key={o.k}
                  href={link({ ordina: o.k === "recenti" ? undefined : o.k })}
                  className={ordina === o.k ? "font-semibold text-action" : "text-ink hover:text-action"}
                >
                  {o.l}
                </Link>
              ))}
            </div>
          </div>

          <p className="t-meta mt-5">
            {totaleFiltrate === conDettaglio
              ? `${fmt(conDettaglio)} ${plural(conDettaglio, "recensione leggibile", "recensioni leggibili")}`
              : `${fmt(totaleFiltrate)} ${plural(totaleFiltrate, "recensione", "recensioni")} con questi filtri, su ${fmt(conDettaglio)}`}
            {pagine > 1 ? ` · pagina ${pagina} di ${fmt(pagine)}` : ""}
          </p>

          {righe.length === 0 ? (
            <p className="t-body mt-8 text-ink-2">
              Nessuna recensione con questi filtri.{" "}
              <Link href={base} className="font-semibold text-action">
                Togli i filtri
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {righe.map((r) => (
                <li key={r.id} className="rounded-card border border-line bg-canvas p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="t-title">{r.author ?? "Cliente"}</p>
                    <Rating value={r.rating} count={1} />
                  </div>
                  {r.text ? (
                    <p className="t-body mt-2 text-ink-2">{r.text}</p>
                  ) : (
                    <p className="t-meta mt-2 italic">Valutazione senza commento.</p>
                  )}
                  <p className="t-meta mt-3">
                    {r.publishedAt
                      ? `${r.publishedAt.toLocaleDateString("it-IT", { year: "numeric", month: "long" })} · `
                      : ""}
                    {r.sourceUrl ? (
                      <a href={r.sourceUrl} rel="nofollow noopener" target="_blank" className="font-semibold text-action">
                        Fonte: {etichetta(r.source)} ↗
                      </a>
                    ) : (
                      <span>Fonte: {etichetta(r.source)}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {pagine > 1 && (
            <nav aria-label="Pagine delle recensioni" className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {pagina > 1 && (
                <Link
                  href={link({ pagina: pagina - 1 > 1 ? pagina - 1 : undefined })}
                  className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25"
                >
                  ← indietro
                </Link>
              )}
              {numeriPagina(pagina, pagine).map((n, i) =>
                n === 0 ? (
                  <span key={`salto-${i}`} className="t-meta px-1">
                    …
                  </span>
                ) : n === pagina ? (
                  <span
                    key={n}
                    aria-current="page"
                    className="rounded-pill border border-action bg-tonal px-3.5 py-2 text-sm font-semibold text-action"
                  >
                    {n}
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={link({ pagina: n > 1 ? n : undefined })}
                    className="rounded-pill border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:border-ink/25"
                  >
                    {n}
                  </Link>
                ),
              )}
              {pagina < pagine && (
                <Link
                  href={link({ pagina: pagina + 1 })}
                  className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25"
                >
                  avanti →
                </Link>
              )}
            </nav>
          )}

          <div className="mt-12">
            <QuoteBox href={quoteHref} position="end" context={`Vuoi un preventivo da ${a.name}?`} />
          </div>

          <p className="t-meta mt-6">
            <Link href="/recensioni/" className="font-semibold text-action hover:underline">
              Sfoglia le recensioni di tutti i professionisti →
            </Link>
          </p>
        </>
      )}

      <JsonLd data={jsonLd} />
    </div>
  );
}
