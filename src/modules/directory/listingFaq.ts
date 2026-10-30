// FAQ e guida corta delle pagine listing, generate da dati veri (numeri,
// mediana dei budget minimi, città vicine). Poche domande giuste, niente
// muro di testo: la risposta alla domanda porta al form.

import { CURRENT_YEAR, articoli, fmt, minuscola } from "@/lib/site";
import { MAX_QUOTES } from "@/lib/cta";
import type { FaqItem } from "./faq";

export type ListingContext = {
  servicePlural?: string; // "Idraulici"
  serviceName?: string; // "Idraulico"
  serviceSingular?: string | null; // "idraulico"
  serviceGender?: string; // m | f
  cityName?: string; // "Roma"
  total: number;
  reviewCount: number;
  budgetMedian: number | null; // €, dai minBudget reali
  budgetSamples: number;
};

const where = (c: ListingContext) => (c.cityName ? `a ${c.cityName}` : "in Italia");
const what = (c: ListingContext) => minuscola(c.servicePlural ?? "professionisti");
const singolare = (c: ListingContext) => articoli(c.serviceSingular, c.serviceGender);

export function listingFaq(c: ListingContext): FaqItem[] {
  const out: FaqItem[] = [];
  out.push({
    q: `Quanti sono ${what(c)} ${where(c)} in questa classifica?`,
    a: `${fmt(c.total)} schede ${where(c)} con ${fmt(c.reviewCount)} recensioni pubbliche in totale. La classifica si aggiorna man mano che arrivano nuove recensioni; nessuno paga per comparire o per salire.`,
  });
  if (c.budgetMedian && c.budgetSamples >= 3) {
    out.push({
      q: `Quanto costa ${singolare(c).un} ${where(c)}?`,
      a: `Il prezzo minimo dichiarato dalle schede di questa pagina ha una mediana di ${fmt(c.budgetMedian)} € (su ${c.budgetSamples} schede che lo indicano). Il preventivo reale dipende dal lavoro: con un solo modulo ne ricevi fino a ${MAX_QUOTES} e li confronti.`,
    });
  }
  out.push({
    q: `Come scelgo ${singolare(c).il} ${c.serviceSingular && c.serviceGender === "f" ? "giusta" : "giusto"} ${where(c)}?`,
    a: `Leggi le recensioni con la fonte, chiedi un sopralluogo o qualche foto di lavori simili, fatti dire tempi e cosa è compreso nel prezzo, e confronta almeno ${MAX_QUOTES} preventivi prima di decidere. La nostra metodologia è pubblica.`,
  });
  out.push({
    q: `Come funziona il confronto dei preventivi?`,
    a: `Descrivi il lavoro in due minuti (cosa ti serve, dove, quando). Giriamo la richiesta a ${MAX_QUOTES} professionisti della zona scelti per recensioni e ti rispondono direttamente loro. Nessuna commissione, nessun obbligo.`,
  });
  out.push({
    q: `I professionisti pagano per stare in cima?`,
    a: `No. L'ordine dipende solo da recensioni, numero di recensioni e completezza della scheda. Chi ha una scheda può rivendicarla e gestirla, ma questo non tocca la posizione.`,
  });
  return out;
}

export type GuideBlock = { title: string; body: string };

export function listingGuide(c: ListingContext): GuideBlock[] {
  const w = where(c);
  return [
    {
      title: `Cosa fa ${singolare(c).un}`,
      body: c.servicePlural
        ? `${c.servicePlural} ${w}: confronta le schede, le recensioni con la fonte e le zone servite, poi chiedi un preventivo descrivendo il lavoro. Più dettagli dai (foto, misure, tempi), più i preventivi saranno confrontabili.`
        : `Professionisti e aziende ${w} per casa, eventi, benessere, lezioni e lavoro. Confronta le schede e chiedi un preventivo descrivendo il lavoro.`,
    },
    {
      title: `Come leggere questa classifica ${CURRENT_YEAR}`,
      body: `L'ordine è calcolato da media e numero delle recensioni pubbliche, con un correttivo per le schede più complete. Ogni recensione riporta la fonte. Nessuno può comprare la posizione: è la regola su cui si regge il sito.`,
    },
    {
      title: `Cosa chiedere prima di accettare un preventivo`,
      body: `Cosa è compreso e cosa no; tempi di inizio e di fine; garanzia sul lavoro; se il prezzo è a corpo o a misura; come si paga. Se una risposta è vaga, passa al preventivo successivo.`,
    },
    {
      title: `Perché confrontare più preventivi`,
      body: `Chiamare i professionisti uno per uno richiede ore e porta a decidere sul primo che risponde. Con un modulo ricevi fino a ${MAX_QUOTES} proposte comparabili e scegli con calma.`,
    },
  ];
}

/** Mediana dei budget minimi dichiarati (null sotto 3 valori). */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length < 3) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/** Righe di testo libero (un modo di dire per riga) → lista pulita. */
export function varianti(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
}

/** "a, b e c" */
function elenco(v: string[]): string {
  if (v.length === 1) return v[0];
  return `${v.slice(0, -1).join(", ")} e ${v[v.length - 1]}`;
}

/**
 * Le domande che esistono solo sulla pagina di un modo di dire. Servono a due
 * cose insieme: dare a quella pagina un testo che la pagina del servizio non
 * ha, e rispondere al dubbio vero di chi arriva, cioè se sta guardando la cosa
 * giusta. Gli altri modi di chiedere la stessa cosa finiscono qui dentro: una
 * variante non merita un indirizzo suo, merita una riga di testo.
 */
export function aliasFaq(
  alias: { label: string; variants: unknown; agencyLabel: string | null },
  servicePlural: string,
  cityName?: string,
): FaqItem[] {
  const dove = cityName ? `a ${cityName}` : "in Italia";
  const v = varianti(alias.variants);
  const out: FaqItem[] = [
    {
      q: `«${alias.label}» e «${servicePlural}» sono la stessa cosa?`,
      a: `Sì. «${alias.label}» è come lo chiede chi cerca, «${minuscola(servicePlural)}» è il nome che usa il settore. I professionisti di questa pagina sono gli stessi: cambia la parola, non il lavoro.${
        v.length ? ` Lo stesso servizio si cerca anche come ${elenco(v)}.` : ""
      }`,
    },
  ];
  if (alias.agencyLabel) {
    out.push({
      q: `Come trovo ${minuscola(alias.agencyLabel)} ${dove}?`,
      a: `Li trovi in questa pagina, ordinati per recensioni pubbliche con la fonte di ogni voto. Se preferisci non contattarli uno per uno, descrivi il lavoro nel modulo: giriamo la richiesta ai professionisti adatti e ti rispondono direttamente loro.`,
    });
  }
  return out;
}
