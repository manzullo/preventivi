// Import assistito dall'estensione Chrome (estensione/): chi naviga Instapro
// nel proprio browser preme "Importa in Mister Wolf" e la pagina che ha già
// davanti arriva qui. Nessuna pagina viene scaricata dal server: si legge solo
// l'HTML ricevuto, con lo stesso estrattore di `--fonte sito:instapro`.
// Le schede entrano come bozze. Attivo solo con IMPORT_KEY nell'ambiente.
//   POST /api/import/pagina/  { key, url, html }
import { NextResponse } from "next/server";
import { mapInstaproElenco, type SiteConfig } from "@/modules/ingest/sito";
import { importRecords } from "@/modules/ingest/import";
import instapro from "../../../../../data/siti/instapro.json";

export const dynamic = "force-dynamic";

const MAX_HTML = 8_000_000;

// "tinteggiatura/imbianchino-professionisti" → i nostri servizi che la usano.
function serviziPer(categoria: string): string[] {
  const cfg = instapro as SiteConfig;
  return Object.entries(cfg.categorie)
    .filter(([, v]) => [v].flat().includes(categoria))
    .map(([slug]) => slug);
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  const fail = (status: number, errore: string) => NextResponse.json({ ok: false, errore }, { status, headers: cors });
  const body = (await req.json().catch(() => null)) as { key?: string; url?: string; html?: string } | null;
  if (!process.env.IMPORT_KEY || body?.key !== process.env.IMPORT_KEY) return fail(401, "chiave mancante o sbagliata");
  if (!body.url || !body.html || body.html.length > MAX_HTML) return fail(400, "pagina mancante");

  let u: URL;
  try {
    u = new URL(body.url);
  } catch {
    return fail(400, "indirizzo non valido");
  }
  if (u.hostname !== "www.instapro.it") return fail(400, "per ora si importano solo le pagine di Instapro");
  // Pagina elenco: /{macro}/{mestiere}-professionisti/{citta}
  const m = /^\/([a-z0-9-]+\/[a-z0-9-]+-professionisti)\/([a-z0-9-]+)\/?$/.exec(u.pathname);
  if (!m) return fail(400, "apri una pagina elenco, tipo instapro.it/tinteggiatura/imbianchino-professionisti/roma");
  const [, categoria, citta] = m;
  const servizi = serviziPer(categoria);
  if (!servizi.length) return fail(400, `categoria Instapro non collegata a un nostro servizio: ${categoria}`);

  const records = mapInstaproElenco(body.html, { source: "instapro", url: u.toString(), serviceSlug: servizi[0], citySlug: citta }).map((r) => ({ ...r, serviceSlugs: servizi }));
  if (!records.length) return fail(422, "nella pagina non ho trovato professionisti");

  const stats = await importRecords(records, { publish: false });
  return NextResponse.json({ ok: true, categoria, citta, servizi, letti: records.length, ...stats, nomi: records.map((r) => r.name) }, { headers: cors });
}
