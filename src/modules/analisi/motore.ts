// Il motore delle interrogazioni: le stesse risposte per il pannello, per
// l'API e per il connettore di Claude e ChatGPT.
//
// Sta in un posto solo perché un numero che cambia a seconda di chi lo chiede
// non serve a nessuno: se il pannello dice 35 visite e l'assistente ne dice 40,
// non ci si fida più di nessuno dei due.
//
// Ogni interrogazione si descrive da sé (nome, cosa fa, quali argomenti
// accetta): è quella descrizione che permette a un assistente di scegliere da
// solo la domanda giusta partendo da una richiesta a parole.

import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { classificaSorgente, type Famiglia } from "@/modules/directory/sorgenti";

// ---------- chiavi ----------

const impronta = (chiave: string) => createHash("sha256").update(chiave).digest("hex");

export async function creaChiave(nome: string, email: string): Promise<string> {
  // Prefisso riconoscibile più 32 byte casuali: si capisce a colpo d'occhio da
  // dove viene, e resta impossibile da indovinare.
  const chiave = `ga_${randomBytes(32).toString("base64url")}`;
  await db.apiKey.create({
    data: { nome, email, impronta: impronta(chiave), prefisso: chiave.slice(0, 11) },
  });
  return chiave;
}

/** La chiave valida, o niente. Segna l'uso, così una chiave dimenticata si vede. */
export async function verificaChiave(intestazione: string | null) {
  const grezza = intestazione?.replace(/^Bearer\s+/i, "").trim();
  if (!grezza) return null;
  const k = await db.apiKey.findUnique({ where: { impronta: impronta(grezza) } });
  if (!k || !k.attiva) return null;
  await db.apiKey.update({ where: { id: k.id }, data: { ultimoUso: new Date(), chiamate: { increment: 1 } } });
  return k;
}

// ---------- interrogazioni ----------

export type Strumento = {
  nome: string;
  descrizione: string;
  argomenti: { nome: string; tipo: "string" | "number"; obbligatorio: boolean; descrizione: string }[];
};

export const STRUMENTI: Strumento[] = [
  {
    nome: "riepilogo_traffico",
    descrizione:
      "Quante visite, quante pagine viste e quante richieste di preventivo nel periodo, con il tasso di conversione. Esclude le visite di chi gestisce il sito.",
    argomenti: [
      { nome: "giorni", tipo: "number", obbligatorio: false, descrizione: "Periodo indietro nel tempo, 30 se non indicato" },
    ],
  },
  {
    nome: "pagine_di_ingresso",
    descrizione:
      "Le pagine da cui entrano i visitatori, con quante visite e quante richieste ha prodotto ciascuna. Si può limitare a una sola provenienza: serve a sapere per quali pagine il sito viene trovato sui motori di ricerca o citato dagli assistenti.",
    argomenti: [
      { nome: "giorni", tipo: "number", obbligatorio: false, descrizione: "Periodo, 30 se non indicato" },
      {
        nome: "sorgente",
        tipo: "string",
        obbligatorio: false,
        descrizione: "ricerca, llm, ads, campagna, social, sito, diretto. Vuoto per tutte",
      },
    ],
  },
  {
    nome: "sorgenti_traffico",
    descrizione:
      "Da dove arrivano le visite, divise per famiglia (motori di ricerca, assistenti AI, campagne, social, altri siti, diretto) e con il nome preciso di chi manda traffico.",
    argomenti: [{ nome: "giorni", tipo: "number", obbligatorio: false, descrizione: "Periodo, 30 se non indicato" }],
  },
  {
    nome: "agenzie_piu_viste",
    descrizione:
      "Quante volte la scheda di ogni professionista è comparsa negli elenchi e quante volte è stata aperta. Serve a capire chi riceve attenzione e a chi ha senso proporre la visibilità a pagamento.",
    argomenti: [
      { nome: "giorni", tipo: "number", obbligatorio: false, descrizione: "Periodo, 30 se non indicato" },
      { nome: "quante", tipo: "number", obbligatorio: false, descrizione: "Quante righe, 20 se non indicato" },
    ],
  },
  {
    nome: "richieste_ricevute",
    descrizione:
      "Le richieste di preventivo arrivate: servizio, città, budget, stato e pagina di invio. Senza nomi, email e telefoni.",
    argomenti: [
      { nome: "giorni", tipo: "number", obbligatorio: false, descrizione: "Periodo, 30 se non indicato" },
      { nome: "quante", tipo: "number", obbligatorio: false, descrizione: "Quante righe, 50 se non indicato" },
    ],
  },
  {
    nome: "cosa_fanno_dopo",
    descrizione:
      "Cosa fa chi entra nel sito: per ogni visita, la pagina di ingresso, quante e quali pagine ha aperto dopo, quali schede di professionista ha guardato e se ha chiesto un preventivo. Si può limitare a una provenienza (per esempio solo chi arriva dai motori di ricerca) o a una pagina di ingresso precisa. Serve a capire se una pagina trattiene le persone o le perde subito.",
    argomenti: [
      { nome: "giorni", tipo: "number", obbligatorio: false, descrizione: "Periodo, 30 se non indicato" },
      { nome: "sorgente", tipo: "string", obbligatorio: false, descrizione: "ricerca, llm, ads, campagna, social, sito, diretto. Vuoto per tutte" },
      { nome: "pagina", tipo: "string", obbligatorio: false, descrizione: "Una sola pagina di ingresso, per esempio /agenzie-video/palermo/" },
      { nome: "quante", tipo: "number", obbligatorio: false, descrizione: "Quante visite raccontare, 20 se non indicato" },
    ],
  },
  {
    nome: "stato_directory",
    descrizione:
      "Quanti professionisti, recensioni, città e pagine pubblicate ci sono, e quali servizi ne hanno di più. La fotografia di cosa contiene il sito.",
    argomenti: [],
  },
];

type Argomenti = Record<string, unknown>;
const numero = (a: Argomenti, k: string, pre: number) => {
  const v = Number(a[k]);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 3650) : pre;
};
const testo = (a: Argomenti, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");

/**
 * Un identificativo di clic vero è una stringa lunga e opaca generata da
 * Google. Quelli scritti a mano durante le prove ("TESTGCLID123") non lo sono,
 * e marcare come pubblicità una richiesta arrivata da un test è il modo più
 * veloce per prendere decisioni sbagliate sui soldi.
 */
export function gclidPlausibile(g?: string | null): boolean {
  if (!g) return false;
  if (/test|demo|esempio|fake|dummy/i.test(g)) return false;
  return g.length >= 20;
}

/** Visite e richieste nate dalle nostre prove, da tenere fuori dai numeri. */
const SEGNI_DI_PROVA = /^(test|prova|demo|verifica)/i;
export function eProva(v: { utmSource?: string | null; utmCampaign?: string | null; gclid?: string | null }): boolean {
  if (v.utmSource && SEGNI_DI_PROVA.test(v.utmSource)) return true;
  if (v.utmCampaign && SEGNI_DI_PROVA.test(v.utmCampaign)) return true;
  if (v.gclid && !gclidPlausibile(v.gclid)) return true;
  return false;
}

/**
 * La pagina di ingresso di ogni richiesta, seguendo la catena
 * richiesta → invio → visita.
 *
 * Prima si raggruppava per la pagina da cui il modulo era stato inviato, e la
 * si confrontava con le pagine di ingresso delle visite: due cose diverse, che
 * coincidono solo se uno entra e invia dalla stessa pagina. Le richieste di
 * chi arrivava da un elenco e poi apriva il modulo non venivano attribuite a
 * nessuna pagina, e sparivano dal conto.
 */
async function ingressoDelleRichieste(periodo: { createdAt: { gte: Date } }) {
  const lead = await db.lead.findMany({
    where: periodo,
    select: {
      id: true,
      landingPath: true,
      submission: { select: { visit: { select: { landingPath: true } } } },
    },
  });
  const conta = new Map<string, number>();
  let senzaVisita = 0;
  for (const l of lead) {
    // La pagina di ingresso della visita; se la visita manca, ripiega su
    // quella di invio, che è comunque meglio di niente.
    const pagina = l.submission?.visit?.landingPath ?? l.landingPath;
    if (!pagina) {
      senzaVisita += 1;
      continue;
    }
    conta.set(pagina, (conta.get(pagina) ?? 0) + 1);
  }
  return { conta, totale: lead.length, senzaVisita };
}

/**
 * I dati personali non escono mai da qui: chi analizza vuole sapere quante
 * richieste sono arrivate da Roma per la SEO, non come si chiama chi le ha
 * mandate.
 */
export async function esegui(nome: string, argomenti: Argomenti = {}): Promise<unknown> {
  const giorni = numero(argomenti, "giorni", 30);
  const da = new Date(Date.now() - giorni * 24 * 3600 * 1000);
  const periodo = { createdAt: { gte: da } };
  const visiteVere = { ...periodo, interna: false };
  const eventiVeri = { ...periodo, interno: false };

  switch (nome) {
    case "riepilogo_traffico": {
      const prove = await db.visit.count({
        where: {
          ...visiteVere,
          OR: [{ utmSource: { startsWith: "test" } }, { utmCampaign: { startsWith: "verifica" } }],
        },
      });
      // Quante pagine sono state aperte davvero.
      //
      // Contare i soli eventi "page_view" qui sarebbe un inganno: quel tipo di
      // evento è nato il 17/09/2026, e sull'archivio precedente il riepilogo
      // rispondeva "2 pagine viste" a fronte di 95 visite. Ogni evento porta
      // però con sé la pagina su cui è avvenuto, quindi una pagina aperta si
      // riconosce anche nelle visite più vecchie: si contano le coppie
      // visita-pagina distinte, che è poi la definizione di pagina vista.
      const [visite, aperture, lead, venduti] = await Promise.all([
        db.visit.count({ where: visiteVere }),
        db.analyticsEvent.findMany({
          where: { ...eventiVeri, path: { not: null } },
          select: { sessionId: true, path: true },
          distinct: ["sessionId", "path"],
        }),
        db.lead.count({ where: periodo }),
        db.lead.count({ where: { ...periodo, status: "sold" } }),
      ]);
      const pagine = aperture.length;
      return {
        periodo: `ultimi ${giorni} giorni`,
        visite,
        pagine_viste: pagine,
        richieste: lead,
        richieste_vendute: venduti,
        conversione: visite > 0 ? `${((lead / visite) * 100).toFixed(2)}%` : "0%",
        nota: "Le visite di chi gestisce il sito sono escluse.",
        ...(prove > 0
          ? {
              avvertenza: `Fra queste ci sono ${prove} visite nate da prove interne (campagne chiamate "test" o "verifica"): con numeri così piccoli spostano le percentuali.`,
            }
          : {}),
      };
    }

    case "pagine_di_ingresso": {
      const filtro = testo(argomenti, "sorgente");
      const visite = await db.visit.findMany({
        where: visiteVere,
        select: { landingPath: true, referrer: true, utmSource: true, utmMedium: true, gclid: true },
      });
      const scelte = filtro ? visite.filter((v) => classificaSorgente(v).famiglia === (filtro as Famiglia)) : visite;
      const conta = new Map<string, number>();
      for (const v of scelte) {
        const k = v.landingPath ?? "(non registrata)";
        conta.set(k, (conta.get(k) ?? 0) + 1);
      }
      const { conta: leadDi, totale: richiesteTotali, senzaVisita } = await ingressoDelleRichieste(periodo);
      const pagine = [...conta.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([pagina, visite]) => ({ pagina, visite, richieste: leadDi.get(pagina) ?? 0 }));
      const attribuite = pagine.reduce((n, p) => n + p.richieste, 0);
      return {
        periodo: `ultimi ${giorni} giorni`,
        sorgente: filtro || "tutte",
        totale_visite: scelte.length,
        richieste_nel_periodo: richiesteTotali,
        richieste_attribuite_a_queste_pagine: attribuite,
        richieste_senza_visita_collegata: senzaVisita,
        nota:
          filtro || attribuite === richiesteTotali
            ? "Le richieste sono attribuite alla pagina da cui è cominciata la visita, non a quella da cui è stato inviato il modulo."
            : `Attenzione: ${richiesteTotali - attribuite} richieste non compaiono qui perché la loro pagina di ingresso è fuori dalle prime 40, oppure la visita non è collegata.`,
        pagine,
      };
    }

    case "sorgenti_traffico": {
      const visite = await db.visit.findMany({
        where: visiteVere,
        select: { referrer: true, utmSource: true, utmMedium: true, utmCampaign: true, gclid: true },
      });
      const famiglie = new Map<string, number>();
      const nomi = new Map<string, number>();
      let prove = 0;
      for (const v of visite) {
        // Le prove interne non sono una sorgente: contarle come campagne
        // farebbe sembrare che una pubblicità stia portando gente.
        if (eProva(v)) {
          prove += 1;
          continue;
        }
        const s = classificaSorgente(v);
        famiglie.set(s.famiglia, (famiglie.get(s.famiglia) ?? 0) + 1);
        nomi.set(s.nome, (nomi.get(s.nome) ?? 0) + 1);
      }
      return {
        periodo: `ultimi ${giorni} giorni`,
        totale: visite.length - prove,
        visite_di_prova_escluse: prove,
        per_famiglia: Object.fromEntries([...famiglie.entries()].sort((a, b) => b[1] - a[1])),
        per_nome: Object.fromEntries([...nomi.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
        nota: "«Diretto o non rilevato» comprende segnalibri, link da applicazioni e visite senza provenienza dichiarata.",
      };
    }

    case "agenzie_piu_viste": {
      const quante = numero(argomenti, "quante", 20);
      const [viste, click] = await Promise.all([
        db.analyticsEvent.groupBy({
          by: ["agencyId"],
          where: { ...eventiVeri, type: "impression", agencyId: { not: null } },
          _count: true,
          orderBy: { _count: { agencyId: "desc" } },
          take: quante,
        }),
        db.analyticsEvent.groupBy({
          by: ["agencyId"],
          where: { ...eventiVeri, type: "card_click", agencyId: { not: null } },
          _count: true,
        }),
      ]);
      const ids = viste.map((v) => v.agencyId).filter((x): x is string => Boolean(x));
      const professionisti = ids.length
        ? await db.agency.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, slug: true, city: { select: { name: true } } },
          })
        : [];
      const per = new Map(professionisti.map((a) => [a.id, a]));
      const clickDi = new Map(click.map((c) => [c.agencyId, c._count]));
      return {
        periodo: `ultimi ${giorni} giorni`,
        professionisti: viste
          .filter((v) => v.agencyId && per.has(v.agencyId))
          .map((v) => {
            const a = per.get(v.agencyId!)!;
            const aperture = clickDi.get(v.agencyId) ?? 0;
            return {
              professionista: a.name,
              citta: a.city?.name ?? null,
              scheda: `/agenzia/${a.slug}/`,
              comparsa: v._count,
              aperta: aperture,
              aperture_su_cento: v._count > 0 ? Number(((aperture / v._count) * 100).toFixed(1)) : 0,
            };
          }),
      };
    }

    case "richieste_ricevute": {
      const quante = numero(argomenti, "quante", 50);
      const lead = await db.lead.findMany({
        where: periodo,
        orderBy: { createdAt: "desc" },
        take: quante,
        select: {
          createdAt: true,
          budget: true,
          timing: true,
          status: true,
          soldPrice: true,
          landingPath: true,
          utmSource: true,
          gclid: true,
          service: { select: { plural: true } },
          city: { select: { name: true } },
          agency: { select: { name: true } },
        },
      });
      return {
        periodo: `ultimi ${giorni} giorni`,
        totale: lead.length,
        nota: "Nomi, email e telefoni non escono da qui.",
        richieste: lead.map((l) => ({
          quando: l.createdAt.toISOString(),
          servizio: l.service?.plural ?? null,
          citta: l.city?.name ?? null,
          agenzia_richiesta: l.agency?.name ?? null,
          budget: l.budget,
          tempi: l.timing,
          stato: l.status,
          venduto_a: l.soldPrice,
          pagina_di_invio: l.landingPath,
          da_google_ads: gclidPlausibile(l.gclid),
          identificativo_clic_sospetto: Boolean(l.gclid) && !gclidPlausibile(l.gclid),
          campagna: l.utmSource,
        })),
      };
    }

    case "cosa_fanno_dopo": {
      const filtro = testo(argomenti, "sorgente");
      const soloPagina = testo(argomenti, "pagina");
      const quante = numero(argomenti, "quante", 20);

      const visite = await db.visit.findMany({
        where: { ...visiteVere, ...(soloPagina ? { landingPath: soloPagina } : {}) },
        select: {
          sessionId: true,
          landingPath: true,
          createdAt: true,
          referrer: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          gclid: true,
        },
        orderBy: { createdAt: "desc" },
      });
      const scelte = visite
        .filter((v) => !eProva(v))
        .filter((v) => !filtro || classificaSorgente(v).famiglia === (filtro as Famiglia))
        .slice(0, quante);

      if (scelte.length === 0) {
        return { periodo: `ultimi ${giorni} giorni`, sorgente: filtro || "tutte", visite: [], nota: "Nessuna visita con questi criteri." };
      }

      const sessioni = scelte.map((v) => v.sessionId);
      const [eventi, richieste] = await Promise.all([
        db.analyticsEvent.findMany({
          where: { sessionId: { in: sessioni }, interno: false },
          select: { sessionId: true, type: true, path: true, agencyId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        db.lead.findMany({
          where: { submission: { visit: { sessionId: { in: sessioni } } } },
          select: {
            service: { select: { plural: true } },
            city: { select: { name: true } },
            submission: { select: { visit: { select: { sessionId: true } } } },
          },
        }),
      ]);

      const idAgenzie = [...new Set(eventi.map((e) => e.agencyId).filter((x): x is string => Boolean(x)))];
      const nomi = new Map(
        idAgenzie.length
          ? (await db.agency.findMany({ where: { id: { in: idAgenzie } }, select: { id: true, name: true } })).map((a) => [a.id, a.name])
          : [],
      );
      const richiestaDi = new Map(
        richieste
          .filter((r) => r.submission?.visit?.sessionId)
          .map((r) => [r.submission!.visit!.sessionId, `${r.service?.plural ?? "servizio"} a ${r.city?.name ?? "città"}`]),
      );

      const dopoLIngresso = new Map<string, number>();
      const racconto = scelte.map((v) => {
        const suoi = eventi.filter((e) => e.sessionId === v.sessionId);
        const pagine: string[] = [];
        for (const e of suoi) {
          if (e.path && !pagine.includes(e.path)) pagine.push(e.path);
        }
        // Le pagine viste dopo quella d'ingresso: sono la prova che la pagina
        // di atterraggio ha invogliato a restare invece di far chiudere.
        for (const p of pagine.slice(1)) dopoLIngresso.set(p, (dopoLIngresso.get(p) ?? 0) + 1);

        const schede = [
          ...new Set(
            suoi
              .filter((e) => e.type === "card_click" && e.agencyId)
              .map((e) => nomi.get(e.agencyId!) ?? "")
              .filter(Boolean),
          ),
        ];
        const ultimo = suoi[suoi.length - 1];
        const durata = ultimo ? Math.round((ultimo.createdAt.getTime() - v.createdAt.getTime()) / 1000) : 0;

        return {
          quando: v.createdAt.toISOString(),
          sorgente: classificaSorgente(v).nome,
          pagina_di_ingresso: v.landingPath,
          pagine_aperte: pagine.length,
          poi_ha_visto: pagine.slice(1, 8),
          schede_aperte: schede,
          ha_aperto_il_modulo: suoi.some((e) => e.type === "step_view" || e.path?.startsWith("/preventivo/")),
          richiesta_inviata: richiestaDi.get(v.sessionId) ?? null,
          durata_secondi: durata,
          se_ne_e_andato_subito: pagine.length <= 1,
        };
      });

      const rimbalzi = racconto.filter((r) => r.se_ne_e_andato_subito).length;
      return {
        periodo: `ultimi ${giorni} giorni`,
        sorgente: filtro || "tutte",
        pagina_di_ingresso: soloPagina || "tutte",
        visite_raccontate: racconto.length,
        se_ne_sono_andati_subito: rimbalzi,
        hanno_proseguito: racconto.length - rimbalzi,
        richieste_da_queste_visite: racconto.filter((r) => r.richiesta_inviata).length,
        pagine_piu_aperte_dopo_l_ingresso: Object.fromEntries(
          [...dopoLIngresso.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
        ),
        visite: racconto,
      };
    }

    case "stato_directory": {
      const [professionisti, recensioni, citta, pagine, servizi] = await Promise.all([
        db.agency.count({ where: { published: true } }),
        db.review.count(),
        db.city.count({ where: { agencies: { some: { published: true } } } }),
        db.landingPage.count({ where: { published: true } }),
        db.service.findMany({
          where: { active: true },
          select: { plural: true, _count: { select: { agencies: true } } },
          orderBy: { position: "asc" },
        }),
      ]);
      return {
        agenzie_pubblicate: professionisti,
        recensioni,
        citta_con_agenzie: citta,
        pagine_pubblicate: pagine,
        servizi: servizi
          .map((s) => ({ servizio: s.plural, professionisti: s._count.agencies }))
          .sort((a, b) => b.professionisti - a.professionisti),
      };
    }

    default:
      throw new Error(`Interrogazione sconosciuta: ${nome}`);
  }
}
