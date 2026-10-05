// Pagina per il professionista: la richiesta arrivata via email, con accetta/rifiuta
// senza login. Il contatto del cliente compare solo dopo l'accettazione.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Kicker } from "@/design/ui";
import { db } from "@/lib/db";
import { PROMISE } from "@/lib/cta";
import { paths } from "@/lib/site";
import { acceptLeadAction, declineLeadAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Richiesta per la vostra attività", robots: { index: false, follow: false } };

const BUDGET: Record<string, string> = { lt200: "meno di 200 €", "200-1000": "200 – 1.000 €", "1000-5000": "1.000 – 5.000 €", gt5000: "oltre 5.000 €", unknown: "da definire" };
const TIMING: Record<string, string> = { urgent: "urgente", now: "entro una settimana", "1m": "entro un mese", "3m": "entro tre mesi", explore: "flessibile" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-ink-2">{k}</dt>
      <dd className="text-right font-medium">{v ?? "—"}</dd>
    </div>
  );
}

export default async function LeadResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const a = await db.leadAssignment.findUnique({ where: { token }, include: { agency: { select: { name: true, slug: true } }, lead: { include: { service: true, city: true } } } });
  if (!a) notFound();
  const expired = a.tokenExpiresAt ? a.tokenExpiresAt < new Date() : false;
  const l = a.lead;
  const open = a.status === "proposed" || a.status === "sent";

  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <Kicker className="mb-2">Per {a.agency.name}</Kicker>
      <h1 className="t-h1">Richiesta: {[l.service?.plural, l.city?.name].filter(Boolean).join(" a ") || "progetto"}</h1>
      <p className="t-lead mt-3">Un cliente ha descritto il lavoro su Mister Wolf e vi abbiamo selezionati tra i professionisti con le recensioni migliori. {PROMISE}</p>

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-3">Il progetto</p>
        <dl>
          <Row k="Servizio" v={l.service?.plural} />
          <Row k="Città" v={l.city?.name} />
          <Row k="Budget indicato" v={l.budget ? (BUDGET[l.budget] ?? l.budget) : null} />
          <Row k="Partenza" v={l.timing ? (TIMING[l.timing] ?? l.timing) : null} />
          <Row k="Azienda" v={l.company} />
          <Row k="Ricevuta il" v={l.createdAt.toLocaleDateString("it-IT")} />
        </dl>
        {l.description && <p className="t-body mt-3 whitespace-pre-line rounded-slot bg-surface p-3 text-ink-2">{l.description}</p>}
      </section>

      {a.status === "accepted" && (
        <section className="mt-6 rounded-card border border-line bg-canvas p-5">
          <div className="mb-3 flex items-center gap-2"><p className="t-kicker">Contatto del cliente</p><Badge>Accettata</Badge></div>
          <dl>
            <Row k="Nome" v={l.name} />
            <Row k="Email" v={l.email && <a href={`mailto:${l.email}`} className="text-action">{l.email}</a>} />
            <Row k="Telefono" v={l.phone && <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="text-action">{l.phone}</a>} />
          </dl>
          <p className="t-meta mt-3">Il cliente aspetta al massimo tre proposte: chi risponde prima parte avvantaggiato. Nessuna commissione da parte nostra sul lavoro.</p>
        </section>
      )}

      {a.status === "declined" && <p className="t-body mt-6 rounded-slot bg-surface p-4 text-ink-2">Avete rifiutato questa richiesta. Se cambiate idea scriveteci indicando il riferimento {l.id.slice(-8)}.</p>}

      {open && expired && <p className="t-body mt-6 rounded-slot bg-surface p-4 text-ink-2">Il link è scaduto. Scriveteci con il riferimento {l.id.slice(-8)} e ve lo rimandiamo.</p>}

      {open && !expired && (
        <section className="mt-6 rounded-panel bg-surface p-6">
          <p className="t-title">Vi interessa questo progetto?</p>
          <p className="t-body mt-1 text-ink-2">Accettando vedete subito nome, email e telefono e contattate il cliente direttamente.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={acceptLeadAction}><input type="hidden" name="token" value={token} /><Button type="submit" arrow>Accetto, mostrami il contatto</Button></form>
            <form action={declineLeadAction}><input type="hidden" name="token" value={token} /><Button type="submit" variant="outline">Non mi interessa</Button></form>
          </div>
        </section>
      )}

      <p className="t-meta mt-8">
        Riferimento {l.id.slice(-8)} · <Link href={paths.agency(a.agency.slug)} className="font-semibold text-action">la vostra scheda</Link> · <Link href={paths.methodology()} className="font-semibold text-action">come selezioniamo</Link>
      </p>
    </div>
  );
}
