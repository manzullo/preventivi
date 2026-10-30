// Ricostruisce le pagine servizio e servizio x città, e su richiesta rifà i
// punteggi.
//   GET /api/cron/pagine/?key=CRON_KEY[&punteggi=1]
// Serve dopo un cambio fatto direttamente sul database (un servizio nuovo, un
// import massivo): dal pannello succede già da solo a ogni salvataggio.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { rebuildLandingPages } from "@/modules/directory/pages";
import { recalcAllScores } from "@/modules/ranking/score";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!process.env.CRON_KEY || key !== process.env.CRON_KEY) return NextResponse.json({ ok: false }, { status: 401 });

  // I punteggi si rifanno solo se richiesto: su migliaia di schede è il pezzo
  // lento, e quasi sempre basta rifare le pagine.
  const punteggi = url.searchParams.get("punteggi") === "1" ? await recalcAllScores() : null;
  const pagine = await rebuildLandingPages();
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, pagine, punteggi });
}
