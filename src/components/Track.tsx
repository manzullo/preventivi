"use client";

// Traccia impression delle card (metà visibile, una volta) e click marcati
// con data-track. Parte dal layout pubblico, zero dipendenze.

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ensureVisit, sessionId } from "@/modules/leadforms/engine/client-tracking";

type Ev = { type: string; agency?: string; path: string; meta?: Record<string, string | undefined> };

function send(events: Ev[]) {
  if (!events.length) return;
  const body = JSON.stringify({ events, sessionId: sessionId() });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/track/", new Blob([body], { type: "application/json" }));
  else void fetch("/api/track/", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
}

// Fuori dal componente: sopravvive al rimontaggio, che è proprio il caso da
// cui ci si difende.
let ultimaPagina = "";

export function Track() {
  // Rieseguito a ogni navigazione client: path sempre attuale, hero_view per pagina.
  const pathname = usePathname();

  // La visita si registra alla prima pagina aperta, non quando si arriva al
  // modulo: prima la creava solo il modulo, quindi in archivio finiva meno
  // della metà di chi passava dal sito, e chi arrivava da una campagna senza
  // compilare niente non lasciava traccia. `ensureVisit` tiene l'identificativo
  // nella memoria di sessione, quindi il modulo poi ritrova questa e non ne
  // apre una seconda.
  useEffect(() => {
    void ensureVisit("migliori-agenzie", []);
  }, []);

  useEffect(() => {
    const path = () => window.location.pathname;
    const seen = new Set<string>();
    let queue: string[] = [];
    let timer: number | undefined;
    const flush = () => { const q = queue; queue = []; send(q.map((agency) => ({ type: "impression", agency, path: path() }))); };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const slug = (e.target as HTMLElement).dataset.agency;
        if (!e.isIntersecting || !slug || seen.has(slug)) continue;
        seen.add(slug);
        queue.push(slug);
        window.clearTimeout(timer);
        timer = window.setTimeout(flush, 800);
      }
    }, { threshold: 0.5 });
    // Le card possono arrivare dopo l'idratazione (streaming) o con la
    // navigazione client: si osservano anche i nodi aggiunti in seguito.
    const observed = new WeakSet<Element>();
    const scan = () => document.querySelectorAll<HTMLElement>("[data-agency]").forEach((el) => { if (!observed.has(el)) { observed.add(el); io.observe(el); } });
    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
    const hero = () => document.documentElement.dataset.hero;
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-track]");
      if (!el) return;
      // CTA verso il form: posizione e variante hero, senza professionista.
      if (el.dataset.track === "cta_click") return send([{ type: "cta_click", path: path(), meta: { position: el.dataset.cta, hero: hero() } }]);
      const agency = el.dataset.agency ?? el.closest<HTMLElement>("[data-agency]")?.dataset.agency;
      if (agency) send([{ type: el.dataset.track!, agency, path: path() }]);
    };
    // Ogni pagina vista lascia una riga: serve al percorso del lead e a contare
    // le visite delle pagine che non hanno la fascia, come le schede e gli
    // articoli, che prima non risultavano viste da nessuno.
    // Una sola per indirizzo: in sviluppo React monta gli effetti due volte, e
    // due righe identiche falserebbero ogni conteggio.
    if (ultimaPagina !== path()) {
      ultimaPagina = path();
      send([{ type: "page_view", path: path() }]);
    }
    // Vista dell'hero (una per pagina) con la variante: denominatore del test A/B.
    if (document.querySelector("[data-hero-band]")) send([{ type: "hero_view", path: path(), meta: { hero: hero() } }]);
    document.addEventListener("click", onClick, true);
    return () => { io.disconnect(); mo.disconnect(); document.removeEventListener("click", onClick, true); window.clearTimeout(timer); };
  }, [pathname]);
  return null;
}
