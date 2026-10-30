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
import { FAMIGLIE, classificaSorgente } from "@/modules/directory/sorgenti";
import { type Campi, campiDa, provenienza, risposte } from "@/modules/pannello/campi";
import { campiPagina, paginaDi, titoliPagine } from "@/modules/pannello/pagine";

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
  serie?: { giorni: string[]; linee: { nome: string; valori: number[]; percento?: boolean }[] };
};

/** Solo le voci arrivate prima di una data: le pagine successive dello storico. */
const primaDi = (prima?: Date) => (prima ? { createdAt: { lt: prima } } : undefined);

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
export const STATO_RICHIESTA: Record<string, string> = {
  new: "nuova",
  qualified: "qualificata",
  sold: "venduta",
  rejected: "scartata",
};

/** La riga senza le relazioni, che si aggiungono a mano con un nome chiaro. */
function senza<T extends object>(riga: T, ...chiavi: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(riga).filter(([k]) => !chiavi.includes(k)));
}

const DETTAGLI_RICHIESTA = {
  service: { select: { plural: true } },
  city: { select: { name: true } },
  agency: { select: { name: true } },
  form: { select: { name: true } },
  submission: {
    select: {
      answers: true,
      contact: true,
      landingPath: true,
      visit: {
        select: {
          landingPath: true,
          referrer: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          gclid: true,
          device: true,
          searchTerm: true,
          createdAt: true,
        },
      },
    },
  },
  assignments: { select: { status: true, agency: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
} as const;

/**
 * I preventivi nel formato di `ultime_richieste`, dal più nuovo, ciascuno con
 * tutti i suoi dati in `campi`: pagina di conversione e di ingresso con titolo
 * e link, risposte del modulo, provenienza, a chi è andato.
 */
export async function richieste(prima?: Date, quante = 20) {
  const righe = await db.lead.findMany({
    where: primaDi(prima),
    orderBy: { createdAt: "desc" },
    take: quante,
    include: DETTAGLI_RICHIESTA,
  });
  const conversione = (l: (typeof righe)[number]) => l.landingPath ?? l.submission?.landingPath;
  const titoli = await titoliPagine(righe.flatMap((l) => [conversione(l), l.submission?.visit?.landingPath]));
  return righe.map((l) => {
    const ingresso = l.submission?.visit?.landingPath;
    const prov = provenienza(l.submission?.visit ?? null, l.gclid);
    const candidate = l.assignments.filter((a) => a.status === "accepted").length;
    return {
      id: l.id,
      quando: l.createdAt.toISOString(),
      tipo: l.service?.plural ?? undefined,
      nome: unisci(l.name, l.company),
      // Solo l'email: il telefono sta in campi.telefono.
      contatto: l.email ?? undefined,
      pagina_ingresso: paginaDi(ingresso, titoli),
      pagina_conversione: paginaDi(conversione(l), titoli),
      in_evidenza: evidenza([
        ["Arrivata da", prov.provenienza],
        ["Cercava", prov.parola_cercata],
        ["Servizio", l.service?.plural],
        ["Città", l.city?.name],
        ["Budget", l.budget],
        [
          "Mandata a",
          l.assignments.length
            ? `${l.assignments.length} ${l.assignments.length === 1 ? "professionista" : "professionisti"}${candidate ? `, ${candidate} ${candidate === 1 ? "candidato" : "candidati"}` : ""}`
            : null,
        ],
      ]),
      riassunto: unisci(l.city?.name, l.agency && `per ${l.agency.name}`, l.budget, l.timing, breve(l.description)),
      stato: STATO_RICHIESTA[l.status] ?? l.status,
      link: admin(`lead/${l.id}/`),
      campi: campiDa(senza(l, "service", "city", "agency", "form", "submission", "assignments", "landingPath"), {
        stato: STATO_RICHIESTA[l.status] ?? l.status,
        servizio: l.service?.plural,
        citta: l.city?.name,
        professionista_scelto_dal_cliente: l.agency?.name,
        ...campiPagina("pagina_di_conversione", conversione(l), titoli),
        ...campiPagina("pagina_di_ingresso", ingresso, titoli),
        ...prov,
        modulo: l.form?.name,
        ...risposte(l.submission?.answers),
        professionisti_a_cui_e_andata: l.assignments.map((a) => `${a.agency.name} (${STATO_ASSEGNAZIONE[a.status] ?? a.status})`),
      }),
    };
  });
}

/** I campi da mostrare subito nella riga, senza aprirla: al massimo 6, solo quelli pieni. */
function evidenza(coppie: [string, unknown][]) {
  const piene = coppie
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 6)
    .map(([nome, v]) => ({ nome, valore: String(v) }));
  return piene.length ? piene : undefined;
}

async function candidature(prima?: Date, quante = VOCI): Promise<Elenco> {
  const [totale, daGestire, righe] = await Promise.all([
    db.application.count(),
    db.application.count({ where: { status: "pending" } }),
    db.application.findMany({ where: primaDi(prima), orderBy: { createdAt: "desc" }, take: quante }),
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
      contatto: a.email,
      dettaglio: unisci(a.citySlug, a.website, breve(a.message)),
      stato: STATO_CANDIDATURA[a.status] ?? a.status,
      link: admin(`candidature/?stato=${a.status}`),
      campi: campiDa(a, { stato: STATO_CANDIDATURA[a.status] ?? a.status }),
    })),
  };
}

async function rivendicazioni(prima?: Date, quante = VOCI): Promise<Elenco> {
  const [totale, daGestire, righe] = await Promise.all([
    db.agencyClaim.count(),
    db.agencyClaim.count({ where: { status: { in: ["pending", "email_ok"] } } }),
    db.agencyClaim.findMany({
      where: primaDi(prima),
      orderBy: { createdAt: "desc" },
      take: quante,
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
      contatto: r.email,
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
async function candidatureAlleRichieste(prima?: Date, quante = VOCI): Promise<Elenco> {
  const risposte = { status: { in: ["accepted", "declined"] }, respondedAt: { not: null } };
  const [totale, righe] = await Promise.all([
    db.leadAssignment.count({ where: risposte }),
    db.leadAssignment.findMany({
      where: { ...risposte, ...(prima ? { respondedAt: { lt: prima } } : {}) },
      orderBy: { respondedAt: "desc" },
      take: quante,
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

type Riepilogo = {
  visite: number;
  pagine_viste: number;
  richieste: number;
  richieste_vendute: number;
  conversione: string;
  nota?: string;
  avvertenza?: string;
};
type Sorgenti = { totale: number; per_famiglia: Record<string, number>; per_nome: Record<string, number>; nota?: string };
type Pagine = { pagine: { pagina: string; visite: number; richieste: number }[]; nota?: string };
type PiuViste = {
  professionisti: { professionista: string; citta: string | null; comparsa: number; aperta: number; aperture_su_cento: number }[];
};
type Directory = {
  agenzie_pubblicate: number;
  recensioni: number;
  citta_con_agenzie: number;
  pagine_pubblicate: number;
  servizi: { servizio: string; professionisti: number }[];
};

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
    tabella: {
      colonne: ["Pagina", "Visite", "Richieste"],
      righe: r.pagine.slice(0, RIGHE).map((p) => [p.pagina, p.visite, p.richieste]),
    },
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
    tabella: {
      colonne: ["Servizio", "Professionisti"],
      righe: r.servizi.slice(0, RIGHE).map((s) => [s.servizio, s.professionisti]),
    },
  };
}

// --- Grafici nel tempo ---------------------------------------------------------

const GIORNI = 30;
const giornoItaliano = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

/** Gli ultimi 30 giorni italiani, dal più vecchio a oggi. */
function ultimiGiorni(): string[] {
  const ora = Date.now();
  return Array.from({ length: GIORNI }, (_, i) => giornoItaliano(new Date(ora - (GIORNI - 1 - i) * 864e5)));
}
const inizioPeriodo = () => new Date(Date.now() - (GIORNI + 1) * 864e5);

/** Conta per giorno e per gruppo; restituisce i gruppi più grandi come linee. */
function linee(righe: { giorno: string; gruppo: string }[], giorni: string[], massimo: number) {
  const totali = new Map<string, number>();
  const per = new Map<string, Map<string, number>>();
  for (const r of righe) {
    totali.set(r.gruppo, (totali.get(r.gruppo) ?? 0) + 1);
    const g = per.get(r.gruppo) ?? new Map<string, number>();
    g.set(r.giorno, (g.get(r.giorno) ?? 0) + 1);
    per.set(r.gruppo, g);
  }
  const ordinati = [...totali.entries()].sort((a, b) => b[1] - a[1]);
  return {
    ordinati,
    linee: ordinati.slice(0, massimo).map(([nome]) => ({ nome, valori: giorni.map((g) => per.get(nome)?.get(g) ?? 0) })),
  };
}

async function provenienzeNelTempo(): Promise<Analisi> {
  const giorni = ultimiGiorni();
  const visite = await db.visit.findMany({
    where: { interna: false, createdAt: { gte: inizioPeriodo() } },
    select: { createdAt: true, referrer: true, utmSource: true, utmMedium: true, gclid: true },
  });
  const nome = new Map(FAMIGLIE.map((f) => [f.chiave as string, f.nome]));
  const righe = visite.map((v) => {
    const f = classificaSorgente(v).famiglia;
    return { giorno: giornoItaliano(v.createdAt), gruppo: nome.get(f) ?? f };
  });
  const { ordinati, linee: l } = linee(righe, giorni, 4);
  const totale = visite.length;
  return {
    titolo: "Provenienze giorno per giorno (30 giorni)",
    nota: "Le quattro provenienze più grandi. Escluse le visite degli amministratori.",
    valori: ordinati.slice(0, 4).map(([n, v]) => ({ nome: n, valore: v, nota: percento(v, totale) })),
    serie: { giorni, linee: l },
  };
}

async function conversioneNelTempo(): Promise<Analisi> {
  const giorni = ultimiGiorni();
  const dal = inizioPeriodo();
  const [visite, lead] = await Promise.all([
    db.visit.findMany({ where: { interna: false, createdAt: { gte: dal } }, select: { createdAt: true } }),
    db.lead.findMany({ where: { createdAt: { gte: dal } }, select: { createdAt: true } }),
  ]);
  const conta = (righe: { createdAt: Date }[]) => {
    const m = new Map<string, number>();
    for (const r of righe) m.set(giornoItaliano(r.createdAt), (m.get(giornoItaliano(r.createdAt)) ?? 0) + 1);
    return giorni.map((g) => m.get(g) ?? 0);
  };
  const v = conta(visite);
  const r = conta(lead);
  // Media mobile di 7 giorni: giorno per giorno con pochi numeri salta da 0 a 50%.
  const mobile = giorni.map((_, i) => {
    const da = Math.max(0, i - 6);
    const vv = v.slice(da, i + 1).reduce((a, b) => a + b, 0);
    const rr = r.slice(da, i + 1).reduce((a, b) => a + b, 0);
    return vv > 0 ? Number(((rr / vv) * 100).toFixed(2)) : 0;
  });
  const somma = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    titolo: "Conversione: visite che diventano richieste (30 giorni)",
    nota: "Linea: media degli ultimi 7 giorni, per non far saltare il grafico nei giorni con poche visite.",
    valori: [
      { nome: "Conversione 30 giorni", valore: percento(somma(r), somma(v)) ?? "0%" },
      { nome: "Conversione 7 giorni", valore: percento(somma(r.slice(-7)), somma(v.slice(-7))) ?? "0%" },
      { nome: "Richieste 30 giorni", valore: somma(r) },
      { nome: "Visite 30 giorni", valore: somma(v) },
    ],
    serie: { giorni, linee: [{ nome: "Conversione %", valori: mobile, percento: true }] },
  };
}

async function richiestePerServizio(): Promise<Analisi> {
  const giorni = ultimiGiorni();
  const lead = await db.lead.findMany({
    where: { createdAt: { gte: inizioPeriodo() } },
    select: { createdAt: true, service: { select: { plural: true } }, city: { select: { name: true } } },
  });
  const { ordinati, linee: l } = linee(
    lead.map((x) => ({ giorno: giornoItaliano(x.createdAt), gruppo: x.service?.plural ?? "Senza servizio" })),
    giorni,
    4,
  );
  const citta = new Map<string, number>();
  for (const x of lead) if (x.city) citta.set(x.city.name, (citta.get(x.city.name) ?? 0) + 1);
  return {
    titolo: "Richieste per servizio (30 giorni)",
    nota: "Le linee sono i quattro servizi più richiesti; in tabella anche le città.",
    serie: { giorni, linee: l },
    tabella: {
      colonne: ["Servizio o città", "Richieste"],
      righe: [
        ...ordinati.slice(0, 25),
        ...[...citta.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([c, n]) => [`Città: ${c}`, n] as [string, number]),
      ].slice(0, RIGHE),
    },
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

const ELENCHI: Record<string, (prima?: Date, quante?: number) => Promise<Elenco>> = {
  candidature,
  rivendicazioni,
  risposte_professionisti: candidatureAlleRichieste,
};

/**
 * Una pagina dello storico di un elenco (`?elenco=...&prima_di=...&quante=...`):
 * se ne chiede una voce in più per sapere se ce ne sono altre.
 */
export async function paginaDiElenco(chiave: string, prima: Date | undefined, quante: number) {
  const voci =
    chiave === "richieste"
      ? await richieste(prima, quante + 1)
      : ELENCHI[chiave]
        ? (await ELENCHI[chiave](prima, quante + 1)).voci
        : null;
  if (!voci) return null;
  return { voci: voci.slice(0, quante), altre: voci.length > quante };
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
    ["conversione nel tempo", conversioneNelTempo],
    ["provenienze nel tempo", provenienzeNelTempo],
    ["richieste per servizio", richiestePerServizio],
    ["provenienze", sorgenti],
    ["pagine di ingresso", pagine],
    ["schede più viste", piuViste],
    ["contenuto", directory],
  ]);
}
