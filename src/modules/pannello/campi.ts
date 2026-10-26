// I dati completi di una voce, per il pannello globale (contratto: `campi`).
//
// Nel pannello ogni richiesta, candidatura o rivendicazione si apre con un
// clic e mostra tutto quello che c'è qui: meglio troppo che troppo poco. Si
// parte dalla riga intera del database e si tolgono solo identificativi
// interni e segreti; il resto passa con il nome in italiano quando lo
// conosciamo, altrimenti con il nome del campo scritto con i trattini bassi.
import { classificaSorgente } from "@/modules/directory/sorgenti";

export type Campi = Record<string, string | number>;

const FUSO = "Europe/Rome";

/** Mai fuori: chiavi, password, impronte e identificativi tecnici. */
const ESCLUSI = new Set([
  "id",
  "token",
  "tokenExpiresAt",
  "password",
  "ipHash",
  "sessionId",
  "userAgent",
  "clientId",
  "errori",
  "bloccatoFino",
  "breakdown",
]);

/** I nomi dei campi più comuni, come li direbbe una persona. */
const NOMI: Record<string, string> = {
  name: "nome",
  email: "email",
  phone: "telefono",
  company: "azienda",
  website: "sito",
  timing: "tempi",
  description: "messaggio",
  message: "messaggio",
  status: "stato",
  note: "nota",
  role: "ruolo",
  price: "prezzo",
  value: "valore",
  currency: "valuta",
  soldPrice: "venduta_a_euro",
  soldAt: "venduta_il",
  createdAt: "arrivata_il",
  updatedAt: "aggiornata_il",
  reviewedAt: "esaminata_il",
  verifiedAt: "email_confermata_il",
  approvedAt: "approvata_il",
  approvedBy: "approvata_da",
  respondedAt: "risposta_il",
  sentAt: "inviata_il",
  openedAt: "aperta_in_admin_il",
  releasedAt: "messa_in_circolo_il",
  closesAt: "chiude_il",
  briefTitle: "oggetto_per_le_agenzie",
  briefText: "testo_per_le_agenzie",
  landingPath: "pagina_di_invio",
  citySlug: "citta",
  services: "servizi",
  cities: "citta",
  months: "mesi",
  level: "livello",
  dailyPrice: "prezzo_al_giorno_euro",
  totalPrice: "prezzo_totale_euro",
  startsAt: "inizia_il",
  endsAt: "finisce_il",
  matchType: "corrispondenza_parola_chiave",
  device: "dispositivo",
  network: "rete_pubblicitaria",
  eventType: "tipo_conversione",
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmTerm: "utm_term",
  utmContent: "utm_content",
};

const nomeCampo = (k: string) => NOMI[k] ?? k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

export const dataItaliana = (d: Date) =>
  d.toLocaleString("it-IT", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Un valore qualsiasi del database come testo o numero leggibile; null se vuoto. */
export function leggibile(v: unknown): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return dataItaliana(v);
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const parti = v.map(leggibile).filter((x) => x !== null);
    return parti.length ? parti.join(", ") : null;
  }
  if (typeof v === "object") {
    const parti = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => [k, leggibile(x)] as const)
      .filter(([, x]) => x !== null)
      .map(([k, x]) => `${k}: ${x}`);
    return parti.length ? parti.join("; ") : null;
  }
  return String(v);
}

/**
 * Tutti i campi semplici di una riga, senza segreti, identificativi e
 * relazioni (gli oggetti annidati che hanno un id si aggiungono a mano, con
 * un nome che spiega cosa sono).
 */
export function campiDa(riga: Record<string, unknown>, aggiunte: Record<string, unknown> = {}): Campi {
  const out: Campi = {};
  const metti = (k: string, v: unknown) => {
    const x = leggibile(v);
    if (x !== null && !(k in out)) out[k] = x;
  };
  // Prima le aggiunte: servizio, città, provenienza dicono più dei campi grezzi.
  for (const [k, v] of Object.entries(aggiunte)) metti(k, v);
  for (const [k, v] of Object.entries(riga)) {
    if (ESCLUSI.has(k) || k.endsWith("Id")) continue;
    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "id" in v) continue;
    metti(nomeCampo(k), v);
  }
  return out;
}

type Visita = {
  landingPath: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  gclid: string | null;
  device: string | null;
  searchTerm: string | null;
  createdAt: Date;
} | null;

/** Da dove è arrivato chi ha inviato: la visita collegata, se c'è. */
export function provenienza(visita: Visita, gclid?: string | null): Record<string, unknown> {
  if (!visita) return gclid ? { provenienza: "Google Ads" } : {};
  return {
    provenienza: classificaSorgente(visita).nome,
    pagina_di_atterraggio: visita.landingPath,
    arrivata_da: visita.referrer,
    parola_cercata: visita.searchTerm,
    dispositivo_visita: visita.device,
    inizio_visita: visita.createdAt,
  };
}

/** Le risposte del modulo, una per riga: "risposta_budget", "risposta_evento"... */
export function risposte(answers: unknown): Record<string, unknown> {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
  return Object.fromEntries(Object.entries(answers as Record<string, unknown>).map(([k, v]) => [`risposta_${k}`, v]));
}
