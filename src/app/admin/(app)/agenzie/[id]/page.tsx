import Link from "next/link";
import { notFound } from "next/navigation";
import { removeAgency, saveAgency } from "@/app/admin/agency-actions";
import { SubmitButton } from "@/app/admin/submit-button";
import { db } from "@/lib/db";
import { paths } from "@/lib/site";
import { agencyCompleteness } from "@/modules/directory/completeness";
import { customFaq, faqToText } from "@/modules/directory/faq";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";
function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}><span className="t-meta mb-1 block text-ink">{label}</span>{children}</label>;
}

export default async function AgencyEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "nuova";
  const [a, services, cities] = await Promise.all([
    isNew ? null : db.agency.findUnique({ where: { id }, include: { city: true, services: { select: { serviceId: true } }, reviews: { orderBy: { publishedAt: "desc" }, take: 10 }, _count: { select: { reviews: true, assignments: true } } } }),
    db.service.findMany({ orderBy: { position: "asc" } }),
    db.city.findMany({ where: { isCapital: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (!isNew && !a) notFound();
  const has = new Set(a?.services.map((s) => s.serviceId) ?? []);
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const comp = a ? agencyCompleteness({ ...a, servicesCount: a.services.length }) : null;
  return (
    <div className="max-w-4xl">
      <Link href="/admin/agenzie/" className="t-meta font-bold text-action">← Professionisti</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="t-h1">{isNew ? "Nuova scheda" : a!.name}</h1>
        {a?.published && <Link href={paths.agency(a.slug)} className="t-meta font-bold text-action">Vedi sul sito →</Link>}
        {a && <Link href={`/admin/agenzie/${a.id}/report/`} className="t-meta font-bold text-action">Report →</Link>}
      </div>
      {msg && <p className="mb-4 rounded-slot bg-tonal px-4 py-2 text-sm font-semibold text-action">{msg}</p>}
      {a?.importNote && <p className="mb-4 rounded-slot bg-warn px-4 py-2 text-sm font-semibold text-warn-fg">Nota import: {a.importNote}</p>}
      {comp && (
        <div className="mb-4 rounded-card border border-line bg-canvas p-4">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="font-bold">Completezza scheda</span><span className="font-bold">{comp.score}%</span></div>
          <div className="h-2 rounded-pill bg-surface"><div className={`h-2 rounded-pill ${comp.score >= 80 ? "bg-ok" : comp.score >= 50 ? "bg-warn-fg" : "bg-ink-3"}`} style={{ width: `${comp.score}%` }} /></div>
          {comp.missing.length > 0 && <p className="t-meta mt-2">Manca: {comp.missing.join(", ")}</p>}
        </div>
      )}
      <form action={saveAgency} className="grid gap-4 rounded-card border border-line bg-canvas p-5 sm:grid-cols-2">
        {a && <input type="hidden" name="id" value={a.id} />}
        {/* Priorità decisa da noi: non tocca il punteggio delle recensioni,
            mette la scheda nella corsia davanti all'elenco, con l'etichetta. */}
        <F label="Priorità (0 = nessuna, più alto sta più in alto)">
          <input name="priority" type="number" min="0" max="999" step="1" className={IN} defaultValue={a?.priority ?? 0} />
        </F>
        <F label="Nome"><input name="name" required className={IN} defaultValue={a?.name ?? ""} /></F>
        <F label="Sito web"><input name="website" className={IN} defaultValue={a?.website ?? ""} placeholder="https://" /></F>
        <F label="Logo (URL)"><input name="logoUrl" className={IN} defaultValue={a?.logoUrl ?? ""} placeholder="https://" /></F>
        <F label="Email"><input name="email" type="email" className={IN} defaultValue={a?.email ?? ""} /></F>
        <F label="Telefono"><input name="phone" className={IN} defaultValue={a?.phone ?? ""} /></F>
        <F label="WhatsApp (numero con prefisso, es. 393331234567)"><input name="whatsapp" className={IN} defaultValue={a?.whatsapp ?? ""} /></F>
        <F label="Città (capoluogo o comune)"><input name="city" list="citta" className={IN} defaultValue={a?.city?.name ?? ""} /><datalist id="citta">{cities.map((c) => <option key={c.name} value={c.name} />)}</datalist></F>
        <F label="Indirizzo"><input name="street" className={IN} defaultValue={a?.street ?? ""} /></F>
        <F label="CAP"><input name="postalCode" className={IN} defaultValue={a?.postalCode ?? ""} /></F>
        <F label="Anno di fondazione"><input name="foundedYear" type="number" className={IN} defaultValue={a?.foundedYear ?? ""} /></F>
        <F label="Team"><select name="teamSize" className={IN} defaultValue={a?.teamSize ?? ""}><option value="">—</option>{["1-10", "11-50", "51-200", "200+"].map((t) => <option key={t}>{t}</option>)}</select></F>
        <F label="Budget minimo (€)"><input name="minBudget" type="number" className={IN} defaultValue={a?.minBudget ?? ""} /></F>
        <F label="Descrizione" wide><textarea name="description" rows={5} className={IN} defaultValue={a?.description ?? ""} /></F>
        {a?.sourceDescription && (
          <div className="sm:col-span-2 rounded-slot border border-line bg-surface p-3">
            <p className="t-meta mb-1 text-ink">Testo della fonte (non pubblicato, base per la riscrittura)</p>
            <textarea readOnly rows={4} className={`${IN} bg-canvas`} value={a.sourceDescription} />
          </div>
        )}
        <F label="Meta title (vuoto = automatico)"><input name="metaTitle" className={IN} maxLength={70} defaultValue={a?.metaTitle ?? ""} /></F>
        <F label="Meta description (vuota = automatica)"><input name="metaDescription" className={IN} maxLength={170} defaultValue={a?.metaDescription ?? ""} /></F>
        <F label="Competenze (separate da virgola; dal sito e dalle fonti, modificabili)" wide><textarea name="skills" rows={2} className={IN} defaultValue={(Array.isArray(a?.skills) ? (a!.skills as string[]) : []).join(", ")} /></F>
        {Array.isArray(a?.externalRatings) && (a!.externalRatings as { source: string; rating: number; count: number; url: string }[]).length > 0 && (
          <p className="t-meta sm:col-span-2">Rating esterni: {(a!.externalRatings as { source: string; rating: number; count: number; url: string }[]).map((e) => `${e.source} ${e.rating} (${e.count})`).join(" · ")} · settori: {(Array.isArray(a?.industries) ? (a!.industries as string[]) : []).join(", ") || "—"}</p>
        )}
        <F label="FAQ personalizzate (una per riga: Domanda? | Risposta), in aggiunta a quelle automatiche" wide><textarea name="faq" rows={4} className={IN} defaultValue={faqToText(customFaq(a?.faq))} placeholder="Lavorate anche da remoto? | Sì, seguiamo clienti in tutta Italia." /></F>
        <div className="sm:col-span-2">
          <p className="t-meta mb-2 text-ink">Servizi</p>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => <label key={s.id} className="flex items-center gap-1.5 rounded-pill bg-surface px-3 py-1.5 text-sm"><input type="checkbox" name="services" value={s.slug} defaultChecked={has.has(s.id)} /> {s.name}</label>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-5 text-sm sm:col-span-2">
          <label className="flex items-center gap-1.5"><input type="checkbox" name="published" defaultChecked={a?.published ?? false} /> pubblicata</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="verified" defaultChecked={a?.verified ?? false} /> verificata (dominio confermato)</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="claimed" defaultChecked={a?.claimed ?? false} /> rivendicata dal titolare</label>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SubmitButton className="min-h-10 px-5 py-2 text-sm">Salva</SubmitButton>
          {a && <span className="t-meta">fonte {a.source} · slug <code>{a.slug}</code> · punteggio {a.score.toFixed(2)} · {a._count.reviews} recensioni · {a._count.assignments} lead assegnati</span>}
        </div>
      </form>
      {a && (
        <>
          <section className="mt-6 rounded-card border border-line bg-canvas p-5">
            <p className="t-title mb-3">Ultime recensioni ({a._count.reviews})</p>
            {a.reviews.length === 0 ? <p className="t-meta">Nessuna. Le recensioni arrivano dall'ingest (Google) o dai clienti del form; non si inseriscono a mano.</p> : a.reviews.map((r) => <p key={r.id} className="text-sm">★ {r.rating} · {r.author ?? "Cliente"} · {r.source} · {r.publishedAt?.toLocaleDateString("it-IT") ?? ""}{r.text ? ` · ${r.text.slice(0, 100)}` : ""}</p>)}
          </section>
          <form action={removeAgency} className="mt-6"><input type="hidden" name="id" value={a.id} /><SubmitButton variant="text" pendingLabel="Eliminazione…" className="text-sm text-ink-2 hover:text-brand">Elimina scheda (anche recensioni e assegnazioni)</SubmitButton></form>
        </>
      )}
    </div>
  );
}
