// Conteggi dei filtri mentre il pannello è aperto: chi tocca una voce vede
// subito quanti professionisti resterebbero, senza che l'elenco sotto si muova.
// L'elenco vero cambia solo alla conferma, che è una normale navigazione.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agencyWhere, cityScopeIds, contaFiltri, parseFilters } from "@/modules/directory/listing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const servizio = sp.get("servizio") ?? undefined;
  const cittaSlug = sp.get("citta") ?? undefined;

  // Il perimetro è quello della pagina che ha aperto il pannello: un capoluogo
  // porta con sé i comuni della sua provincia, come negli elenchi.
  let cityIds: string[] | undefined;
  if (cittaSlug) {
    const c = await db.city.findUnique({ where: { slug: cittaSlug }, select: { id: true, slug: true, isCapital: true } });
    if (c) cityIds = await cityScopeIds(c);
  }

  const filtri = parseFilters(Object.fromEntries(sp.entries()));
  const perimetro = { serviceSlug: servizio, cityIds };
  const [totale, conteggi] = await Promise.all([
    db.agency.count({ where: agencyWhere({ ...perimetro, filters: filtri }) }),
    contaFiltri({ ...perimetro, filters: filtri }),
  ]);

  return NextResponse.json({ totale, conteggi });
}
