import Link from "next/link";
import { Badge, Rating } from "@/design/ui";
import { fmt, paths } from "@/lib/site";
import type { AgencyCardConEvidenza } from "@/modules/directory/listing";
import { Logo } from "@/components/Logo";
import { factSummary } from "@/modules/directory/summary";

export function AgencyCard({ agency: a, position }: { agency: AgencyCardConEvidenza; position?: number }) {
  const services = a.services.map((s) => s.service);
  // Vale sia la corsia comprata su una pagina sia la priorità valida ovunque:
  // in tutti e due i casi la scelta è nostra, quindi si dichiara.
  const evidenza = a.evidenza ?? (a.priority ? "In evidenza" : null);
  const meta = [
    a.minBudget ? `da ${fmt(a.minBudget)} €` : null,
  ].filter(Boolean);

  return (
    <article
      className="group relative flex flex-col gap-3 rounded-card border border-line bg-canvas p-5 shadow-card transition-colors hover:border-ink/25"
      data-agency={a.slug}
    >
      <div className="flex items-start justify-between gap-3">
        {a.logoUrl && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-slot border border-line bg-canvas">
            <Logo src={a.logoUrl} size={48} className="h-full w-full" />
          </span>
        )}
        <div className="min-w-0">
          {/* Se la posizione l'abbiamo decisa noi si dice, con il numero al
              posto del quale sarebbe finita da sola. */}
          {evidenza ? (
            <p className="t-kicker mb-1 text-action">{evidenza}</p>
          ) : (
            typeof position === "number" && <p className="t-kicker mb-1">#{position}</p>
          )}
          <h3 className="t-title">
            <Link href={paths.agency(a.slug)} data-track="card_click" className="after:absolute after:inset-0">
              {a.name}
            </Link>
          </h3>
          {a.city && <p className="t-meta mt-0.5">{a.city.name}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Rating value={a.rating} count={a.reviewCount} />
          {a.verified && <Badge>Verificata</Badge>}
          {/* Il "Controllo qualità" di Instapro: chi lavora con partita IVA. */}
          {a.vatNumber && <Badge tone="neutral">Con partita IVA</Badge>}
        </div>
      </div>

      {(a.description ?? factSummary(a, { short: true })) && (
        <p className="t-body line-clamp-2 text-ink-2">{a.description ?? factSummary(a, { short: true })}</p>
      )}

      {services.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {services.slice(0, 3).map((s) => (
            <span
              key={s.slug}
              className="rounded-pill bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2"
            >
              {s.name}
            </span>
          ))}
          {services.length > 3 && (
            <span className="rounded-pill px-2 py-1 text-xs font-semibold text-ink-3">
              +{services.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="t-meta mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="truncate">{meta.join(" · ")}</span>
        <span className="shrink-0 font-bold text-action">
          Vedi scheda <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </article>
  );
}
