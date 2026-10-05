"use client";

// "Vicino a te" (Tabbble): con il permesso del browser trova il capoluogo con
// pagina pubblicata più vicino e mostra le suoi professionisti. Nessuna posizione
// viene salvata: la richiesta parte solo al click.

import Link from "next/link";
import { useState } from "react";
import { AgencyCard } from "./AgencyCard";
import type { AgencyCardData } from "@/modules/directory/listing";

type Result = { city: { slug: string; name: string }; path: string; distKm: number; items: AgencyCardData[] };

export function NearYou() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  const locate = () => {
    if (!("geolocation" in navigator)) return fail("Il browser non permette la geolocalizzazione.");
    setState("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/near/?lat=${pos.coords.latitude.toFixed(4)}&lng=${pos.coords.longitude.toFixed(4)}`);
          if (!r.ok) throw new Error();
          setRes((await r.json()) as Result);
          setState("done");
        } catch {
          fail("Non riesco a trovare professionisti vicino a te in questo momento.");
        }
      },
      () => fail("Posizione non disponibile: puoi scegliere la città qui sopra."),
      { timeout: 8000, maximumAge: 600000 },
    );
  };
  const fail = (m: string) => { setErr(m); setState("error"); };

  if (state === "done" && res) {
    return (
      <div>
        <p className="t-body mb-4 text-ink-2">
          Il capoluogo più vicino con schede pubblicate è <strong className="text-ink">{res.city.name}</strong> ({res.distKm} km).{" "}
          <Link href={res.path} className="font-bold text-action">Tutte i professionisti a {res.city.name} →</Link>
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {res.items.map((a) => <AgencyCard key={a.id} agency={a} />)}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-dashed border-line p-8 text-center">
      <p className="t-title">Professionisti vicino a te</p>
      <p className="t-meta mt-1">Usa la posizione del browser per vedere il capoluogo più vicino. Non la salviamo.</p>
      <button type="button" onClick={locate} disabled={state === "loading"} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-pill border-[1.5px] border-ink/15 px-6 py-3 text-[15px] font-bold text-ink hover:border-ink/35 disabled:opacity-60">
        {state === "loading" ? "Cerco…" : "Usa la mia posizione"}
      </button>
      {state === "error" && <p className="t-meta mt-3 text-brand">{err}</p>}
    </div>
  );
}
