"use client";

// Avviso sui cookie, ma solo quando ce n'è davvero bisogno.
//
// Il sito da solo non scrive cookie che richiedano un permesso: il conteggio
// delle visite sta in sessionStorage e muore chiudendo la scheda. L'unico
// strumento che ne scrive è Clarity, e finché non gli si dà un codice questo
// componente non viene nemmeno montato: niente striscia, niente domanda inutile.
//
// Quando il codice c'è, Clarity parte solo per chi accetta. La scelta resta nel
// browser di chi visita, non sul nostro server: è una preferenza sua.

import { useEffect, useState } from "react";

const CHIAVE = "ma_consenso";

function leggi(): "si" | "no" | null {
  try {
    const v = window.localStorage.getItem(CHIAVE);
    return v === "si" || v === "no" ? v : null;
  } catch {
    // navigazione privata o archiviazione bloccata: si resta senza misurazione
    return null;
  }
}

type ConClarity = Window & { clarity?: { (...args: unknown[]): void; q?: unknown[][] } };

function avviaClarity(id: string) {
  if (document.getElementById("ma-clarity")) return;
  // Stessa forma dello snippet ufficiale: la coda raccoglie le chiamate fatte
  // prima che lo script finisca di caricare, così non se ne perde nessuna.
  const w = window as ConClarity;
  if (!w.clarity) {
    const coda: { (...args: unknown[]): void; q?: unknown[][] } = (...args: unknown[]) => {
      (coda.q = coda.q || []).push(args);
    };
    w.clarity = coda;
  }
  const s = document.createElement("script");
  s.id = "ma-clarity";
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(s);
}

export function Consenso({ clarityId }: { clarityId: string }) {
  // "attesa" è il primo render, prima di sapere cosa è già stato scelto: senza
  // questo stato la striscia comparirebbe per un istante anche a chi ha già
  // risposto, e sarebbe la cosa più fastidiosa di tutte.
  const [scelta, setScelta] = useState<"si" | "no" | null | "attesa">("attesa");

  useEffect(() => {
    const v = leggi();
    setScelta(v);
    if (v === "si") avviaClarity(clarityId);
  }, [clarityId]);

  function decidi(v: "si" | "no") {
    try {
      window.localStorage.setItem(CHIAVE, v);
    } catch {
      // se non si può salvare, la scelta vale per questa visita
    }
    setScelta(v);
    if (v === "si") avviaClarity(clarityId);
  }

  if (scelta !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie di misurazione"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-canvas p-4 shadow-card"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="t-meta flex-1 text-ink-2">
          Usiamo uno strumento che registra in forma anonima dove si clicca, per capire cosa non funziona nelle pagine.
          Puoi dire di no: il sito resta identico.{" "}
          <a href="/cookie/" className="font-semibold text-action underline">
            Quali cookie
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decidi("no")}
            className="min-h-11 rounded-pill border border-line px-5 text-sm font-bold text-ink hover:border-ink/25"
          >
            No, grazie
          </button>
          <button
            type="button"
            onClick={() => decidi("si")}
            className="min-h-11 rounded-pill bg-action px-5 text-sm font-bold text-white hover:bg-action-hover"
          >
            Va bene
          </button>
        </div>
      </div>
    </div>
  );
}
