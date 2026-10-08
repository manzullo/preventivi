import Link from "next/link";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";
import { LeadTable } from "./lead/LeadTable";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-canvas p-5">
      <p className="t-kicker">{label}</p>
      <p className="t-h2 mt-1">{value}</p>
      {hint && <p className="t-meta mt-1">{hint}</p>}
    </div>
  );
}

export default async function AdminHome() {
  const since7 = new Date(Date.now() - 7 * 864e5);
  const since30 = new Date(Date.now() - 30 * 864e5);
  const [leads7, leads30, sold30, visits7, agencies, pages, forms, recent] = await Promise.all([
    db.lead.count({ where: { createdAt: { gte: since7 }, status: { not: "rejected" } } }),
    db.lead.count({ where: { createdAt: { gte: since30 }, status: { not: "rejected" } } }),
    db.lead.aggregate({ where: { status: "sold", soldAt: { gte: since30 } }, _sum: { soldPrice: true }, _count: true }),
    db.visit.count({ where: { createdAt: { gte: since7 } } }),
    db.agency.count({ where: { published: true } }),
    db.landingPage.count({ where: { published: true } }),
    db.form.count({ where: { status: "active" } }),
    db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { service: true, city: true, form: { select: { name: true } } } }),
  ]);
  return (
    <div>
      <h1 className="t-h1 mb-6">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lead 7 giorni" value={fmt(leads7)} hint={`${fmt(leads30)} negli ultimi 30`} />
        <Stat label="Venduti 30 giorni" value={`${fmt(sold30._sum.soldPrice ?? 0)} €`} hint={`${fmt(sold30._count)} lead`} />
        <Stat label="Visite tracciate 7 giorni" value={fmt(visits7)} />
        <Stat label="Catalogo" value={fmt(agencies)} hint={`${fmt(pages)} pagine pubblicate · ${fmt(forms)} form attivi`} />
      </div>
      <div className="mt-10 mb-4 flex items-end justify-between">
        <h2 className="t-h2">Ultimi lead</h2>
        <Link href="/admin/lead/" className="t-meta font-bold text-action">
          Tutti i lead →
        </Link>
      </div>
      <LeadTable leads={recent} />
    </div>
  );
}
