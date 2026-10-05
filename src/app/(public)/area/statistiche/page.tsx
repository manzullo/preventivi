import type { Metadata } from "next";
import { db } from "@/lib/db";
import { fmt } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";
import { requireOwner } from "@/modules/owner/auth";
import { AreaNav } from "../AreaNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ title: "I numeri della scheda", description: "Quante volte compari, quanti aprono la scheda, quanti contatti.", path: "/area/statistiche/", noindex: true });

const MESI = 6;

export default async function AreaNumeri() {
  const a = await requireOwner();
  const da = new Date();
  da.setMonth(da.getMonth() - (MESI - 1), 1);
  da.setHours(0, 0, 0, 0);

  const [eventi, assegnazioni, posizione] = await Promise.all([
    db.analyticsEvent.findMany({
      where: { agencyId: a.id, createdAt: { gte: da }, type: { in: ["impression", "card_click", "contact_click"] } },
      select: { type: true, createdAt: true },
    }),
    db.leadAssignment.findMany({ where: { agencyId: a.id, createdAt: { gte: da } }, select: { status: true, createdAt: true } }),
    a.cityId
      ? db.agency.count({ where: { published: true, cityId: a.cityId, score: { gt: a.score } } })
      : Promise.resolve(null),
  ]);

  const chiave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const mesi: string[] = [];
  for (let i = 0; i < MESI; i++) {
    const d = new Date(da);
    d.setMonth(da.getMonth() + i);
    mesi.push(chiave(d));
  }
  const tabella = mesi.map((m) => ({
    mese: m,
    impression: eventi.filter((e) => e.type === "impression" && chiave(e.createdAt) === m).length,
    aperture: eventi.filter((e) => e.type === "card_click" && chiave(e.createdAt) === m).length,
    contatti: eventi.filter((e) => e.type === "contact_click" && chiave(e.createdAt) === m).length,
    richieste: assegnazioni.filter((r) => chiave(r.createdAt) === m).length,
  }));
  const totali = tabella.reduce(
    (t, r) => ({ impression: t.impression + r.impression, aperture: t.aperture + r.aperture, contatti: t.contatti + r.contatti, richieste: t.richieste + r.richieste }),
    { impression: 0, aperture: 0, contatti: 0, richieste: 0 },
  );
  const nomeMese = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <AreaNav attiva="numeri" nome={a.name} slug={a.slug} />

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { k: "Comparse in elenco", v: totali.impression },
          { k: "Schede aperte", v: totali.aperture },
          { k: "Click sui contatti", v: totali.contatti },
          { k: "Richieste ricevute", v: totali.richieste },
        ].map((c) => (
          <div key={c.k} className="rounded-card border border-line bg-surface p-5">
            <p className="t-h3">{fmt(c.v)}</p>
            <p className="t-meta mt-1">{c.k}</p>
          </div>
        ))}
      </div>

      <p className="t-meta mt-4">
        Ultimi {MESI} mesi.
        {a.rating && a.reviewCount ? ` Media recensioni ${a.rating.toFixed(1)} su ${fmt(a.reviewCount)}.` : ""}
        {posizione !== null && a.city ? ` Nella classifica di ${a.city.name} hai ${fmt(posizione)} professionisti davanti.` : ""}
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="t-meta border-b border-line text-ink">
              <th className="py-2 pr-3">Mese</th>
              <th className="py-2 pr-3">Comparse</th>
              <th className="py-2 pr-3">Aperture</th>
              <th className="py-2 pr-3">Contatti</th>
              <th className="py-2">Richieste</th>
            </tr>
          </thead>
          <tbody>
            {tabella.map((r) => (
              <tr key={r.mese} className="border-b border-line/70">
                <td className="py-2.5 pr-3 font-semibold text-ink">{nomeMese(r.mese)}</td>
                <td className="py-2.5 pr-3">{fmt(r.impression)}</td>
                <td className="py-2.5 pr-3">{fmt(r.aperture)}</td>
                <td className="py-2.5 pr-3">{fmt(r.contatti)}</td>
                <td className="py-2.5">{fmt(r.richieste)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 rounded-card border border-line bg-surface p-5">
        <p className="font-semibold text-ink">Come si sale in classifica</p>
        <p className="t-body mt-1 text-ink-2">
          Contano media delle recensioni, quante sono e quanto è completa la scheda. Non esiste modo di pagare per salire:
          se un giorno cambiassimo regola, lo scriveremmo nella metodologia prima di applicarla.
        </p>
      </div>
    </div>
  );
}
