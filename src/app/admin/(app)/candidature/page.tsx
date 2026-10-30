import { reviewApplication } from "@/app/admin/agency-actions";
import { Badge, Button, Chip } from "@/design/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ApplicationsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const status = typeof sp.stato === "string" ? sp.stato : "pending";
  const rows = await db.application.findMany({ where: status === "tutte" ? {} : { status }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="t-h1">Candidature</h1>
      <div className="flex flex-wrap gap-2">{[["pending", "Da esaminare"], ["accepted", "Accettate"], ["rejected", "Rifiutate"], ["tutte", "Tutte"]].map(([k, v]) => <Chip key={k} href={`/admin/candidature/?stato=${k}`} active={status === k}>{v}</Chip>)}</div>
      {rows.length === 0 && <p className="t-body text-ink-2">Nessuna candidatura.</p>}
      {rows.map((a) => (
        <div key={a.id} className="rounded-card border border-line bg-canvas p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="t-title">{a.name}</p>
            <Badge tone={a.status === "accepted" ? "ok" : a.status === "rejected" ? "neutral" : "warn"}>{a.status}</Badge>
            <span className="t-meta">{a.createdAt.toLocaleString("it-IT")}</span>
          </div>
          <p className="t-body mt-2">{[a.website, a.email, a.phone, a.citySlug].filter(Boolean).join(" · ")}</p>
          <p className="t-meta mt-1">Servizi: {((a.services as string[]) ?? []).join(", ") || "—"}</p>
          {a.message && <p className="t-body mt-2 whitespace-pre-line text-ink-2">{a.message}</p>}
          {a.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <form action={reviewApplication}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="decision" value="accept" /><Button type="submit" className="min-h-9 px-4 py-1.5 text-sm">Accetta e crea la scheda</Button></form>
              <form action={reviewApplication}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="decision" value="reject" /><Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Rifiuta</Button></form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
