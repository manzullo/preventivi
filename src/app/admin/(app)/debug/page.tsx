import { clearDebugLog } from "@/app/admin/ads-actions";
import { Badge, Button, Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { BASE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function DebugPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const level = typeof sp.livello === "string" && ["info", "warn", "error"].includes(sp.livello) ? sp.livello : undefined;
  const [rows, g, counts] = await Promise.all([
    db.debugLog.findMany({ where: level ? { level } : {}, orderBy: { createdAt: "desc" }, take: 200 }),
    settings.gads(),
    db.debugLog.groupBy({ by: ["level"], _count: true }),
  ]);
  const env = { NEXT_PUBLIC_SITE_URL: BASE_URL, APP_SECRET: process.env.APP_SECRET ? "impostata" : "MANCANTE", CRON_KEY: process.env.CRON_KEY ? "impostata" : "mancante", ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "mancante", DATABASE_URL: process.env.DATABASE_URL ? "impostata" : "MANCANTE" };
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="t-h1">Debug</h1>
        <form action={clearDebugLog}><Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Svuota log</Button></form>
      </div>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-2">Ambiente</p>
          {Object.entries(env).map(([k, v]) => <p key={k} className="text-sm"><code>{k}</code> · {v}</p>)}
        </div>
        <div className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-2">Google Ads</p>
          <p className="text-sm">Refresh token: {g.refreshToken ? "presente" : "assente"} · Developer token: {g.developerToken ? "presente" : "assente"} · MCC: {g.loginCustomerId || "—"} · default: {g.defaultCustomerId || "—"}</p>
          <p className="text-sm">Access token: {g.accessToken ? `valido fino a ${new Date(g.accessExpires).toLocaleString("it-IT")}` : "assente"}</p>
          {g.lastError && <p className="mt-1 text-sm text-brand">Ultimo errore: {g.lastError.slice(0, 300)}</p>}
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Chip href="/admin/debug/" active={!level}>Tutti</Chip>
        {["error", "warn", "info"].map((l) => <Chip key={l} href={`/admin/debug/?livello=${l}`} active={level === l} count={counts.find((c) => c.level === l)?._count ?? 0}>{l}</Chip>)}
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-canvas">
        <table className="w-full text-sm"><thead className="t-kicker border-b border-line text-left"><tr>{["Quando", "Livello", "Area", "Messaggio", "Dettagli"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>
          {rows.length === 0 && <tr><td className="px-4 py-3 text-ink-2" colSpan={5}>Nessun log.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 align-top">
              <td className="whitespace-nowrap px-4 py-2 text-ink-2">{r.createdAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "medium" })}</td>
              <td className="px-4 py-2"><Badge tone={r.level === "error" ? "warn" : r.level === "warn" ? "neutral" : "ok"}>{r.level}</Badge></td>
              <td className="px-4 py-2">{r.area}</td><td className="px-4 py-2">{r.message}</td>
              <td className="px-4 py-2 text-ink-2"><code className="text-xs break-all">{r.meta ? JSON.stringify(r.meta).slice(0, 240) : ""}</code></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
