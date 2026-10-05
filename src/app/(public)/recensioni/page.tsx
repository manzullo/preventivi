import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { QuoteBox } from "@/components/QuoteCta";
import { Rating } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt, paths } from "@/lib/site";
import { SOURCE_LABEL } from "@/components/AgencyReviews";
import { pageMeta } from "@/modules/directory/seo";

export const revalidate = 1800;
const PER_PAGINA = 20;

export const metadata: Metadata = pageMeta({
  title: "Recensioni dei professionisti",
  description: "Tutte le recensioni pubbliche raccolte, con fonte e link all'originale. Filtra per fonte, voto, città o servizio.",
  path: "/recensioni/",
});

type Search = Promise<{ fonte?: string; voto?: string; citta?: string; servizio?: string; ordina?: string; pagina?: string }>;

export default async function Recensioni({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const fonte = sp.fonte;
  const voto = Number(sp.voto) >= 1 && Number(sp.voto) <= 5 ? Number(sp.voto) : undefined;
  const citta = sp.citta;
  const servizio = sp.servizio;
  const ordina = sp.ordina === "alto" || sp.ordina === "basso" ? sp.ordina : "recenti";
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  const where = {
    agency: {
      published: true,
      ...(citta ? { city: { slug: citta } } : {}),
      ...(servizio ? { services: { some: { service: { slug: servizio } } } } : {}),
    },
    ...(fonte ? { source: fonte } : {}),
    ...(voto ? { rating: voto } : {}),
  };

  const [totale, righe, perFonte, perVoto, citte, servizi] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy:
        ordina === "alto"
          ? [{ rating: "desc" }, { publishedAt: { sort: "desc", nulls: "last" } }]
          : ordina === "basso"
            ? [{ rating: "asc" }, { publishedAt: { sort: "desc", nulls: "last" } }]
            : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      select: {
        id: true, author: true, rating: true, text: true, publishedAt: true, source: true, sourceUrl: true,
        agency: { select: { slug: true, name: true, city: { select: { name: true, slug: true } }, services: { select: { service: { select: { name: true } } }, take: 2, orderBy: { weight: "desc" } } } },
      },
    }),
    db.review.groupBy({ by: ["source"], where: { agency: { published: true } }, _count: { _all: true } }),
    db.review.groupBy({ by: ["rating"], where: { agency: { published: true } }, _count: { _all: true } }),
    db.city.findMany({ where: { isCapital: true, agencies: { some: { published: true, reviews: { some: {} } } } }, select: { slug: true, name: true }, take: 12 }),
    db.service.findMany({ where: { active: true }, select: { slug: true, plural: true }, orderBy: { position: "asc" }, take: 12 }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const link = (patch: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const finale = { fonte, voto, citta, servizio, ordina: ordina === "recenti" ? undefined : ordina, pagina: undefined, ...patch };
    for (const [k, v] of Object.entries(finale)) if (v !== undefined && v !== "") q.set(k, String(v));
    const s = q.toString();
    return `/recensioni/${s ? `?${s}` : ""}`;
  };
  const Chip = ({ href, attivo, children }: { href: string; attivo: boolean; children: React.ReactNode }) => (
    <Link href={href} className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${attivo ? "border-action bg-tonal text-action" : "border-line text-ink hover:border-ink/25"}`}>
      {children}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Recensioni", href: "/recensioni/" }]} />
      <h1 className="t-h1 mt-4">Le recensioni dei professionisti</h1>
      <p className="t-lead mt-3 max-w-3xl">
        Ogni recensione riporta la fonte e il link all&apos;originale. Non ne scriviamo nessuna e non ne cancelliamo:
        quello che vedi è quello che i clienti hanno pubblicato altrove.
      </p>
      <p className="t-meta mt-2">{fmt(totale)} recensioni con questi filtri, su {fmt(perVoto.reduce((n, v) => n + v._count._all, 0))} in totale.</p>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-meta w-16">Fonte</span>
          <Chip href={link({ fonte: undefined })} attivo={!fonte}>tutte</Chip>
          {perFonte.sort((a, b) => b._count._all - a._count._all).map((f) => (
            <Chip key={f.source} href={link({ fonte: f.source })} attivo={fonte === f.source}>
              {SOURCE_LABEL[f.source] ?? f.source} <span className="text-ink-3">{fmt(f._count._all)}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-meta w-16">Voto</span>
          <Chip href={link({ voto: undefined })} attivo={!voto}>tutti</Chip>
          {[5, 4, 3, 2, 1].map((v) => {
            const n = perVoto.find((p) => p.rating === v)?._count._all ?? 0;
            if (!n) return null;
            return (
              <Chip key={v} href={link({ voto: v })} attivo={voto === v}>
                {v} stelle <span className="text-ink-3">{fmt(n)}</span>
              </Chip>
            );
          })}
        </div>
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
        <div className="t-meta flex flex-wrap items-center gap-3">
          <span className="w-16">Ordine</span>
          {[{ k: "recenti", l: "più recenti" }, { k: "alto", l: "voto alto" }, { k: "basso", l: "voto basso" }].map((o) => (
            <Link key={o.k} href={link({ ordina: o.k === "recenti" ? undefined : o.k })} className={ordina === o.k ? "font-semibold text-action" : "text-ink hover:text-action"}>
              {o.l}
            </Link>
          ))}
        </div>
      </div>

      {righe.length === 0 ? (
        <p className="t-body mt-10 text-ink-2">Nessuna recensione con questi filtri. <Link href="/recensioni/" className="font-semibold text-action">Togli i filtri</Link>.</p>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {righe.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-canvas p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={paths.agency(r.agency.slug)} className="font-semibold text-ink hover:text-action">{r.agency.name}</Link>
                  <p className="t-meta">{[r.agency.city?.name, ...r.agency.services.map((s) => s.service.name)].filter(Boolean).join(" · ")}</p>
                </div>
                <Rating value={r.rating} count={1} />
              </div>
              {r.text ? <p className="t-body mt-3 text-ink-2">{r.text.length > 320 ? `${r.text.slice(0, 320)}…` : r.text}</p> : <p className="t-meta mt-3 italic">Valutazione senza commento.</p>}
              <p className="t-meta mt-3">
                {r.author ?? "Cliente"}
                {r.publishedAt ? ` · ${r.publishedAt.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}` : ""}
                {" · "}
                {r.sourceUrl ? (
                  <a href={r.sourceUrl} rel="nofollow noopener" target="_blank" className="font-semibold text-action">{SOURCE_LABEL[r.source] ?? r.source} ↗</a>
                ) : (
                  <span>{SOURCE_LABEL[r.source] ?? r.source}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {pagine > 1 && (
        <nav aria-label="Pagine" className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {pagina > 1 && <Link href={link({ pagina: pagina - 1 })} className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25">← indietro</Link>}
          <span className="t-meta px-2">pagina {pagina} di {fmt(pagine)}</span>
          {pagina < pagine && <Link href={link({ pagina: pagina + 1 })} className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25">avanti →</Link>}
        </nav>
      )}

      <div className="mt-12">
        <QuoteBox href={paths.quote()} position="end" />
      </div>
    </div>
  );
}
