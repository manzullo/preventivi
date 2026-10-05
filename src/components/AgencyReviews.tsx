// Sezione recensioni in stile Google: media grande, barre per stelle, filtro
// per fonte, ordinamento e "mostra altre" a blocchi. Tutto lato server:
// ogni stato è un indirizzo, quindi resta indicizzabile e condivisibile.
import Link from "next/link";
import { Rating } from "@/design/ui";
import { db } from "@/lib/db";
import { fmt, plural } from "@/lib/site";

const PASSO = 8;

export const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  sortlist: "Sortlist",
  pickanagency: "Pick an Agency",
  trustpilot: "Trustpilot",
  designrush: "DesignRush",
  buyer_form: "Cliente verificato",
  cernita: "Fonte pubblica",
};

const etichetta = (s: string) => SOURCE_LABEL[s] ?? s;

type Params = { fonte?: string; ordina?: string };

function link(base: string, p: Params, cambi: Partial<Params>) {
  const q = new URLSearchParams();
  const finale = { ...p, ...cambi };
  if (finale.fonte) q.set("fonte", finale.fonte);
  if (finale.ordina && finale.ordina !== "recenti") q.set("ordina", finale.ordina);
  const s = q.toString();
  return `${base}${s ? `?${s}` : ""}#recensioni`;
}

type Esterno = { source: string; rating: number; count: number; url?: string };

export async function AgencyReviews({
  agencyId, path, nome, params, totaleDichiarato, mediaDichiarata, esterni = [],
}: {
  agencyId: string; path: string; nome: string; params: Params;
  totaleDichiarato?: number; mediaDichiarata?: number | null; esterni?: Esterno[];
}) {
  const fonte = params.fonte;
  const ordina = params.ordina === "alto" || params.ordina === "basso" ? params.ordina : "recenti";
  const mostrate = PASSO;

  const where = { agencyId, ...(fonte ? { source: fonte } : {}) };
  const [perVoto, perFonte, totale, righe] = await Promise.all([
    db.review.groupBy({ by: ["rating"], where: { agencyId }, _count: { _all: true } }),
    db.review.groupBy({ by: ["source"], where: { agencyId }, _count: { _all: true } }),
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy:
        ordina === "alto"
          ? [{ rating: "desc" }, { publishedAt: { sort: "desc", nulls: "last" } }]
          : ordina === "basso"
            ? [{ rating: "asc" }, { publishedAt: { sort: "desc", nulls: "last" } }]
            : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: mostrate,
      select: { id: true, author: true, rating: true, text: true, publishedAt: true, source: true, sourceUrl: true },
    }),
  ]);

  const conDettaglio = perVoto.reduce((n, v) => n + v._count._all, 0);
  // Il totale della scheda comprende anche le valutazioni aggregate delle fonti,
  // di cui non abbiamo il testo: qui si dice sempre quante sono leggibili.
  const totaleTutte = Math.max(totaleDichiarato ?? 0, conDettaglio);
  const soloConteggiate = Math.max(0, totaleTutte - conDettaglio);
  if (totaleTutte === 0) {
    return (
      <section id="recensioni" className="mt-14">
        <p className="t-kicker mb-2">Recensioni</p>
        <h2 className="t-h2">Ancora nessuna recensione</h2>
        <p className="t-body mt-2 text-ink-2">
          Nessuna recensione pubblica registrata per {nome}. Il punteggio resta a zero finché non ne arrivano.
        </p>
      </section>
    );
  }

  const somma = perVoto.reduce((n, v) => n + v.rating * v._count._all, 0);
  const media = mediaDichiarata ?? (conDettaglio ? somma / conDettaglio : 0);
  const conteggio = (v: number) => perVoto.find((p) => p.rating === v)?._count._all ?? 0;

  return (
    <section id="recensioni" className="mt-14">
      <p className="t-kicker mb-2">Con la fonte</p>
      <h2 className="t-h2">
        {fmt(totaleTutte)} {plural(totaleTutte, "recensione", "recensioni")}
      </h2>
      {soloConteggiate > 0 && (
        <p className="t-body mt-2 max-w-3xl text-ink-2">
          {fmt(conDettaglio)} {plural(conDettaglio, "è leggibile qui", "sono leggibili qui")} con autore, data e link all&apos;originale.
          Le altre {fmt(soloConteggiate)} arrivano dalle valutazioni complessive delle fonti
          {esterni.length ? ` (${esterni.map((e) => `${etichetta(e.source)} ${e.rating.toFixed(1)} su ${fmt(e.count)}`).join(", ")})` : ""}:
          contano nel punteggio, ma il testo resta sul sito della fonte.
        </p>
      )}

      <div className="mt-6 grid gap-6 rounded-card border border-line bg-surface p-6 sm:grid-cols-[auto_1fr]">
        <div className="text-center sm:pr-6">
          <p className="text-[44px] font-extrabold leading-none tracking-[-0.02em] text-ink">{media.toFixed(1)}</p>
          <div className="mt-2 flex justify-center">
            <Rating value={media} count={totaleTutte} />
          </div>
          {soloConteggiate > 0 && <p className="t-meta mt-2">barre sulle {fmt(conDettaglio)} con dettaglio</p>}
        </div>
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((v) => {
            const n = conteggio(v);
            const perc = conDettaglio ? Math.round((n / conDettaglio) * 100) : 0;
            return (
              <div key={v} className="flex items-center gap-3">
                <span className="t-meta w-3 text-right">{v}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-tonal">
                  <span className="block h-full rounded-pill bg-action" style={{ width: `${perc}%` }} />
                </span>
                <span className="t-meta w-16 text-right">{fmt(n)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {(perFonte.length > 1 || ordina !== "recenti") && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href={link(path, params, { fonte: undefined })}
            className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${!fonte ? "border-action bg-tonal text-action" : "border-line text-ink hover:border-ink/25"}`}
          >
            Tutte
          </Link>
          {perFonte
            .sort((a, b) => b._count._all - a._count._all)
            .map((f) => (
              <Link
                key={f.source}
                href={link(path, params, { fonte: f.source })}
                className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${fonte === f.source ? "border-action bg-tonal text-action" : "border-line text-ink hover:border-ink/25"}`}
              >
                {etichetta(f.source)} <span className="text-ink-3">{fmt(f._count._all)}</span>
              </Link>
            ))}
          <span className="t-meta ml-auto flex items-center gap-2">
            Ordina:
            {[
              { k: "recenti", l: "più recenti" },
              { k: "alto", l: "voto alto" },
              { k: "basso", l: "voto basso" },
            ].map((o) => (
              <Link
                key={o.k}
                href={link(path, params, { ordina: o.k })}
                className={ordina === o.k ? "font-semibold text-action" : "text-ink hover:text-action"}
              >
                {o.l}
              </Link>
            ))}
          </span>
        </div>
      )}

      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {righe.map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-canvas p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="t-title">{r.author ?? "Cliente"}</p>
              <Rating value={r.rating} count={1} />
            </div>
            {r.text ? (
              <p className="t-body mt-2 text-ink-2">{r.text}</p>
            ) : (
              <p className="t-meta mt-2 italic">Valutazione senza commento.</p>
            )}
            <p className="t-meta mt-3">
              {r.publishedAt ? `${r.publishedAt.toLocaleDateString("it-IT", { year: "numeric", month: "long" })} · ` : ""}
              {r.sourceUrl ? (
                <a href={r.sourceUrl} rel="nofollow noopener" target="_blank" className="font-semibold text-action">
                  Fonte: {etichetta(r.source)} ↗
                </a>
              ) : (
                <span>Fonte: {etichetta(r.source)}</span>
              )}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link
          href={`${path}recensioni/${fonte ? `?fonte=${fonte}` : ""}`}
          className="rounded-pill border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/25 hover:text-action"
        >
          {totale > righe.length
            ? `Tutte le ${fmt(totale)} recensioni${soloConteggiate > 0 ? " leggibili" : ""}${fonte ? ` da ${etichetta(fonte)}` : ""} →`
            : "Filtra e ordina tutte le recensioni →"}
        </Link>
        <span className="t-meta">
          {fmt(righe.length)} di {fmt(totale)}
          {fonte ? ` da ${etichetta(fonte)}` : ""} qui sopra
        </span>
      </div>
      <p className="t-meta mt-4">
        <Link href="/recensioni/" className="font-semibold text-action hover:underline">
          Sfoglia le recensioni di tutte i professionisti →
        </Link>
      </p>
    </section>
  );
}
