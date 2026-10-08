// Dice agli assistenti chi custodisce le chiavi di questo connettore.
// È la prima cosa che Claude e ChatGPT cercano quando si aggiunge un
// connettore: senza, tentano una registrazione alla cieca e falliscono.
import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    resource: `${BASE_URL}/api/mcp/`,
    authorization_servers: [BASE_URL],
    scopes_supported: ["analisi"],
    bearer_methods_supported: ["header"],
  });
}
