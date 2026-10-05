// Il link dell'email passa da qui: il cookie si può scrivere solo in un route
// handler, non dentro una pagina. Poi si va all'area o si torna all'accesso.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { OWNER_COOKIE, makeOwnerToken } from "@/modules/owner/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const errore = (m: string) => NextResponse.redirect(new URL(`/area/?msg=${encodeURIComponent(m)}`, req.url));

  if (!token) return errore("Link mancante.");
  const l = await db.ownerLogin.findUnique({ where: { token }, include: { agency: { select: { id: true, published: true } } } });
  if (!l || !l.agency.published) return errore("Link non valido.");
  if (l.usedAt) return errore("Link già usato: chiedine un altro.");
  if (Date.now() - l.createdAt.getTime() > 2 * 3600e3) return errore("Link scaduto: chiedine un altro.");
  // Doppio controllo: senza rivendicazione approvata non si entra, anche con un link valido.
  const approvata = await db.agencyClaim.findFirst({ where: { agencyId: l.agencyId, status: "approved" }, select: { id: true } });
  if (!approvata) return errore("Rivendicazione non ancora approvata: ti scriviamo appena verifichiamo.");

  await db.$transaction([
    db.ownerLogin.update({ where: { id: l.id }, data: { usedAt: new Date() } }),
    db.agency.update({ where: { id: l.agencyId }, data: { claimed: true, claimedAt: new Date(), verified: true } }),
  ]);

  const res = NextResponse.redirect(new URL("/area/scheda/", req.url));
  res.cookies.set(OWNER_COOKIE, makeOwnerToken(l.agencyId), {
    httpOnly: true,
    sameSite: "lax",
    secure: BASE_URL.startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
