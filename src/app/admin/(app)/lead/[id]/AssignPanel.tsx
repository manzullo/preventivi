import Link from "next/link";
import { assignmentStatusAction, autoAssignAction, proposeAssignmentAction, removeAssignmentAction, sendAssignmentAction } from "@/app/admin/actions";
import { Badge, Button, Rating } from "@/design/ui";
import { paths } from "@/lib/site";
import type { AgencyCardData } from "@/modules/directory/listing";

type Assignment = { id: string; status: string; price: number | null; note: string | null; sentAt: Date | null; respondedAt?: Date | null; agency: { id: string; slug: string; name: string; email: string | null } };
const LABEL: Record<string, string> = { proposed: "Proposta", sent: "Inviata", accepted: "Accettata", declined: "Rifiutata" };
const IN = "rounded-slot border-[1.5px] border-line bg-canvas px-2 py-1 text-sm outline-none focus:border-action";

export function AssignPanel({ leadId, assignments, suggestions }: { leadId: string; assignments: Assignment[]; suggestions: AgencyCardData[] }) {
  const active = assignments.filter((a) => ["proposed", "sent", "accepted"].includes(a.status)).length;
  const free = Math.max(0, 3 - active);
  return (
    <section className="mt-6 rounded-card border border-line bg-canvas p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="t-kicker">Smistamento (max 3 professionisti attivi)</p>
        {suggestions.length > 0 && free > 0 && (
          <form action={autoAssignAction}>
            <input type="hidden" name="leadId" value={leadId} />
            <Button type="submit" arrow className="min-h-9 px-4 py-1.5 text-sm">Smista alle prime {Math.min(free, suggestions.length)} e invia</Button>
          </form>
        )}
      </div>
      {assignments.length === 0 ? <p className="t-meta mb-4">Nessun professionista ancora proposto.</p> : (
        <ul className="mb-5 space-y-2">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-slot border border-line px-3 py-2 text-sm">
              <Link href={paths.agency(a.agency.slug)} className="font-bold text-action">{a.agency.name}</Link>
              <Badge tone={a.status === "accepted" ? "ok" : a.status === "declined" ? "neutral" : a.status === "sent" ? "warn" : "neutral"}>{LABEL[a.status] ?? a.status}</Badge>
              {a.sentAt && <span className="t-meta">inviata {a.sentAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>}
              {a.respondedAt && <span className="t-meta">risposta {a.respondedAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>}
              {a.price !== null && <span className="t-meta">{a.price} €</span>}
              {a.note && <span className="t-meta text-warn-fg">{a.note}</span>}
              {!a.agency.email && <span className="t-meta">(senza email in scheda)</span>}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {a.status === "proposed" && <form action={sendAssignmentAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="leadId" value={leadId} /><button type="submit" className="text-xs font-bold text-action">Invia all&apos;professionista</button></form>}
                {a.status !== "accepted" && a.status !== "declined" && (
                  <form action={assignmentStatusAction} className="flex items-center gap-1"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="leadId" value={leadId} /><input type="hidden" name="status" value="accepted" /><input name="price" type="number" placeholder="€" className={`${IN} w-16`} /><button type="submit" className="text-xs font-bold text-ok">Accettata</button></form>
                )}
                {a.status !== "declined" && <form action={assignmentStatusAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="leadId" value={leadId} /><input type="hidden" name="status" value="declined" /><button type="submit" className="text-xs font-semibold text-ink-2">Rifiutata</button></form>}
                <form action={removeAssignmentAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="leadId" value={leadId} /><button type="submit" className="text-xs text-ink-3 hover:text-brand">×</button></form>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="t-meta mb-2">Suggerite per servizio e città, ordinate per punteggio:</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-slot border border-dashed border-line px-3 py-2 text-sm">
            <span><Link href={paths.agency(s.slug)} className="font-semibold text-action">{s.name}</Link><span className="t-meta block">{s.city?.name} · <Rating value={s.rating} count={s.reviewCount} /></span></span>
            <form action={proposeAssignmentAction}><input type="hidden" name="leadId" value={leadId} /><input type="hidden" name="agencyId" value={s.id} /><Button type="submit" variant="tonal" className="min-h-8 px-3 py-1 text-xs">Proponi</Button></form>
          </li>
        ))}
        {suggestions.length === 0 && <li className="t-meta">Nessun professionista pubblicato con questo servizio.</li>}
      </ul>
      <form action={proposeAssignmentAction} className="mt-3 flex items-center gap-2"><input type="hidden" name="leadId" value={leadId} /><input name="agencySlug" placeholder="oppure slug professionista" className={IN} /><Button type="submit" variant="outline" className="min-h-8 px-3 py-1 text-xs">Proponi</Button></form>
    </section>
  );
}
