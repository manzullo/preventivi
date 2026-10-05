// FAQ della scheda professionista: generate dai campi (come agencyFaq di
// guidalocation) più quelle custom scritte in admin. Escono anche come
// JSON-LD FAQPage.

import { fmt } from "@/lib/site";

export type FaqItem = { q: string; a: string };

type AgencyForFaq = {
  name: string;
  city: { name: string } | null;
  services: { service: { name: string; plural: string } }[];
  minBudget: number | null;
  teamSize: string | null;
  foundedYear: number | null;
  rating: number | null;
  reviewCount: number;
  website: string | null;
  faq: unknown;
};

export function customFaq(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is FaqItem => Boolean(x) && typeof x === "object" && typeof (x as FaqItem).q === "string" && typeof (x as FaqItem).a === "string")
    .map((x) => ({ q: x.q.trim(), a: x.a.trim() }))
    .filter((x) => x.q && x.a);
}

/** Testo admin "Domanda? | Risposta" (una per riga) → lista. */
export function parseFaqText(text: string): FaqItem[] {
  return text
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts.length >= 2)
    .map(([q, ...a]) => ({ q: q.trim(), a: a.join("|").trim() }))
    .filter((x) => x.q && x.a);
}

export function faqToText(items: FaqItem[]): string {
  return items.map((x) => `${x.q} | ${x.a}`).join("\n");
}

export function agencyFaq(a: AgencyForFaq, opts: { auto: boolean }): FaqItem[] {
  const out: FaqItem[] = [];
  const custom = customFaq(a.faq);
  if (opts.auto) {
    const names = a.services.map((s) => s.service.name);
    if (names.length > 0) {
      out.push({
        q: `Di cosa si occupa ${a.name}?`,
        a: `${a.name} offre ${names.length === 1 ? names[0].toLowerCase() : names.slice(0, -1).map((n) => n.toLowerCase()).join(", ") + " e " + names[names.length - 1].toLowerCase()}${a.city ? `, con sede a ${a.city.name}` : ""}.`,
      });
    }
    if (a.city) {
      out.push({ q: `Dove si trova ${a.name}?`, a: `La sede di ${a.name} è a ${a.city.name}. Molti professionisti lavorano anche da remoto: chiedi nel preventivo se seguono clienti fuori città.` });
    }
    if (a.minBudget) {
      out.push({ q: `Qual è il budget minimo per lavorare con ${a.name}?`, a: `Il budget minimo dichiarato è di ${fmt(a.minBudget)} €. Il preventivo esatto dipende dal progetto: lo chiedi gratis dalla scheda.` });
    }
    if (a.teamSize) {
      out.push({ q: `Quanto è grande il team di ${a.name}?`, a: `${a.name} dichiara un team di ${a.teamSize} persone.` });
    }
    if (a.foundedYear) {
      out.push({ q: `Da quanto tempo opera ${a.name}?`, a: `${a.name} è attiva dal ${a.foundedYear}.` });
    }
    if (a.reviewCount > 0 && a.rating !== null) {
      out.push({ q: `Che recensioni ha ${a.name}?`, a: `${a.name} ha ${fmt(a.reviewCount)} recensioni pubbliche con una media di ${a.rating.toFixed(1)} su 5. Ogni recensione riporta la fonte.` });
    }
    out.push({ q: `Come chiedo un preventivo a ${a.name}?`, a: `Dal bottone "Chiedi un preventivo" nella scheda: descrivi il lavoro in due minuti e il professionista ti risponde direttamente, senza commissioni.` });
  }
  return [...custom, ...out];
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}
