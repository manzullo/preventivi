import Link from "next/link";
import { saveLandingMeta } from "@/app/admin/page-actions";
import { Button } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-1.5 text-sm outline-none focus:border-action";

export default async function SeoAdmin({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const msg = first(sp.msg);
  const where = { published: true, ...(q ? { path: { contains: q } } : {}) };
  const [total, rows, custom] = await Promise.all([
    db.landingPage.count({ where }),
    db.landingPage.findMany({ where, orderBy: [{ resultCount: "desc" }, { path: "asc" }], skip: (page - 1) * 30, take: 30, select: { id: true, path: true, title: true, kind: true, resultCount: true, metaTitle: true, metaDescription: true } }),
    db.landingPage.count({ where: { published: true, OR: [{ metaTitle: { not: null } }, { metaDescription: { not: null } }] } }),
  ]);
  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="t-h1">SEO pagine</h1>
        <p className="t-meta mt-1">{fmt(total)} landing page pubblicate · {fmt(custom)} con title o description personalizzati. Vuoto = template automatico (numero professionisti e anno aggiornati da soli).</p>
      </div>
      {msg && <p className="rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="cerca nel path, es. /agenzie-seo/" className={`${IN} max-w-sm`} />
        <Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Cerca</Button>
      </form>
      <div className="space-y-3">
        {rows.length === 0 && <p className="t-meta">Nessuna pagina.</p>}
        {rows.map((r) => (
          <form key={r.id} action={saveLandingMeta} className="grid gap-2 rounded-card border border-line bg-canvas p-4 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="q" value={q} />
            <div className="sm:col-span-3">
              <Link href={r.path} className="font-semibold text-action">{r.path}</Link>
              <span className="t-meta ml-2">{r.kind} · {fmt(r.resultCount)} professionisti · titolo automatico: {r.title}</span>
            </div>
            <input name="metaTitle" className={IN} maxLength={70} placeholder="meta title personalizzato" defaultValue={r.metaTitle ?? ""} />
            <input name="metaDescription" className={IN} maxLength={170} placeholder="meta description personalizzata" defaultValue={r.metaDescription ?? ""} />
            <Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Salva</Button>
          </form>
        ))}
      </div>
      {total > 30 && <p className="t-meta">Pagina {page} di {Math.ceil(total / 30)} · {page * 30 < total && <Link href={`/admin/seo/?q=${encodeURIComponent(q)}&page=${page + 1}`} className="font-bold text-action">successiva →</Link>}</p>}
    </div>
  );
}
