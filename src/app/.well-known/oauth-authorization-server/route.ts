// Come si ottiene una chiave. Gli indirizzi portano la barra finale: il sito
// la impone, e senza di quella ogni chiamata si trasformerebbe in un rimando.
// Come si ottiene una chiave: dove mandare la persona a dire di sì, dove
// ritirare il gettone, e che tipo di accesso accettiamo.
import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/autorizza/`,
    token_endpoint: `${BASE_URL}/api/oauth/token/`,
    registration_endpoint: `${BASE_URL}/api/oauth/register/`,
    scopes_supported: ["analisi"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    // Solo PKCE: nessun segreto da conservare da nessuna parte.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
