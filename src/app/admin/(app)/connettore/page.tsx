// Le chiavi del connettore: si creano qui, si incollano in Claude o ChatGPT.
import Link from "next/link";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { STRUMENTI } from "@/modules/analisi/motore";
import { nuovaChiave, revocaChiave } from "./actions";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm";
const TD = "px-3 py-2 align-top";

export default async function ConnettorePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const msg = first(sp.msg);
  const appena = first(sp.chiave);
  const chiavi = await db.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  const indirizzo = `${BASE_URL}/api/mcp/`;

  return (
    <div className="max-w-4xl">
      <h1 className="t-h1">Connettore per Claude e ChatGPT</h1>
      <p className="t-body mt-2 max-w-3xl text-ink-2">
        Collega i dati del sito a un assistente, e da lì si fanno domande a parole: com&apos;è andato il traffico,
        da quali pagine entra chi arriva da Google, quali schede vengono guardate. Le risposte sono gli stessi numeri
        che vedi nel pannello.
      </p>

      {msg && <p className="mt-4 rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}

      {appena && (
        <div className="mt-4 rounded-card border-2 border-action/40 bg-canvas p-5">
          <p className="t-kicker mb-2">Il tuo indirizzo, visibile una volta sola</p>
          <p className="t-body mb-3 text-ink-2">
            Copia questa riga e incollala in Claude o in ChatGPT quando ti chiedono l&apos;indirizzo del connettore.
            La chiave è già dentro: non c&apos;è altro da configurare.
          </p>
          <code className="block break-all rounded-slot bg-surface p-3 text-sm">{`${BASE_URL}/api/mcp/${appena}`}</code>
          <p className="t-meta mt-3 text-ink-2">
            Trattala come una password. Il sito ne conserva solo l&apos;impronta, quindi non potrà più mostrartela: se
            la perdi ne crei un&apos;altra e revochi questa.
          </p>
        </div>
      )}

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-3">Come si collega</p>
        <ol className="t-body list-decimal space-y-2 pl-5 text-ink-2">
          <li>Crea una chiave qui sotto: il sito ti dà un indirizzo completo, con la chiave già dentro.</li>
          <li>
            In <strong>Claude</strong>: Impostazioni → Connettori → Aggiungi connettore personalizzato. In{" "}
            <strong>ChatGPT</strong>: Impostazioni → Connettori → Aggiungi.
          </li>
          <li>Incolla l&apos;indirizzo e dai un nome. Non serve altro: non c&apos;è nessuna chiave da mettere a parte.</li>
        </ol>
        <p className="t-meta mt-3 text-ink-3">
          L&apos;indirizzo di base è <code className="break-all">{indirizzo}</code>, ma da solo non basta: senza chiave
          risponde che non sei autorizzato.
        </p>
        <p className="t-meta mt-3 text-ink-3">
          Domande che capisce: {STRUMENTI.map((s) => s.nome).join(", ")}. Nomi, email e telefoni di chi manda una
          richiesta non escono mai dal connettore, e le visite di chi gestisce il sito non vengono contate.
        </p>
      </section>

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-3">Nuova chiave</p>
        <form action={nuovaChiave} className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="t-meta mb-1 block text-ink">A cosa serve</span>
            <input name="nome" className={`${IN} w-72`} placeholder="Claude sul mio portatile" />
          </label>
          <button type="submit" className="min-h-10 rounded-pill bg-action px-5 text-sm font-bold text-white">
            Crea
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-3">Chiavi esistenti</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="t-kicker border-b border-line text-left">
              <tr>
                {["Nome", "Inizia con", "Creata da", "Ultimo uso", "Chiamate", "Stato", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chiavi.length === 0 && (
                <tr><td className="px-3 py-3 text-ink-2" colSpan={7}>Nessuna chiave: creane una qui sopra.</td></tr>
              )}
              {chiavi.map((k) => (
                <tr key={k.id} className="border-b border-line/60">
                  <td className={`${TD} font-semibold`}>{k.nome}</td>
                  <td className={TD}><code className="text-xs">{k.prefisso}…</code></td>
                  <td className={`${TD} text-ink-2`}>{k.email}</td>
                  <td className={`${TD} text-ink-2`}>{k.ultimoUso ? k.ultimoUso.toLocaleString("it-IT") : "mai usata"}</td>
                  <td className={`${TD} tabular-nums`}>{k.chiamate}</td>
                  <td className={TD}>
                    {k.attiva ? <span className="font-semibold text-ok-fg">attiva</span> : <span className="text-ink-3">revocata</span>}
                  </td>
                  <td className={TD}>
                    {k.attiva && (
                      <form action={revocaChiave}>
                        <input type="hidden" name="id" value={k.id} />
                        <button type="submit" className="t-meta font-semibold text-ink hover:text-action">revoca</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-meta mt-3 text-ink-3">
          Una chiave che non usi da tempo va revocata: chi ce l&apos;ha vede i numeri di tutto il sito finché resta
          attiva. La colonna Ultimo uso serve proprio a riconoscerle.
        </p>
      </section>

      <p className="t-meta mt-6">
        <Link href="/admin/traffico/" className="text-action">← Torna al traffico</Link>
      </p>
    </div>
  );
}
