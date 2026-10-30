// Lo scambio finale: l'assistente porta il codice ricevuto e ritira la sua
// chiave. Il codice vale una volta sola e pochi minuti, e chi lo porta deve
// dimostrare di essere lo stesso che lo aveva chiesto (PKCE).
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { creaChiave } from "@/modules/analisi/motore";

export const dynamic = "force-dynamic";

const errore = (code: string, descrizione: string, stato = 400) =>
  NextResponse.json({ error: code, error_description: descrizione }, { status: stato });

export async function POST(req: Request) {
  // Gli assistenti mandano il modulo classico, non JSON.
  const tipo = req.headers.get("content-type") ?? "";
  const dati = tipo.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as Record<string, string>)
    : Object.fromEntries((await req.formData()).entries() as Iterable<[string, string]>);

  if (dati.grant_type !== "authorization_code") {
    return errore("unsupported_grant_type", "Qui si accetta solo authorization_code");
  }

  const riga = await db.oAuthCode.findUnique({ where: { codice: String(dati.code ?? "") } });
  if (!riga || riga.usato || riga.scadenza < new Date()) {
    return errore("invalid_grant", "Codice non valido, già usato o scaduto");
  }
  if (riga.redirectUri !== dati.redirect_uri) {
    return errore("invalid_grant", "L'indirizzo di ritorno non è quello dichiarato");
  }

  // PKCE: l'impronta del verificatore deve combaciare con quella depositata.
  if (riga.codeChallenge) {
    const verifier = String(dati.code_verifier ?? "");
    const impronta = createHash("sha256").update(verifier).digest("base64url");
    if (!verifier || impronta !== riga.codeChallenge) {
      return errore("invalid_grant", "La prova di chi ritira non corrisponde");
    }
  }

  await db.oAuthCode.update({ where: { id: riga.id }, data: { usato: true } });
  const chiave = await creaChiave(`Connettore autorizzato da ${riga.email}`, riga.email);

  return NextResponse.json({
    access_token: chiave,
    token_type: "Bearer",
    scope: "analisi",
  });
}
