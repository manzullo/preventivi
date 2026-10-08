"use client";

// "Vicino a te" (Tabbble): con il permesso del browser mostra i professionisti
// più vicini, ordinati per distanza dalla posizione. Nessuna posizione viene
// salvata: la richiesta parte solo al click.

import Link from "next/link";
import { useState } from "react";
import { AgencyCard } from "./AgencyCard";
import type { AgencyCardData } from "@/modules/directory/listing";

type Result = {
  mode: "distance" | "city";
  city: { slug: string; name: string } | null;
  path: string | null;
  cityDistKm: number | null;
  items: (AgencyCardData & { distKm?: number })[];
};

const km = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1).replace(".", ",").replace(",0", "")} km`);

export function NearYou() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  const fail = (m: string) => { setErr(m); setState("error"); };

  const locate = () => {
    if (!("geolocation" in navigator)) return fail("Questo browser non permette la geolocalizzazione: scegli la città qui sopra.");
    setState("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/near/?lat=${pos.coords.latitude.toFixed(4)}&lng=${pos.coords.longitude.toFixed(4)}`);
          if (!r.ok) throw new Error();
          const data = (await r.json()) as Result;
          if (!data.items?.length) return fail("Non abbiamo ancora professionisti vicino a te: scegli la città qui sopra.");
          setRes(data);
          setState("done");
        } catch {
          fail("Non riesco a trovare professionisti vicino a te in questo momento.");
        }
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          fail("Il browser non ci ha dato la posizione. Consenti l'accesso alla posizione per questo sito (icona accanto all'indirizzo) e riprova.");
        } else if (e.code === e.TIMEOUT) {
          fail("La posizione ci sta mettendo troppo ad arrivare. Riprova, oppure scegli la città qui sopra.");
        } else {
          fail("Posizione non disponibile su questo dispositivo: scegli la città qui sopra.");
        }
      },
      { timeout: 20000, maximumAge: 300000, enableHighAccuracy: false },
    );
  };

  if (state === "done" && res) {
    return (
      <div>
        <p className="t-body mb-4 text-ink-2">
          {res.mode === "distance" ? (
            <>I professionisti più vicini alla tua posizione, dal più vicino.</>
          ) : (
            <>Vicino a te non abbiamo ancora schede con indirizzo: ecco i migliori a <strong className="text-ink">{res.city?.name}</strong> ({res.cityDistKm} km).</>
          )}{" "}
          {res.path && res.city && <Link href={res.path} className="font-bold text-action">Tutti i professionisti a {res.city.name} →</Link>}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {res.items.map((a) => (
            <div key={a.id} className="flex flex-col gap-1">
              {typeof a.distKm === "number" && <p className="t-meta font-bold text-ink-2">a {km(a.distKm)} da te</p>}
              <AgencyCard agency={a} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-dashed border-line p-8 text-center">
      <p className="t-title">Professionisti vicino a te</p>
      <p className="t-meta mt-1">Usa la posizione del browser per vedere chi lavora più vicino a te. Non la salviamo.</p>
      <button type="button" onClick={locate} disabled={state === "loading"} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-pill border-[1.5px] border-ink/15 px-6 py-3 text-[15px] font-bold text-ink hover:border-ink/35 disabled:opacity-60">
        {state === "loading" ? "Cerco…" : state === "error" ? "Riprova" : "Usa la mia posizione"}
      </button>
      {state === "error" && <p className="t-meta mt-3 text-brand">{err}</p>}
    </div>
  );
}
