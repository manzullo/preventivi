import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { QuoteButton } from "@/components/QuoteCta";
import { db } from "@/lib/db";
import { fmt, paths } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";
import { SearchByName } from "./SearchByName";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Cerca un professionista per nome",
  description: "Cerca per nome il professionista che stai valutando: recensioni con fonte, servizi, contatti e posizione in classifica.",
  path: "/cerca/",
});

export default async function CercaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [professionisti, recensioni] = await Promise.all([
    db.agency.count({ where: { published: true } }),
    db.review.count(),
  ]);
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Cerca per nome", href: "/cerca/" }]} />
      <h1 className="t-h1 mt-4">Cerca un&apos;professionista per nome</h1>
      <p className="t-lead mt-3">
        Hai già un nome sul tavolo? Cercalo qui: vedi recensioni con la fonte, servizi dichiarati e contatti.
        In elenco ci sono {fmt(professionisti)} professionisti e {fmt(recensioni)} recensioni pubbliche.
      </p>

      <div className="mt-7">
        <SearchByName initial={q} />
      </div>

      <div className="mt-10 rounded-card border border-line bg-surface p-6">
        <p className="t-title">Non sai ancora quale scegliere?</p>
        <p className="t-body mt-1 text-ink-2">Chiedi un preventivo una volta sola: ricevi fino a 3 preventivi da confrontare.</p>
        <div className="mt-4">
          <QuoteButton href={paths.quote()} position="mid" />
        </div>
      </div>

      <p className="t-meta mt-6">
        Cerchi per servizio o per città? Vai alle <Link href="/#servizi" className="text-action hover:underline">classifiche per servizio</Link> o alle{" "}
        <Link href="/#citta" className="text-action hover:underline">città</Link>.
      </p>
    </div>
  );
}
