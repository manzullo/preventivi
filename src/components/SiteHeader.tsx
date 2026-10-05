import Link from "next/link";
import { MenuMobile } from "./MenuMobile";
import { Button } from "@/design/ui";
import { db } from "@/lib/db";
import { paths } from "@/lib/site";

// Il segno del marchio: un ago di bussola bianco su quadrato blu. È disegnato
// qui dentro invece che caricato come immagine, così resta nitido a ogni misura
// e non aggiunge una richiesta di rete in cima alla pagina.
export function LogoIcona({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className} focusable="false">
      <rect width="100" height="100" rx="22.5" fill="#0b57d0" />
      <polygon points="79,18 42,39 59,56" fill="#fff" />
      <polygon points="18,82 38,43 54,61" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-[-0.033em] ${className}`}>
      Preven<span className="text-action">tivi</span>
    </span>
  );
}

/** Marchio completo: icona più nome, come nel logo consegnato. */
export function Marchio({ className = "", testo = "text-[17px] sm:text-[22px]", icona = "size-6 sm:size-8" }: { className?: string; testo?: string; icona?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoIcona className={`${icona} shrink-0 rounded-[22%]`} />
      <Wordmark className={testo} />
    </span>
  );
}

type Voce = { href: string; label: string; hint?: string };

// Tendina che si apre al passaggio del mouse e con la tastiera (focus-within),
// senza JavaScript: il menu resta usabile anche con gli script bloccati.
function Tendina({ label, voci }: { label: string; voci: Voce[] }) {
  return (
    <div className="group relative">
      <button type="button" className="t-meta flex items-center gap-1 py-2 text-ink hover:text-action group-focus-within:text-action" aria-haspopup="true">
        {label}
        <span aria-hidden className="text-[10px] text-ink-3">▾</span>
      </button>
      <div className="invisible absolute left-0 top-full z-50 w-72 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <ul className="rounded-card border border-line bg-canvas p-2 shadow-card">
          {voci.map((v) => (
            <li key={v.href}>
              <Link href={v.href} className="block rounded-slot px-3 py-2 hover:bg-surface">
                <span className="block text-sm font-semibold text-ink">{v.label}</span>
                {v.hint && <span className="t-meta block">{v.hint}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export async function SiteHeader() {
  const posts = await db.page.count({ where: { kind: "blog", published: true } });

  const trovare: Voce[] = [
    { href: "/cerca/", label: "Cerca per nome", hint: "hai già un professionista in mente" },
    { href: "/#servizi", label: "Per servizio", hint: "SEO, Ads, social, siti, video" },
    { href: "/competenze/", label: "Per competenza", hint: "WordPress, link building, video" },
    { href: "/#citta", label: "Per città", hint: "Roma, Milano, Torino e altre" },
    { href: "/recensioni/", label: "Tutte le recensioni", hint: "con fonte e link all'originale" },
    { href: "/mappa/", label: "Sulla mappa", hint: "dove hanno la sede" },
    { href: paths.quote(), label: "Ricevi fino a 3 preventivi", hint: "descrivi il lavoro una volta sola" },
  ];
  const perAgenzie: Voce[] = [
    { href: "/per-agenzie/", label: "Come funziona per i professionisti", hint: "richieste dirette, nessuna commissione" },
    { href: "/candidatura/", label: "Aggiungi la tua attività", hint: "iscrizione gratuita" },
    { href: "/rivendica/", label: "Rivendica la tua scheda", hint: "se sei già in elenco" },
    { href: "/area/", label: "Area professionista", hint: "gestisci scheda, richieste e numeri" },
  ];
  const risorse: Voce[] = [
    { href: paths.methodology(), label: "Metodologia", hint: "come nasce l'ordine delle classifiche" },
    ...(posts > 0 ? [{ href: "/blog/", label: "Guide e confronti", hint: "prezzi reali e criteri di scelta" }] : []),
    { href: "/alternative-a-sortlist/", label: "Alternative ai portali", hint: "Sortlist, Clutch, DesignRush" },
    { href: "/chi-siamo/", label: "Chi siamo" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 md:gap-6">
        <Link href="/" aria-label="Preventivi, home" className="shrink-0">
          <Marchio />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Tendina label="Trova professionisti" voci={trovare} />
          <Tendina label="Per i professionisti" voci={perAgenzie} />
          <Tendina label="Risorse" voci={risorse} />
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button href={paths.quote()} arrow className="min-h-10 whitespace-nowrap px-2.5 py-2.5 text-[13px] sm:px-5 sm:text-sm">
            {/* Sui telefoni il testo lungo spinge il bottone fuori dallo schermo. */}
            <span className="sm:hidden">Preventivi</span>
            <span className="hidden sm:inline">Chiedi un preventivo</span>
          </Button>
          <MenuMobile
            gruppi={[
              { titolo: "Trova professionisti", voci: trovare },
              { titolo: "Per i professionisti", voci: perAgenzie },
              { titolo: "Risorse", voci: risorse },
            ]}
          />
        </div>
      </div>

    </header>
  );
}
