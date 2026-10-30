// Ordine deciso da noi, sopra quello delle recensioni. Due leve: la spinta e la
// posizione fissa stanno nella scheda di ogni professionista; qui stanno le posizioni
// mirate su una singola pagina servizio x città.
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Button } from "@/design/ui";
import { creaPosizione, togliPosizione } from "./actions";

export const dynamic = "force-dynamic";

const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="t-meta mb-1 block text-ink">{label}</span>
      {children}
      {hint && <span className="t-meta mt-1 block">{hint}</span>}
    </label>
  );
}

const giorno = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : null);

export default async function Priorita() {
  await requireAdmin();
  const adesso = new Date();
  const [righe, servizi, citta, spinte] = await Promise.all([
    db.placement.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        agency: { select: { name: true, slug: true, id: true, score: true } },
        service: { select: { plural: true, slug: true } },
        city: { select: { name: true, slug: true } },
      },
    }),
    db.service.findMany({ where: { active: true }, orderBy: { position: "asc" }, select: { slug: true, plural: true } }),
    db.city.findMany({ where: { isCapital: true }, orderBy: { name: "asc" }, select: { slug: true, name: true }, take: 120 }),
    db.agency.findMany({
      where: { priority: { gt: 0 } },
      select: { id: true, name: true, slug: true, priority: true, score: true, reviewCount: true },
      orderBy: [{ priority: "desc" }, { score: "desc" }],
      take: 100,
    }),
  ]);

  const attiva = (r: { startsAt: Date | null; endsAt: Date | null }) =>
    (!r.startsAt || r.startsAt <= adesso) && (!r.endsAt || r.endsAt >= adesso);

  return (
    <div className="max-w-5xl">
      <h1 className="t-h1">Ordine deciso da noi</h1>
      <p className="t-body mt-2 max-w-3xl text-ink-2">
        Il punteggio nasce dalle recensioni e nessun pagamento lo tocca. Chi paga entra in una corsia davanti
        all&apos;elenco: la priorità è un numero, zero per quasi tutte, e più è alto più si sta in alto. A parità di
        numero decidono di nuovo le recensioni. Ogni scheda
        in quella corsia porta l&apos;etichetta &quot;In evidenza&quot;, come su Sortlist e Clutch e come chiede la legge
        quando la posizione non nasce da un criterio dichiarato.
      </p>

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <h2 className="t-h3">Metti un&apos;professionista in cima a una pagina</h2>
        <form action={creaPosizione} className="mt-4 grid gap-4 sm:grid-cols-2">
          <F label="Professionista" hint="nome esatto o indirizzo della scheda">
            <input name="professionista" required className={IN} placeholder="es. courage-production-milano" />
          </F>
          <F label="Priorità" hint="più alto sta più in alto; a parità decidono le recensioni">
            <input name="priorita" type="number" min="1" max="999" step="1" defaultValue={10} className={IN} />
          </F>
          <F label="Servizio" hint="vuoto = vale per tutti i servizi">
            <select name="servizio" className={IN} defaultValue="">
              <option value="">tutti i servizi</option>
              {servizi.map((s) => (
                <option key={s.slug} value={s.slug}>{s.plural}</option>
              ))}
            </select>
          </F>
          <F label="Città" hint="vuoto = vale per tutte le città">
            <select name="citta" className={IN} defaultValue="">
              <option value="">tutte le città</option>
              {citta.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </F>
          <F label="Etichetta in pagina" hint='vuoto = "In evidenza"'>
            <input name="etichetta" className={IN} placeholder="In evidenza" maxLength={40} />
          </F>
          <F label="Nota interna" hint="perché: contratto, prova, scambio">
            <input name="note" className={IN} maxLength={200} />
          </F>
          <F label="Da (facoltativo)"><input name="inizio" type="date" className={IN} /></F>
          <F label="A (facoltativo)"><input name="fine" type="date" className={IN} /></F>
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-10 px-5 py-2 text-sm">Metti in cima</Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="t-h3">Posizioni attive</h2>
        {righe.length === 0 ? (
          <p className="t-meta mt-2">Nessuna: oggi l&apos;ordine è tutto delle recensioni.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 font-semibold">Professionista</th>
                <th className="py-2 font-semibold">Dove</th>
                <th className="py-2 font-semibold">Priorità</th>
                <th className="py-2 font-semibold">Periodo</th>
                <th className="py-2 font-semibold">Etichetta e nota</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/agenzie/${r.agency.id}/`} className="font-semibold text-action">{r.agency.name}</Link>
                    {!attiva(r) && <span className="t-meta block">fuori periodo, non conta</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {[r.service?.plural ?? "tutti i servizi", r.city?.name ?? "tutte le città"].join(" · ")}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{r.priority}</td>
                  <td className="t-meta py-2 pr-3">
                    {giorno(r.startsAt) ?? "sempre"} → {giorno(r.endsAt) ?? "senza scadenza"}
                  </td>
                  <td className="t-meta py-2 pr-3">
                    {r.label ? `"${r.label}"` : "In evidenza"}
                    {r.note ? ` · ${r.note}` : ""}
                  </td>
                  <td className="py-2 text-right">
                    <form action={togliPosizione}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="t-meta font-semibold text-ink hover:text-action">togli</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="t-h3">Priorità su tutto il sito</h2>
        <p className="t-meta mt-1">
          Si imposta nella scheda della singolo professionista e vale ovunque, non su una pagina sola. Zero vuol dire
          nessuna priorità. Il punteggio delle recensioni resta quello che è: cambia solo la posizione, e la
          scheda lo dichiara in pagina.
        </p>
        {spinte.length === 0 ? (
          <p className="t-meta mt-2">Nessun professionista ha una priorità su tutto il sito.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 font-semibold">Professionista</th>
                <th className="py-2 font-semibold">Priorità</th>
                <th className="py-2 font-semibold">Punteggio</th>
                <th className="py-2 font-semibold">Recensioni</th>
              </tr>
            </thead>
            <tbody>
              {spinte.map((a) => (
                <tr key={a.id} className="border-b border-line">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/agenzie/${a.id}/`} className="font-semibold text-action">{a.name}</Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{a.priority}</td>
                  <td className="py-2 pr-3">{a.score.toFixed(2)}</td>
                  <td className="t-meta py-2 pr-3">{a.reviewCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
