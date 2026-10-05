"use client";

// Posa il contrassegno "browser di casa" appena si entra nel pannello.
//
// Non disegna niente: serve solo a far partire la chiamata. Da lì in poi le
// visite fatte da questo browser restano in archivio ma non entrano nei
// conteggi, così i numeri parlano dei visitatori e non di chi lavora al sito.

import { useEffect } from "react";

export function SegnaInterno() {
  useEffect(() => {
    // Una volta per scheda: il cookie dura un anno, non serve ripeterlo a ogni
    // pagina del pannello.
    try {
      if (window.sessionStorage.getItem("ma_interno_ok")) return;
      window.sessionStorage.setItem("ma_interno_ok", "1");
    } catch {
      // archiviazione bloccata: si richiama, non è un problema
    }
    void fetch("/api/interno/", { method: "POST", keepalive: true });
  }, []);
  return null;
}
