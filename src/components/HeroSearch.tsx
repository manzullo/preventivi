"use client";

// Ricerca dell'hero (Tabbble SearchGlass, ridotta a "Cosa cerchi / Dove"):
// due campi con ricerca dal vivo, porta alla pagina servizio × città se
// esiste, altrimenti alla pagina più vicina o al form con i campi precompilati.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { paths } from "@/lib/site";

export type SearchItem = {
  value: string;
  label: string;
  hint?: string;
  keywords?: string[];
  /** Indirizzo proprio della voce: le competenze hanno una pagina loro. */
  href?: string;
  /**
   * Lo slug del servizio vero dietro la voce. Per un modo di dire ("Professionisti
   * GEO") è il servizio a cui è attaccato: serve a sapere se l'incrocio con la
   * città esiste, perché le coppie sono calcolate sui servizi.
   */
  pair?: string;
  /**
   * Inizio dell'indirizzo quando c'è anche la città, barre comprese: ci si
   * attacca in fondo lo slug della città. Vale "/agenzie-geo/" per un modo di
   * dire con pagina propria (che deve portare a /agenzie-geo/roma/, non a
   * /agenzie-llm-marketing/roma/) e "/competenze/wordpress/" per una
   * competenza.
   */
  base?: string;
  /** "Servizio", "Competenza": si legge nella tendina, distingue voci simili. */
  gruppo?: string;
};

export function matchItems(items: SearchItem[], q: string): SearchItem[] {
  const needle = q.trim().toLowerCase();
  return needle ? items.filter((i) => i.label.toLowerCase().includes(needle) || i.keywords?.some((k) => k.toLowerCase().includes(needle))) : items;
}

function Combo({ id, label, placeholder, items, value, onChange, q, setQ }: { id: string; label: string; placeholder: string; items: SearchItem[]; value: string; onChange: (v: string) => void; q: string; setQ: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.value === value);
  const needle = q.trim().toLowerCase();
  const list = matchItems(items, q).slice(0, 60);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <label htmlFor={id} className="t-kicker block px-4 pt-2.5">{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        className="w-full bg-transparent px-4 pb-2.5 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
        placeholder={placeholder}
        value={open ? q : (selected?.label ?? q)}
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={(e) => { setQ(e.target.value); setActive(0); if (value) onChange(""); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && open && list[active]) { e.preventDefault(); onChange(list[active].value); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-card border border-line bg-canvas p-1.5 text-left shadow-card">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-ink-3">Nessun risultato</li>}
          {list.map((i, k) => {
            const viaKeyword = needle && !i.label.toLowerCase().includes(needle) ? i.keywords?.find((w) => w.toLowerCase().includes(needle)) : undefined;
            return (
              <li key={i.value} role="option" aria-selected={k === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(i.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-slot px-3 py-2 text-sm ${k === active ? "bg-surface" : "hover:bg-surface"}`}
                >
                  <span className="min-w-0 truncate font-semibold">
                    {i.label}
                    {viaKeyword && <span className="ml-2 font-normal text-ink-3">include {viaKeyword}</span>}
                    {i.gruppo && <span className="ml-2 font-normal text-ink-3">{i.gruppo}</span>}
                  </span>
                  {i.hint && <span className="t-kicker shrink-0">{i.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function HeroSearch({ services, cities, pairs }: { services: SearchItem[]; cities: SearchItem[]; pairs: string[] }) {
  const router = useRouter();
  const [service, setService] = useState("");
  const [city, setCity] = useState("");
  const [sq, setSq] = useState("");
  const [cq, setCq] = useState("");
  const pairSet = new Set(pairs);

  const go = () => {
    // Testo scritto ma non scelto: vale il primo risultato.
    const s = service || (sq.trim() ? (matchItems(services, sq)[0]?.value ?? "") : "");
    const c = city || (cq.trim() ? (matchItems(cities, cq)[0]?.value ?? "") : "");
    const voceS = services.find((i) => i.value === s);
    const voceC = cities.find((i) => i.value === c);
    // Dietro un modo di dire c'è un servizio: le coppie servizio × città sono
    // calcolate su quello, l'indirizzo invece resta quello del modo di dire.
    const sv = voceS?.pair ?? s;
    // Una competenza con la città porta al suo incrocio: quella pagina esiste
    // ovunque ci sia almeno un professionista, quindi non serve portarsi dietro
    // l'elenco delle coppie valide.
    if (voceS?.href && c && voceS.base) return router.push(`${voceS.base}${c}/`);
    if (voceS?.href) return router.push(voceS.href);
    const destinazioneCitta = voceC?.href;
    // Un modo di dire, invece, ha la pagina città solo dove ce l'ha il servizio.
    if (sv && c && pairSet.has(`${sv}|${c}`)) {
      return router.push(voceS?.base ? `${voceS.base}${c}/` : paths.serviceCity(sv, c));
    }
    if (sv && c) return router.push(paths.quote({ servizio: sv, citta: c }));
    if (sv) return router.push(voceS?.base ?? paths.service(sv));
    if (destinazioneCitta) return router.push(destinazioneCitta);
    if (c) return router.push(paths.city(c));
    document.getElementById("hero-servizio")?.focus();
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); go(); }}
      className="mx-auto mt-8 flex max-w-3xl flex-col items-stretch rounded-card border border-line bg-canvas p-2 text-left shadow-card sm:flex-row sm:items-center sm:rounded-pill"
    >
      <Combo id="hero-servizio" label="Cosa cerchi" placeholder="es. Idraulico, fotografo" items={services} value={service} onChange={setService} q={sq} setQ={setSq} />
      {/* Separatore fra i due campi: riga sui telefoni, dove stanno uno sotto
          l'altro, colonnina sugli schermi larghi, dove stanno affiancati. */}
      <div className="mx-3 my-1 h-px bg-line sm:mx-2 sm:my-0 sm:h-10 sm:w-px" />
      <Combo id="hero-citta" label="Dove" placeholder="es. Roma, o il tuo comune" items={cities} value={city} onChange={setCity} q={cq} setQ={setCq} />
      <button type="submit" className="m-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-pill bg-action px-6 text-[15px] font-bold text-white hover:bg-action-hover">
        Cerca
        <span aria-hidden>→</span>
      </button>
    </form>
  );
}
