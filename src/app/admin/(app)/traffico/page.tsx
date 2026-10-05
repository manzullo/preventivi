// Analisi del traffico: da dove entra la gente, cosa guarda, cosa porta a una
// richiesta.
//
// La pagina Visite elenca le sessioni una per una e Performance guarda il
// funnel dei moduli. Qui si guarda l'insieme: quali pagine fanno entrare, quali
// vengono lette, quali professionisti si fanno guardare. L'ultima tabella è quella che
// serve quando si parla di visibilità a pagamento, perché dice chi riceve
// attenzione e chi no.

import Link from "next/link";
import { Chip } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";
import { FAMIGLIE, classificaSorgente, type Famiglia } from "@/modules/directory/sorgenti";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const TD = "px-3 py-2 align-top";
const PERIODI: Record<string, { giorni: number; nome: string }> = {
  "7": { giorni: 7, nome: "7 giorni" },
  "30": { giorni: 30, nome: "30 giorni" },
  "90": { giorni: 90, nome: "90 giorni" },
  tutto: { giorni: 3650, nome: "Da sempre" },
};

/** Quota sul totale, per confrontare le righe a colpo d'occhio. */
function Barra({ parte, totale }: { parte: number; totale: number }) {
  const q = totale > 0 ? Math.round((parte / totale) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-pill bg-surface">
        <span className="block h-full rounded-pill bg-action" style={{ width: `${Math.max(2, q)}%` }} />
      </span>
      <span className="t-meta tabular-nums text-ink-3">{q}%</span>
    </span>
  );
}

function Scheda({ titolo, valore, nota }: { titolo: string; valore: string; nota?: string }) {
  return (
    <div className="rounded-card border border-line bg-canvas p-5">
      <p className="t-kicker">{titolo}</p>
      <p className="t-h2 mt-1">{valore}</p>
      {nota && <p className="t-meta mt-1 text-ink-3">{nota}</p>}
    </div>
  );
}

export default async function TrafficoPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const chiave = first(sp.periodo) ?? "30";
  const periodo = PERIODI[chiave] ?? PERIODI["30"];
  const da = new Date(Date.now() - periodo.giorni * 24 * 3600 * 1000);

  // Filtri che si sommano: si sceglie una sorgente, una pagina di ingresso, o
  // tutte e due insieme per rispondere a "chi entra da /web-agency/roma/, da
  // dove arriva davvero".
  const sorgente = first(sp.sorgente) ?? "";
  const ingresso = first(sp.ingresso) ?? "";
  const conMie = first(sp.mie) === "1";

  const dentro = {
    createdAt: { gte: da },
    ...(conMie ? {} : { interna: false }),
    ...(ingresso ? { landingPath: ingresso } : {}),
  };

  // La famiglia di provenienza si ricava dal referrer, che è testo libero:
  // non si può filtrare nel database, quindi le visite del periodo si leggono
  // una volta e si classificano qui.
  const tutte = await db.visit.findMany({
    where: dentro,
    select: { sessionId: true, landingPath: true, referrer: true, utmSource: true, utmMedium: true, gclid: true, createdAt: true },
  });
  const conSorgente = tutte.map((v) => ({ ...v, sorgente: classificaSorgente(v) }));
  const selezionate = sorgente ? conSorgente.filter((v) => v.sorgente.famiglia === sorgente) : conSorgente;
  const sessioniSorgente = new Set(selezionate.map((v) => v.sessionId));
  // Gli eventi hanno una loro colonna e non conoscono la provenienza: quando si
  // filtra per sorgente o per pagina di ingresso, le sessioni ammesse arrivano
  // dalle visite.
  // I lead non hanno né la colonna delle visite interne né la provenienza:
  // l'unico filtro che li riguarda è il periodo, più la pagina da cui hanno
  // inviato quando si sta guardando una pagina di ingresso precisa.
  const dentroLead = { createdAt: { gte: da }, ...(ingresso ? { landingPath: ingresso } : {}) };

  const filtraPerVisita = Boolean(sorgente || ingresso);
  const sessioniAmmesse = filtraPerVisita ? [...sessioniSorgente] : null;
  const dentroEventi = {
    createdAt: { gte: da },
    ...(conMie ? {} : { interno: false }),
    ...(sessioniAmmesse ? { sessionId: { in: sessioniAmmesse } } : {}),
  };

  const [sessioni, pagineViste, lead, viste, schede, click, leadPerIngresso] =
    await Promise.all([
      db.analyticsEvent.findMany({ where: dentroEventi, select: { sessionId: true }, distinct: ["sessionId"] }),
      db.analyticsEvent.count({ where: { ...dentroEventi, type: "page_view" } }),
      db.lead.count({ where: dentroLead }),
      db.analyticsEvent.groupBy({
        by: ["path"],
        where: { ...dentroEventi, type: "page_view" },
        _count: true,
        orderBy: { _count: { path: "desc" } },
        take: 25,
      }),
      // Quante volte una scheda è finita sotto gli occhi di qualcuno…
      db.analyticsEvent.groupBy({
        by: ["agencyId"],
        where: { ...dentroEventi, type: "impression", agencyId: { not: null } },
        _count: true,
        orderBy: { _count: { agencyId: "desc" } },
        take: 30,
      }),
      // …e quante volte è stata aperta.
      db.analyticsEvent.groupBy({
        by: ["agencyId"],
        where: { ...dentroEventi, type: "card_click", agencyId: { not: null } },
        _count: true,
      }),
      // La richiesta si attribuisce alla pagina da cui è cominciata la visita,
      // non a quella da cui è stato inviato il modulo: chi entra da un elenco e
      // poi apre il modulo altrimenti non viene contato da nessuna parte.
      db.lead.findMany({
        where: dentroLead,
        select: { landingPath: true, submission: { select: { visit: { select: { landingPath: true } } } } },
      }),
    ]);

  const visite = selezionate.length;

  // Pagine di ingresso, calcolate sulle visite selezionate.
  const contaIngressi = new Map<string, number>();
  for (const v of selezionate) {
    const k = v.landingPath ?? "(non registrata)";
    contaIngressi.set(k, (contaIngressi.get(k) ?? 0) + 1);
  }
  const ingressi = [...contaIngressi.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);

  // Provenienze per famiglia e, dentro ognuna, per nome.
  const perFamiglia = new Map<Famiglia, number>();
  const perNome = new Map<string, { nome: string; famiglia: Famiglia; n: number }>();
  for (const v of conSorgente) {
    perFamiglia.set(v.sorgente.famiglia, (perFamiglia.get(v.sorgente.famiglia) ?? 0) + 1);
    const k = `${v.sorgente.famiglia}|${v.sorgente.nome}`;
    const r = perNome.get(k) ?? { nome: v.sorgente.nome, famiglia: v.sorgente.famiglia, n: 0 };
    r.n += 1;
    perNome.set(k, r);
  }
  const nomiSorgente = [...perNome.values()].sort((a, b) => b.n - a.n).slice(0, 15);

  const leadDi = new Map<string, number>();
  for (const l of leadPerIngresso) {
    const pagina = l.submission?.visit?.landingPath ?? l.landingPath;
    if (pagina) leadDi.set(pagina, (leadDi.get(pagina) ?? 0) + 1);
  }
  const clickDi = new Map(click.map((c) => [c.agencyId, c._count]));

  const idsAgenzie = schede.map((s) => s.agencyId).filter((x): x is string => Boolean(x));

  const nomiAgenzie = new Map(
    idsAgenzie.length
      ? (
          await db.agency.findMany({ where: { id: { in: idsAgenzie } }, select: { id: true, name: true } })
        ).map((a) => [a.id, a])
      : [],
  );

  // Le schede cancellate dopo essere state viste restano negli eventi: si
  // tengono fuori dalla tabella e si contano in coda, per non far sembrare che
  // manchino dei nomi.
  const schedeVive = schede.filter((r) => r.agencyId && nomiAgenzie.has(r.agencyId));
  const schedeSparite = schede.length - schedeVive.length;

  // Andamento giorno per giorno: le visite si contano in memoria perché
  // raggrupparle per data in Prisma richiederebbe SQL grezzo.
  const righeGrafico = await db.visit.findMany({ where: dentro, select: { createdAt: true } });
  const perGiorno = new Map<string, number>();
  for (let i = periodo.giorni - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    if (periodo.giorni <= 90) perGiorno.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of righeGrafico) {
    const k = r.createdAt.toISOString().slice(0, 10);
    if (perGiorno.has(k) || periodo.giorni > 90) perGiorno.set(k, (perGiorno.get(k) ?? 0) + 1);
  }
  const grafico = [...perGiorno.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxGiorno = Math.max(1, ...grafico.map(([, n]) => n));

  // Incrocio: per ogni pagina di ingresso, da dove arrivano quelle visite.
  const perIncrocio = await db.visit.findMany({
    where: dentro,
    select: { landingPath: true, utmSource: true, gclid: true, referrer: true },
  });
  const incrocio = new Map<string, { ads: number; campagna: number; referral: number; diretto: number; tot: number }>();
  for (const v of perIncrocio) {
    const k = v.landingPath ?? "(non registrata)";
    const r = incrocio.get(k) ?? { ads: 0, campagna: 0, referral: 0, diretto: 0, tot: 0 };
    if (v.gclid) r.ads += 1;
    else if (v.utmSource) r.campagna += 1;
    else if (v.referrer) r.referral += 1;
    else r.diretto += 1;
    r.tot += 1;
    incrocio.set(k, r);
  }
  const incroci = [...incrocio.entries()].sort((a, b) => b[1].tot - a[1].tot).slice(0, 15);

  const conversione = visite > 0 ? ((lead / visite) * 100).toFixed(1) : "0";
  const qs = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ periodo: chiave });
    if (sorgente) q.set("sorgente", sorgente);
    if (ingresso) q.set("ingresso", ingresso);
    if (conMie) q.set("mie", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/admin/traffico/?${q.toString()}`;
  };

  return (
    <div className="max-w-6xl">
      <h1 className="t-h1">Traffico</h1>
      <p className="t-meta mt-1">Da dove entra la gente, cosa guarda, cosa porta a una richiesta.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(PERIODI).map(([k, v]) => (
          <Chip key={k} href={qs({ periodo: k })} active={chiave === k}>
            {v.nome}
          </Chip>
        ))}
      </div>

      {/* Come i filtri del sito: ogni voce porta il suo numero, e quelle a zero
          restano visibili ma spente invece di sparire. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="t-kicker mr-1 text-ink-3">Sorgente</span>
        <Chip href={qs({ sorgente: "" })} active={!sorgente} count={conSorgente.length}>
          Tutte
        </Chip>
        {FAMIGLIE.map((f) => {
          const n = perFamiglia.get(f.chiave) ?? 0;
          return n === 0 && sorgente !== f.chiave ? (
            <span key={f.chiave} className="t-meta rounded-pill border border-line px-3 py-1.5 text-ink-3" title={f.spiega}>
              {f.nome} 0
            </span>
          ) : (
            <Chip key={f.chiave} href={qs({ sorgente: f.chiave })} active={sorgente === f.chiave} count={n}>
              {f.nome}
            </Chip>
          );
        })}
      </div>
      {sorgente && (
        <p className="t-meta mt-2 text-ink-2">
          {FAMIGLIE.find((f) => f.chiave === sorgente)?.spiega}. Tutto quello che segue riguarda solo queste visite.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="t-kicker mr-1 text-ink-3">Le mie visite</span>
        <Chip href={qs({ mie: "" })} active={!conMie}>
          Escluse
        </Chip>
        <Chip href={qs({ mie: "1" })} active={conMie}>
          Contale
        </Chip>
        {ingresso && (
          <>
            <span className="t-kicker ml-3 mr-1 text-ink-3">Ingresso</span>
            <Chip href={qs({ ingresso: "" })} active>
              {ingresso} ×
            </Chip>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Scheda titolo="Visite" valore={fmt(visite)} nota={periodo.nome.toLowerCase()} />
        <Scheda titolo="Sessioni con attività" valore={fmt(sessioni.length)} nota="hanno aperto almeno una pagina" />
        <Scheda titolo="Pagine viste" valore={fmt(pagineViste)} />
        <Scheda titolo="Richieste" valore={fmt(lead)} nota={`${conversione}% delle visite`} />
      </div>

      {grafico.length > 1 && (
        <section className="mt-8 rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-1">Visite giorno per giorno</p>
          <p className="t-meta mb-4 text-ink-3">Punta una barra per vedere la data e il numero.</p>
          <div className="flex h-36 items-end gap-[3px]">
            {grafico.map(([giorno, n]) => (
              <div
                key={giorno}
                title={`${new Date(giorno).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}: ${n} ${n === 1 ? "visita" : "visite"}`}
                className="group flex-1 rounded-t-[3px] bg-action/20 transition-colors hover:bg-action"
                style={{ height: `${Math.max(3, (n / maxGiorno) * 100)}%` }}
              />
            ))}
          </div>
          <div className="t-meta mt-2 flex justify-between text-ink-3">
            <span>{new Date(grafico[0][0]).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span>
            <span>massimo in un giorno: {maxGiorno}</span>
            <span>{new Date(grafico[grafico.length - 1][0]).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span>
          </div>
        </section>
      )}

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-1">Pagine di ingresso</p>
        <p className="t-meta mb-3 text-ink-3">
          La prima pagina aperta in ogni visita, non quella dove si è convertito. Quando qui compare il modulo, vuol
          dire che quella persona è arrivata direttamente lì da un link diretto, senza passare da nessun elenco.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="t-kicker border-b border-line text-left">
              <tr>
                {["Pagina", "Visite", "Quota", "Richieste"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingressi.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-ink-2" colSpan={4}>
                    Nessuna visita nel periodo.
                  </td>
                </tr>
              )}
              {ingressi.map(([pagina, n]) => {
                const richieste = leadDi.get(pagina) ?? 0;
                const vero = pagina !== "(non registrata)";
                return (
                  <tr key={pagina} className="border-b border-line/60">
                    <td className={TD}>
                      {vero ? (
                        <span className="flex flex-wrap items-baseline gap-2">
                          <Link href={qs({ ingresso: pagina })} className="break-all font-semibold text-action">
                            {pagina}
                          </Link>
                          {pagina.startsWith("/preventivo/") && (
                            <span className="t-kicker rounded-pill bg-surface px-2 text-ink-3">link diretto al modulo</span>
                          )}
                          <Link href={pagina} className="t-meta text-ink-3 hover:text-action" target="_blank">
                            apri ↗
                          </Link>
                        </span>
                      ) : (
                        <span className="text-ink-3">{pagina}</span>
                      )}
                    </td>
                    <td className={`${TD} tabular-nums font-semibold`}>{fmt(n)}</td>
                    <td className={TD}>
                      <Barra parte={n} totale={visite} />
                    </td>
                    <td className={`${TD} tabular-nums`}>
                      {richieste > 0 ? <span className="font-bold text-ok-fg">{richieste}</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-1">Da dove arriva chi entra da una certa pagina</p>
        <p className="t-meta mb-3 text-ink-3">
          Entrare direttamente su una pagina non vuol dire arrivare da Google: qui le due cose sono incrociate, così si
          vede quali pagine vivono di ricerca e quali di link o di campagne.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="t-kicker border-b border-line text-left">
              <tr>
                {["Pagina di ingresso", "Totale", "Google Ads", "Campagne", "Da altri siti", "Diretto"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incroci.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-ink-2" colSpan={6}>
                    Nessuna visita nel periodo.
                  </td>
                </tr>
              )}
              {incroci.map(([pagina, r]) => (
                <tr key={pagina} className="border-b border-line/60">
                  <td className={TD}>
                    <Link href={qs({ ingresso: pagina })} className="break-all text-action">
                      {pagina}
                    </Link>
                  </td>
                  <td className={`${TD} tabular-nums font-semibold`}>{fmt(r.tot)}</td>
                  <td className={`${TD} tabular-nums`}>{r.ads || "—"}</td>
                  <td className={`${TD} tabular-nums`}>{r.campagna || "—"}</td>
                  <td className={`${TD} tabular-nums`}>{r.referral || "—"}</td>
                  <td className={`${TD} tabular-nums text-ink-2`}>{r.diretto || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-meta mt-3 text-ink-3">
          &laquo;Diretto&raquo; qui significa senza provenienza registrata: indirizzo digitato, segnalibro, un link da
          un&apos;applicazione, oppure una visita ricostruita.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-1">Pagine più viste</p>
          <p className="t-meta mb-3 text-ink-3">Tutte le aperture, non solo la prima della visita.</p>
          <table className="w-full text-sm">
            <tbody>
              {viste.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-ink-2">Nessun dato nel periodo.</td>
                </tr>
              )}
              {viste.map((r) => (
                <tr key={r.path ?? "?"} className="border-b border-line/60">
                  <td className={TD}>
                    {r.path ? (
                      <Link href={r.path} className="break-all text-action" target="_blank">
                        {r.path}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap tabular-nums font-semibold`}>{fmt(r._count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-card border border-line bg-canvas p-5">
          <p className="t-kicker mb-1">Chi manda traffico</p>
          <p className="t-meta mb-3 text-ink-3">
            Il nome preciso dietro ogni famiglia. Le quote sono sul totale del periodo, filtri di sorgente esclusi.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {nomiSorgente.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-ink-2">Nessun dato nel periodo.</td>
                </tr>
              )}
              {nomiSorgente.map((r) => (
                <tr key={`${r.famiglia}-${r.nome}`} className="border-b border-line/60">
                  <td className={TD}>
                    <Link href={qs({ sorgente: r.famiglia })} className="text-action">
                      {r.nome}
                    </Link>
                  </td>
                  <td className={`${TD} whitespace-nowrap tabular-nums font-semibold`}>{fmt(r.n)}</td>
                  <td className={TD}>
                    <Barra parte={r.n} totale={conSorgente.length} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <p className="t-kicker mb-1">Professionisti più guardate</p>
        <p className="t-meta mb-3 text-ink-3">
          Quante volte una scheda è comparsa negli elenchi e quante volte è stata aperta. È il dato da mettere sul
          tavolo quando si parla di visibilità a pagamento.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="t-kicker border-b border-line text-left">
              <tr>
                {["Professionista", "Comparsa", "Aperta", "Su 100 volte che compare"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedeVive.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-ink-2" colSpan={4}>
                    Nessun dato nel periodo.
                  </td>
                </tr>
              )}
              {schedeVive.map((r) => {
                const a = nomiAgenzie.get(r.agencyId!)!;
                const aperture = clickDi.get(r.agencyId) ?? 0;
                const tasso = r._count > 0 ? ((aperture / r._count) * 100).toFixed(1) : "0";
                return (
                  <tr key={r.agencyId ?? "?"} className="border-b border-line/60">
                    <td className={TD}>
                      <Link href={`/admin/agenzie/${a.id}/`} className="font-semibold text-action">
                        {a.name}
                      </Link>
                    </td>
                    <td className={`${TD} tabular-nums`}>{fmt(r._count)}</td>
                    <td className={`${TD} tabular-nums font-semibold`}>{aperture > 0 ? fmt(aperture) : "—"}</td>
                    <td className={`${TD} tabular-nums text-ink-2`}>{tasso}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {schedeSparite > 0 && (
        <p className="t-meta mt-2 text-ink-3">
          Escluse {schedeSparite} schede cancellate dopo essere state viste.
        </p>
      )}

      <p className="t-meta mt-6 text-ink-3">
        Le pagine viste si contano dal 17 settembre 2026, quando ogni pagina ha iniziato a lasciare una riga: prima
        risultavano viste solo quelle con la fascia in cima. Le visite si contano dalla prima pagina aperta sempre dal
        17 settembre 2026. Prima venivano registrate solo
        all&apos;apertura del modulo: quelle recuperate dagli eventi si riconoscono in{" "}
        <Link href="/admin/visite/?filtro=ricostruite" className="text-action">
          Visite
        </Link>
        .
      </p>
    </div>
  );
}
