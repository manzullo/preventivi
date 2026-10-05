import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Kicker } from "@/design/ui";
import { pageMeta } from "@/modules/directory/seo";
import { currentOwnerId } from "@/modules/owner/auth";
import { requestOwnerLink } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "Area professionista",
  description: "Entra nell'area della tua attività: dati della scheda, richieste ricevute, statistiche.",
  path: "/area/",
  noindex: true,
});

export default async function AreaAccesso({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  if (await currentOwnerId()) redirect("/area/scheda/");
  const { msg } = await searchParams;
  const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-4 py-3 text-[15px] outline-none focus:border-action";
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <Kicker className="mb-2">Area professionista</Kicker>
      <h1 className="t-h1">Entra con la tua email di lavoro</h1>
      <p className="t-lead mt-3">
        Ti mandiamo un link di accesso: niente password da ricordare. Serve un indirizzo sul dominio del sito che compare
        nella scheda, così sappiamo che l&apos;professionista è la tua.
      </p>

      {msg && <p className="mt-5 rounded-slot border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink">{msg}</p>}

      <form action={requestOwnerLink} className="mt-6 flex flex-wrap gap-3">
        <input name="email" type="email" required placeholder="nome@tuaagenzia.it" className={`${IN} max-w-sm`} />
        <button type="submit" className="rounded-pill bg-action px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
          Mandami il link
        </button>
      </form>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          { t: "La scheda", d: "Testo, contatti, competenze, budget minimo, domande frequenti." },
          { t: "Le richieste", d: "Chi ti ha cercato: accetti e vedi i contatti, oppure rifiuti." },
          { t: "I numeri", d: "Quante volte compari, quanti aprono la scheda, quanti contatti." },
        ].map((c) => (
          <div key={c.t} className="rounded-card border border-line bg-surface p-5">
            <p className="font-semibold text-ink">{c.t}</p>
            <p className="t-body mt-1 text-ink-2">{c.d}</p>
          </div>
        ))}
      </div>

      <p className="t-meta mt-8">
        Non trovi la tua attività in elenco? <Link href="/candidatura/" className="text-action hover:underline">Candidala</Link>. Come funziona il resto è spiegato in{" "}
        <Link href="/per-agenzie/" className="text-action hover:underline">questa pagina</Link>.
      </p>
    </div>
  );
}
