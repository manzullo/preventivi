import type { Metadata } from "next";
import Link from "next/link";
import { Button, Kicker } from "@/design/ui";
import { PROMISE } from "@/lib/cta";
import { firma } from "@/lib/crypto";
import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { paths } from "@/lib/site";
import { pagineEsistenti } from "@/modules/directory/pages";
import { pageMeta } from "@/modules/directory/seo";
import { parseFormConfig } from "@/modules/leadforms/schema";
import { ConversionFire } from "./ConversionFire";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "Richiesta ricevuta",
  description: "Abbiamo ricevuto la richiesta.",
  path: paths.thanks(),
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;

// Etichette leggibili per le risposte chiuse del form di default.
const BUDGET: Record<string, string> = { lt200: "meno di 200 €", "200-1000": "200 – 1.000 €", "1000-5000": "1.000 – 5.000 €", gt5000: "oltre 5.000 €", unknown: "budget da definire" };
const TIMING: Record<string, string> = { urgent: "urgente", now: "entro una settimana", "1m": "entro un mese", "3m": "entro tre mesi", explore: "tempi flessibili" };

const NEXT = [
  ["Entro un giorno lavorativo", "scegliamo fino a 3 professionisti in base alle recensioni pubbliche e ti scriviamo la selezione."],
  ["I professionisti ti contattano direttamente", "di solito con una chiamata breve. Ti scrivono solo loro, mai altri."],
  ["Confronti i preventivi con calma", "nessuna commissione, nessun intermediario, nessun obbligo."],
];

const QUESTIONS = [
  "Cosa è compreso nel prezzo, e cosa no?",
  "Quando può iniziare e quanto ci mette?",
  "Che garanzia dà sul lavoro?",
  "Serve un sopralluogo prima del preventivo?",
];

export default async function ThanksPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const leadId = Array.isArray(sp.lead) ? sp.lead[0] : sp.lead;
  const lead = leadId
    ? await db.lead.findUnique({
        where: { id: leadId },
        include: { form: { include: { conversions: { where: { enabled: true } } } }, service: true, city: true, submission: { select: { answers: true } } },
      })
    : null;
  const config = lead?.form ? parseFormConfig(lead.form.config) : parseFormConfig({});
  const firstName = lead?.name?.split(" ")[0];
  // La classifica si propone solo se esiste: sotto PUBLISH_THRESHOLD la pagina
  // servizio × città non viene generata, e il bottone finirebbe su un 404.
  const paio = lead?.service && lead.city ? paths.serviceCity(lead.service.slug, lead.city.slug) : null;
  const classificaHref = paio && (await pagineEsistenti([paio])).has(paio) ? paio : null;
  const smtp = await settings.smtp();
  const mailSent = Boolean(smtp.host && smtp.from);
  const posts = await db.page.findMany({ where: { kind: "blog", published: true }, orderBy: { publishedAt: "desc" }, take: 2, select: { slug: true, title: true } });
  const recap = lead
    ? [
        [lead.service?.plural, lead.city?.name].filter(Boolean).join(" a "),
        lead.budget ? (BUDGET[lead.budget] ?? lead.budget) : null,
        lead.timing ? (TIMING[lead.timing] ?? lead.timing) : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <div className="text-center">
        <Kicker className="mb-3">Fatto</Kicker>
        <h1 className="t-h1">
          {config.successTitle}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="t-lead mx-auto mt-4 max-w-xl">{config.successMessage}</p>
        {recap.length > 0 && (
          <p className="t-meta mt-3">
            Richiesta: {recap.join(" · ")} · codice {lead!.id.slice(-8)}
          </p>
        )}
        {lead && (
          <div className="mt-6">
            <Button href={paths.request(lead.id, firma(lead.id))} arrow>
              Segui la tua richiesta
            </Button>
            <p className="t-meta mt-2">Vedi a chi è arrivata e chi ha già risposto. Il link è anche nell&apos;email.</p>
          </div>
        )}
        {lead?.email && mailSent && <p className="t-meta mt-1">Ti abbiamo scritto a {lead.email}: se non trovi l&apos;email, guarda nella posta indesiderata.</p>}
      </div>

      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {NEXT.map(([t, d], i) => (
          <li key={t} className="rounded-card border border-line bg-canvas p-5">
            <p className="t-kicker mb-2">0{i + 1}</p>
            <p className="t-title">{t}</p>
            <p className="t-body mt-1 text-ink-2">{d}</p>
          </li>
        ))}
      </ol>
      <p className="t-meta mt-3 text-center">{PROMISE}</p>

      <section className="mt-10 rounded-panel bg-surface p-6 sm:p-8">
        <p className="t-kicker mb-2">Intanto preparati</p>
        <p className="t-title">Quattro domande da fare a ogni professionista</p>
        <ul className="t-body mt-3 grid gap-2 text-ink-2 sm:grid-cols-2">
          {QUESTIONS.map((q) => (
            <li key={q} className="flex gap-2">
              <span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-pill bg-action" />
              {q}
            </li>
          ))}
        </ul>
        <p className="t-meta mt-3">Se una risposta è vaga, passa alla prossimo professionista.</p>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {classificaHref ? (
          <Button href={classificaHref} variant="outline">
            Intanto guarda la classifica
          </Button>
        ) : (
          <Button href="/" variant="outline">
            Torna alla home
          </Button>
        )}
        <Link href={paths.methodology()} className="t-meta inline-flex items-center font-bold text-action">
          Come scegliamo i professionisti →
        </Link>
      </div>
      {posts.length > 0 && (
        <p className="t-meta mt-6 text-center">
          Dal blog:{" "}
          {posts.map((p, i) => (
            <span key={p.slug}>
              {i > 0 && " · "}
              <Link href={`/blog/${p.slug}/`} className="font-semibold text-action">{p.title}</Link>
            </span>
          ))}
        </p>
      )}

      {lead && lead.status !== "rejected" && (
        <ConversionFire
          p={{
            leadId: lead.id,
            formSlug: lead.form?.slug ?? "preventivo",
            clientId: lead.clientId ?? config.clientId,
            eventType: lead.eventType ?? config.eventType,
            value: lead.value,
            currency: lead.currency,
            serviceSlug: lead.service?.slug,
            citySlug: lead.city?.slug,
            email: lead.email,
            phone: lead.phone,
            name: lead.name,
            gclid: lead.gclid,
            campaign: lead.utmCampaign,
            keyword: lead.utmTerm,
            answers: (lead.submission?.answers as Record<string, unknown> | null) ?? undefined,
            conversions: (lead.form?.conversions ?? []).map((c) => ({ gadsId: c.gadsId, gadsLabel: c.gadsLabel, value: c.value, currency: c.currency })),
            gtmId: config.gtmId,
            gtmMode: config.gtmMode,
            ga4Id: config.ga4Id,
          }}
        />
      )}
    </div>
  );
}
