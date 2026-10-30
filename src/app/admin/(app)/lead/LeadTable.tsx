import Link from "next/link";
import { Badge } from "@/design/ui";
import type { Prisma } from "@/generated/prisma";

export type LeadRow = Prisma.LeadGetPayload<{ include: { service: true; city: true; form: { select: { name: true } } } }>;

export const STATUS_LABEL: Record<string, string> = { new: "Nuovo", qualified: "Qualificato", sold: "Venduto", rejected: "Scartato" };

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "sold" ? "ok" : status === "rejected" ? "neutral" : status === "qualified" ? "warn" : "neutral";
  return <Badge tone={tone}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function LeadTable({ leads }: { leads: LeadRow[] }) {
  if (leads.length === 0) return <p className="t-body text-ink-2">Nessun lead.</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-canvas">
      <table className="w-full text-sm">
        <thead className="t-kicker border-b border-line text-left">
          <tr>
            {["Data", "Contatto", "Richiesta", "Budget", "Origine", "Stato", ""].map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b border-line last:border-0 hover:bg-surface">
              <td className="whitespace-nowrap px-4 py-3 text-ink-2">{l.createdAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="px-4 py-3">
                <p className="font-semibold">{l.name ?? "—"}</p>
                <p className="text-ink-2">{[l.company, l.email].filter(Boolean).join(" · ")}</p>
              </td>
              <td className="px-4 py-3">{[l.service?.name, l.city?.name].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-4 py-3 text-ink-2">{l.budget ?? "—"}</td>
              <td className="px-4 py-3 text-ink-2">
                {l.gclid ? "Google Ads" : l.utmSource ? `${l.utmSource}/${l.utmMedium ?? ""}` : "diretto"}
                {l.clientId && l.clientId !== "migliori-agenzie" ? ` · ${l.clientId}` : ""}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={l.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/lead/${l.id}/`} className="font-bold text-action">
                  Apri →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
