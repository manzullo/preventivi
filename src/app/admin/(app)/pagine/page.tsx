import Link from "next/link";
import { Badge, Button, Chip } from "@/design/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PagesAdmin({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const kind = first(sp.tipo) === "blog" ? "blog" : first(sp.tipo) === "static" ? "static" : undefined;
  const rows = await db.page.findMany({ where: kind ? { kind } : {}, orderBy: [{ kind: "asc" }, { updatedAt: "desc" }] });
  const msg = first(sp.msg);
  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">Pagine e blog</h1>
          <p className="t-meta mt-1">Le statiche rispondono a /slug/, gli articoli a /blog/slug/. Testo in markdown semplice.</p>
        </div>
        <Button href="/admin/pagine/nuova/" arrow className="min-h-10 px-5 py-2 text-sm">Nuova pagina</Button>
      </div>
      {msg && <p className="rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <Chip href="/admin/pagine/" active={!kind}>Tutte</Chip>
        <Chip href="/admin/pagine/?tipo=static" active={kind === "static"}>Statiche</Chip>
        <Chip href="/admin/pagine/?tipo=blog" active={kind === "blog"}>Blog</Chip>
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-canvas">
        <table className="w-full text-sm">
          <thead className="t-kicker border-b border-line text-left"><tr>{["Titolo", "Tipo", "Path", "Stato", "Aggiornata", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="px-3 py-3 text-ink-2" colSpan={6}>Nessuna pagina.</td></tr>}
            {rows.map((p) => {
              const path = p.kind === "blog" ? `/blog/${p.slug}/` : `/${p.slug}/`;
              return (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-3 py-2"><Link href={`/admin/pagine/${p.id}/`} className="font-semibold text-action">{p.title}</Link></td>
                  <td className="px-3 py-2 text-ink-2">{p.kind === "blog" ? "articolo" : "statica"}</td>
                  <td className="px-3 py-2"><code className="text-xs">{path}</code></td>
                  <td className="px-3 py-2"><Badge tone={p.published ? "ok" : "neutral"}>{p.published ? "pubblicata" : "bozza"}</Badge></td>
                  <td className="px-3 py-2 text-ink-2">{p.updatedAt.toLocaleDateString("it-IT")}</td>
                  <td className="px-3 py-2">{p.published && <Link href={path} className="text-ink-2 hover:text-action">Vedi</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
