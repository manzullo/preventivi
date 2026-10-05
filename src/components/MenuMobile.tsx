"use client";

// Menu a scomparsa per i telefoni: un bottone a tre righe apre un pannello con
// tutte le voci, divise per gruppo. Sostituisce la riga di link scorrevole, che
// mostrava una barra di scorrimento e teneva metà delle voci fuori campo.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type VoceMenu = { href: string; label: string; hint?: string };
export type GruppoMenu = { titolo: string; voci: VoceMenu[] };

export function MenuMobile({ gruppi }: { gruppi: GruppoMenu[] }) {
  const [aperto, setAperto] = useState(false);
  const percorso = usePathname();

  // Cambio pagina: il pannello si chiude da solo.
  useEffect(() => setAperto(false), [percorso]);

  // Con il pannello aperto la pagina sotto non deve scorrere, e Esc chiude.
  useEffect(() => {
    if (!aperto) return;
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperto(false);
    };
    document.addEventListener("keydown", suTasto);
    return () => {
      document.body.style.overflow = prima;
      document.removeEventListener("keydown", suTasto);
    };
  }, [aperto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        aria-controls="menu-mobile"
        aria-label={aperto ? "Chiudi il menu" : "Apri il menu"}
        className="grid size-10 shrink-0 place-items-center rounded-pill border border-line text-ink hover:border-ink/25 hover:text-action md:hidden"
      >
        <span aria-hidden className="relative block h-3 w-5">
          <span className={`absolute left-0 block h-0.5 w-5 rounded bg-current transition-all ${aperto ? "top-1.5 rotate-45" : "top-0"}`} />
          <span className={`absolute left-0 top-1.5 block h-0.5 w-5 rounded bg-current transition-opacity ${aperto ? "opacity-0" : "opacity-100"}`} />
          <span className={`absolute left-0 block h-0.5 w-5 rounded bg-current transition-all ${aperto ? "top-1.5 -rotate-45" : "top-3"}`} />
        </span>
      </button>

      {aperto && (
        <div
          id="menu-mobile"
          // L'intestazione ha la sfocatura di sfondo, e un elemento con quel
          // filtro diventa il riferimento dei figli posizionati in modo fisso:
          // per questo l'altezza è dichiarata invece di appoggiarsi al fondo
          // della finestra, che qui sarebbe il fondo dell'intestazione.
          className="fixed inset-x-0 top-16 z-40 h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-line bg-canvas px-5 pb-24 pt-4 md:hidden"
        >
          {gruppi.map((g) => (
            <section key={g.titolo} className="border-b border-line py-4 first:pt-0 last:border-0">
              <p className="t-kicker mb-2">{g.titolo}</p>
              <ul className="grid gap-1">
                {g.voci.map((v) => (
                  <li key={v.href}>
                    <Link href={v.href} className="-mx-3 block rounded-slot px-3 py-2.5 hover:bg-surface">
                      <span className="block font-semibold text-ink">{v.label}</span>
                      {v.hint && <span className="t-meta block">{v.hint}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
