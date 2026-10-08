import Link from "next/link";
import { importCsvAction } from "@/app/admin/agency-actions";
import { Badge, Button, Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt, paths } from "@/lib/site";
import { agencyCompleteness } from "@/modules/directory/completeness";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const IN = "rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";

export default async function AgenciesPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const stato = first(sp.stato) ?? "tutte";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { domain: { contains: q.toLowerCase() } }, { city: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
    ...(stato === "pubblicate" ? { published: true } : stato === "bozze" ? { published: false } : stato === "fixture" ? { source: "fixture" } : {}),
  };
  const [total, rows, bySource] = await Promise.all([
    db.agency.count({ where }),
    db.agency.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * 50, take: 50, include: { city: { select: { name: true } }, _count: { select: { services: true, reviews: true, assignments: true } } } }),
    db.agency.groupBy({ by: ["source"], _count: true }),
  ]);
  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">Professionisti</h1>
          <p className="t-meta mt-1">{fmt(total)} schede · {bySource.map((s) => `${s.source}: ${s._count}`).join(" · ")}</p>
        </div>
        <Button href="/admin/agenzie/nuova/" arrow className="min-h-10 px-5 py-2 text-sm">Nuova scheda</Button>
      </div>
      {first(sp.msg) && <p className="rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{first(sp.msg)}</p>}
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="cerca nome, dominio, città" className={IN} />
        <input type="hidden" name="stato" value={stato} />
        <Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Cerca</Button>
        <span className="mx-2 text-ink-3">·</span>
        {[["tutte", "Tutte"], ["pubblicate", "Pubblicate"], ["bozze", "Bozze"], ["fixture", "Dati di prova"]].map(([k, v]) => <Chip key={k} href={`/admin/agenzie/?stato=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} active={stato === k}>{v}</Chip>)}
      </form>
      <div className="overflow-x-auto rounded-card border border-line bg-canvas">
        <table className="w-full text-sm">
          <thead className="t-kicker border-b border-line text-left"><tr>{["Nome", "Città", "Completezza", "Servizi", "Recensioni", "Punteggio", "Fonte", "Stato", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="px-3 py-3 text-ink-2" colSpan={9}>Nessuna scheda.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface">
                <td className="px-3 py-2"><Link href={`/admin/agenzie/${a.id}/`} className="font-semibold text-action">{a.name}</Link>{a.domain && <span className="t-meta block">{a.domain}</span>}</td>
                <td className="px-3 py-2">{a.city?.name ?? "—"}</td>
                <td className="px-3 py-2">{(() => { const c = agencyCompleteness({ ...a, servicesCount: a._count.services }); return <span title={c.missing.length ? `Manca: ${c.missing.join(", ")}` : "Scheda completa"} className={`inline-flex min-w-12 justify-center rounded-pill px-2 py-0.5 text-xs font-bold ${c.score >= 80 ? "bg-ok-soft text-ok" : c.score >= 50 ? "bg-warn text-warn-fg" : "bg-surface text-ink-2"}`}>{c.score}%</span>; })()}</td>
                <td className="px-3 py-2">{a._count.services}</td><td className="px-3 py-2">{a._count.reviews}</td><td className="px-3 py-2">{a.score.toFixed(2)}</td><td className="px-3 py-2 text-ink-2">{a.source}</td>
                <td className="px-3 py-2"><Badge tone={a.published ? "ok" : "neutral"}>{a.published ? "pubblicata" : "bozza"}</Badge>{a.verified && <span className="t-kicker ml-2 text-ok">verificata</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{a.published && <Link href={paths.agency(a.slug)} className="mr-3 text-ink-2 hover:text-action">Vedi</Link>}<Link href={`/admin/agenzie/${a.id}/report/`} className="text-ink-2 hover:text-action">Report</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 50 && <p className="t-meta">Pagina {page} di {Math.ceil(total / 50)} · {page * 50 < total && <Link href={`/admin/agenzie/?stato=${stato}&q=${encodeURIComponent(q)}&page=${page + 1}`} className="font-bold text-action">successiva →</Link>}</p>}
      <details className="rounded-card border border-line bg-canvas p-5">
        <summary className="t-title cursor-pointer">Importa da CSV</summary>
        <p className="t-meta mt-2">Colonne: <code>nome; sito; telefono; email; indirizzo; cap; citta; descrizione; servizi</code> (slug separati da |). Le schede entrano come bozze salvo spunta.</p>
        <form action={importCsvAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="publish" /> pubblica subito</label>
          <Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Importa</Button>
        </form>
      </details>
    </div>
  );
}
