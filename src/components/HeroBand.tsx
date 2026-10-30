// Fascia in cima agli elenchi. Il vestito si sceglie dal pannello: chiara,
// scura (Sortlist usa il nero pieno, l'unico elemento chiaro è il bottone),
// blu piena, senza fascia, oppure "a caso" per confrontare chiara e scura.
// Nel caso del confronto la scelta si fa nel browser dal cookie ma_ab, così la
// pagina resta in cache, e lo script scrive data-hero sull'html prima del
// disegno: niente sfarfallio.

import type { ReactNode } from "react";
import { CTA_LABEL, CTA_MICRO, PROMISE } from "@/lib/cta";
import type { SiteSettings } from "@/lib/settings";
import { QuoteButton } from "./QuoteCta";

const PICK = `(function(){try{var m=document.cookie.match(/(?:^|; )ma_ab=(\\d+)/);var b=m?Number(m[1]):Math.floor(Math.random()*100);if(!m)document.cookie="ma_ab="+b+"; path=/; max-age=2592000; samesite=lax";document.documentElement.dataset.hero=b<50?"dark":"light"}catch(e){}})()`;

export type HeroStyle = SiteSettings["heroStyle"];

export function HeroBand({
  kicker,
  heading,
  subline,
  quoteHref,
  stile = "auto",
  children,
}: {
  kicker?: string;
  heading: string;
  subline?: string;
  quoteHref: string;
  stile?: HeroStyle;
  children?: ReactNode;
}) {
  const aCaso = stile === "auto";
  return (
    <header
      className="hero-band mb-8 px-5 py-10 sm:py-14"
      data-hero-band
      // Con una scelta fissa il vestito arriva già dal server, senza script.
      data-hero-fisso={aCaso ? undefined : stile}
    >
      {aCaso && <script dangerouslySetInnerHTML={{ __html: PICK }} />}
      <div className="mx-auto max-w-6xl text-center">
        {kicker && <p className="t-kicker hero-kicker mb-3">{kicker}</p>}
        <h1 className="t-h1 hero-title mx-auto max-w-4xl">{heading}</h1>
        <p className="t-lead hero-sub mx-auto mt-4 max-w-2xl">{subline ?? PROMISE}</p>
        <div className="mt-7">
          <QuoteButton href={quoteHref} position="hero" label={CTA_LABEL} className="hero-cta" />
          <p className="t-meta hero-micro mt-2.5">{CTA_MICRO}</p>
        </div>
        {children}
      </div>
    </header>
  );
}
