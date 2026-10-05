// Il connettore per Claude e ChatGPT.
//
// Parla MCP, il modo in cui gli assistenti si collegano a una fonte di dati
// esterna: si incolla l'indirizzo di questa rotta e una chiave, e da lì si
// fanno domande a parole ("com'è andato il traffico questa settimana?", "da
// quali pagine entra chi arriva da Google?"). L'assistente sceglie da solo
// l'interrogazione giusta leggendo le descrizioni in `STRUMENTI`.
//
// Tecnicamente è JSON-RPC 2.0 su una sola rotta. MCP prevede anche un canale
// aperto per gli aggiornamenti, che qui non serve: nessuno spinge niente verso
// l'assistente, si risponde e basta.
//
// Senza chiave valida non esce nessun dato, nemmeno l'elenco delle domande.
import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/site";
import { STRUMENTI, esegui, verificaChiave } from "@/modules/analisi/motore";

export const dynamic = "force-dynamic";

const PROTOCOLLO = "2024-11-05";

type Richiesta = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };

const risposta = (id: unknown, result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result });
const errore = (id: unknown, code: number, message: string, stato = 200) =>
  NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    {
      status: stato,
      // Con un 401 l'assistente non si arrende: legge qui dove chiedere
      // l'accesso e avvia il collegamento invece di mostrare un errore secco.
      headers:
        stato === 401
          ? { "WWW-Authenticate": `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"` }
          : undefined,
    },
  );

/** Gli argomenti nella forma che si aspettano gli assistenti. */
function schema(s: (typeof STRUMENTI)[number]) {
  return {
    type: "object",
    properties: Object.fromEntries(s.argomenti.map((a) => [a.nome, { type: a.tipo, description: a.descrizione }])),
    required: s.argomenti.filter((a) => a.obbligatorio).map((a) => a.nome),
  };
}

/**
 * Il cuore del connettore, indipendente da dove arriva la chiave.
 *
 * Claude e ChatGPT, quando si aggiunge un connettore, non hanno un campo per
 * l'intestazione di autorizzazione: per questo la chiave si può mettere anche
 * dentro l'indirizzo, che è l'unica cosa che quei pannelli chiedono.
 */
export async function gestisci(req: Request, chiaveDaIndirizzo?: string) {
  const body = (await req.json().catch(() => null)) as Richiesta | null;
  if (!body?.method) return errore(null, -32600, "Richiesta non valida");

  const chiave = await verificaChiave(chiaveDaIndirizzo ?? req.headers.get("authorization"));
  if (!chiave) return errore(body.id ?? null, -32001, "Chiave mancante o revocata", 401);

  switch (body.method) {
    case "initialize":
      return risposta(body.id, {
        protocolVersion: PROTOCOLLO,
        capabilities: { tools: {} },
        serverInfo: { name: "preventivi-analisi", version: "1.0.0" },
        instructions:
          "Dati di Mister Wolf: traffico, provenienze, pagine di ingresso, schede più viste e richieste di preventivo. I numeri escludono le visite di chi gestisce il sito. Nomi, email e telefoni non sono disponibili.",
      });

    case "notifications/initialized":
      return new NextResponse(null, { status: 204 });

    case "tools/list":
      return risposta(body.id, {
        tools: STRUMENTI.map((s) => ({ name: s.nome, description: s.descrizione, inputSchema: schema(s) })),
      });

    case "tools/call": {
      const nome = String(body.params?.name ?? "");
      const argomenti = (body.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const dati = await esegui(nome, argomenti);
        return risposta(body.id, { content: [{ type: "text", text: JSON.stringify(dati, null, 2) }] });
      } catch (e) {
        return risposta(body.id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : "Interrogazione fallita" }],
          isError: true,
        });
      }
    }

    case "ping":
      return risposta(body.id, {});

    default:
      return errore(body.id ?? null, -32601, `Metodo non gestito: ${body.method}`);
  }
}

export async function POST(req: Request) {
  return gestisci(req);
}

/** Con il browser si vede solo cos'è: i dati passano dal POST con la chiave. */
export async function GET() {
  return NextResponse.json({
    nome: "Connettore analisi di Mister Wolf",
    protocollo: `MCP ${PROTOCOLLO}`,
    uso: "Aggiungilo come connettore in Claude o ChatGPT con questo indirizzo e una chiave creata in /admin/connettore/.",
    interrogazioni: STRUMENTI.map((s) => ({ nome: s.nome, descrizione: s.descrizione })),
  });
}
