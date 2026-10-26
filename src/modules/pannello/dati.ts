// Il resto dei dati del sito per il pannello globale (contratto versione 2).
//
// `elenchi`: tutto quello che arriva dal sito e che qualcuno deve guardare,
// oltre ai preventivi: candidature e rivendicazioni dei professionisti, e i
// professionisti che rispondono alle richieste.
// `analisi`: le stesse interrogazioni del connettore MCP (motore.ts),
// voltate in blocchi di numeri e tabelle che il pannello mostra così come sono.
//
// Ogni pezzo è indipendente: se uno si rompe, il pannello riceve gli altri e
// una riga che dice cosa non è andato.
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { esegui } from "@/modules/analisi/motore";
import { FAMIGLIE } from "@/modules/directory/sorgenti";
import { type Campi, campiDa, provenienza, risposte } from "@/modules/pannello/campi";

const VOCI = 50;
const RIGHE = 50;

type Voce = {
  id: string;
  quando: string;
  titolo: string;
  contatto?: string;
  dettaglio?: string;
  stato?: string;
  link?: string;
  campi?: Campi;
};
export type Elenco = { chiave: string; titolo: string; totale?: number; da_gestire?: number; voci: Voce[] };
type Valore = { nome: string; valore: number | string; nota?: string };
export type Analisi = {
  titolo: string;
  nota?: string;
  valori?: Valore[];
  tabella?: { colonne: string[]; righe: (string | number)[][] };
};

const admin = (percorso: string) => `${BASE_URL}/admin/${percorso}`;
const unisci = (...parti: (string | null | undefined | false)[]) => parti.filter(Boolean).join(" · ") || undefined;
const breve = (s: string | null | undefined, n = 200) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : undefined);

const STATO_CANDIDATURA: Record<string, string> = { pending: "da gestire", accepted: "accettata", rejected: "rifiutata" };
const STATO_RIVENDICAZIONE: Record<string, string> = {
  pending: "email da confermare",
  email_ok: "da gestire",
  approved: "approvata",
  rejected: "respinta",
};
const STATO_ASSEGNAZIONE: Record<string, string> = {
  offered: "proposta",
  proposed: "proposta",
  sent: "inviata",
  accepted: "candidata",
  declined: "non interessata",
  closed: "chiusa",
};

/** Gli stati dei preventivi come in admin, con "nuova" che il pannello evidenzia. */
export const STATO_RICHIESTA: Record<string, string> = { new: "nuova", qualified: "qualificata", sold: "venduta", rejected: "scartata" };

/** La riga senza le relazioni, che si aggiungono a mano con un nome chiaro. */
function senza<T extends object>(riga: T, ...chiavi: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(riga).filter(([k]) => !chiavi.includes(k)));
}

type RichiestaCompleta = Record<string, unknown> & {
  status: string;
  gclid: string | null;
  service: { plural: string } | null;
  city: { name: string } | null;
  agency: { name: string } | null;
  form: { name: string } | null;
  submission: { answers: unknown; contact: unknown; visit: Parameters<typeof provenienza>[0] } | null;
  assignments: { status: string; agency: { name: string } }[];
};

/** Tutto quello che si sa di un preventivo, per aprirlo con un clic nel pannello. */
export function campiRichiesta(l: RichiestaCompleta): Campi {
  return campiDa(senza(l, "service", "city", "agency", "form", "submission", "assignments"), {
    stato: STATO_RICHIESTA[l.status] ?? l.status,
    servizio: l.service?.plural,
    citta: l.city?.name,
    professionista_scelto_dal_cliente: l.agency?.name,
    modulo: l.form?.name,
    ...risposte(l.submission?.answers),
    ...provenienza(l.submission?.visit ?? null, l.gclid),
    professionisti_a_cui_e_andata: l.assignments.map((a) => `${a.agency.name} (${STATO_ASSEGNAZIONE[a.status] ?? a.status})`),
  });
}

async function candidature(): Promise<Elenco> {
  const [totale, daGestire, righe] = await Promise.all([
    db.application.count(),
    db.application.count({ where: { status: "pending" } }),
    db.application.findMany({ orderBy: { createdAt: "desc" }, take: VOCI }),
  ]);
  return {
    chiave: "candidature",
    titolo: "Candidature professionisti",
    totale,
    da_gestire: daGestire,
    voci: righe.map((a) => ({
      id: a.id,
      quando: a.createdAt.toISOString(),
      titolo: a.name,
      contatto: unisci(a.email, a.phone),
      dettaglio: unisci(a.citySlug, a.website, breve(a.message)),
      stato: STATO_CANDIDATURA[a.status] ?? a.status,
      link: admin(`candidature/?stato=${a.status}`),
      campi: campiDa(a, { stato: STATO_CANDIDATURA[a.status] ?? a.status }),
    })),
  };
}

async function rivendicazioni(): Promise<Elenco> {
  const [totale, daGestire, righe] = await Promise.all([
    db.agencyClaim.count(),
    db.agencyClaim.count({ where: { status: { in: ["pending", "email_ok"] } } }),
    db.agencyClaim.findMany({
      orderBy: { createdAt: "desc" },
      take: VOCI,
      include: { agency: { select: { name: true, city: { select: { name: true } } } } },
    }),
  ]);
  return {
    chiave: "rivendicazioni",
    titolo: "Rivendicazioni schede",
    totale,
    da_gestire: daGestire,
    voci: righe.map((r) => ({
      id: r.id,
      quando: r.createdAt.toISOString(),
      titolo: r.agency.name,
      contatto: unisci(r.email, r.phone),
      dettaglio: unisci(r.agency.city?.name, r.role),
      stato: STATO_RIVENDICAZIONE[r.status] ?? r.status,
      link: admin("rivendicazioni/"),
      campi: campiDa(senza(r, "agency"), {
        scheda: r.agency.name,
        citta: r.agency.city?.name,
        stato: STATO_RIVENDICAZIONE[r.status] ?? r.status,
      }),
    })),
  };
}

/** I professionisti che hanno risposto a una richiesta. */
async function candidatureAlleRichieste(): Promise<Elenco> {
  const risposte = { status: { in: ["accepted", "declined"] }, respondedAt: { not: null } };
  const [totale, righe] = await Promise.all([
    db.leadAssignment.count({ where: risposte }),
    db.leadAssignment.findMany({
      where: risposte,
      orderBy: { respondedAt: "desc" },
      take: VOCI,
      include: {
        agency: { select: { name: true } },
        lead: { select: { service: { select: { plural: true } }, city: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    chiave: "risposte_professionisti",
    titolo: "Professionisti che rispondono alle richieste",
    totale,
    voci: righe.map((a) => ({
      id: a.id,
      quando: (a.respondedAt ?? a.createdAt).toISOString(),
      titolo: a.agency.name,
      dettaglio: unisci(a.lead.service?.plural, a.lead.city?.name, a.price != null && `${a.price} €`),
      stato: a.status === "accepted" ? "candidata" : "non interessata",
      link: admin(`lead/${a.leadId}/`),
      campi: campiDa(senza(a, "agency", "lead"), {
        professionista: a.agency.name,
        servizio: a.lead.service?.plural,
        citta: a.lead.city?.name,
        stato: STATO_ASSEGNAZIONE[a.status] ?? a.status,
      }),
    })),
  };
}

// --- Analisi -----------------------------------------------------------------

type Riepilogo = { visite: number; pagine_viste: number; richieste: number; richieste_vendute: number; conversione: string; nota?: string; avvertenza?: string };
type Sorgenti = { totale: number; per_famiglia: Record<string, number>; per_nome: Record<string, number>; nota?: string };
type Pagine = { pagine: { pagina: string; visite: number; richieste: number }[]; nota?: string };
type PiuViste = { professionisti: { professionista: string; citta: string | null; comparsa: number; aperta: number; aperture_su_cento: number }[] };
type Directory = { agenzie_pubblicate: number; recensioni: number; citta_con_agenzie: number; pagine_pubblicate: number; servizi: { servizio: string; professionisti: number }[] };

const percento = (n: number, su: number) => (su > 0 ? `${((n / su) * 100).toFixed(1).replace(".", ",")}%` : undefined);

async function riepilogo(): Promise<Analisi> {
  const r = (await esegui("riepilogo_traffico")) as Riepilogo;
  return {
    titolo: "Traffico e conversione (30 giorni)",
    nota: unisci(r.nota, r.avvertenza),
    valori: [
      { nome: "Visite", valore: r.visite },
      { nome: "Pagine viste", valore: r.pagine_viste },
      { nome: "Richieste", valore: r.richieste },
      { nome: "Richieste vendute", valore: r.richieste_vendute },
      { nome: "Conversione", valore: r.conversione },
    ],
  };
}

async function sorgenti(): Promise<Analisi> {
  const r = (await esegui("sorgenti_traffico")) as Sorgenti;
  const nome = new Map(FAMIGLIE.map((f) => [f.chiave as string, f.nome]));
  return {
    titolo: "Da dove arrivano le visite (30 giorni)",
    nota: unisci("Escluse le visite degli amministratori e le prove", r.nota),
    valori: Object.entries(r.per_famiglia).map(([k, n]) => ({ nome: nome.get(k) ?? k, valore: n, nota: percento(n, r.totale) })),
    tabella: { colonne: ["Provenienza", "Visite"], righe: Object.entries(r.per_nome).slice(0, RIGHE) },
  };
}

async function pagine(): Promise<Analisi> {
  const r = (await esegui("pagine_di_ingresso")) as Pagine;
  return {
    titolo: "Pagine di ingresso (30 giorni)",
    nota: r.nota,
    tabella: { colonne: ["Pagina", "Visite", "Richieste"], righe: r.pagine.slice(0, RIGHE).map((p) => [p.pagina, p.visite, p.richieste]) },
  };
}

async function piuViste(): Promise<Analisi> {
  const r = (await esegui("agenzie_piu_viste", { quante: 30 })) as PiuViste;
  return {
    titolo: "Schede più viste (30 giorni)",
    nota: "Comparsa = quante volte la scheda è apparsa negli elenchi; aperta = quante volte qualcuno l'ha aperta.",
    tabella: {
      colonne: ["Professionista", "Città", "Comparsa", "Aperta", "Aperte su 100"],
      righe: r.professionisti.map((a) => [a.professionista, a.citta ?? "", a.comparsa, a.aperta, a.aperture_su_cento]),
    },
  };
}

async function directory(): Promise<Analisi> {
  const r = (await esegui("stato_directory")) as Directory;
  return {
    titolo: "Contenuto del sito",
    valori: [
      { nome: "Professionisti pubblicati", valore: r.agenzie_pubblicate },
      { nome: "Recensioni", valore: r.recensioni },
      { nome: "Città con professionisti", valore: r.citta_con_agenzie },
      { nome: "Pagine pubblicate", valore: r.pagine_pubblicate },
    ],
    tabella: { colonne: ["Servizio", "Professionisti"], righe: r.servizi.slice(0, RIGHE).map((s) => [s.servizio, s.professionisti]) },
  };
}

/** Tiene i pezzi che riescono; per quelli che falliscono, una riga di avviso. */
async function raccogli<T>(pezzi: [string, () => Promise<T>][]): Promise<{ ok: T[]; errori: string[] }> {
  const esiti = await Promise.allSettled(pezzi.map(([, f]) => f()));
  const ok: T[] = [];
  const errori: string[] = [];
  esiti.forEach((e, i) => {
    if (e.status === "fulfilled") ok.push(e.value);
    else {
      console.error(`[pannello] ${pezzi[i][0]}:`, e.reason);
      errori.push(pezzi[i][0]);
    }
  });
  return { ok, errori };
}

export async function elenchi() {
  return raccogli<Elenco>([
    ["candidature", candidature],
    ["rivendicazioni", rivendicazioni],
    ["risposte dei professionisti", candidatureAlleRichieste],
  ]);
}

export async function analisi() {
  return raccogli<Analisi>([
    ["traffico", riepilogo],
    ["provenienze", sorgenti],
    ["pagine di ingresso", pagine],
    ["schede più viste", piuViste],
    ["contenuto", directory],
  ]);
}
