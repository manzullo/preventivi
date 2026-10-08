import Link from "next/link";
import { applyTrackingTemplate, campaignStatusAction, clearGadsCache, retryUploads } from "@/app/admin/ads-actions";
import { Badge, Button, Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { fmt } from "@/lib/site";
import { isConnected } from "@/modules/ads/google-ads";
import { getAccessibleAccountsWithInfo, getCampaignStats, getConversionStats, getConvertingSearchTerms, getDailyMetrics, getSearchTerms, listConversionActions } from "@/modules/ads/google-ads-reports";
import { discoverAllContainers, getLiveVersion } from "@/modules/ads/gtm";
import { AdvicePanel } from "@/components/admin/AdvicePanel";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const eur = (v: number) => `${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-canvas p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="t-title">{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}
const TH = "px-3 py-2 text-left font-semibold";
const TD = "px-3 py-2";

export default async function AdsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const msg = first(sp.msg);
  const connected = await isConnected();
  const g = await settings.gads();
  if (!connected) {
    return (
      <div className="max-w-3xl">
        <h1 className="t-h1 mb-3">Google Ads</h1>
        <p className="t-body text-ink-2">Account non collegato. Inserisci developer token e credenziali OAuth in <Link href="/admin/impostazioni/" className="font-bold text-action">Impostazioni</Link> e premi "Collega Google Ads".</p>
        {g.lastError && <p className="mt-3 text-sm text-brand">Ultimo errore: {g.lastError.slice(0, 300)}</p>}
      </div>
    );
  }

  const accounts = await getAccessibleAccountsWithInfo();
  const customerId = first(sp.customer) || g.defaultCustomerId || accounts.find((a) => !a.manager)?.id || accounts[0]?.id || "";
  const days = [7, 30, 90].includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;
  const base = `/admin/ads/?customer=${customerId}&giorni=${days}`;

  const [campaigns, daily, terms, convTerms, actions, convStats, uploads, containers] = await Promise.all([
    customerId ? getCampaignStats(customerId, days) : null,
    customerId ? getDailyMetrics(customerId, days) : [],
    customerId ? getSearchTerms(customerId, days, 30) : null,
    customerId ? getConvertingSearchTerms(customerId, days) : null,
    customerId ? listConversionActions(customerId, days) : [],
    customerId ? getConversionStats(customerId, days) : null,
    db.conversionUpload.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { lead: { select: { id: true, name: true } } } }),
    discoverAllContainers().catch(() => []),
  ]);
  // Diagnostica gclid (port di psf_get_gclid_diagnostics)
  const [leadsWithGclid, uploadsByStatus, mapped] = await Promise.all([
    db.lead.count({ where: { gclid: { not: null } } }),
    db.conversionUpload.groupBy({ by: ["status"], _count: true }),
    db.formConversion.count({ where: { enabled: true, apiUpload: true, NOT: [{ customerId: null }, { conversionActionId: null }] } }),
  ]);
  const diag = { leadsWithGclid, sent: uploadsByStatus.find((u) => u.status === "sent")?._count ?? 0, failed: uploadsByStatus.find((u) => u.status === "failed")?._count ?? 0, pending: uploadsByStatus.find((u) => u.status === "pending")?._count ?? 0, mapped };
  const totals = daily.reduce((a, d) => ({ impressions: a.impressions + d.impressions, clicks: a.clicks + d.clicks, cost: a.cost + d.cost, conversions: a.conversions + d.conversions }), { impressions: 0, clicks: 0, cost: 0, conversions: 0 });
  const gtmPath = first(sp.container);
  const live = gtmPath ? await getLiveVersion(gtmPath) : null;
  const convByAction = new Map<string, number>();
  for (const c of convStats ?? []) convByAction.set(c.actionId, (convByAction.get(c.actionId) ?? 0) + c.conversions);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">Google Ads</h1>
          <p className="t-meta mt-1">{g.accountEmail && `Connesso come ${g.accountEmail} · `}dati con cache 5-10 minuti</p>
        </div>
        <form action={clearGadsCache}><Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Svuota cache</Button></form>
      </div>
      {msg && <p className="rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}
      {g.lastError && <p className="text-sm text-brand">Ultimo errore API: {g.lastError.slice(0, 300)}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {accounts.map((a) => (
          <Chip key={a.id} href={`/admin/ads/?customer=${a.id}&giorni=${days}`} active={a.id === customerId}>
            {a.name}{a.manager ? " (MCC)" : ""}
          </Chip>
        ))}
        <span className="mx-2 text-ink-3">·</span>
        {[7, 30, 90].map((d) => (
          <Chip key={d} href={`/admin/ads/?customer=${customerId}&giorni=${d}`} active={d === days}>{d} giorni</Chip>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[["Impression", fmt(totals.impressions)], ["Click", fmt(totals.clicks)], ["Spesa", eur(totals.cost)], ["Conversioni", totals.conversions.toLocaleString("it-IT")]].map(([k, v]) => (
          <div key={k} className="rounded-card border border-line bg-canvas p-5"><p className="t-kicker">{k}</p><p className="t-h2 mt-1">{v}</p></div>
        ))}
      </div>

      <AdvicePanel level="account" customerId={customerId} days={days} />

      <Card title="Campagne" action={
        <form action={applyTrackingTemplate} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="back" value={base} />
          <label className="flex items-center gap-1"><input type="checkbox" name="force" /> sovrascrivi</label>
          <Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Applica tracking template</Button>
        </form>
      }>
        {!campaigns ? <p className="t-meta">Lettura fallita: vedi l&apos;ultimo errore.</p> : campaigns.length === 0 ? <p className="t-meta">Nessuna campagna nel periodo.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["Campagna", "Stato", "Click", "Impr.", "Spesa", "Conv.", "CPA", ""].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className={TD}><span className="font-semibold">{c.name}</span><span className="t-meta block">{c.type} · {c.id}</span></td>
                <td className={TD}><Badge tone={c.status === "ENABLED" ? "ok" : "neutral"}>{c.status}</Badge></td>
                <td className={TD}>{fmt(c.clicks)}</td><td className={TD}>{fmt(c.impressions)}</td><td className={TD}>{eur(c.cost)}</td><td className={TD}>{c.conversions.toLocaleString("it-IT")}</td>
                <td className={TD}>{c.conversions > 0 ? eur(c.cost / c.conversions) : "—"}</td>
                <td className={TD}>
                  <form action={campaignStatusAction} className="inline"><input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="back" value={base} /><input type="hidden" name="status" value={c.status === "ENABLED" ? "PAUSED" : "ENABLED"} />
                    <button type="submit" className="font-bold text-action">{c.status === "ENABLED" ? "Pausa" : "Attiva"}</button></form>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Termini di ricerca (per spesa)">
          {!terms ? <p className="t-meta">Lettura fallita.</p> : (
            <table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["Termine", "Click", "Spesa", "Conv."].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
              {terms.slice(0, 20).map((t) => <tr key={t.searchTerm} className="border-b border-line last:border-0"><td className={TD}>{t.searchTerm}<span className="t-meta block">{t.campaign}</span></td><td className={TD}>{t.clicks}</td><td className={TD}>{eur(t.cost)}</td><td className={TD}>{t.conversions}</td></tr>)}
            </tbody></table>
          )}
          <p className="t-meta mt-2">Per aggiungere negative: <Link href={`/admin/keywords/?customer=${customerId}`} className="font-bold text-action">Keyword →</Link></p>
        </Card>
        <Card title="Termini che convertono">
          {!convTerms ? <p className="t-meta">Lettura fallita.</p> : convTerms.length === 0 ? <p className="t-meta">Nessuna conversione nel periodo.</p> : (
            <table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["Termine", "Data", "Conv.", "Spesa"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
              {convTerms.slice(0, 20).map((t, i) => <tr key={i} className="border-b border-line last:border-0"><td className={TD}>{t.searchTerm}<span className="t-meta block">{t.keyword} · {t.matchType}</span></td><td className={TD}>{t.date}</td><td className={TD}>{t.conversions}</td><td className={TD}>{eur(t.cost)}</td></tr>)}
            </tbody></table>
          )}
        </Card>
      </div>

      <Card title="Azioni di conversione (ID da usare nel form per l'upload API)">
        {actions.length === 0 ? <p className="t-meta">Nessuna azione letta.</p> : (
          <table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["ID", "Nome", "Tipo", "Primaria", "Conv. periodo"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
            {actions.map((a) => <tr key={a.id} className="border-b border-line last:border-0"><td className={TD}><code>{a.id}</code></td><td className={TD}>{a.name}</td><td className={TD}>{a.type}</td><td className={TD}>{a.primaryForGoal ? "sì" : "no"}</td><td className={TD}>{(convByAction.get(a.id) ?? a.conversions).toLocaleString("it-IT")}</td></tr>)}
          </tbody></table>
        )}
      </Card>

      <Card title="Coda upload conversioni offline" action={
        <form action={retryUploads}><input type="hidden" name="back" value={base} /><Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Riprova tutti</Button></form>
      }>
        <p className="t-meta mb-3">Diagnostica gclid: {fmt(diag.leadsWithGclid)} lead con gclid · {diag.sent} inviati · {diag.pending} in attesa · {diag.failed} falliti · {diag.mapped} conversioni con upload API mappato{diag.mapped === 0 ? " (nessuna: imposta customer ID e ID azione nel form)" : ""}</p>
        {uploads.length === 0 ? <p className="t-meta">Vuota. Le righe nascono al submit se il lead ha un gclid e il form ha una conversione con upload API attivo.</p> : (
          <table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["Lead", "Account / azione", "Stato", "Tentativi", "Errore"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
            {uploads.map((u) => <tr key={u.id} className="border-b border-line last:border-0"><td className={TD}><Link href={`/admin/lead/${u.leadId}/`} className="font-bold text-action">{u.lead.name ?? u.leadId.slice(-6)}</Link></td><td className={TD}>{u.customerId} / {u.conversionActionId}</td><td className={TD}><Badge tone={u.status === "sent" ? "ok" : u.status === "failed" ? "warn" : "neutral"}>{u.status}</Badge></td><td className={TD}>{u.attempts}</td><td className={`${TD} text-ink-2`}>{u.lastError?.slice(0, 120)}</td></tr>)}
          </tbody></table>
        )}
        <p className="t-meta mt-2">Scheduler: <code>GET /api/cron/ads/?key=CRON_KEY</code> ogni ora (chiave in .env).</p>
      </Card>

      <Card title="Tag Manager (sola lettura)">
        {containers.length === 0 ? <p className="t-meta">Nessun container leggibile (serve lo scope tagmanager.readonly nel consenso OAuth).</p> : (
          <div className="flex flex-wrap gap-2">
            {containers.map((c) => <Chip key={c.path} href={`${base}&container=${encodeURIComponent(c.path)}`} active={c.path === gtmPath}>{c.publicId} · {c.name}</Chip>)}
          </div>
        )}
        {live && (
          <div className="mt-4 text-sm">
            <p className="font-semibold">Versione live {live.versionId}: {live.name || "senza nome"} · {live.tagCount} tag · {live.triggerCount} trigger · {live.variableCount} variabili</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {live.tags.map((t) => <li key={t.id} className={t.paused ? "text-ink-3" : ""}>{t.name} <span className="t-meta">({t.type}{t.paused ? ", in pausa" : ""}, {t.firingCount} trigger)</span></li>)}
            </ul>
            <p className="t-meta mt-2">Trigger: {live.triggers.map((t) => t.name).join(", ")}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
