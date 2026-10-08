import Link from "next/link";
import { addKeywordAction, addNegativeAction, changeMatchAction, keywordBidAction, keywordStatusAction } from "@/app/admin/ads-actions";
import { Badge, Button, Chip } from "@/design/ui";
import { settings } from "@/lib/settings";
import { isConnected } from "@/modules/ads/google-ads";
import { getAccessibleAccountsWithInfo, getCampaignStats, getKeywordStats, getSearchTerms, listNegativeKeywords } from "@/modules/ads/google-ads-reports";

// Keyword: port della pagina "Keywords" del plugin con le sue schede:
// keyword, termini di ricerca, negative, aggiungi, sprechi.

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const eur = (v: number) => `${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const IN = "rounded-slot border-[1.5px] border-line bg-canvas px-2 py-1 text-sm outline-none focus:border-action";
const TH = "px-3 py-2 text-left font-semibold";
const TD = "px-3 py-2 align-top";
const TABS = [["keywords", "Keyword"], ["termini", "Termini di ricerca"], ["negative", "Negative"], ["sprechi", "Sprechi"], ["aggiungi", "Aggiungi"]] as const;

function Hidden({ customerId, back }: { customerId: string; back: string }) {
  return <><input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="back" value={back} /></>;
}

export default async function KeywordsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const msg = first(sp.msg);
  if (!(await isConnected())) {
    return <div className="max-w-3xl"><h1 className="t-h1 mb-3">Keyword</h1><p className="t-body text-ink-2">Google Ads non collegato: vai in <Link href="/admin/impostazioni/" className="font-bold text-action">Impostazioni</Link>.</p></div>;
  }
  const g = await settings.gads();
  const accounts = await getAccessibleAccountsWithInfo();
  const customerId = first(sp.customer) || g.defaultCustomerId || accounts.find((a) => !a.manager)?.id || "";
  const days = [7, 30, 90].includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;
  const campaignId = first(sp.campagna) || undefined;
  const tab = (TABS.find(([k]) => k === first(sp.tab))?.[0] ?? "keywords") as (typeof TABS)[number][0];
  const qs = `customer=${customerId}&giorni=${days}${campaignId ? `&campagna=${campaignId}` : ""}`;
  const base = `/admin/keywords/?${qs}&tab=${tab}`;

  const [campaigns, keywords, terms, negCampaign, negGroup] = await Promise.all([
    getCampaignStats(customerId, days),
    tab === "keywords" ? getKeywordStats(customerId, days, campaignId) : null,
    tab === "termini" || tab === "sprechi" ? getSearchTerms(customerId, days, 300, campaignId) : null,
    tab === "negative" ? listNegativeKeywords(customerId, "campaign", campaignId) : [],
    tab === "negative" ? listNegativeKeywords(customerId, "ad_group") : [],
  ]);
  // Sprechi: termini con spesa e zero conversioni, a fasce (come il plugin: Tier/Score/Suggerimento).
  const waste = (terms ?? []).filter((t) => t.cost > 0 && t.conversions === 0).sort((a, b) => b.cost - a.cost).map((t) => ({ ...t, tier: t.cost >= 50 ? "A" : t.cost >= 20 ? "B" : "C", score: Math.min(100, Math.round(t.cost * 2 + t.clicks)), suggestion: t.clicks >= 5 ? "negativa PHRASE" : "osserva" }));

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="t-h1">Keyword</h1>
      {msg && <p className="rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {accounts.filter((a) => !a.manager).map((a) => <Chip key={a.id} href={`/admin/keywords/?customer=${a.id}&giorni=${days}&tab=${tab}`} active={a.id === customerId}>{a.name}</Chip>)}
        <span className="mx-2 text-ink-3">·</span>
        {[7, 30, 90].map((d) => <Chip key={d} href={`/admin/keywords/?customer=${customerId}&giorni=${d}&tab=${tab}${campaignId ? `&campagna=${campaignId}` : ""}`} active={d === days}>{d}g</Chip>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip href={`/admin/keywords/?customer=${customerId}&giorni=${days}&tab=${tab}`} active={!campaignId}>Tutte le campagne</Chip>
        {(campaigns ?? []).map((c) => <Chip key={c.id} href={`/admin/keywords/?customer=${customerId}&giorni=${days}&tab=${tab}&campagna=${c.id}`} active={campaignId === c.id}>{c.name}</Chip>)}
      </div>
      <div className="flex gap-1 border-b border-line">
        {TABS.map(([k, v]) => <Link key={k} href={`/admin/keywords/?${qs}&tab=${k}`} className={`px-4 py-2 text-sm font-bold ${tab === k ? "border-b-2 border-action text-action" : "text-ink-2 hover:text-ink"}`}>{v}</Link>)}
      </div>

      {tab === "keywords" && (
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-title mb-3">Keyword ({keywords?.length ?? 0})</p>
          {!keywords ? <p className="t-meta">Lettura fallita.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["Keyword", "Match", "Stato", "QS", "Click", "Spesa", "Conv.", "CPC max", ""].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
              {keywords.map((k) => (
                <tr key={k.adGroupCriterionId} className="border-b border-line last:border-0">
                  <td className={TD}><span className="font-semibold">{k.keyword}</span><span className="t-meta block">{k.campaign} › {k.adGroup}</span></td>
                  <td className={TD}><form action={changeMatchAction} className="flex items-center gap-1"><Hidden customerId={customerId} back={base} /><input type="hidden" name="adGroupId" value={k.adGroupId} /><input type="hidden" name="criterionId" value={k.criterionId} /><input type="hidden" name="text" value={k.keyword} /><select name="matchType" defaultValue={k.matchType} className={IN}>{["BROAD", "PHRASE", "EXACT"].map((m) => <option key={m}>{m}</option>)}</select><button type="submit" className="text-xs font-bold text-action">cambia</button></form></td>
                  <td className={TD}><Badge tone={k.effectiveStatus === "ENABLED" ? "ok" : "neutral"}>{k.status}</Badge></td>
                  <td className={TD}>{k.qualityScore || "—"}</td><td className={TD}>{k.clicks}</td><td className={TD}>{eur(k.cost)}</td><td className={TD}>{k.conversions}</td>
                  <td className={TD}><form action={keywordBidAction} className="flex items-center gap-1"><Hidden customerId={customerId} back={base} /><input type="hidden" name="adGroupCriterionId" value={k.adGroupCriterionId} /><input name="bid" defaultValue={k.cpcBidMax ? k.cpcBidMax.toFixed(2) : ""} placeholder={k.cpcBidSource} className={`${IN} w-20`} /><button type="submit" className="text-xs font-bold text-action">ok</button></form></td>
                  <td className={TD}><form action={keywordStatusAction}><Hidden customerId={customerId} back={base} /><input type="hidden" name="adGroupCriterionId" value={k.adGroupCriterionId} /><input type="hidden" name="status" value={k.status === "ENABLED" ? "PAUSED" : "ENABLED"} /><button type="submit" className="text-xs font-bold text-action">{k.status === "ENABLED" ? "pausa" : "attiva"}</button></form></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </section>
      )}

      {tab === "termini" && (
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-title mb-3">Termini di ricerca: cosa cercano gli utenti ({terms?.length ?? 0})</p>
          {!terms ? <p className="t-meta">Lettura fallita.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["Termine", "Keyword origine", "Match", "Click", "Spesa", "Conv.", "Negativa"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
              {terms.map((t) => (
                <tr key={t.searchTerm} className="border-b border-line last:border-0">
                  <td className={TD}><span className="font-semibold">{t.searchTerm}</span><span className="t-meta block">{t.campaign} › {t.adGroup}</span></td>
                  <td className={TD}>{t.keyword}</td><td className={TD}>{t.matchType}</td><td className={TD}>{t.clicks}</td><td className={TD}>{eur(t.cost)}</td><td className={TD}>{t.conversions}</td>
                  <td className={TD}><form action={addNegativeAction} className="flex items-center gap-1"><Hidden customerId={customerId} back={base} /><input type="hidden" name="level" value="campaign" /><input type="hidden" name="scopeId" value={t.campaignId} /><input type="hidden" name="text" value={t.searchTerm} /><select name="matchType" className={IN} defaultValue="PHRASE">{["PHRASE", "EXACT", "BROAD"].map((m) => <option key={m}>{m}</option>)}</select><button type="submit" className="text-xs font-bold text-brand">escludi</button></form></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </section>
      )}

      {tab === "sprechi" && (
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-title mb-1">Sprechi: termini con spesa e zero conversioni ({waste.length})</p>
          <p className="t-meta mb-3">Tier A ≥ 50 €, B ≥ 20 €, C sotto. Il suggerimento "negativa PHRASE" scatta da 5 click senza conversioni.</p>
          {!terms ? <p className="t-meta">Lettura fallita.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="t-kicker border-b border-line"><tr>{["Tier", "Termine", "Campagna", "Click", "Spesa", "Score", "Suggerimento", ""].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead><tbody>
              {waste.map((t) => (
                <tr key={t.searchTerm} className="border-b border-line last:border-0">
                  <td className={TD}><Badge tone={t.tier === "A" ? "warn" : "neutral"}>{t.tier}</Badge></td>
                  <td className={`${TD} font-semibold`}>{t.searchTerm}</td><td className={TD}>{t.campaign}</td><td className={TD}>{t.clicks}</td><td className={TD}>{eur(t.cost)}</td><td className={TD}>{t.score}</td><td className={TD}>{t.suggestion}</td>
                  <td className={TD}><form action={addNegativeAction}><Hidden customerId={customerId} back={base} /><input type="hidden" name="level" value="campaign" /><input type="hidden" name="scopeId" value={t.campaignId} /><input type="hidden" name="text" value={t.searchTerm} /><input type="hidden" name="matchType" value="PHRASE" /><button type="submit" className="text-xs font-bold text-brand">escludi</button></form></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </section>
      )}

      {tab === "negative" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {[["Negative di campagna", negCampaign], ["Negative di gruppo", negGroup]].map(([title, list]) => (
            <section key={title as string} className="rounded-card border border-line bg-canvas p-5">
              <p className="t-title mb-3">{title as string} ({(list as typeof negCampaign).length})</p>
              <ul className="max-h-96 space-y-1 overflow-auto text-sm">
                {(list as typeof negCampaign).map((nk) => <li key={`${nk.scopeId}-${nk.criterionId}`}>{nk.text} <span className="t-meta">({nk.matchType} · {nk.scopeName})</span></li>)}
                {(list as typeof negCampaign).length === 0 && <li className="t-meta">Nessuna.</li>}
              </ul>
            </section>
          ))}
        </div>
      )}

      {tab === "aggiungi" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-card border border-line bg-canvas p-5">
            <p className="t-title mb-3">Aggiungi keyword positiva</p>
            <form action={addKeywordAction} className="grid gap-2 sm:grid-cols-2"><Hidden customerId={customerId} back={base} />
              <input name="adGroupId" placeholder="ID gruppo di annunci" className={IN} required /><input name="text" placeholder="testo keyword" className={IN} required />
              <select name="matchType" className={IN} defaultValue="PHRASE">{["BROAD", "PHRASE", "EXACT"].map((m) => <option key={m}>{m}</option>)}</select><input name="bid" placeholder="CPC max € (opzionale)" className={IN} />
              <div className="sm:col-span-2"><Button type="submit" className="min-h-9 px-4 py-1.5 text-sm">Aggiungi</Button></div>
            </form>
          </section>
          <section className="rounded-card border border-line bg-canvas p-5">
            <p className="t-title mb-3">Aggiungi negativa</p>
            <form action={addNegativeAction} className="grid gap-2 sm:grid-cols-2"><Hidden customerId={customerId} back={base} />
              <select name="level" className={IN} defaultValue="campaign"><option value="campaign">campagna</option><option value="ad_group">gruppo</option></select><input name="scopeId" placeholder="ID campagna o gruppo" defaultValue={campaignId ?? ""} className={IN} required />
              <input name="text" placeholder="testo" className={IN} required /><select name="matchType" className={IN} defaultValue="PHRASE">{["BROAD", "PHRASE", "EXACT"].map((m) => <option key={m}>{m}</option>)}</select>
              <div className="sm:col-span-2"><Button type="submit" className="min-h-9 px-4 py-1.5 text-sm">Aggiungi negativa</Button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
