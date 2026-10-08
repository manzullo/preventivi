// Chi entra nel pannello e cosa può fare. Solo il proprietario vede questa
// pagina: gli altri, se ci arrivano, tornano alla dashboard.
import { Button } from "@/design/ui";
import { db } from "@/lib/db";
import { RUOLI, requireRuolo, type Ruolo } from "@/lib/auth";
import { cambiaRuolo, cambiaStato, creaUtente, rigeneraPassword } from "./actions";

export const dynamic = "force-dynamic";

const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";

type Search = Promise<{ msg?: string; nuovo?: string; pw?: string }>;

const quando = (d: Date | null) =>
  d
    ? `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
    : "mai";

export default async function Utenti({ searchParams }: { searchParams: Search }) {
  const io = await requireRuolo("owner");
  const sp = await searchParams;
  const utenti = await db.adminUser.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });

  return (
    <div className="max-w-4xl">
      <h1 className="t-h1">Utenti del pannello</h1>
      <p className="t-body mt-2 max-w-3xl text-ink-2">
        Ogni persona entra con la propria email e la propria password, e lascia traccia di quando è entrata. Le
        password non si possono rileggere: si vedono una volta quando si creano, poi resta solo un&apos;impronta.
      </p>

      {sp.msg && <p className="mt-4 rounded-slot bg-warn px-4 py-2 text-sm font-semibold text-warn-fg">{sp.msg}</p>}

      {sp.nuovo && sp.pw && (
        <div className="mt-5 rounded-card border-[1.5px] border-action bg-tonal p-5">
          <p className="t-title text-action">Password per {sp.nuovo}</p>
          <p className="mt-2 select-all rounded-slot border border-line bg-canvas px-4 py-3 font-mono text-lg text-ink">{sp.pw}</p>
          <p className="t-meta mt-2">
            Copiala adesso e mandala alla persona per una via sicura. Ricaricando la pagina sparisce, e da qui non si
            recupera più: si può solo generarne un&apos;altra.
          </p>
        </div>
      )}

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <h2 className="t-h3">Aggiungi una persona</h2>
        <form action={creaUtente} className="mt-4 grid gap-4 sm:grid-cols-4">
          <label className="block text-sm sm:col-span-2">
            <span className="t-meta mb-1 block text-ink">Email</span>
            <input name="email" type="email" required className={IN} placeholder="nome@esempio.it" />
          </label>
          <label className="block text-sm">
            <span className="t-meta mb-1 block text-ink">Nome</span>
            <input name="nome" className={IN} />
          </label>
          <label className="block text-sm">
            <span className="t-meta mb-1 block text-ink">Ruolo</span>
            <select name="ruolo" className={IN} defaultValue="editor">
              {Object.keys(RUOLI).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-4">
            <Button type="submit" className="min-h-10 px-5 py-2 text-sm">
              Crea e genera la password
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="t-h3">Chi ha le chiavi</h2>
        {utenti.length === 0 ? (
          <p className="t-meta mt-2">
            Nessun utente in tabella: si entra ancora con le credenziali scritte nelle variabili d&apos;ambiente.
          </p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 font-semibold">Persona</th>
                <th className="py-2 font-semibold">Ruolo</th>
                <th className="py-2 font-semibold">Ultimo accesso</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {utenti.map((u) => (
                <tr key={u.id} className={`border-b border-line align-top ${u.active ? "" : "opacity-60"}`}>
                  <td className="py-3 pr-3">
                    <span className="font-semibold text-ink">{u.name || u.email}</span>
                    {u.name && <span className="t-meta block">{u.email}</span>}
                    {!u.active && <span className="t-meta block">disattivato</span>}
                    {u.email === io.email && <span className="t-meta block">sei tu</span>}
                  </td>
                  <td className="py-3 pr-3">
                    {u.email === io.email ? (
                      <span>{u.role}</span>
                    ) : (
                      <form action={cambiaRuolo} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <select name="ruolo" defaultValue={u.role} className="rounded-slot border border-line bg-canvas px-2 py-1 text-sm">
                          {Object.keys(RUOLI).map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="t-meta font-semibold text-action">
                          salva
                        </button>
                      </form>
                    )}
                    <span className="t-meta block">{RUOLI[u.role as Ruolo] ?? "ruolo sconosciuto"}</span>
                  </td>
                  <td className="t-meta py-3 pr-3">{quando(u.lastLogin)}</td>
                  <td className="py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <form action={rigeneraPassword}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="t-meta font-semibold text-ink hover:text-action">
                          nuova password
                        </button>
                      </form>
                      {u.email !== io.email && (
                        <form action={cambiaStato}>
                          <input type="hidden" name="id" value={u.id} />
                          <button type="submit" className="t-meta font-semibold text-ink hover:text-action">
                            {u.active ? "disattiva" : "riattiva"}
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10 rounded-card border border-line bg-surface p-5">
        <h2 className="t-h3">Cosa può fare ciascun ruolo</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
          <li>
            <strong className="text-ink">owner</strong>: tutto, comprese queste chiavi, le impostazioni e i collegamenti
            pubblicitari.
          </li>
          <li>
            <strong className="text-ink">editor</strong>: schede, pagine, articoli, richieste e priorità. Non tocca
            utenti né impostazioni.
          </li>
          <li>
            <strong className="text-ink">viewer</strong>: guarda i numeri e le schede, non salva niente.
          </li>
        </ul>
        <p className="t-meta mt-3">
          Le credenziali nelle variabili d&apos;ambiente restano la porta di servizio del proprietario: servono se il
          database non ha ancora utenti o se si perde l&apos;accesso.
        </p>
      </section>
    </div>
  );
}
