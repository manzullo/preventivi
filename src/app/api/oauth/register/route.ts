// Registrazione al volo dell'assistente che chiede di collegarsi.
//
// Non serve conoscerlo in anticipo: quello che conta è chi dirà di sì nella
// pagina di autorizzazione, e quello è un amministratore che deve essere già
// entrato nel pannello. Qui si risponde solo "va bene, ecco come ti chiamerò".
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    redirect_uris?: string[];
    client_name?: string;
  };
  const clientId = `cli_${randomBytes(16).toString("hex")}`;
  return NextResponse.json(
    {
      client_id: clientId,
      client_name: body.client_name ?? "Assistente",
      redirect_uris: body.redirect_uris ?? [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
