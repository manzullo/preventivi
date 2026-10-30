import Link from "next/link";
import { Button } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt, paths } from "@/lib/site";

export const revalidate = 3600;

// Pagina non trovata: invece del vicolo cieco, le tre strade utili
// (cerca per nome, classifiche più viste, modulo preventivi).
export default async function NonTrovata() {
  const [professionisti, top] = await Promise.all([
    db.agency.count({ where: { published: true } }),
    db.landingPage.findMany({
      where: { published: true, kind: { in: ["service_city", "service", "city"] } },
      select: { path: true, title: true, resultCount: true },
      orderBy: { resultCount: "desc" },
      take: 6,
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="t-kicker mb-2">Pagina non trovata</p>
      <h1 className="t-h1">Questo indirizzo non esiste</h1>
      <p className="t-lead mt-3">
        Può essere un link vecchio o un errore di battitura. In elenco ci sono {fmt(professionisti)} professionisti: si trovano da qui.
      </p>

      <div className="mt-7 flex flex-wrap gap-3">
        <Button href="/cerca/" arrow>
          Cerca un&apos;professionista per nome
        </Button>
        <Link href={paths.quote()} className="rounded-pill border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/25 hover:text-action">
          Ricevi fino a 3 preventivi
        </Link>
      </div>

      {top.length > 0 && (
        <div className="mt-10">
          <p className="t-kicker mb-3">Le classifiche più consultate</p>
          <ul className="divide-y divide-line rounded-card border border-line">
            {top.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface">
                  <span className="font-semibold text-ink">{p.title}</span>
                  <span className="t-meta">{fmt(p.resultCount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
