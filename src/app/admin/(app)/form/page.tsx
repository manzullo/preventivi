import Link from "next/link";
import { duplicateForm, importForm } from "@/app/admin/actions";
import { Badge, Button } from "@/design/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function FormsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const forms = await db.form.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { steps: true, submissions: true, leads: true } } },
  });
  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="t-h1">Form</h1>
        <Button href="/admin/form/nuovo/" arrow className="min-h-10 px-5 py-2 text-sm">
          Nuovo form
        </Button>
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-canvas">
        <table className="w-full text-sm">
          <thead className="t-kicker border-b border-line text-left">
            <tr>
              {["Nome", "Slug", "Stato", "Passi", "Invii", "Lead", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forms.map((f) => (
              <tr key={f.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-semibold">
                  <Link href={`/admin/form/${f.id}/`} className="text-action">{f.name}</Link>
                  {f.testMode && <span className="t-kicker ml-2 text-warn-fg">test</span>}
                </td>
                <td className="px-4 py-3"><code>{f.slug}</code></td>
                <td className="px-4 py-3"><Badge tone={f.status === "active" ? "ok" : "neutral"}>{f.status}</Badge></td>
                <td className="px-4 py-3">{f._count.steps}</td>
                <td className="px-4 py-3">{f._count.submissions}</td>
                <td className="px-4 py-3">{f._count.leads}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link href={`/preventivo/`} className="mr-3 text-ink-2 hover:text-action">Anteprima</Link>
                  <Link href={`/admin/form/${f.id}/export/`} className="mr-3 text-ink-2 hover:text-action">JSON ↓</Link>
                  <form action={duplicateForm.bind(null, f.id)} className="inline">
                    <button type="submit" className="font-bold text-action">Duplica</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-8 rounded-card border border-line bg-canvas p-5">
        <summary className="t-title cursor-pointer">Importa da JSON</summary>
        {sp.errore && <p className="mt-2 text-sm font-semibold text-brand">Import fallito: {sp.errore === "json" ? "JSON non valido" : "struttura non riconosciuta"}.</p>}
        <form action={importForm} className="mt-3 space-y-3">
          <textarea name="json" rows={8} className="w-full rounded-slot border-[1.5px] border-line p-3 font-mono text-xs" placeholder='{"name":"...","slug":"...","steps":[...]}' />
          <Button type="submit" variant="outline" className="min-h-10 px-5 py-2 text-sm">Importa come bozza</Button>
        </form>
      </details>
    </div>
  );
}
