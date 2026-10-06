// La richiesta vista dal cliente, come su Instapro: a chi è arrivata, chi ha
// già risposto, e il profilo di chi ha accettato per confrontarli e scegliere.
// Si apre dal link nell'email (id + firma), senza account.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Kicker, Rating } from "@/design/ui";
import { firmaValida } from "@/lib/crypto";
import { db } from "@/lib/db";
import { paths } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "La tua richiesta", robots: { index: false, follow: false } };

const BUDGET: Record<string, string> = { lt200: "meno di 200 €", "200-1000": "200 – 1.000 €", "1000-5000": "1.000 – 5.000 €", gt5000: "oltre 5.000 €", unknown: "da definire" };
const TIMING: Record<string, string> = { urgent: "urgente", now: "entro una settimana", "1m": "entro un mese", "3m": "entro tre mesi", explore: "flessibile" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function RichiestaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const k = Array.isArray(sp.k) ? sp.k[0] : sp.k;
  if (!firmaValida(id, k)) notFound();
  const l = await db.lead.findUnique({
    where: { id },
    include: {
      service: true,
      city: true,
      assignments: {
        where: { status: { in: ["sent", "accepted"] } },
        orderBy: [{ respondedAt: "asc" }, { createdAt: "asc" }],
        include: { agency: { select: { slug: true, name: true, rating: true, reviewCount: true, phone: true, website: true, verified: true, vatNumber: true, city: { select: { name: true } } } } },
      },
    },
  });
  if (!l) notFound();

  const accettate = l.assignments.filter((a) => a.status === "accepted");
  const inAttesa = l.assignments.length - accettate.length;
  const what = [l.service?.plural, l.city?.name].filter(Boolean).join(" a ");

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Kicker className="mb-2">La tua richiesta · codice {l.id.slice(-8)}</Kicker>
      <h1 className="t-h1">{what || "Richiesta di preventivo"}</h1>
      <p className="t-meta mt-2">
        Inviata il {l.createdAt.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
        {l.budget ? ` · budget ${BUDGET[l.budget] ?? l.budget}` : ""}
        {l.timing ? ` · ${TIMING[l.timing] ?? l.timing}` : ""}
      </p>
      {l.description && <p className="t-body mt-4 whitespace-pre-line rounded-card bg-surface p-4 text-ink-2">{l.description}</p>}

      <section className="mt-10">
        <h2 className="t-h2">
          {l.assignments.length === 0
            ? "Stiamo scegliendo i professionisti"
            : accettate.length === 0
              ? `Inviata a ${l.assignments.length} ${l.assignments.length === 1 ? "professionista" : "professionisti"}, in attesa di risposta`
              : `${accettate.length} ${accettate.length === 1 ? "professionista ha" : "professionisti hanno"} accettato`}
        </h2>
        <p className="t-body mt-2 text-ink-2">
          {l.assignments.length === 0
            ? "Entro un giorno lavorativo giriamo la richiesta ai professionisti della zona con le recensioni migliori. Questa pagina si aggiorna da sola: tienila tra i preferiti."
            : "Chi accetta vede i tuoi contatti e ti chiama o ti scrive. Qui sotto trovi i loro profili per confrontarli con calma."}
          {inAttesa > 0 && accettate.length > 0 ? ` Altri ${inAttesa} non hanno ancora risposto.` : ""}
        </p>

        {accettate.length > 0 && (
          <ul className="mt-6 grid gap-4">
            {accettate.map(({ agency: a, respondedAt }) => (
              <li key={a.slug} className="rounded-card border border-line bg-canvas p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="t-title">
                      <Link href={paths.agency(a.slug)} className="hover:text-action">
                        {a.name}
                      </Link>
                    </p>
                    <p className="t-meta mt-0.5">
                      {a.city?.name}
                      {respondedAt ? ` · ha accettato il ${respondedAt.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Rating value={a.rating} count={a.reviewCount} />
                    <div className="flex gap-1.5">
                      {a.verified && <Badge>Verificata</Badge>}
                      {a.vatNumber && <Badge tone="neutral">Con partita IVA</Badge>}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button href={paths.agency(a.slug)} variant="outline">
                    Vedi profilo e recensioni
                  </Button>
                  {a.phone && (
                    <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="t-meta inline-flex items-center font-bold text-action">
                      Chiama {a.phone}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="t-meta mt-10">
        Nessuna commissione: il prezzo lo concordi direttamente con il professionista che scegli. Hai cambiato idea o il lavoro è già fatto? Rispondi
        all&apos;email di conferma e chiudiamo la richiesta.
      </p>
    </div>
  );
}
