import Link from "next/link";
import { backfillSearchTerms, checkTrackingTemplate } from "@/app/admin/ads-actions";
import { Badge, Button, Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { fmt } from "@/lib/site";
import { percorsoSessione } from "@/modules/leads/percorso";

// Visite: port della pagina "Visite" del plugin (utm_visits). Ogni riga è una
// sessione con attribuzione; il dettaglio mostra tracking, tecnico, form
// inviati e le visite precedenti della stessa sessione.

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const TD = "px-3 py-2 align-top";

export default async function VisitsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filter = first(sp.filtro) ?? "tutte";
  const page = Math.max(1, Number(sp.page) || 1);
  const detailId = first(sp.visita);
  const msg = first(sp.msg);
  const g = await settings.gads();

  const where = filter === "ads" ? { gclid: { not: null } } : filter === "convertite" ? { submissions: { some: { testMode: false } } } : filter === "organico" ? { gclid: null, utmSource: null, ricostruita: false } : filter === "ricostruite" ? { ricostruita: true } : {};
  const [total, visits, detail] = await Promise.all([
    db.visit.count({ where }),
    db.visit.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { submissions: { select: { id: true, testMode: true, lead: { select: { id: true, name: true, status: true } }, form: { select: { name: true } } } } } }),
    detailId ? db.visit.findUnique({ where: { id: detailId }, include: { submissions: { include: { lead: true, form: { select: { name: true } } } } } }) : null,
  ]);
  const previous = detail ? await db.visit.findMany({ where: { sessionId: detail.sessionId, id: { not: detail.id } }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
  // Lo stesso percorso che si vede nella scheda di un lead: qui vale anche per
  // chi non ha compilato niente, che è la maggior parte delle visite.
  const percorso = detail ? await percorsoSessione(detail) : null;
  const pages = Math.max(1, Math.ceil(total / 50));
  const base = `/admin/visite/?filtro=${filter}&page=${page}`;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">Visite</h1>
          <p className="t-meta mt-1">{fmt(total)} sessioni, registrate alla prima pagina aperta</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={backfillSearchTerms}><input type="hidden" name="back" value={base} /><Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Backfill search term</Button></form>
          {g.defaultCustomerId && (
            <form action={checkTrackingTemplate}><input type="hidden" name="customerId" value={g.defaultCustomerId} /><input type="hidden" name="back" value={base} /><Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Verifica tracking template</Button></form>
          )}
        </div>
      </div>
      {msg && <p className="rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        {[["tutte", "Tutte"], ["ads", "Da Google Ads"], ["convertite", "Con lead"], ["organico", "Senza sorgente"], ["ricostruite", "Ricostruite"]].map(([k, v]) => (
          <Chip key={k} href={`/admin/visite/?filtro=${k}`} active={filter === k}>{v}</Chip>
        ))}
      </div>

      {filter === "ricostruite" && (
        <p className="t-meta max-w-3xl rounded-slot bg-surface px-4 py-3 text-ink-2">
          Visite dedotte dagli eventi già registrati, per il periodo in cui la visita veniva salvata solo se qualcuno
          apriva il modulo. Di queste si conoscono ora di arrivo e pagina di ingresso; la provenienza no, perché allora
          non veniva raccolta. Dal 17 settembre ogni visita viene registrata alla prima pagina aperta.
        </p>
      )}

      {detail && (
        <section className="rounded-card border-2 border-action/30 bg-canvas p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="t-title">Dettaglio visita · {detail.createdAt.toLocaleString("it-IT")}</p>
            <Link href={`/admin/visite/?filtro=${filter}&page=${page}`} className="t-meta font-bold text-action">chiudi ×</Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3 text-sm">
            <div>
              <p className="t-kicker mb-2">Da dove arriva</p>
              {[["Sorgente / mezzo", [detail.utmSource, detail.utmMedium].filter(Boolean).join(" / ")], ["Campagna", detail.utmCampaign], ["Parola chiave", detail.utmTerm], ["Annuncio o gruppo", detail.utmContent], ["Corrispondenza", detail.matchType], ["Dispositivo", detail.device], ["Rete pubblicitaria", detail.network], ["Ricerca fatta su Google", detail.searchTerm], ["Identificativo del clic", detail.gclid], ["Altri identificativi", [detail.gbraid, detail.wbraid].filter(Boolean).join(" / ")]].map(([k, v]) => (
                <p key={k as string}><span className="text-ink-2">{k}:</span> {v || "—"}</p>
              ))}
            </div>
            <div>
              <p className="t-kicker mb-2">Dati della sessione</p>
              <p>
                <span className="text-ink-2">Pagina di ingresso:</span>{" "}
                <code className="break-all text-xs">{percorso?.passi.find((x) => x.landing)?.path ?? detail.landingPath ?? "—"}</code>
              </p>
              <p><span className="text-ink-2">Sito da cui proviene:</span> {detail.referrer || "nessuno, arrivo diretto"}</p>
              <p><span className="text-ink-2">Sito di origine:</span> {detail.clientId || "—"}</p>
              <p><span className="text-ink-2">Identificativo sessione:</span> <code className="text-xs">{detail.sessionId}</code></p>
              <p><span className="text-ink-2">IP, in forma cifrata:</span> {detail.ipHash?.slice(0, 12) || "—"}</p>
              <p className="break-all"><span className="text-ink-2">Browser:</span> {detail.userAgent?.slice(0, 120) || "—"}</p>
              {detail.ricostruita && (
                <p className="mt-2 text-warn-fg">
                  Visita dedotta dagli eventi: ora e pagina di ingresso sono certe, la provenienza non fu registrata.
                </p>
              )}
            </div>
            <div>
              <p className="t-kicker mb-2">Come è finita</p>
              {detail.submissions.length === 0 ? <p className="text-ink-2">Nessun form inviato.</p> : detail.submissions.map((s) => (
                <p key={s.id}>✓ {s.form.name}{s.testMode ? " (test)" : ""} → {s.lead ? <Link href={`/admin/lead/${s.lead.id}/`} className="font-bold text-action">{s.lead.name ?? "lead"} · {s.lead.status}</Link> : "senza lead"}</p>
              ))}
              {previous.length > 0 && (
                <>
                  <p className="t-kicker mt-4 mb-2">Altre visite della stessa persona</p>
                  {previous.map((p) => <p key={p.id}><Link href={`/admin/visite/?visita=${p.id}`} className="text-action">{p.createdAt.toLocaleString("it-IT")}</Link> · {p.utmSource ?? "diretto"} · <code className="text-xs">{p.landingPath?.slice(0, 60)}</code></p>)}
                </>
              )}
            </div>
          </div>

          {percorso && percorso.passi.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="t-kicker mb-3">Cosa ha fatto, passo per passo</p>
              <ol className="relative space-y-0 border-l border-line pl-5">
                {percorso.passi.map((x, i) => (
                  <li key={i} className="relative py-1.5">
                    <span
                      className={`absolute -left-[1.4rem] top-3 size-2 rounded-full ${x.finale ? "bg-action" : "bg-line"}`}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="t-body font-semibold text-ink">{x.titolo}</span>
                      {x.dettaglio && <span className="t-meta text-ink-2">{x.dettaglio}</span>}
                      {x.landing && <span className="t-kicker rounded-pill bg-surface px-2 text-ink-3">ingresso</span>}
                      <span className="t-meta ml-auto text-ink-3">{x.quando.toLocaleTimeString("it-IT")}</span>
                    </div>
                    {x.path && <code className="t-meta block break-all text-ink-3">{x.path}</code>}
                  </li>
                ))}
              </ol>
              <p className="t-meta mt-3 text-ink-3">
                {percorso.passi.length} {percorso.passi.length === 1 ? "passo" : "passi"} da {percorso.eventi}{" "}
                {percorso.eventi === 1 ? "evento" : "eventi"}. Le schede viste sono contate, non elencate una per una.
              </p>
            </div>
          )}
        </section>
      )}

      <div className="overflow-x-auto rounded-card border border-line bg-canvas">
        <table className="w-full text-sm">
          <thead className="t-kicker border-b border-line text-left"><tr>{["Data", "Sorgente", "Campagna", "Keyword", "Match", "Device", "Rete", "Search term", "gclid", "Form", "Esito", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {visits.length === 0 && <tr><td className="px-3 py-3 text-ink-2" colSpan={12}>Nessuna visita.</td></tr>}
            {visits.map((v) => {
              const lead = v.submissions.find((s) => s.lead)?.lead;
              return (
                <tr key={v.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className={`${TD} whitespace-nowrap text-ink-2`}>{v.createdAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className={TD}>{v.gclid ? <Badge>Google Ads</Badge> : v.utmSource ? `${v.utmSource}/${v.utmMedium ?? ""}` : v.ricostruita ? <span className="text-warn-fg" title="Visita dedotta dagli eventi: la provenienza non era registrata">non rilevata</span> : <span className="text-ink-3">diretto</span>}</td>
                  <td className={TD}>{v.utmCampaign ?? "—"}</td><td className={TD}>{v.utmTerm ?? "—"}</td><td className={TD}>{v.matchType ?? "—"}</td><td className={TD}>{v.device ?? "—"}</td><td className={TD}>{v.network ?? "—"}</td><td className={TD}>{v.searchTerm ?? "—"}</td>
                  <td className={TD}>{v.gclid ? <code className="text-xs">{v.gclid.slice(0, 10)}…</code> : "—"}</td>
                  <td className={TD}>{v.submissions[0]?.form.name ?? "—"}</td>
                  <td className={TD}>{lead ? <Link href={`/admin/lead/${lead.id}/`} className="font-bold text-action">✓ {lead.name ?? "lead"}</Link> : <span className="text-ink-3">—</span>}</td>
                  <td className={TD}><Link href={`/admin/visite/?filtro=${filter}&page=${page}&visita=${v.id}`} className="font-bold text-action">Dettaglio</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && <p className="t-meta">Pagina {page} di {pages} · {page < pages && <Link href={`/admin/visite/?filtro=${filter}&page=${page + 1}`} className="font-bold text-action">successiva →</Link>}</p>}
    </div>
  );
}
