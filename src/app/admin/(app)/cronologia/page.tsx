import { Chip } from "@/design/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const AREAS = ["form", "ads", "settings", "lead", "ingest"];

export default async function ChangelogPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const area = typeof sp.area === "string" && AREAS.includes(sp.area) ? sp.area : undefined;
  const rows = await db.changelogEntry.findMany({ where: area ? { area } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <div className="max-w-5xl">
      <h1 className="t-h1 mb-4">Cronologia</h1>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href="/admin/cronologia/" active={!area}>Tutto</Chip>
        {AREAS.map((a) => <Chip key={a} href={`/admin/cronologia/?area=${a}`} active={area === a}>{a}</Chip>)}
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-canvas">
        <table className="w-full text-sm"><thead className="t-kicker border-b border-line text-left"><tr>{["Quando", "Area", "Azione", "Oggetto", "Dettagli", "Chi"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>
          {rows.length === 0 && <tr><td className="px-4 py-3 text-ink-2" colSpan={6}>Nessuna voce.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 align-top">
              <td className="whitespace-nowrap px-4 py-2 text-ink-2">{r.createdAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="px-4 py-2">{r.area}</td><td className="px-4 py-2 font-semibold">{r.action}</td><td className="px-4 py-2">{r.subject}</td>
              <td className="px-4 py-2 text-ink-2"><code className="text-xs">{r.diff ? JSON.stringify(r.diff).slice(0, 160) : ""}</code></td>
              <td className="px-4 py-2 text-ink-2">{r.actor}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
