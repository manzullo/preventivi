import Link from "next/link";
import { notFound } from "next/navigation";
import { removePage, savePage } from "@/app/admin/page-actions";
import { Button } from "@/design/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";
function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}><span className="t-meta mb-1 block text-ink">{label}</span>{children}</label>;
}

export default async function PageEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "nuova";
  const p = isNew ? null : await db.page.findUnique({ where: { id } });
  if (!isNew && !p) notFound();
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const path = p ? (p.kind === "blog" ? `/blog/${p.slug}/` : `/${p.slug}/`) : null;
  return (
    <div className="max-w-4xl">
      <Link href="/admin/pagine/" className="t-meta font-bold text-action">← Pagine e blog</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="t-h1">{isNew ? "Nuova pagina" : p!.title}</h1>
        {p?.published && path && <Link href={path} className="t-meta font-bold text-action">Vedi sul sito →</Link>}
      </div>
      {msg && <p className="mb-4 rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}
      <form action={savePage} className="grid gap-4 rounded-card border border-line bg-canvas p-5 sm:grid-cols-2">
        {p && <input type="hidden" name="id" value={p.id} />}
        <F label="Tipo"><select name="kind" className={IN} defaultValue={p?.kind ?? "blog"}><option value="blog">Articolo del blog (/blog/slug/)</option><option value="static">Pagina statica (/slug/)</option></select></F>
        <F label="Slug (vuoto = dal titolo; rinominare una pagina pubblicata crea un 301)"><input name="slug" className={IN} defaultValue={p?.slug ?? ""} /></F>
        <F label="Titolo" wide><input name="title" required className={IN} defaultValue={p?.title ?? ""} /></F>
        <F label="Descrizione (meta description e anteprima nelle card)" wide><input name="description" className={IN} maxLength={170} defaultValue={p?.description ?? ""} /></F>
        <F label="Testo (markdown: ## titoli, - elenchi, **grassetto**, [link](/url/))" wide><textarea name="body" rows={18} className={`${IN} font-mono text-[13px]`} defaultValue={p?.body ?? ""} /></F>
        <div className="sm:col-span-2 rounded-slot border border-line bg-surface p-3">
          <p className="t-meta mb-1 text-ink">Blocchi dinamici: i risultati si interrogano, non si scrivono</p>
          <ul className="t-meta space-y-0.5">
            <li><code>[professionisti servizio=&quot;seo&quot; citta=&quot;roma&quot; numero=&quot;4&quot;]</code> schede vere, aggiornate a ogni visita</li>
            <li><code>[classifica servizio=&quot;seo&quot; citta=&quot;roma&quot; numero=&quot;10&quot;]</code> tabella numerata</li>
            <li><code>[numeri servizio=&quot;seo&quot; citta=&quot;roma&quot;]</code> quanti professionisti, recensioni, budget mediano</li>
            <li><code>[faq servizio=&quot;seo&quot; citta=&quot;roma&quot;]</code> domande e risposte dai dati</li>
            <li><code>[preventivi]</code> riquadro del modulo multi-preventivo</li>
            <li><code>[link servizio=&quot;seo&quot; citta=&quot;roma&quot; testo=&quot;professionisti SEO a Roma&quot;]</code> link interno</li>
          </ul>
          <p className="t-meta mt-1">Gli attributi <code>servizio</code> e <code>citta</code> sono gli slug delle pagine (es. <code>social-media</code>, <code>milano</code>); si possono omettere per l&apos;Italia intera.</p>
        </div>
        <label className="flex items-center gap-1.5 text-sm sm:col-span-2"><input type="checkbox" name="published" defaultChecked={p?.published ?? false} /> pubblicata</label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" className="min-h-10 px-5 py-2 text-sm">Salva</Button>
          {p && <span className="t-meta">creata {p.createdAt.toLocaleDateString("it-IT")}{p.publishedAt ? ` · pubblicata il ${p.publishedAt.toLocaleDateString("it-IT")}` : ""}</span>}
        </div>
      </form>
      {p && (
        <form action={removePage} className="mt-6"><input type="hidden" name="id" value={p.id} /><Button type="submit" variant="text" className="text-sm text-ink-2 hover:text-brand">Elimina pagina</Button></form>
      )}
    </div>
  );
}
