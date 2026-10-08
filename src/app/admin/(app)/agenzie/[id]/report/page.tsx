import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";

// Report per professionista: impression delle card, click sulla scheda e sui
// contatti, lead assegnati. È il materiale che si vende al titolare.

export const dynamic = "force-dynamic";

export default async function AgencyReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.agency.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  if (!a) notFound();
  const since = new Date();
  since.setMonth(since.getMonth() - 6, 1);
  since.setHours(0, 0, 0, 0);
  const [events, assignments] = await Promise.all([
    db.analyticsEvent.findMany({ where: { agencyId: a.id, createdAt: { gte: since } }, select: { type: true, createdAt: true } }),
    db.leadAssignment.findMany({ where: { agencyId: a.id, createdAt: { gte: since } }, select: { status: true, createdAt: true, price: true } }),
  ]);
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
  const key = (d: Date) => d.toISOString().slice(0, 7);
  const row = (m: string) => ({
    impression: events.filter((e) => e.type === "impression" && key(e.createdAt) === m).length,
    card: events.filter((e) => e.type === "card_click" && key(e.createdAt) === m).length,
    contact: events.filter((e) => e.type === "contact_click" && key(e.createdAt) === m).length,
    lead: assignments.filter((x) => key(x.createdAt) === m).length,
    sold: assignments.filter((x) => key(x.createdAt) === m && x.status === "accepted").reduce((s, x) => s + (x.price ?? 0), 0),
  });
  return (
    <div className="max-w-4xl">
      <Link href={`/admin/agenzie/${a.id}/`} className="t-meta font-bold text-action">← {a.name}</Link>
      <h1 className="t-h1 mt-2 mb-1">Report: {a.name}</h1>
      <p className="t-meta mb-5">Ultimi 6 mesi. Impression = card vista nei listing; click scheda = apertura della pagina; click contatti = preventivo, sito o telefono dalla scheda.</p>
      <div className="overflow-hidden rounded-card border border-line bg-canvas">
        <table className="w-full text-sm"><thead className="t-kicker border-b border-line text-left"><tr>{["Mese", "Impression", "Click scheda", "Click contatti", "Lead assegnati", "Venduto (€)"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>
          {months.map((m) => { const r = row(m); return <tr key={m} className="border-b border-line last:border-0"><td className="px-4 py-2 font-semibold">{m}</td><td className="px-4 py-2">{fmt(r.impression)}</td><td className="px-4 py-2">{fmt(r.card)}</td><td className="px-4 py-2">{fmt(r.contact)}</td><td className="px-4 py-2">{fmt(r.lead)}</td><td className="px-4 py-2">{fmt(r.sold)}</td></tr>; })}
        </tbody></table>
      </div>
    </div>
  );
}
