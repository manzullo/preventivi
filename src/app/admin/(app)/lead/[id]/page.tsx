import Link from "next/link";
import { notFound } from "next/navigation";
import { setLeadStatus } from "@/app/admin/actions";
import { Button } from "@/design/ui";
import { db } from "@/lib/db";
import { STATUS_LABEL, StatusBadge } from "../LeadTable";
import { AdsPanel } from "./AdsPanel";
import { AssignPanel } from "./AssignPanel";
import { suggestAgencies } from "@/modules/leads/assign";
import { percorsoLead } from "@/modules/leads/percorso";

export const dynamic = "force-dynamic";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-ink-2">{k}</dt>
      <dd className="text-right font-medium">{v ?? "—"}</dd>
    </div>
  );
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LeadDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const l = await db.lead.findUnique({
    where: { id },
    include: { service: true, city: true, agency: true, form: { select: { name: true, slug: true } }, submission: true, notificationLogs: { include: { notification: true }, orderBy: { createdAt: "desc" } }, uploads: true, assignments: { include: { agency: { select: { id: true, slug: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!l) notFound();
  const suggestions = await suggestAgencies(l.id, 5);
  const percorso = await percorsoLead(l.id);
  // La pagina di ingresso vera è il primo passo del percorso: quella salvata
  // sul lead è dove stava quando ha inviato.
  const ingresso = percorso?.passi.find((x) => x.landing)?.path ?? null;
  const answers = (l.submission?.answers ?? {}) as Record<string, unknown>;
  // La casella del modulo, salvata insieme ai contatti: senza, non potremmo
  // dimostrare di aver chiesto il permesso prima di girare la richiesta.
  const contatto = (l.submission?.contact ?? {}) as Record<string, unknown>;
  const consenso = contatto.consenso === "1" || contatto.consenso === true;
  // Il testo fotografato al momento dell'invio. I lead raccolti prima che lo
  // salvassimo non ce l'hanno: per quelli si mostra la frase in uso oggi nel
  // modulo, dicendo chiaramente che è quella attuale e non quella letta allora.
  const testoRegistrato = typeof contatto.consenso_testo === "string" ? contatto.consenso_testo : null;
  const passoContatti = l.form
    ? await db.formStep.findFirst({
        where: { form: { slug: l.form.slug }, type: "contact" },
        select: { config: true },
      })
    : null;
  const testoOggi = ((passoContatti?.config ?? {}) as { consentText?: string }).consentText ?? null;
  return (
    <div className="max-w-5xl">
      <Link href="/admin/lead/" className="t-meta font-bold text-action">
        ← Lead
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="t-h1">{l.name ?? "Lead senza nome"}</h1>
        <StatusBadge status={l.status} />
        {l.submission?.testMode && <span className="t-kicker text-warn-fg">test</span>}
      </div>
      {msg && <p className="mb-4 rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}

      {percorso && (
        <section className="mb-6 rounded-card border border-line bg-canvas p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="t-kicker">Percorso fino alla richiesta</p>
            <p className="t-meta text-ink-3">
              {percorso.sorgente}
              {percorso.device ? ` · ${percorso.device}` : ""}
              {percorso.arrivo ? ` · arrivo ${percorso.arrivo.toLocaleString("it-IT")}` : ""}
            </p>
          </div>

          {percorso.atterratoAltrove && (
            <p className="t-meta mb-3 rounded-slot bg-tonal px-3 py-2 text-ink-2">
              È entrato da una pagina diversa da quella dell&apos;professionista richiesto: l&apos;ha trovata girando il sito.
            </p>
          )}

          <ol className="relative space-y-0 border-l border-line pl-5">
            {percorso.passi.map((x, i) => (
              <li key={i} className="relative py-1.5">
                <span
                  className={`absolute -left-[1.4rem] top-3 size-2 rounded-full ${x.finale ? "bg-action" : "bg-line"}`}
                  aria-hidden
                />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="t-body font-semibold text-ink">{x.titolo}</span>
                  {x.dettaglio && <span className="t-meta text-ink-2">{x.dettaglio}</span>}
                  {x.landing && <span className="t-kicker rounded-pill bg-surface px-2 text-ink-3">ingresso</span>}
                  <span className="t-meta ml-auto text-ink-3">{x.quando.toLocaleTimeString("it-IT")}</span>
                </div>
                {x.path && <code className="t-meta block break-all text-ink-3">{x.path}</code>}
              </li>
            ))}
          </ol>

          <p className="t-meta mt-3 text-ink-3">
            {percorso.passi.length} {percorso.passi.length === 1 ? "passo" : "passi"} da {percorso.eventi}{" "}
            {percorso.eventi === 1 ? "evento registrato" : "eventi registrati"}. Le schede viste sono contate, non
            elencate una per una.
          </p>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-3">Contatto</p>
          <dl>
            <Row k="Email" v={l.email && <a href={`mailto:${l.email}`} className="text-action">{l.email}</a>} />
            <Row k="Telefono" v={l.phone && <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="text-action">{l.phone}</a>} />
            <Row k="Azienda" v={l.company} />
            <Row k="Ricevuto" v={l.createdAt.toLocaleString("it-IT")} />
            <Row k="Form" v={l.form?.name} />
            <Row
              k="Consenso"
              v={
                consenso ? (
                  <span className="block">
                    <span className="font-semibold text-ok-fg">
                      dato il {l.createdAt.toLocaleString("it-IT")}
                    </span>
                    {(testoRegistrato ?? testoOggi) && (
                      <span className="t-meta mt-1 block rounded-slot bg-surface px-2.5 py-1.5 text-ink-2">
                        «{testoRegistrato ?? testoOggi}»
                        {!testoRegistrato && (
                          <span className="mt-1 block text-warn-fg">
                            testo in uso oggi nel modulo: questa richiesta è precedente alla registrazione della frase
                          </span>
                        )}
                      </span>
                    )}
                    <span className="t-meta mt-1 block text-ink-3">
                      Trattamento dei dati: <Link href="/privacy/" className="text-action">informativa</Link>, accettata
                      insieme alla casella.
                    </span>
                  </span>
                ) : (
                  <span className="font-semibold text-warn-fg">
                    non risulta: la casella non era spuntata
                  </span>
                )
              }
            />
          </dl>
        </section>
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-3">Richiesta</p>
          <dl>
            <Row k="Servizio" v={l.service?.plural} />
            <Row k="Città" v={l.city?.name} />
            <Row k="Professionista richiesto" v={l.agency && <Link href={`/agenzia/${l.agency.slug}/`} className="text-action">{l.agency.name}</Link>} />
            <Row k="Budget" v={l.budget} />
            <Row k="Tempi" v={l.timing} />
            <Row k="Valore stimato" v={l.value !== null ? `${l.value} ${l.currency}` : null} />
          </dl>
          {l.description && <p className="t-body mt-3 whitespace-pre-line rounded-slot bg-surface p-3 text-ink-2">{l.description}</p>}
        </section>
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-3">Attribuzione</p>
          <dl>
            <Row k="Sorgente / mezzo" v={[l.utmSource, l.utmMedium].filter(Boolean).join(" / ")} />
            <Row k="Campagna" v={l.utmCampaign} />
            <Row k="Keyword" v={l.utmTerm} />
            <Row k="gclid" v={l.gclid && <code className="text-xs">{l.gclid}</code>} />
            <Row k="Sito di origine" v={l.clientId} />
            {/* Due cose diverse che prima si chiamavano tutte "landing": da dove
                è entrato nel sito, e da quale pagina ha poi mandato la richiesta. */}
            <Row
              k="Pagina di ingresso"
              v={
                ingresso ? (
                  <span className="block">
                    <code className="text-xs break-all">{ingresso}</code>
                    <span className="t-meta mt-0.5 block text-ink-3">
                      la prima pagina che ha aperto
                      {percorso?.atterratoAltrove ? ", diversa da quella del professionista richiesto" : ""}
                    </span>
                  </span>
                ) : (
                  <span className="t-meta text-ink-3">non registrata</span>
                )
              }
            />
            <Row
              k="Inviato da"
              v={
                l.landingPath && (
                  <span className="block">
                    <code className="text-xs break-all">{l.landingPath}</code>
                    <span className="t-meta mt-0.5 block text-ink-3">la pagina in cui ha compilato il modulo</span>
                  </span>
                )
              }
            />
          </dl>
        </section>
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-3">Stato</p>
          <form action={setLeadStatus} className="space-y-3">
            <input type="hidden" name="id" value={l.id} />
            <select name="status" defaultValue={l.status} className="w-full rounded-slot border-[1.5px] border-line px-3 py-2 text-sm">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <label className="block text-sm">
              <span className="t-meta mb-1 block">Prezzo di vendita (€)</span>
              <input type="number" name="soldPrice" defaultValue={l.soldPrice ?? ""} min={0} className="w-full rounded-slot border-[1.5px] border-line px-3 py-2 text-sm" />
            </label>
            <Button type="submit" className="min-h-10 px-5 py-2 text-sm">
              Salva stato
            </Button>
          </form>
        </section>
      </div>

      <section className="mt-6 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-3">Risposte grezze</p>
        <dl>
          {Object.entries(answers).map(([k, v]) => (
            <Row key={k} k={k} v={Array.isArray(v) ? v.join(", ") : String(v)} />
          ))}
        </dl>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-3">Notifiche</p>
          {l.notificationLogs.length === 0 ? (
            <p className="t-meta">Nessuna notifica inviata.</p>
          ) : (
            l.notificationLogs.map((n) => (
              <p key={n.id} className="text-sm">
                {n.createdAt.toLocaleString("it-IT")} · {n.notification.name} · {n.status}
                {n.error ? ` · ${n.error}` : ""}
              </p>
            ))
          )}
        </div>
        <AdsPanel leadId={l.id} gclid={l.gclid} adsMeta={(l.adsMeta as Record<string, unknown> | null) ?? null} uploads={l.uploads} />
      </section>
      <AssignPanel leadId={l.id} assignments={l.assignments} suggestions={suggestions} />
    </div>
  );
}
