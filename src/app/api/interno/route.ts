// Segna questo browser come "di casa": chi gestisce il sito lo apre decine di
// volte al giorno, e senza distinguerlo i numeri raccontano soprattutto il
// lavoro di chi lo costruisce.
//
// Il contrassegno è un cookie posato dal server quando si entra nell'area
// riservata e leggibile solo dal server: non si può fingere di essere di casa
// dal browser, né il contrario.
//
//   POST   /api/interno/   lo posa (lo chiama il pannello)
//   DELETE /api/interno/   lo toglie, per provare il sito da visitatore
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const COOKIE_INTERNO = "ma_interno";
const UN_ANNO = 60 * 60 * 24 * 365;

export async function POST() {
  await requireAdmin();
  const c = await cookies();
  c.set(COOKIE_INTERNO, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UN_ANNO,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true, interno: true });
}

export async function DELETE() {
  await requireAdmin();
  const c = await cookies();
  c.delete(COOKIE_INTERNO);
  return NextResponse.json({ ok: true, interno: false });
}
