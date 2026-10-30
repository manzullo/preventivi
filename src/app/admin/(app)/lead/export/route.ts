import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Non autorizzato", { status: 401 });
  const status = new URL(req.url).searchParams.get("stato") ?? undefined;
  const leads = await db.lead.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, include: { service: true, city: true, agency: true } });
  const head = ["data", "stato", "nome", "azienda", "email", "telefono", "servizio", "citta", "professionista", "budget", "tempi", "descrizione", "utm_source", "utm_medium", "utm_campaign", "utm_term", "gclid", "client_id", "landing", "valore", "prezzo_vendita", "id"];
  const rows = leads.map((l) => [
    l.createdAt.toISOString(), l.status, l.name, l.company, l.email, l.phone, l.service?.slug, l.city?.slug, l.agency?.slug, l.budget, l.timing, l.description,
    l.utmSource, l.utmMedium, l.utmCampaign, l.utmTerm, l.gclid, l.clientId, l.landingPath, l.value, l.soldPrice, l.id,
  ]);
  const csv = [head, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  return new Response(`﻿${csv}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lead-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
