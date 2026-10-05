// I servizi della directory: sono le tassonomie che generano le pagine e le
// voci di ricerca. Qui si aggiungono, si rinominano, si spengono.
import Link from "next/link";
import { Button } from "@/design/ui";
import { db } from "@/lib/db";
import { requireRuolo } from "@/lib/auth";
import { fmt, paths } from "@/lib/site";
import { competenze } from "@/modules/directory/skills";
import { competenzaAServizio, creaAlias, creaServizio, rinominaCompetenza, salvaAlias, salvaServizio, togliAlias, togliCompetenza, togliServizio } from "./actions";

export const dynamic = "force-dynamic";

const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";

type Search = Promise<{ msg?: string; modifica?: string }>;

function F({ label, children, hint, wide }: { label: string; children: React.ReactNode; hint?: string; wide?: boolean }) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="t-meta mb-1 block text-ink">{label}</span>
      {children}
      {hint && <span className="t-meta mt-1 block">{hint}</span>}
    </label>
  );
}

const query = (v: unknown): string => (Array.isArray(v) ? (v as string[]).join("\n") : "");

export default async function Tassonomie({ searchParams }: { searchParams: Search }) {
  await requireRuolo("owner", "editor");
  const sp = await searchParams;

  const servizi = await db.service.findMany({
    orderBy: [{ active: "desc" }, { position: "asc" }],
    include: {
      _count: { select: { agencies: true, pages: true, leads: true } },
      aliases: { orderBy: [{ position: "asc" }, { label: "asc" }] },
    },
  });
  const inModifica = sp.modifica ? servizi.find((s) => s.id === sp.modifica) : null;
  // Le competenze non stanno in una tabella: si contano leggendo le schede.
  const skills = await competenze({ min: 1 });

  return (
    <div className="max-w-5xl">
      <h1 className="t-h1">Tassonomie</h1>
      <p className="t-body mt-2 max-w-3xl text-ink-2">
        Sono le tassonomie del sito: ognuna ha la sua pagina, entra nel menu e nella ricerca, e si incrocia con le
        città per creare le pagine locali. Una pagina nasce quando il servizio ha almeno tre professionisti: prima resta
        invisibile, così non pubblichiamo elenchi vuoti.
      </p>

      {sp.msg && <p className="mt-4 rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{sp.msg}</p>}

      <section className="mt-8 rounded-card border border-line bg-canvas p-5">
        <h2 className="t-h3">{inModifica ? `Modifica: ${inModifica.plural}` : "Aggiungi un servizio"}</h2>
        <form action={inModifica ? salvaServizio : creaServizio} className="mt-4 grid gap-4 sm:grid-cols-2">
          {inModifica && <input type="hidden" name="id" value={inModifica.id} />}

          <F label="Nome al plurale" hint="quello che si legge in cima alla pagina: Professionisti LLM marketing">
            <input name="plural" required className={IN} defaultValue={inModifica?.plural ?? ""} placeholder="Professionisti LLM marketing" />
          </F>
          <F label="Nome corto" hint="come si chiama il servizio dentro le schede: LLM marketing">
            <input name="name" className={IN} defaultValue={inModifica?.name ?? ""} placeholder="LLM marketing" />
          </F>

          {inModifica ? (
            <F label="Indirizzo" hint="non si cambia: i motori di ricerca hanno già questa pagina">
              <input className={`${IN} opacity-60`} defaultValue={`/${inModifica.slug}/`} disabled />
            </F>
          ) : (
            <F label="Indirizzo" hint="vuoto = ricavato dal nome, per esempio /agenzie-llm-marketing/">
              <input name="slug" className={IN} placeholder="agenzie-llm-marketing" />
            </F>
          )}

          <F label="Posizione nel menu" hint="numero piccolo = più in alto">
            <input name="position" type="number" className={IN} defaultValue={inModifica?.position ?? 99} />
          </F>

          <F label="Presentazione" wide hint="due righe in cima alla pagina del servizio">
            <textarea name="intro" rows={2} className={IN} defaultValue={inModifica?.intro ?? ""} />
          </F>

          <F label="Come si cerca su Google" wide hint="una per riga, senza la città: servono a trovare nuovi professionisti da importare">
            <textarea
              name="queries"
              rows={3}
              className={IN}
              defaultValue={query(inModifica?.queries)}
              placeholder={"professionista llm marketing\nconsulente geo\nottimizzazione per chatgpt"}
            />
          </F>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={inModifica ? inModifica.active : true} /> attivo, cioè visibile sul sito
          </label>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" className="min-h-10 px-5 py-2 text-sm">
              {inModifica ? "Salva" : "Crea il servizio"}
            </Button>
            {inModifica && (
              <Link href="/admin/tassonomie/" className="t-meta font-semibold text-ink hover:text-action">
                annulla
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="t-h3">I servizi di adesso</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 font-semibold">Servizio</th>
              <th className="py-2 font-semibold">Indirizzo</th>
              <th className="py-2 font-semibold">Professionisti</th>
              <th className="py-2 font-semibold">Pagine</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {servizi.map((s) => (
              <tr key={s.id} className={`border-b border-line align-top ${s.active ? "" : "opacity-60"}`}>
                <td className="py-2 pr-3">
                  <span className="font-semibold text-ink">{s.plural}</span>
                  <span className="t-meta block">{s.name}</span>
                  {!s.active && <span className="t-meta block">spento</span>}
                </td>
                <td className="py-2 pr-3">
                  {s._count.pages > 0 ? (
                    <Link href={paths.service(s.slug)} className="font-semibold text-action">
                      /{s.slug}/
                    </Link>
                  ) : (
                    <span className="t-meta">/{s.slug}/ (nessuna pagina)</span>
                  )}
                </td>
                <td className="py-2 pr-3 tabular-nums">{s._count.agencies}</td>
                <td className="py-2 pr-3 tabular-nums">{s._count.pages}</td>
                <td className="py-2 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Link href={`/admin/tassonomie/?modifica=${s.id}`} className="t-meta font-semibold text-ink hover:text-action">
                      modifica
                    </Link>
                    {s._count.agencies === 0 && s._count.leads === 0 && (
                      <form action={togliServizio}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="t-meta font-semibold text-ink hover:text-action">
                          cancella
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-12">
        <h2 className="t-h3">Come lo chiama la gente</h2>
        <p className="t-body mt-2 max-w-3xl text-ink-2">
          Chi cerca non scrive &quot;professionisti LLM marketing&quot;, scrive &quot;pubblicità su ChatGPT&quot;. Qui si aggiungono i modi
          in cui lo stesso servizio viene chiesto davvero. Valgono subito nella ricerca del sito. Diventano una
          pagina propria solo se gli scrivi un testo suo, almeno duecento caratteri: senza, sarebbe la fotocopia
          della pagina del servizio, e l&apos;indirizzo rimanda lì.
        </p>

        {servizi
          .filter((s) => s.active)
          .map((s) => (
            <div key={s.id} className="mt-6 rounded-card border border-line bg-canvas p-5">
              <p className="t-title">{s.plural}</p>

              {s.aliases.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {s.aliases.map((a) => (
                    <li key={a.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                      <form action={salvaAlias} className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <input type="hidden" name="id" value={a.id} />
                        <div className="grid gap-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <input name="label" defaultValue={a.label} className={`${IN} max-w-xs`} />
                            <span className="t-meta">
                              {a.published ? (
                                <Link href={`/${a.slug}/`} className="font-semibold text-action">/{a.slug}/</Link>
                              ) : (
                                <>/{a.slug}/ rimanda al servizio</>
                              )}
                            </span>
                            <label className="t-meta flex items-center gap-1.5">
                              <input type="checkbox" name="published" defaultChecked={a.published} /> pagina propria
                            </label>
                            <input name="position" type="number" defaultValue={a.position} className={`${IN} w-20`} aria-label="ordine" />
                          </div>
                          <label className="block">
                            <span className="t-meta mb-1 block text-ink">Come si chiamano i professionisti che lo fanno</span>
                            <input
                              name="agencyLabel"
                              defaultValue={a.agencyLabel ?? ""}
                              placeholder="Professionisti di pubblicità su ChatGPT"
                              className={IN}
                            />
                          </label>
                          <label className="block">
                            <span className="t-meta mb-1 block text-ink">Altri modi di cercarlo, uno per riga</span>
                            <textarea
                              name="variants"
                              rows={2}
                              defaultValue={(Array.isArray(a.variants) ? (a.variants as unknown[]) : []).map(String).join("\n")}
                              placeholder={"professionisti pubblicità chatgpt\nfare pubblicità su chatgpt"}
                              className={IN}
                            />
                            <span className="t-meta">
                              Non diventano indirizzi: finiscono nel testo della pagina, che è dove Google li legge.
                            </span>
                          </label>
                          <textarea
                            name="intro"
                            rows={2}
                            defaultValue={a.intro ?? ""}
                            placeholder="Il testo che va in cima alla sua pagina: deve dire qualcosa che la pagina del servizio non dice."
                            className={IN}
                          />
                          <span className="t-meta">{(a.intro ?? "").length} caratteri scritti, ne servono 200 per pubblicare</span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button type="submit" className="t-meta font-semibold text-action">salva</button>
                        </div>
                      </form>
                      <form action={togliAlias} className="mt-1 text-right">
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="t-meta font-semibold text-ink hover:text-action">togli</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <form action={creaAlias} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <input type="hidden" name="serviceId" value={s.id} />
                <label className="block text-sm">
                  <span className="t-meta mb-1 block text-ink">Come lo chiedono</span>
                  <input name="label" className={`${IN} w-64`} placeholder="Pubblicità su ChatGPT" />
                </label>
                <label className="block text-sm">
                  <span className="t-meta mb-1 block text-ink">Indirizzo</span>
                  <input name="slug" className={`${IN} w-56`} placeholder="pubblicita-su-chatgpt" />
                </label>
                <button type="submit" className="min-h-10 rounded-pill border border-line px-4 text-sm font-bold text-ink hover:border-ink/25">
                  aggiungi
                </button>
              </form>
            </div>
          ))}
      </section>

      <section className="mt-12">
        <h2 className="t-h3">Competenze</h2>
        <p className="t-body mt-2 max-w-3xl text-ink-2">
          Sono i mestieri dichiarati dai professionisti dentro la loro scheda, non una lista che abbiamo deciso noi:
          per questo non hanno un interruttore acceso e spento. Da qui si possono rinominare in tutte le schede
          insieme, unire due modi di dire la stessa cosa scrivendo il nome dell&apos;altra, togliere quelle sbagliate,
          o promuoverne una a servizio quando merita una tassonomia sua. Le competenze con almeno quindici professionisti
          hanno già la loro pagina.
        </p>

        <div className="mt-4 max-h-[32rem] overflow-y-auto rounded-card border border-line">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-canvas">
              <tr className="border-b border-line text-left">
                <th className="px-3 py-2 font-semibold">Competenza</th>
                <th className="px-3 py-2 font-semibold">Professionisti</th>
                <th className="px-3 py-2 font-semibold">Rinomina o unisci</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {skills.map((c) => (
                <tr key={c.slug} className="border-b border-line align-middle">
                  <td className="px-3 py-2">
                    {c.totale >= 15 ? (
                      <Link href={`/competenze/${c.slug}/`} className="font-semibold text-action">
                        {c.nome}
                      </Link>
                    ) : (
                      <span className="text-ink">{c.nome}</span>
                    )}
                    {c.totale < 15 && <span className="t-meta block">sotto le 15, nessuna pagina</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmt(c.totale)}</td>
                  <td className="px-3 py-2">
                    <form action={rinominaCompetenza} className="flex items-center gap-2">
                      <input type="hidden" name="da" value={c.nome} />
                      <input name="a" className={`${IN} w-56`} placeholder="nuovo nome, o nome di un'altra per unirle" />
                      <button type="submit" className="t-meta font-semibold text-action">salva</button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <form action={competenzaAServizio}>
                        <input type="hidden" name="nome" value={c.nome} />
                        <button type="submit" className="t-meta font-semibold text-ink hover:text-action">
                          rendi servizio
                        </button>
                      </form>
                      <form action={togliCompetenza}>
                        <input type="hidden" name="nome" value={c.nome} />
                        <button type="submit" className="t-meta font-semibold text-ink hover:text-action">
                          togli
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 rounded-card border border-line bg-surface p-5">
        <h2 className="t-h3">Dopo aver creato un servizio</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Assegnalo ai professionisti che lo fanno, dalla scheda di ciascuna.</li>
          <li>Alla terzo professionista la pagina compare da sola, insieme agli incroci con le città che arrivano a tre.</li>
          <li>Le parole scritte qui sopra servono quando si cercano professionisti nuovi da importare.</li>
        </ol>
      </section>
    </div>
  );
}
