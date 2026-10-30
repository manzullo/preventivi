import Link from "next/link";
import { Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";
import { LeadTable, STATUS_LABEL } from "./LeadTable";
import { PartialsTable } from "./PartialsTable";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LeadsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const status = typeof sp.stato === "string" && sp.stato in STATUS_LABEL ? sp.stato : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const partial = sp.stato === "parziali";
  if (partial) return <PartialsPage page={page} />;
  const where = status ? { status } : {};
  const [total, leads] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { service: true, city: true, form: { select: { name: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">Lead</h1>
          <p className="t-meta mt-1">{fmt(total)} in totale</p>
        </div>
        <Link href={`/admin/lead/export/${status ? `?stato=${status}` : ""}`} className="t-meta font-bold text-action">
          Esporta CSV ↓
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href="/admin/lead/" active={!status}>
          Tutti
        </Chip>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <Chip key={k} href={`/admin/lead/?stato=${k}`} active={status === k}>
            {v}
          </Chip>
        ))}
        <Chip href="/admin/lead/?stato=parziali" active={false}>
          Parziali
        </Chip>
      </div>
      <LeadTable leads={leads} />
      {pages > 1 && (
        <p className="t-meta mt-4">
          Pagina {page} di {pages} ·{" "}
          {page < pages && (
            <Link href={`/admin/lead/?page=${page + 1}${status ? `&stato=${status}` : ""}`} className="font-bold text-action">
              successiva →
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

// Lead parziali: bozze compilate ma mai inviate (recupero abbandoni).
async function PartialsPage({ page }: { page: number }) {
  const where = { converted: false };
  const [total, drafts] = await Promise.all([
    db.formDraft.count({ where }),
    db.formDraft.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { form: { select: { name: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <div>
      <div className="mb-6">
        <h1 className="t-h1">Lead parziali</h1>
        <p className="t-meta mt-1">{fmt(total)} bozze non inviate · si aggiornano a ogni passo del form</p>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href="/admin/lead/" active={false}>Tutti</Chip>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <Chip key={k} href={`/admin/lead/?stato=${k}`} active={false}>{v}</Chip>
        ))}
        <Chip href="/admin/lead/?stato=parziali" active>Parziali</Chip>
      </div>
      <PartialsTable drafts={drafts.map((d) => ({ id: d.id, form: d.form.name, updatedAt: d.updatedAt.toISOString(), lastStepKey: d.lastStepKey, landingPath: d.landingPath, answers: d.answers as Record<string, unknown>, contact: (d.contact as Record<string, string> | null) ?? null }))} />
      {pages > 1 && (
        <p className="t-meta mt-4">
          Pagina {page} di {pages} ·{" "}
          {page < pages && <Link href={`/admin/lead/?stato=parziali&page=${page + 1}`} className="font-bold text-action">successiva →</Link>}
        </p>
      )}
    </div>
  );
}
