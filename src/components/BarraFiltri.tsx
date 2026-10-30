"use client";

// Sopra l'elenco resta una riga sola: il bottone che apre il pannello e le
// scelte già fatte, ognuna con la sua croce per toglierla al volo. Le quattro
// righe di pillole di prima occupavano mezzo schermo prima di far vedere una
// solo professionista.
import Link from "next/link";
import { useState } from "react";
import { PannelloFiltri } from "./PannelloFiltri";
import { fmt, plural } from "@/lib/site";
import { BUDGET_RANGES, type ConteggiFiltri, type ListingFilters } from "@/modules/directory/listing";

type Props = {
  basePath: string;
  filtri: ListingFilters;
  conteggi?: ConteggiFiltri;
  totale: number;
  servizio?: string;
  citta?: string;
};

/** Filtri attivi in parole, con l'indirizzo che li toglie uno per uno. */
function attivi(f: ListingFilters): { etichetta: string; senza: ListingFilters }[] {
  const out: { etichetta: string; senza: ListingFilters }[] = [];
  if (f.minRating) out.push({ etichetta: `da ${String(f.minRating).replace(".", ",")} in su`, senza: { ...f, minRating: undefined } });
  if (f.minReviews) out.push({ etichetta: `almeno ${f.minReviews} recensioni`, senza: { ...f, minReviews: undefined } });
  if (f.budget) {
    const b = BUDGET_RANGES.find((x) => x.key === f.budget);
    out.push({ etichetta: b?.label ?? f.budget, senza: { ...f, budget: undefined } });
  }
  if (f.team) out.push({ etichetta: `${f.team} persone`, senza: { ...f, team: undefined } });
  if (f.verified) out.push({ etichetta: "solo verificate", senza: { ...f, verified: undefined } });
  return out;
}

function href(basePath: string, f: ListingFilters): string {
  const q = new URLSearchParams();
  if (f.minRating) q.set("voto", String(f.minRating));
  if (f.minReviews) q.set("recensioni", String(f.minReviews));
  if (f.budget) q.set("budget", f.budget);
  if (f.team) q.set("team", f.team);
  if (f.verified) q.set("verificate", "1");
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function BarraFiltri({ basePath, filtri, conteggi, totale, servizio, citta }: Props) {
  const [aperto, setAperto] = useState(false);
  const scelti = attivi(filtri);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setAperto(true)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 text-sm font-bold transition-colors ${
          scelti.length ? "border-action bg-tonal text-action" : "border-line bg-surface text-ink hover:border-ink/25"
        }`}
      >
        <span aria-hidden>☰</span>
        Filtri
        {scelti.length > 0 && <span className="tabular-nums">{scelti.length}</span>}
      </button>

      {scelti.map((s) => (
        <Link
          key={s.etichetta}
          href={href(basePath, s.senza)}
          className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-canvas px-4 text-sm font-semibold text-ink hover:border-ink/25"
        >
          {s.etichetta}
          <span aria-hidden className="text-ink-3">×</span>
          <span className="sr-only">togli questo filtro</span>
        </Link>
      ))}

      {scelti.length > 0 && (
        <Link href={basePath} className="t-meta font-semibold text-action hover:underline">
          azzera
        </Link>
      )}

      <span className="t-meta ml-auto">
        {fmt(totale)} {plural(totale, "professionista", "professionisti")}
      </span>

      {aperto && (
        <PannelloFiltri
          basePath={basePath}
          filtri={filtri}
          conteggi={conteggi}
          totale={totale}
          servizio={servizio}
          citta={citta}
          onChiudi={() => setAperto(false)}
        />
      )}
    </div>
  );
}
