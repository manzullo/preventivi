import { enrichLeadAction, retryUploads } from "@/app/admin/ads-actions";
import { Button } from "@/design/ui";

type Upload = { id: string; conversionActionId: string; customerId: string | null; status: string; attempts: number; lastError: string | null };

export function AdsPanel({ leadId, gclid, adsMeta, uploads }: { leadId: string; gclid: string | null; adsMeta: Record<string, unknown> | null; uploads: Upload[] }) {
  const back = `/admin/lead/${leadId}/`;
  return (
    <>
      <div className="rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-3">Google Ads: dati del click</p>
        {adsMeta ? (
          <dl className="space-y-1 text-sm">
            {Object.entries(adsMeta).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-ink-2">{k}</dt>
                <dd className="font-medium">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="t-meta">{gclid ? "Non ancora arricchito (click_view ha 4-12 ore di ritardo)." : "Nessun gclid: il lead non arriva da Google Ads."}</p>
        )}
        {gclid && (
          <form action={enrichLeadAction} className="mt-3">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="back" value={back} />
            <Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Arricchisci da Google Ads</Button>
          </form>
        )}
      </div>
      <div className="rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-3">Upload conversioni Google Ads</p>
        {uploads.length === 0 ? (
          <p className="t-meta">Nessun upload in coda (serve gclid + conversione con upload API attivo nel form).</p>
        ) : (
          uploads.map((u) => (
            <p key={u.id} className="text-sm">
              {u.customerId ?? "?"} / azione {u.conversionActionId} · <strong>{u.status}</strong> · tentativi {u.attempts}
              {u.lastError ? ` · ${u.lastError.slice(0, 160)}` : ""}
            </p>
          ))
        )}
        {uploads.some((u) => u.status !== "sent") && (
          <form action={retryUploads} className="mt-3">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="back" value={back} />
            <Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Riprova upload</Button>
          </form>
        )}
      </div>
    </>
  );
}
