// Il percorso che ha portato al lead: cosa ha guardato questa persona, in che
// ordine, prima di compilare il modulo.
//
// I pezzi c'erano già tutti e non parlavano fra loro: `Visit` conserva da dove
// è arrivata (landing, referrer, campagna) e `AnalyticsEvent` registra ogni
// pagina e ogni clic. A cucirli è il `sessionId`, lo stesso per entrambi.
//
// Il problema è il numero: una sola visita produce anche settanta eventi,
// perché ogni scheda vista ne vale uno. Un elenco di settanta righe non si
// legge, quindi le viste delle schede si contano invece di elencarle e resta
// una riga per ogni cosa che la persona ha deciso di fare.

import { db } from "@/lib/db";

export type Passo = {
  quando: Date;
  /** Cosa è successo: "Visita pagina", "Click su scheda"… */
  titolo: string;
  /** Il nome del professionista, o quante schede ha visto su quella pagina. */
  dettaglio?: string;
  path?: string;
  /** La pagina da cui è entrato nel sito. */
  landing?: boolean;
  /** L'ultimo passo, quello che ha generato il lead. */
  finale?: boolean;
};

export type Percorso = {
  arrivo?: Date;
  landingPath?: string | null;
  referrer?: string | null;
  device?: string | null;
  sorgente: string;
  /** La landing non è la pagina del professionista richiesto: è entrato da altrove. */
  atterratoAltrove: boolean;
  passi: Passo[];
  /** Quanti eventi grezzi stanno dietro questi passi. */
  eventi: number;
};

/** Da dove arriva la visita, in parole: "google / cpc", "referral bing.com"… */
function sorgenteDi(v: {
  utmSource: string | null;
  utmMedium: string | null;
  referrer: string | null;
  gclid: string | null;
}): string {
  if (v.gclid) return "Google Ads";
  if (v.utmSource) return [v.utmSource, v.utmMedium].filter(Boolean).join(" / ");
  if (!v.referrer) return "diretto";
  try {
    return `referral ${new URL(v.referrer).hostname.replace(/^www\./, "")}`;
  } catch {
    return `referral ${v.referrer}`;
  }
}

/** Dove stava il bottone che ha premuto: i nomi interni non dicono niente. */
const POSIZIONI: Record<string, string> = {
  hero: "dalla fascia in cima",
  mid: "da metà elenco",
  end: "dal fondo pagina",
  faq: "dalle domande frequenti",
  sticky: "dalla barra fissa",
  agency: "dalla scheda professionista",
  blog: "da un articolo",
};

const TITOLI: Record<string, string> = {
  card_click: "Click su scheda",
  contact_click: "Click sui contatti",
  cta_click: "Click sul bottone preventivi",
  step_view: "Passo del modulo aperto",
  step_completed: "Passo del modulo completato",
  form_submit: "Modulo inviato",
};

export async function percorsoLead(leadId: string): Promise<Percorso | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      createdAt: true,
      agency: { select: { slug: true, name: true } },
      submission: { select: { visit: true } },
    },
  });
  const visita = lead?.submission?.visit;
  if (!lead || !visita) return null;
  return percorsoSessione(visita, lead.agency?.slug ?? null);
}

type VisitaLike = {
  sessionId: string;
  landingPath: string | null;
  referrer: string | null;
  device: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  gclid: string | null;
  createdAt: Date;
};

/**
 * Il percorso di una sessione, che diventi un lead o no.
 * `slugAgenzia` serve solo a capire se la pagina di ingresso era già quella
 * del professionista poi richiesta: senza lead non c'è niente da confrontare.
 */
export async function percorsoSessione(visita: VisitaLike, slugAgenzia: string | null = null): Promise<Percorso | null> {
  const eventi = await db.analyticsEvent.findMany({
    where: { sessionId: visita.sessionId },
    select: { type: true, path: true, createdAt: true, meta: true, agencyId: true },
    orderBy: { createdAt: "asc" },
  });

  // Gli eventi portano solo l'id del professionista: i nomi si prendono in un colpo
  // solo, invece di una query per riga.
  const ids = [...new Set(eventi.map((e) => e.agencyId).filter((x): x is string => Boolean(x)))];
  const nomi = new Map(
    ids.length
      ? (await db.agency.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((a) => [a.id, a.name])
      : [],
  );

  const passi: Passo[] = [];
  let pathCorrente: string | null = null;
  // Il conteggio delle schede va attaccato alla pagina su cui le ha viste, non
  // all'ultima riga scritta: in mezzo possono esserci clic.
  let visitaCorrente: Passo | null = null;
  let schedeViste = 0;
  // La compilazione del modulo produce due eventi per ogni passo: messi in fila
  // sono quindici righe che dicono sempre la stessa cosa. Diventano una riga
  // sola con quanto ci ha messo.
  let formDa: Date | null = null;
  let formA: Date | null = null;
  let formPassi = 0;

  const conteggi = new Map<Passo, number>();
  const scarica = () => {
    if (schedeViste && visitaCorrente) {
      const totale = (conteggi.get(visitaCorrente) ?? 0) + schedeViste;
      conteggi.set(visitaCorrente, totale);
      visitaCorrente.dettaglio = `${totale} ${totale === 1 ? "scheda vista" : "schede viste"}`;
    }
    schedeViste = 0;
  };

  const chiudiForm = () => {
    if (!formDa || !formA || formPassi === 0) {
      formDa = null;
      formA = null;
      formPassi = 0;
      return;
    }
    const secondi = Math.max(1, Math.round((formA.getTime() - formDa.getTime()) / 1000));
    passi.push({
      quando: formDa,
      titolo: "Compilazione del modulo",
      dettaglio: `${formPassi} ${formPassi === 1 ? "passo" : "passi"} in ${secondi < 60 ? `${secondi} secondi` : `${Math.round(secondi / 60)} minuti`}`,
      path: "/preventivo/",
    });
    formDa = null;
    formA = null;
    formPassi = 0;
  };

  for (const e of eventi) {
    const dentroIlModulo = e.type === "step_view" || e.type === "step_completed";

    if (dentroIlModulo) {
      scarica();
      formDa = formDa ?? e.createdAt;
      formA = e.createdAt;
      if (e.type === "step_completed") formPassi += 1;
      continue;
    }

    if (e.path && e.path !== pathCorrente) {
      scarica();
      chiudiForm();
      pathCorrente = e.path;
      // La pagina del modulo non è una tappa: quello che conta è la
      // compilazione, che ha una riga sua.
      if (!e.path.startsWith("/preventivo/")) {
        visitaCorrente = { quando: e.createdAt, titolo: "Visita pagina", path: e.path, landing: passi.length === 0 };
        passi.push(visitaCorrente);
      }
    }

    if (e.type === "impression") {
      schedeViste += 1;
      continue;
    }
    // La pagina vista l'abbiamo già segnata sopra, dal cambio di indirizzo:
    // questi due eventi la confermano soltanto.
    if (e.type === "hero_view" || e.type === "page_view") continue;

    if (e.type === "form_submit") {
      scarica();
      chiudiForm();
      passi.push({ quando: e.createdAt, titolo: "Richiesta inviata", path: e.path ?? undefined });
      // Quello che succede dopo non ha portato a questa richiesta.
      break;
    }

    const meta = (e.meta ?? {}) as { position?: string; step?: string };
    passi.push({
      quando: e.createdAt,
      titolo: TITOLI[e.type] ?? e.type,
      dettaglio:
        (e.agencyId ? nomi.get(e.agencyId) : undefined) ??
        (meta.position ? (POSIZIONI[meta.position] ?? meta.position) : undefined) ??
        meta.step,
      path: e.path ?? undefined,
    });
  }
  scarica();
  chiudiForm();

  passi.sort((a, b) => a.quando.getTime() - b.quando.getTime());
  if (passi.length) passi[passi.length - 1].finale = true;

  // "Atterrato altrove" vuol dire che la richiesta riguarda un professionista diverso
  // dalla pagina da cui è entrato: il sito ha fatto da tramite, invece di
  // ricevere qualcuno che quel nome lo cercava già.
  const atterratoAltrove = Boolean(slugAgenzia && visita.landingPath && !visita.landingPath.includes(slugAgenzia));

  return {
    arrivo: passi[0]?.quando ?? visita.createdAt,
    landingPath: visita.landingPath,
    referrer: visita.referrer,
    device: visita.device,
    sorgente: sorgenteDi(visita),
    atterratoAltrove,
    passi,
    eventi: eventi.length,
  };
}
