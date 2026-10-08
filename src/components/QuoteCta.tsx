import Link from "next/link";
import { CTA_LABEL, CTA_MICRO, CTA_QUESTION, CTA_TEXT, PROMISE } from "@/lib/cta";
import { paths } from "@/lib/site";

// CTA verso il form, ripetuto nei punti di decisione della pagina. Ogni click
// porta la posizione (data-cta) così Performance dice quale converte.

export type CtaPosition = "hero" | "mid" | "end" | "faq" | "sticky" | "agency" | "blog";

export function QuoteButton({ href, position, label = CTA_LABEL, className = "" }: { href: string; position: CtaPosition; label?: string; className?: string }) {
  return (
    <Link
      href={href}
      data-track="cta_click"
      data-cta={position}
      className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-pill bg-action px-7 py-3 text-[15px] font-bold text-white shadow-soft transition-colors hover:bg-action-hover ${className}`}
    >
      {label}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

/** Box a metà lista e a fine lista (il "Difficoltà di scelta?" di Sortlist, con la nostra promessa). */
export function QuoteBox({ href, position, context, recent }: { href: string; position: "mid" | "end" | "faq"; context?: string; recent?: number | null }) {
  return (
    <aside className="rounded-card border border-line bg-surface p-6 sm:p-8" data-cta-box={position}>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="t-kicker mb-2">{context ?? "Confronta più preventivi in una volta"}</p>
          <p className="t-h2">{CTA_QUESTION}</p>
          <p className="t-body mt-2 text-ink-2">{CTA_TEXT}</p>
          <p className="t-meta mt-2">
            {PROMISE}
            {recent ? ` · ${recent} richieste negli ultimi 30 giorni` : ""}
          </p>
        </div>
        <div className="shrink-0 text-center">
          <QuoteButton href={href} position={position} />
          <p className="t-meta mt-2">{CTA_MICRO}</p>
        </div>
      </div>
    </aside>
  );
}

/** Barra fissa in basso, solo mobile: il CTA resta a portata di pollice. */
export function StickyCta({ href }: { href: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-4 py-2.5 backdrop-blur md:hidden" data-sticky-cta>
      <div className="flex items-center justify-between gap-3">
        <p className="t-meta min-w-0 truncate">{CTA_MICRO}</p>
        <QuoteButton href={href} position="sticky" className="min-h-10 shrink-0 whitespace-nowrap px-5 py-2 text-sm" />
      </div>
    </div>
  );
}
