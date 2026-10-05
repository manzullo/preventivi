import Link from "next/link";
import { AgencyCard } from "./AgencyCard";
import { BarraFiltri } from "./BarraFiltri";
import { HeroBand, type HeroStyle } from "./HeroBand";
import { QuoteBox, StickyCta } from "./QuoteCta";
import { JsonLd } from "./JsonLd";
import { Chip, EmptyState, SectionHead, cn } from "@/design/ui";
import { PAGE_SIZE, fmt, paths, plural } from "@/lib/site";
import { faqJsonLd, type FaqItem } from "@/modules/directory/faq";
import type { GuideBlock } from "@/modules/directory/listingFaq";
import {
  BUDGET_RANGES,
  MIN_REVIEWS_OPTIONS,
  RATING_OPTIONS,
  TEAM_SIZES,
  type AgencyCardConEvidenza,
  type ConteggiFiltri,
  type ListingFilters,
} from "@/modules/directory/listing";
import type { NearbyGroup } from "@/modules/directory/nearby";
import { AgencyMap, type MapPoint } from "@/components/AgencyMap";
import { collectionPageJsonLd, itemListJsonLd } from "@/modules/directory/seo";

type Props = {
  heading: string;
  /** Riga sotto il titolo: dice cosa si fa qui, in una frase. */
  sottotitolo?: string;
  kicker?: string;
  intro?: string | null;
  basePath: string;
  items: AgencyCardConEvidenza[];
  total: number;
  page: number;
  pageCount: number;
  filters: ListingFilters;
  /** Quanti professionisti resterebbero per ogni opzione: il numero accanto alla voce. */
  conteggi?: ConteggiFiltri;
  /** Perimetro della pagina: serve al pannello per contare la stessa cosa. */
  servizioSlug?: string;
  cittaSlug?: string;
  quoteHref: string;
  listName: string;
  nearby?: NearbyGroup[];
  serviceLabel?: string;
  // Blocchi che convertono (PIANO 3d): tutti opzionali, gli hub li passano.
  faq?: FaqItem[];
  guide?: GuideBlock[];
  posts?: { slug: string; title: string; description: string | null; publishedAt: Date | null }[];
  recent?: number | null;
  /** Vestito della fascia: chiara, scura, blu, senza fascia, o a caso. */
  heroStile?: HeroStyle;
  updatedAt?: Date;
};

const MID_AFTER = 6; // il box "non vuoi chiamarli uno per uno?" dopo la 6ª card

/** Numeri da mostrare: prima, ultima e una finestra intorno alla corrente.
 *  Lo zero segna il salto (…): con 57 pagine l'elenco completo esce dallo schermo. */
export function numeriPagina(corrente: number, totale: number): number[] {
  if (totale <= 7) return Array.from({ length: totale }, (_, i) => i + 1);
  const set = new Set<number>([1, totale, corrente]);
  for (const d of [1, 2]) {
    if (corrente - d > 1) set.add(corrente - d);
    if (corrente + d < totale) set.add(corrente + d);
  }
  const ordinati = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  for (const [i, n] of ordinati.entries()) {
    if (i > 0 && n - ordinati[i - 1] > 1) out.push(0);
    out.push(n);
  }
  return out;
}

function hrefWith(basePath: string, filters: ListingFilters, patch: Partial<ListingFilters> & { page?: number }) {
  const merged = { ...filters, ...patch };
  return paths.withQuery(basePath, {
    recensioni: merged.minReviews,
    team: merged.team,
    voto: merged.minRating,
    budget: merged.budget,
    verificate: merged.verified ? "1" : undefined,
    // Cambiare filtro riporta sempre alla prima pagina: restare alla ventesima
    // di un elenco che si è appena accorciato è il modo più veloce per finire
    // su una pagina vuota.
    page: merged.page && merged.page > 1 ? merged.page : undefined,
  });
}

export function ListingView(p: Props) {
  const hasFilters = Boolean(p.filters.minReviews || p.filters.team || p.filters.minRating || p.filters.budget || p.filters.verified);
  const offset = (p.page - 1) * PAGE_SIZE;
  // Solo chi ha coordinate verificate finisce sulla mappa.
  const puntiMappa: MapPoint[] = p.items
    .filter((a): a is typeof a & { lat: number; lng: number } => typeof a.lat === "number" && typeof a.lng === "number")
    .map((a) => ({ slug: a.slug, name: a.name, lat: a.lat, lng: a.lng, rating: a.rating, reviewCount: a.reviewCount, city: a.city?.name ?? null }));
  // Data vera dell'ultimo dato mostrato, non la data di oggi.
  const aggiornata =
    p.updatedAt ??
    (p.items.length ? new Date(Math.max(...p.items.map((a) => new Date(a.updatedAt).getTime()))) : undefined);

  return (
    <section>
      <HeroBand kicker={p.kicker} heading={p.heading} subline={p.sottotitolo} quoteHref={p.quoteHref} stile={p.heroStile ?? "auto"} />
      {p.intro && <p className="t-lead mb-4 max-w-3xl">{p.intro}</p>}

      {/* Frase-definizione: un fatto citabile, con numero e data, per chi legge e per gli assistenti. */}
      <p className="t-meta mb-8 max-w-3xl">
        Trovate {fmt(p.total)} {p.listName.replace(/^Professionisti/, "professionisti").replace(/^Web/, "web")} ordinate per recensioni pubbliche verificabili.
        {/* Mese e anno del dato più recente mostrato, non di oggi: se un giorno
            l'archivio si ferma, la pagina lo dice invece di fingere. */}
        {aggiornata ? ` Dati aggiornati a ${aggiornata.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}.` : ""}
      </p>
      <JsonLd
        data={collectionPageJsonLd({
          name: p.heading,
          description: `${p.total} ${p.listName.replace(/^Professionisti/, "professionisti")} ordinate per recensioni pubbliche.`,
          path: p.basePath,
          dateModified: aggiornata,
          total: p.total,
        })}
      />

      <BarraFiltri
        basePath={p.basePath}
        filtri={p.filters}
        conteggi={p.conteggi}
        totale={p.total}
        servizio={p.servizioSlug}
        citta={p.cittaSlug}
      />

      <div className="mb-5 flex items-center justify-between border-b border-line pb-3">
        <p className="t-kicker">
          {fmt(p.total)} {plural(p.total, "professionista", "professionisti")}
        </p>
        <p className="t-kicker">Classifica per recensioni</p>
      </div>

      {p.items.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Nessun professionista con questi filtri." : "Nessun professionista ancora."}
          text="Prova a togliere un filtro, oppure descrivi il lavoro e ti proponiamo noi una selezione."
          primary={{ href: p.quoteHref, label: "Chiedi un preventivo" }}
          secondary={hasFilters ? { href: p.basePath, label: "Togli i filtri" } : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {p.items.slice(0, MID_AFTER).map((a, i) => (
              <AgencyCard key={a.id} agency={a} position={offset + i + 1} />
            ))}
          </div>
          {p.items.length > MID_AFTER && (
            <>
              <div className="my-6">
                <QuoteBox href={p.quoteHref} position="mid" context="Hai già scelto cosa e dove: manca solo il budget" recent={p.recent} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {p.items.slice(MID_AFTER).map((a, i) => (
                  <AgencyCard key={a.id} agency={a} position={offset + MID_AFTER + i + 1} />
                ))}
              </div>
            </>
          )}
          {puntiMappa.length >= 3 && (
            <div className="mt-8">
              <AgencyMap points={puntiMappa} />
            </div>
          )}
          <div className="mt-8">
            <QuoteBox href={p.quoteHref} position="end" recent={p.recent} />
          </div>
          <JsonLd data={itemListJsonLd(p.listName, p.items, offset)} />
        </>
      )}

      {p.pageCount > 1 && (
        <nav aria-label="Pagine" className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {p.page > 1 && (
            <Link href={hrefWith(p.basePath, p.filters, { page: p.page - 1 })} className="inline-flex h-10 items-center justify-center rounded-pill bg-surface px-4 text-sm font-bold text-ink hover:bg-tonal hover:text-action">
              ← indietro
            </Link>
          )}
          {numeriPagina(p.page, p.pageCount).map((n, i) =>
            n === 0 ? (
              <span key={`salto-${i}`} className="t-meta px-1">…</span>
            ) : (
              <Link
                key={n}
                href={hrefWith(p.basePath, p.filters, { page: n })}
                aria-current={n === p.page ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 min-w-10 items-center justify-center rounded-pill px-3 text-sm font-bold",
                  n === p.page ? "bg-ink text-white" : "bg-surface text-ink hover:bg-tonal hover:text-action",
                )}
              >
                {n}
              </Link>
            ),
          )}
          {p.page < p.pageCount && (
            <Link href={hrefWith(p.basePath, p.filters, { page: p.page + 1 })} className="inline-flex h-10 items-center justify-center rounded-pill bg-surface px-4 text-sm font-bold text-ink hover:bg-tonal hover:text-action">
              avanti →
            </Link>
          )}
        </nav>
      )}

      {p.nearby && p.nearby.length > 0 && (
        <div className="mt-14">
          <SectionHead kicker="Nei dintorni" title="Anche nelle città vicine" />
          <div className="space-y-8">
            {p.nearby.map((g) => (
              <div key={g.city.slug}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <Link href={g.path} className="t-title text-action hover:text-action-hover">
                    {p.serviceLabel ?? "Professionisti"} a {g.city.name} →
                  </Link>
                  <span className="t-meta">{g.distKm} km</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((a) => (
                    <AgencyCard key={a.id} agency={a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {p.guide && p.guide.length > 0 && (
        <div className="mt-14">
          <SectionHead kicker="In breve" title={`Guida per scegliere: ${p.listName.charAt(0).toLowerCase()}${p.listName.slice(1)}`} />
          <div className="grid gap-6 md:grid-cols-2">
            {p.guide.map((g) => (
              <div key={g.title} className="rounded-card border border-line bg-canvas p-5">
                <h2 className="t-title">{g.title}</h2>
                <p className="t-body mt-2 text-ink-2">{g.body}</p>
              </div>
            ))}
          </div>
          <p className="t-meta mt-4">
            Redazione Preventivi · aggiornata il {(p.updatedAt ?? new Date()).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} · <Link href={paths.methodology()} className="font-semibold text-action">metodologia</Link>
          </p>
        </div>
      )}

      {p.faq && p.faq.length > 0 && (
        <div className="mt-14">
          <SectionHead kicker="Domande frequenti" title={`Domande su ${p.listName.toLowerCase()}`} />
          <div className="max-w-3xl divide-y divide-line rounded-card border border-line bg-canvas">
            {p.faq.map((f) => (
              <details key={f.q} className="px-5 py-4">
                <summary className="t-title cursor-pointer">{f.q}</summary>
                <p className="t-body mt-2 text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
          <JsonLd data={faqJsonLd(p.faq)} />
          <div className="mt-6">
            <QuoteBox href={p.quoteHref} position="faq" context="Hai ancora dubbi? Falli decidere alle proposte" recent={p.recent} />
          </div>
        </div>
      )}

      {p.posts && p.posts.length > 0 && (
        <div className="mt-14">
          <SectionHead kicker="Dal blog" title="Per approfondire" action={<Link href="/blog/" className="t-meta font-bold text-action">Tutti gli articoli →</Link>} />
          <div className="grid gap-4 md:grid-cols-3">
            {p.posts.map((post) => (
              <article key={post.slug} className="rounded-card border border-line bg-canvas p-5">
                <p className="t-kicker">{post.publishedAt?.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</p>
                <h3 className="t-title mt-2">
                  <Link href={`/blog/${post.slug}/`} className="hover:text-action">{post.title}</Link>
                </h3>
                {post.description && <p className="t-body mt-2 line-clamp-2 text-ink-2">{post.description}</p>}
              </article>
            ))}
          </div>
        </div>
      )}

      <StickyCta href={p.quoteHref} />
    </section>
  );
}
