// I numeri del sito per il pannello globale di Ale (aleglobalpanel).
//
// Il pannello chiama questo indirizzo ogni pochi minuti, insieme a quello
// degli altri siti, e mette tutto su una pagina sola: visite, richieste e le
// ultime richieste arrivate. Il formato è lo stesso per tutti i siti ed è
// descritto in docs/CONTRATTO-SITI.md del repository del pannello.
//
//   GET /api/pannello/   con  Authorization: Bearer <PANNELLO_TOKEN>
//
// Solo lettura. Senza la chiave giusta risponde 401 e basta; se la chiave non
// è impostata nel .env l'indirizzo resta spento. Le visite di chi gestisce il
// sito sono escluse, come nel resto delle statistiche.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";

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

  const ora = new Date();
  // Un giorno in più del necessario: il filtro fine sul giorno italiano lo fa
  // il raggruppamento, qui basta non perdere la mezzanotte.
  const dal = new Date(ora.getTime() - (GIORNI + 1) * 864e5);

  const [visitePerGiorno, richiestePerGiorno, daGestire, schede, ultime] = await Promise.all([
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
    db.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        budget: true,
        timing: true,
        description: true,
        status: true,
        service: { select: { plural: true } },
        city: { select: { name: true } },
        agency: { select: { name: true } },
      },
    }),
  ]);

  const visite = new Map(visitePerGiorno.map((r) => [r.g, r.n]));
  const richieste = new Map(richiestePerGiorno.map((r) => [r.g, r.n]));
  // Dal più vecchio al più nuovo, oggi compreso.
  const perGiorno = Array.from({ length: GIORNI }, (_, i) => {
    const giorno = giornoItaliano(new Date(ora.getTime() - (GIORNI - 1 - i) * 864e5));
    return { giorno, visite: visite.get(giorno) ?? 0, richieste: richieste.get(giorno) ?? 0 };
  });
  const somma = (quanti: number, campo: "visite" | "richieste") =>
    perGiorno.slice(-quanti).reduce((t, g) => t + g[campo], 0);
  const oggi = perGiorno[GIORNI - 1];
  const ieri = perGiorno[GIORNI - 2];

  return NextResponse.json(
    {
      versione: 1,
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
      ultime_richieste: ultime.map((l) => ({
        id: l.id,
        quando: l.createdAt.toISOString(),
        tipo: l.service?.plural ?? undefined,
        nome: [l.name, l.company].filter(Boolean).join(" · ") || undefined,
        contatto: l.email ?? l.phone ?? undefined,
        riassunto:
          [
            l.city?.name,
            l.agency ? `per ${l.agency.name}` : null,
            l.budget,
            l.timing,
            l.description?.slice(0, 200),
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        stato: l.status,
        link: `${BASE_URL}/admin/lead/${l.id}/`,
      })),
      extra: { schede_pubblicate: schede },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
