// Lo stesso connettore, con la chiave dentro l'indirizzo.
//
// Serve perché i pannelli di Claude e ChatGPT, quando si aggiunge un
// connettore, chiedono solo un indirizzo: non c'è un campo dove mettere
// l'autorizzazione. Così si incolla un indirizzo solo e funziona.
//
// La chiave finisce nei registri del server, che sono nostri, e non nei
// referrer, perché questa non è una pagina che il browser apre. Resta comunque
// una chiave da trattare come una password: si revoca dal pannello.
import { NextResponse } from "next/server";
import { STRUMENTI } from "@/modules/analisi/motore";
import { gestisci } from "../route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ chiave: string }> };

export async function POST(req: Request, { params }: Params) {
  const { chiave } = await params;
  return gestisci(req, chiave);
}

export async function GET() {
  return NextResponse.json({
    nome: "Connettore analisi di Preventivi",
    stato: "attivo: usa questo stesso indirizzo come connettore in Claude o ChatGPT",
    interrogazioni: STRUMENTI.map((s) => s.nome),
  });
}
