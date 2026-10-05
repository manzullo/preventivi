import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { approveClaim, rejectClaim } from "./actions";

export const dynamic = "force-dynamic";

const STATO: Record<string, string> = {
  pending: "email da confermare",
  email_ok: "da verificare",
  approved: "approvata",
  rejected: "respinta",
};

export default async function Rivendicazioni() {
  await requireAdmin();
  const righe = await db.agencyClaim.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: { agency: { select: { name: true, slug: true, domain: true, website: true, phone: true, city: { select: { name: true } }, reviewCount: true, verified: true } } },
  });
  const daVedere = righe.filter((r) => r.status === "email_ok");
  const altre = righe.filter((r) => r.status !== "email_ok");
  const IN = "w-full rounded-slot border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";

  return (
    <div>
      <h1 className="t-h2">Rivendicazioni</h1>
      <p className="t-body mt-2 max-w-3xl text-ink-2">
        L&apos;email prova solo l&apos;indirizzo. Prima di approvare, controlla che chi scrive gestisca davvero l&apos;professionista:
        telefona al numero pubblico della scheda, o chiedi un riscontro verificabile. Con l&apos;approvazione la scheda
        diventa verificata e parte il link di accesso all&apos;area.
      </p>

      <h2 className="t-h3 mt-8">Da verificare ({daVedere.length})</h2>
      {daVedere.length === 0 && <p className="t-body mt-2 text-ink-2">Nessuna richiesta in attesa.</p>}
      <ul className="mt-4 space-y-4">
        {daVedere.map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-canvas p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="t-title">
                <Link href={`/agenzia/${r.agency.slug}/`} className="hover:text-action" target="_blank">{r.agency.name} ↗</Link>
              </p>
              <span className="t-meta">{r.createdAt.toLocaleDateString("it-IT")} · {STATO[r.status]}</span>
            </div>
            <dl className="t-meta mt-3 grid gap-1 sm:grid-cols-2">
              <div><dt className="inline text-ink">Email: </dt><dd className="inline">{r.email}</dd></div>
              <div><dt className="inline text-ink">Dominio scheda: </dt><dd className="inline">{r.agency.domain ?? "assente"}</dd></div>
              <div><dt className="inline text-ink">Ruolo dichiarato: </dt><dd className="inline">{r.role ?? "non indicato"}</dd></div>
              <div><dt className="inline text-ink">Telefono dichiarato: </dt><dd className="inline">{r.phone ?? "non indicato"}</dd></div>
              <div><dt className="inline text-ink">Telefono in scheda: </dt><dd className="inline">{r.agency.phone ?? "assente"}</dd></div>
              <div><dt className="inline text-ink">Città: </dt><dd className="inline">{r.agency.city?.name ?? "assente"}</dd></div>
            </dl>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <form action={approveClaim} className="contents">
                <input type="hidden" name="id" value={r.id} />
                <input name="note" placeholder="Come hai verificato (telefonata, visura, altro)" className={IN} />
                <button type="submit" className="rounded-pill bg-action px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Approva</button>
              </form>
              <form action={rejectClaim}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-ink/25">Respingi</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="t-h3 mt-10">Storico</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="t-meta border-b border-line text-ink">
              <th className="py-2 pr-3">Professionista</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Stato</th>
              <th className="py-2 pr-3">Nota</th>
              <th className="py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {altre.map((r) => (
              <tr key={r.id} className="border-b border-line/70">
                <td className="py-2 pr-3 font-semibold text-ink">{r.agency.name}</td>
                <td className="py-2 pr-3">{r.email}</td>
                <td className="py-2 pr-3">{STATO[r.status] ?? r.status}</td>
                <td className="py-2 pr-3 text-ink-2">{r.note ?? ""}</td>
                <td className="py-2">{r.createdAt.toLocaleDateString("it-IT")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
