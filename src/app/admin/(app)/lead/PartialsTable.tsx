// Tabella dei lead parziali: risposte date finora e contatto se inserito.
type Draft = {
  id: string;
  form: string;
  updatedAt: string;
  lastStepKey: string | null;
  landingPath: string | null;
  answers: Record<string, unknown>;
  contact: Record<string, string> | null;
};

function fmtAnswer(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v ?? "");
}

export function PartialsTable({ drafts }: { drafts: Draft[] }) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line p-10 text-center">
        <p className="font-bold">Nessuna bozza in sospeso</p>
        <p className="t-meta mt-1">Compare qui chi inizia il form e non lo invia.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full text-sm">
        <thead className="t-kicker border-b border-line bg-surface text-left">
          <tr>
            {["Aggiornata", "Form", "Fermo a", "Contatto", "Risposte", "Pagina"].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drafts.map((d) => {
            const c = d.contact ?? {};
            const who = [c.name, c.email, c.phone].filter(Boolean).join(" · ");
            return (
              <tr key={d.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-ink-2">{new Date(d.updatedAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-3 py-2 font-semibold">{d.form}</td>
                <td className="px-3 py-2"><code className="rounded bg-surface px-1.5 py-0.5 text-xs">{d.lastStepKey ?? "—"}</code></td>
                <td className="px-3 py-2">{who ? <span className="font-semibold text-ok">{who}</span> : <span className="text-ink-3">non ancora</span>}</td>
                <td className="px-3 py-2">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                    {Object.entries(d.answers).slice(0, 8).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-ink-3">{k}</dt>
                        <dd className="truncate">{fmtAnswer(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 text-ink-2">{d.landingPath ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
