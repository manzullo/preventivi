"use client";

// Il pannello che sale dal basso, come su capodanno-roma.
//
// Le scelte valgono alla conferma, non subito: applicarle mentre il pannello è
// aperto farebbe muovere l'elenco sotto, e chi cambia idea non avrebbe niente
// da annullare. Il pulsante in fondo dice quanti professionisti resterebbero, e il
// numero arriva dal server mentre si tocca, così è sempre vero.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, plural } from "@/lib/site";
import {
  BUDGET_RANGES,
  MIN_REVIEWS_OPTIONS,
  RATING_OPTIONS,
  TEAM_SIZES,
  type ConteggiFiltri,
  type ListingFilters,
} from "@/modules/directory/listing";

type Props = {
  basePath: string;
  filtri: ListingFilters;
  conteggi?: ConteggiFiltri;
  totale: number;
  /** Perimetro della pagina, per far contare al server la stessa cosa. */
  servizio?: string;
  citta?: string;
  onChiudi: () => void;
};

type Voce = { chiave: string; etichetta: string; quanti?: number };
type Gruppo = { titolo: string; voci: Voce[] };

/** Filtri come indirizzo: la stessa forma che legge il server. */
function query(f: ListingFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.minRating) q.set("voto", String(f.minRating));
  if (f.minReviews) q.set("recensioni", String(f.minReviews));
  if (f.budget) q.set("budget", f.budget);
  if (f.team) q.set("team", f.team);
  if (f.verified) q.set("verificate", "1");
  return q;
}

const gruppoDi = (c: string) => c.slice(0, c.indexOf(":"));
const valoreDi = (c: string) => c.slice(c.indexOf(":") + 1);

/** Una voce toccata: se era scelta si spegne, altrimenti prende il posto dell'altra. */
function tocca(f: ListingFilters, chiave: string): ListingFilters {
  const g = gruppoDi(chiave);
  const v = valoreDi(chiave);
  const n = { ...f };
  if (g === "voto") n.minRating = n.minRating === Number(v) ? undefined : Number(v);
  if (g === "recensioni") n.minReviews = n.minReviews === Number(v) ? undefined : Number(v);
  if (g === "budget") n.budget = n.budget === v ? undefined : v;
  if (g === "team") n.team = n.team === v ? undefined : v;
  if (g === "verificate") n.verified = n.verified ? undefined : true;
  return n;
}

export function PannelloFiltri({ basePath, filtri, conteggi, totale, servizio, citta, onChiudi }: Props) {
  const router = useRouter();
  const [provvisori, setProvvisori] = useState<ListingFilters>(filtri);
  const [numeri, setNumeri] = useState<{ totale: number; conteggi?: ConteggiFiltri }>({ totale, conteggi });
  const [chiudendo, setChiudendo] = useState(false);
  const [aggiornando, setAggiornando] = useState(false);
  const primaVolta = useRef(true);

  useEffect(() => {
    const conEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudi();
    };
    window.addEventListener("keydown", conEsc);
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", conEsc);
      document.body.style.overflow = prima;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Numeri veri a ogni tocco: il server conta sul perimetro della pagina.
  useEffect(() => {
    if (primaVolta.current) {
      primaVolta.current = false;
      return;
    }
    const q = query(provvisori);
    if (servizio) q.set("servizio", servizio);
    if (citta) q.set("citta", citta);
    const stop = new AbortController();
    const t = window.setTimeout(async () => {
      setAggiornando(true);
      try {
        const r = await fetch(`/api/filtri?${q.toString()}`, { signal: stop.signal });
        if (r.ok) setNumeri(await r.json());
      } catch {
        // rete ballerina: restano i numeri di prima, meglio che nessun numero
      } finally {
        setAggiornando(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(t);
      stop.abort();
    };
  }, [provvisori, servizio, citta]);

  function chiudi() {
    setChiudendo(true);
    window.setTimeout(onChiudi, 180);
  }

  function applica() {
    const q = query(provvisori).toString();
    router.push(q ? `${basePath}?${q}` : basePath);
    chiudi();
  }

  const gruppi: Gruppo[] = useMemo(
    () => [
      {
        titolo: "Voto minimo",
        voci: RATING_OPTIONS.map((v) => ({
          chiave: `voto:${v}`,
          etichetta: `da ${String(v).replace(".", ",")} in su`,
          quanti: numeri.conteggi?.voto[v],
        })),
      },
      {
        titolo: "Quante recensioni",
        voci: MIN_REVIEWS_OPTIONS.map((n) => ({
          chiave: `recensioni:${n}`,
          etichetta: `almeno ${n}`,
          quanti: numeri.conteggi?.recensioni[n],
        })),
      },
      {
        titolo: "Prezzi a partire da",
        voci: BUDGET_RANGES.map((b) => ({ chiave: `budget:${b.key}`, etichetta: b.label, quanti: numeri.conteggi?.budget[b.key] })),
      },
      {
        titolo: "Persone in squadra",
        voci: TEAM_SIZES.map((t) => ({ chiave: `team:${t}`, etichetta: `${t} persone`, quanti: numeri.conteggi?.team[t] })),
      },
      {
        titolo: "Scheda",
        voci: [{ chiave: "verificate:1", etichetta: "solo verificate", quanti: numeri.conteggi?.verificate }],
      },
    ],
    [numeri],
  );

  const scelta = (chiave: string): boolean => {
    const g = gruppoDi(chiave);
    const v = valoreDi(chiave);
    if (g === "voto") return provvisori.minRating === Number(v);
    if (g === "recensioni") return provvisori.minReviews === Number(v);
    if (g === "budget") return provvisori.budget === v;
    if (g === "team") return provvisori.team === v;
    if (g === "verificate") return Boolean(provvisori.verified);
    return false;
  };

  const quanti = numeri.totale;
  const nessunFiltro = query(provvisori).toString() === "";

  const pannello = (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-6 ${chiudendo ? "opacity-0 transition-opacity duration-150" : "animate-[fadeIn_.18s_ease-out]"}`}
      onClick={chiudi}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtri"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88dvh] w-full max-w-[620px] flex-col rounded-t-panel bg-canvas text-ink shadow-card transition-transform duration-200 sm:rounded-panel ${chiudendo ? "translate-y-full sm:translate-y-4" : "translate-y-0"}`}
      >
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-pill bg-line sm:hidden" />
        <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-3">
          <h2 className="t-h3">Filtri</h2>
          <button
            type="button"
            onClick={chiudi}
            aria-label="Chiudi i filtri"
            className="grid size-9 place-items-center rounded-pill bg-surface text-xl leading-none text-ink hover:text-action"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
          {gruppi.map((g) => (
            <section key={g.titolo} className="border-t border-line py-3.5 first:border-t-0 first:pt-0">
              <span className="t-kicker mb-2.5 block">{g.titolo}</span>
              <div className="flex flex-wrap gap-2">
                {g.voci.map((v) => {
                  const attiva = scelta(v.chiave);
                  // Una voce che darebbe zero resta al suo posto, spenta:
                  // sparendo sposterebbe tutte le altre sotto il dito.
                  const spenta = v.quanti === 0 && !attiva;
                  return (
                    <button
                      key={v.chiave}
                      type="button"
                      disabled={spenta}
                      aria-pressed={attiva}
                      onClick={() => setProvvisori((f) => tocca(f, v.chiave))}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-bold transition-colors ${
                        attiva
                          ? "border-action bg-tonal text-action"
                          : spenta
                            ? "border-line bg-transparent text-ink-3"
                            : "border-line bg-surface text-ink hover:border-ink/25"
                      }`}
                    >
                      {v.etichetta}
                      {typeof v.quanti === "number" && (
                        <span className={`tabular-nums ${attiva ? "text-action" : "text-ink-3"}`}>{fmt(v.quanti)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="flex shrink-0 gap-2.5 border-t border-line px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
          <button
            type="button"
            onClick={() => setProvvisori({})}
            disabled={nessunFiltro}
            className="min-h-12 rounded-pill border border-line px-5 text-sm font-bold text-ink disabled:opacity-40"
          >
            Azzera
          </button>
          <button
            type="button"
            onClick={applica}
            className="min-h-12 flex-1 rounded-pill bg-action px-5 text-sm font-bold text-white hover:bg-action-hover"
          >
            {aggiornando
              ? "Conto..."
              : quanti === 0
                ? "Nessun professionista"
                : `Mostra ${fmt(quanti)} ${plural(quanti, "professionista", "professionisti")}`}
          </button>
        </footer>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(pannello, document.body) : null;
}
