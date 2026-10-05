// La pagina dove si dice di sì.
//
// È l'unico punto in cui una persona decide davvero: l'assistente arriva qui,
// chi guarda deve essere già entrato nel pannello, e solo allora nasce il
// codice che l'assistente scambierà per la sua chiave. Chi non è entrato viene
// mandato all'accesso e torna qui dopo.
import { redirect } from "next/navigation";
import { sessione } from "@/lib/auth";
import { autorizza } from "./actions";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AutorizzaPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const clientId = first(sp.client_id) ?? "";
  const redirectUri = first(sp.redirect_uri) ?? "";
  const stato = first(sp.state) ?? "";
  const sfida = first(sp.code_challenge) ?? "";
  const metodo = first(sp.code_challenge_method) ?? "";

  // Senza accesso non si decide niente: si passa dal pannello e si torna qui
  // con la richiesta intatta.
  const utente = await sessione();
  if (!utente) {
    const q = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])),
    );
    redirect(`/admin/login/?torna=${encodeURIComponent(`/oauth/autorizza/?${q.toString()}`)}`);
  }

  if (!clientId || !redirectUri) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20">
        <h1 className="t-h2">Richiesta incompleta</h1>
        <p className="t-body mt-3 text-ink-2">
          Manca l&apos;indicazione di chi sta chiedendo il collegamento. Riprova dal pannello dell&apos;assistente.
        </p>
      </main>
    );
  }

  if (metodo && metodo !== "S256") {
    return (
      <main className="mx-auto max-w-lg px-5 py-20">
        <h1 className="t-h2">Metodo non accettato</h1>
        <p className="t-body mt-3 text-ink-2">Questo collegamento accetta solo la verifica S256.</p>
      </main>
    );
  }

  let host = redirectUri;
  try {
    host = new URL(redirectUri).hostname;
  } catch {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="t-h1">Collegare l&apos;assistente?</h1>
      <p className="t-lead mt-4 text-ink-2">
        <strong>{host}</strong> chiede di leggere i dati di analisi di Preventivi.
      </p>

      <div className="mt-6 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-2">Cosa potrà vedere</p>
        <ul className="t-body list-disc space-y-1 pl-5 text-ink-2">
          <li>visite, pagine viste e da dove arrivano</li>
          <li>pagine di ingresso e schede più guardate</li>
          <li>richieste di preventivo: servizio, città, budget e stato</li>
        </ul>
        <p className="t-kicker mb-2 mt-4">Cosa non potrà vedere</p>
        <ul className="t-body list-disc space-y-1 pl-5 text-ink-2">
          <li>nomi, email e telefoni di chi manda una richiesta</li>
          <li>niente di modificabile: legge soltanto</li>
        </ul>
      </div>

      <p className="t-meta mt-4 text-ink-3">
        Stai autorizzando come <strong>{utente.email}</strong>. Potrai revocare il collegamento quando vuoi da
        Connettore AI, nel pannello.
      </p>

      <form action={autorizza} className="mt-6 flex flex-wrap gap-3">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="state" value={stato} />
        <input type="hidden" name="code_challenge" value={sfida} />
        <button type="submit" className="min-h-12 rounded-pill bg-action px-6 text-sm font-bold text-white">
          Collega
        </button>
        <a href="/admin/connettore/" className="min-h-12 rounded-pill border border-line px-6 py-3 text-sm font-bold text-ink">
          Annulla
        </a>
      </form>
    </main>
  );
}
