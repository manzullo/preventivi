import type { Metadata } from "next";
import { db } from "@/lib/db";
import { pageMeta } from "@/modules/directory/seo";
import { requireOwner } from "@/modules/owner/auth";
import { AreaNav } from "../AreaNav";
import { respondFromArea } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ title: "Richieste ricevute", description: "Le richieste dei clienti per la tua attività.", path: "/area/richieste/", noindex: true });

const ETICHETTA: Record<string, string> = { proposed: "da leggere", sent: "in attesa di risposta", accepted: "accettata", declined: "rifiutata" };

export default async function AreaRichieste({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const a = await requireOwner();
  const { msg } = await searchParams;
  const righe = await db.leadAssignment.findMany({
    where: { agencyId: a.id },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { lead: { select: { name: true, email: true, phone: true, company: true, description: true, budget: true, timing: true, city: { select: { name: true } }, service: { select: { name: true } }, createdAt: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <AreaNav attiva="richieste" nome={a.name} slug={a.slug} />
      {msg && <p className="mb-6 rounded-slot border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink">{msg}</p>}

      {righe.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-6">
          <p className="t-title">Ancora nessuna richiesta</p>
          <p className="t-body mt-1 text-ink-2">
            Le richieste arrivano dai moduli del sito e vengono mandate ai professionisti adatti per servizio e città.
            Una scheda completa, con budget minimo e competenze aggiornate, riceve richieste più pertinenti.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {righe.map((r) => {
            const accettata = r.status === "accepted";
            const chiusa = accettata || r.status === "declined";
            return (
              <li key={r.id} className="rounded-card border border-line bg-canvas p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="t-title">
                    {r.lead.service?.name ?? "Richiesta"} {r.lead.city ? `· ${r.lead.city.name}` : ""}
                  </p>
                  <span className="t-meta">
                    {r.createdAt.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} · {ETICHETTA[r.status] ?? r.status}
                  </span>
                </div>
                {(r.lead.budget || r.lead.timing) && (
                  <p className="t-meta mt-1">
                    {r.lead.budget ? `Budget indicato: ${r.lead.budget}` : ""}
                    {r.lead.budget && r.lead.timing ? " · " : ""}
                    {r.lead.timing ? `Tempi: ${r.lead.timing}` : ""}
                  </p>
                )}
                {r.lead.description && <p className="t-body mt-2 whitespace-pre-line text-ink-2">{r.lead.description}</p>}

                {accettata ? (
                  <div className="mt-3 rounded-slot bg-surface p-3">
                    <p className="t-meta text-ink">Contatti del cliente</p>
                    <p className="t-body mt-1">
                      {r.lead.name ?? "Cliente"}
                      {r.lead.company ? ` · ${r.lead.company}` : ""}
                      {r.lead.email ? ` · ${r.lead.email}` : ""}
                      {r.lead.phone ? ` · ${r.lead.phone}` : ""}
                    </p>
                  </div>
                ) : chiusa ? (
                  <p className="t-meta mt-3">Richiesta rifiutata: i contatti non sono più visibili.</p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={respondFromArea}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="azione" value="accetta" />
                      <button type="submit" className="rounded-pill bg-action px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                        Accetto, mostrami i contatti
                      </button>
                    </form>
                    <form action={respondFromArea}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="azione" value="rifiuta" />
                      <button type="submit" className="rounded-pill border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/25">
                        Non fa per noi
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
