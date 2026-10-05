"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/** Il codice vive cinque minuti: il tempo che serve e non uno di più. */
export async function autorizza(fd: FormData) {
  const sessione = await requireAdmin();
  const clientId = String(fd.get("client_id") ?? "");
  const redirectUri = String(fd.get("redirect_uri") ?? "");
  const stato = String(fd.get("state") ?? "");
  const sfida = String(fd.get("code_challenge") ?? "");
  if (!clientId || !redirectUri) redirect("/admin/connettore/?msg=Richiesta+incompleta");

  const codice = randomBytes(32).toString("base64url");
  await db.oAuthCode.create({
    data: {
      codice,
      clientId,
      redirectUri,
      codeChallenge: sfida || null,
      email: sessione.email,
      scadenza: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const torna = new URL(redirectUri);
  torna.searchParams.set("code", codice);
  if (stato) torna.searchParams.set("state", stato);
  redirect(torna.toString());
}
