// I numeri del sito per il pannello globale di Ale (aleglobalpanel).
//
// Il pannello chiama questo indirizzo ogni pochi minuti, insieme a quello
// degli altri siti, e mette tutto su una pagina sola: visite, richieste e le
// ultime richieste arrivate, più gli altri elenchi da guardare (candidature,
// rivendicazioni, recensioni...) e le analisi: vedi modules/pannello/dati.ts.
// Il formato è lo stesso per tutti i siti ed è
// descritto in docs/CONTRATTO-SITI.md del repository del pannello.
//
//   GET /api/pannello/   con  Authorization: Bearer <PANNELLO_TOKEN>
//   GET /api/pannello/?elenco=richieste&prima_di=<data>&quante=200
//       lo storico di un elenco, dal più nuovo, per vedere tutte le voci
//
// Solo lettura. Senza la chiave giusta risponde 401 e basta; se la chiave non
// è impostata nel .env l'indirizzo resta spento. Le visite di chi gestisce il
// sito sono escluse, come nel resto delle statistiche.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analisi, elenchi, paginaDiElenco, richieste as ultimeRichieste } from "@/modules/pannello/dati";

export const dynamic = "force-dynamic";

const SITO = "misterwolf";
const FUSO = "Europe/Rome";
const GIORNI = 30;

function chiaveGiusta(intestazione: string | null): boolean {
  const attesa = process.env.PANNELLO_TOKEN;
  if (!attesa || !intestazione) return false;
  const a = Buffer.from(intestazione);
  const b = Buffer.from(`Bearer ${attesa}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Il giorno di calendario italiano di una data, come "2026-10-26". */
const giornoItaliano = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO });

export async function GET(req: Request) {
  if (!chiaveGiusta(req.headers.get("authorization"))) {
    return new NextResponse(null, { status: 401 });
  }

  // Lo storico completo di un elenco, una pagina alla volta.
  const parametri = new URL(req.url).searchParams;
  const elenco = parametri.get("elenco");
  if (elenco) {
    const prima = parametri.get("prima_di") ? new Date(parametri.get("prima_di")!) : undefined;
    if (prima && Number.isNaN(prima.getTime())) {
      return NextResponse.json({ errore: "prima_di non è una data" }, { status: 400 });
    }
    const quante = Math.min(500, Math.max(1, Number(parametri.get("quante")) || 200));
    const pagina = await paginaDiElenco(elenco, prima, quante);
    if (!pagina) return NextResponse.json({ errore: `Elenco sconosciuto: ${elenco}` }, { status: 404 });
    return NextResponse.json(pagina, { headers: { "Cache-Control": "no-store" } });
  }

  const ora = new Date();
  // Un giorno in più del necessario: il filtro fine sul giorno italiano lo fa
  // il raggruppamento, qui basta non perdere la mezzanotte.
  const dal = new Date(ora.getTime() - (GIORNI + 1) * 864e5);

  const [visitePerGiorno, richiestePerGiorno, daGestire, schede, ultime, liste, blocchi] = await Promise.all([
    db.$queryRaw<{ g: string; n: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS g, count(*)::int AS n
      FROM "Visit"
      WHERE interna = false AND "createdAt" >= ${dal}
      GROUP BY g`,
    db.$queryRaw<{ g: string; n: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS g, count(*)::int AS n
      FROM "Lead"
      WHERE "createdAt" >= ${dal}
      GROUP BY g`,
    db.lead.count({ where: { status: "new" } }),
    db.agency.count({ where: { published: true } }),
    ultimeRichieste(undefined, 20),
    elenchi(),
    analisi(),
  ]);
  const nonDisponibili = [...liste.errori, ...blocchi.errori];

  const visite = new Map(visitePerGiorno.map((r) => [r.g, r.n]));
  const richieste = new Map(richiestePerGiorno.map((r) => [r.g, r.n]));
  // Dal più vecchio al più nuovo, oggi compreso.
  const perGiorno = Array.from({ length: GIORNI }, (_, i) => {
    const giorno = giornoItaliano(new Date(ora.getTime() - (GIORNI - 1 - i) * 864e5));
    return { giorno, visite: visite.get(giorno) ?? 0, richieste: richieste.get(giorno) ?? 0 };
  });
  const somma = (quanti: number, campo: "visite" | "richieste") => perGiorno.slice(-quanti).reduce((t, g) => t + g[campo], 0);
  const oggi = perGiorno[GIORNI - 1];
  const ieri = perGiorno[GIORNI - 2];

  return NextResponse.json(
    {
      versione: 2,
      sito: SITO,
      aggiornato: ora.toISOString(),
      visite: { oggi: oggi.visite, ieri: ieri.visite, giorni_7: somma(7, "visite"), giorni_30: somma(GIORNI, "visite") },
      richieste: {
        oggi: oggi.richieste,
        ieri: ieri.richieste,
        giorni_7: somma(7, "richieste"),
        giorni_30: somma(GIORNI, "richieste"),
        da_gestire: daGestire,
      },
      per_giorno: perGiorno,
      ultime_richieste: ultime,
      extra: { schede_pubblicate: schede },
      elenchi: liste.ok,
      analisi: [
        ...blocchi.ok,
        ...(nonDisponibili.length
          ? [{ titolo: "Dati non disponibili", nota: `Non è stato possibile leggere: ${nonDisponibili.join(", ")}.` }]
          : []),
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
