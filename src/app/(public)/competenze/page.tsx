// Indice delle competenze: la porta d'ingresso per chi sa già il mestiere che
// gli serve e non il servizio con cui lo chiamiamo noi.
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { QuoteBox } from "@/components/QuoteCta";
import { db } from "@/lib/db";
import { fmt, paths, plural } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";
import { competenze } from "@/modules/directory/skills";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Competenze dei professionisti: cerca per quello che ti serve",
  description:
    "Pronto intervento, caldaie, matrimoni, a domicilio: i lavori precisi dichiarati dai professionisti, con quanti li fanno.",
  path: "/competenze/",
});

export default async function CompetenzePage() {
  const [lista, professionisti] = await Promise.all([competenze(), db.agency.count({ where: { published: true } })]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Competenze", href: "/competenze/" }]} />
      <h1 className="t-h1 mt-4">Cerca per competenza</h1>
      <p className="t-lead mt-3 max-w-3xl">
        I servizi dicono il capitolo grande, le competenze dicono il mestiere. Queste sono quelle dichiarate dalle{" "}
        {fmt(professionisti)} professionisti in elenco, con quante ne lavorano su ciascuna.
      </p>

      <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/competenze/${c.slug}/`}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-canvas px-4 py-3 hover:border-ink/25"
            >
              <span className="font-semibold text-ink">{c.nome}</span>
              <span className="t-meta shrink-0">
                {fmt(c.totale)} {plural(c.totale, "professionista", "professionisti")}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12">
        <QuoteBox href={paths.quote()} position="end" />
      </div>
    </div>
  );
}
