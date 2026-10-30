import Link from "next/link";
import { Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";
import { AdvicePanel } from "@/components/admin/AdvicePanel";

// Performance: port della pagina "Performance" del plugin. Lead per giorno,
// sorgente traffico, lead per form, confronto form, funnel per step, visite
// e lead per campagna. I dati Google Ads stanno in /admin/ads/.

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-canvas p-5">
      <p className="t-title mb-3">{title}</p>
      {children}
    </section>
  );
}
function Bars({ rows, max }: { rows: { label: string; value: number; hint?: string }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="t-meta">Nessun dato nel periodo.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-0.5 flex justify-between text-sm"><span className="font-semibold">{r.label}{r.hint && <span className="t-meta ml-2">{r.hint}</span>}</span><span className="text-ink-2">{fmt(r.value)}</span></div>
          <div className="h-2 rounded-pill bg-surface"><div className="h-2 rounded-pill bg-action" style={{ width: `${Math.round((r.value / top) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function PerformancePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const forms = await db.form.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, slug: true, abGroup: true, abWeight: true, steps: { orderBy: { position: "asc" }, select: { id: true, key: true, type: true, position: true } } } });
  const formId = typeof sp.form === "string" && forms.some((f) => f.id === sp.form) ? sp.form : forms[0]?.id;
  const days = [7, 30, 90].includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;
  const since = new Date(Date.now() - days * 864e5);
  const form = forms.find((f) => f.id === formId);

  const ctaEvents = await db.analyticsEvent.findMany({ where: { type: { in: ["cta_click", "hero_view"] }, createdAt: { gte: since } }, select: { type: true, meta: true } });
  const [leads, visits, stepRows, submissionsByForm, startsByForm] = await Promise.all([
    db.lead.findMany({ where: { createdAt: { gte: since } }, select: { id: true, createdAt: true, formId: true, status: true, gclid: true, utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, clientId: true, soldPrice: true } }),
    db.visit.findMany({ where: { createdAt: { gte: since } }, select: { utmCampaign: true, gclid: true, utmSource: true } }),
    formId ? db.stepAnalytics.groupBy({ by: ["stepId"], where: { formId, day: { gte: since } }, _sum: { views: true, completions: true } }) : [],
    db.submission.groupBy({ by: ["formId"], where: { createdAt: { gte: since }, testMode: false }, _count: true }),
    db.analyticsEvent.groupBy({ by: ["formId"], where: { type: "step_view", createdAt: { gte: since } }, _count: true }),
  ]);
  const real = leads.filter((l) => l.status !== "rejected");

  // Lead per giorno
  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) byDay.set(day(new Date(Date.now() - i * 864e5)), 0);
  for (const l of real) byDay.set(day(l.createdAt), (byDay.get(day(l.createdAt)) ?? 0) + 1);
  const dayRows = [...byDay.entries()].filter(([, v], i, arr) => v > 0 || i >= arr.length - 14).map(([d, v]) => ({ label: d.slice(5), value: v }));

  // Sorgente traffico
  const bySource = new Map<string, number>();
  for (const l of real) {
    const k = l.gclid ? "Google Ads" : l.utmSource ? `${l.utmSource}/${l.utmMedium ?? "?"}` : "diretto";
    bySource.set(k, (bySource.get(k) ?? 0) + 1);
  }

  // Per form + confronto
  const formRows = forms.map((f) => {
    const subs = submissionsByForm.find((s) => s.formId === f.id)?._count ?? 0;
    const starts = startsByForm.find((s) => s.formId === f.id)?._count ?? 0;
    const sold = real.filter((l) => l.formId === f.id && l.status === "sold").length;
    return { name: f.name, ab: f.abGroup ? `${f.abGroup} · ${f.abWeight}%` : "", subs, starts, rate: starts ? Math.round((subs / starts) * 100) : 0, sold };
  }).sort((x, y) => x.ab.localeCompare(y.ab));

  // Visite & lead per campagna
  const byCampaign = new Map<string, { visits: number; leads: number }>();
  for (const v of visits) {
    const k = v.utmCampaign ?? (v.gclid ? "(gclid senza campagna)" : "(nessuna)");
    const c = byCampaign.get(k) ?? { visits: 0, leads: 0 };
    c.visits++;
    byCampaign.set(k, c);
  }
  for (const l of real) {
    const k = l.utmCampaign ?? (l.gclid ? "(gclid senza campagna)" : "(nessuna)");
    const c = byCampaign.get(k) ?? { visits: 0, leads: 0 };
    c.leads++;
    byCampaign.set(k, c);
  }
  const campaignRows = [...byCampaign.entries()].sort((a, b) => b[1].leads - a[1].leads || b[1].visits - a[1].visits).slice(0, 15);

  // Keyword (utm_term) che portano lead
  const byTerm = new Map<string, number>();
  for (const l of real) if (l.utmTerm) byTerm.set(l.utmTerm, (byTerm.get(l.utmTerm) ?? 0) + 1);

  // Funnel
  const byStep = new Map(stepRows.map((r) => [r.stepId, { views: r._sum.views ?? 0, completions: r._sum.completions ?? 0 }]));
  const firstViews = byStep.get(form?.steps[0]?.id ?? "")?.views ?? 0;
  let worst: { key: string; drop: number } | null = null;
  for (const s of form?.steps ?? []) {
    const a = byStep.get(s.id);
    if (!a) continue;
    const drop = a.views - a.completions;
    if (!worst || drop > worst.drop) worst = { key: s.key, drop };
  }
  const revenue = real.reduce((a, l) => a + (l.soldPrice ?? 0), 0);

  // CTA verso il form: click per posizione e test hero chiaro/scuro (PIANO 3d).
  const byPos = new Map<string, number>();
  const byHero = new Map<string, { views: number; clicks: number }>();
  for (const e of ctaEvents) {
    const m = (e.meta ?? {}) as { position?: string; hero?: string };
    const h = m.hero ?? "n/d";
    const row = byHero.get(h) ?? { views: 0, clicks: 0 };
    if (e.type === "hero_view") row.views++;
    else {
      byPos.set(m.position ?? "n/d", (byPos.get(m.position ?? "n/d") ?? 0) + 1);
      if (m.position === "hero") row.clicks++;
    }
    byHero.set(h, row);
  }
  const posRows = [...byPos.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const heroRows = [...byHero.entries()].filter(([k]) => k !== "n/d").map(([variant, r]) => ({ variant, ...r, ctr: r.views ? Math.round((r.clicks / r.views) * 1000) / 10 : 0 }));

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="t-h1">Performance</h1>
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => <Chip key={d} href={`/admin/analytics/?form=${formId}&giorni=${d}`} active={d === days}>{d} giorni</Chip>)}
        <span className="t-meta ml-3">Dati Google Ads e conversioni: <Link href="/admin/ads/" className="font-bold text-action">Google Ads →</Link></span>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[["Lead", fmt(real.length)], ["Visite tracciate", fmt(visits.length)], ["Venduti", fmt(real.filter((l) => l.status === "sold").length)], ["Incasso", `${fmt(revenue)} €`]].map(([k, v]) => (
          <div key={k} className="rounded-card border border-line bg-canvas p-5"><p className="t-kicker">{k}</p><p className="t-h2 mt-1">{v}</p></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Lead per giorno"><Bars rows={dayRows} /></Card>
        <Card title="Sorgente traffico (lead)"><Bars rows={[...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} /></Card>
      </div>

      <Card title="Confronto form: quale converte di più?">
        <table className="w-full text-sm"><thead className="t-kicker border-b border-line text-left"><tr>{["Form", "Gruppo A/B", "Hanno iniziato", "Invii", "Tasso", "Venduti"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
          {formRows.map((r) => <tr key={r.name} className="border-b border-line last:border-0"><td className="px-3 py-2 font-semibold">{r.name}</td><td className="px-3 py-2 text-ink-2">{r.ab || "—"}</td><td className="px-3 py-2">{fmt(r.starts)}</td><td className="px-3 py-2">{fmt(r.subs)}</td><td className="px-3 py-2">{r.rate}%</td><td className="px-3 py-2">{r.sold}</td></tr>)}
        </tbody></table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Visite e lead per campagna">
          {campaignRows.length === 0 ? <p className="t-meta">Nessuna campagna nel periodo.</p> : (
            <table className="w-full text-sm"><thead className="t-kicker border-b border-line text-left"><tr>{["Campagna", "Visite", "Lead", "Conv."].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
              {campaignRows.map(([k, v]) => <tr key={k} className="border-b border-line last:border-0"><td className="px-3 py-2">{k}</td><td className="px-3 py-2">{v.visits}</td><td className="px-3 py-2">{v.leads}</td><td className="px-3 py-2">{v.visits ? `${Math.round((v.leads / v.visits) * 100)}%` : "—"}</td></tr>)}
            </tbody></table>
          )}
        </Card>
        <Card title="Keyword che portano lead (utm_term)"><Bars rows={[...byTerm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }))} /></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="CTA verso il form: click per posizione">
          {posRows.length === 0 ? <p className="t-meta">Nessun click nel periodo. Le posizioni: hero, mid (dopo la 6ª card), end, faq, sticky (mobile), agency (scheda), blog.</p> : <Bars rows={posRows} />}
        </Card>
        <Card title="Test hero chiaro/scuro (click sul CTA dell'hero / viste)">
          {heroRows.length === 0 ? <p className="t-meta">Nessuna vista registrata nel periodo.</p> : (
            <table className="w-full text-sm"><thead className="t-kicker border-b border-line text-left"><tr>{["Variante", "Viste", "Click hero", "CTR"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
              {heroRows.map((r) => <tr key={r.variant} className="border-b border-line last:border-0"><td className="px-3 py-2 font-semibold">{r.variant === "dark" ? "Scuro (bottone bianco)" : "Chiaro (bottone blu)"}</td><td className="px-3 py-2">{fmt(r.views)}</td><td className="px-3 py-2">{fmt(r.clicks)}</td><td className="px-3 py-2">{r.ctr}%</td></tr>)}
            </tbody></table>
          )}
          <p className="t-meta mt-3">Sotto le 200 viste per variante il confronto non dice nulla. Si spegne il test in Impostazioni → Sito pubblico e si tiene la vincente.</p>
        </Card>
      </div>

      <AdvicePanel level="form" formId={formId} days={days} />

      <Card title={`Funnel per step · ${form?.name ?? ""}`}>
        <div className="mb-4 flex flex-wrap gap-2">{forms.map((f) => <Chip key={f.id} href={`/admin/analytics/?form=${f.id}&giorni=${days}`} active={f.id === formId}>{f.name}</Chip>)}</div>
        <ol className="space-y-3">
          {(form?.steps ?? []).map((s) => {
            const a = byStep.get(s.id) ?? { views: 0, completions: 0 };
            const w = firstViews ? Math.round((a.views / firstViews) * 100) : 0;
            const rate = a.views ? Math.round((a.completions / a.views) * 100) : 0;
            return (
              <li key={s.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">{s.position + 1}. {s.key} <span className="text-ink-3">({s.type})</span>{worst?.key === s.key && worst.drop > 0 && <span className="ml-2 rounded-pill bg-warn px-2 py-0.5 text-xs font-bold text-warn-fg">collo di bottiglia</span>}</span>
                  <span className="text-ink-2">{fmt(a.views)} visti · {fmt(a.completions)} completati · {rate}%</span>
                </div>
                <div className="h-2 rounded-pill bg-surface"><div className="h-2 rounded-pill bg-action" style={{ width: `${w}%` }} /></div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
