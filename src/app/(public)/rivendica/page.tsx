import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";
import { SearchByName } from "../cerca/SearchByName";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Rivendica la scheda della tua attività",
  description: "Cerca la tua attività, verifica l'indirizzo email sul dominio e prendi il controllo della scheda: dati, servizi, contatti e richieste dei clienti.",
  path: "/rivendica/",
});

export default async function RivendicaIndice({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [professionisti, rivendicate] = await Promise.all([
    db.agency.count({ where: { published: true } }),
    db.agency.count({ where: { claimed: true } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Rivendica la scheda", href: "/rivendica/" }]} />
      <h1 className="t-h1 mt-4">Rivendica la scheda della tua attività</h1>
      <p className="t-lead mt-3">
        Sei già in elenco insieme ad altre {fmt(professionisti)} professionisti. Cerca il nome, verifica un indirizzo email sul dominio
        dell&apos;professionista e la scheda passa a te: dati, servizi, contatti, richieste dei clienti.
      </p>

      <div className="mt-7">
        <SearchByName initial={q} destinazione="rivendica" />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { n: "1", t: "Trova la scheda", d: "Cerca il nome del professionista qui sopra." },
          { n: "2", t: "Verifica l'email", d: "Ti arriva un link su un indirizzo del tuo dominio." },
          { n: "3", t: "Aggiorna i dati", d: "Servizi, contatti, competenze, foto e FAQ." },
        ].map((s) => (
          <div key={s.n} className="rounded-card border border-line bg-surface p-5">
            <p className="t-kicker mb-1">Passo {s.n}</p>
            <p className="font-semibold text-ink">{s.t}</p>
            <p className="t-body mt-1 text-ink-2">{s.d}</p>
          </div>
        ))}
      </div>

      <p className="t-meta mt-8">
        Schede già rivendicate: {fmt(rivendicate)}. Non trovi la tua attività?{" "}
        <Link href="/candidatura/" className="text-action hover:underline">Aggiungila da qui</Link>. Come funziona il resto lo spieghiamo in{" "}
        <Link href="/per-professionisti/" className="text-action hover:underline">questa pagina</Link>.
      </p>
    </div>
  );
}
