import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button, Kicker } from "@/design/ui";
import { db } from "@/lib/db";
import { pageMeta } from "@/modules/directory/seo";
import { submitApplication } from "./actions";

// Candidatura: i professionisti chiedono di entrare, come /candidatura di
// guidalocation. La scheda nasce come bozza dopo la revisione in admin.

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ title: "Candida la tua attività", description: "Entra nella directory: scheda gratuita, ordine calcolato dalle recensioni pubbliche, contatti diretti senza commissioni.", path: "/candidatura/" });
type Search = Promise<Record<string, string | string[] | undefined>>;
const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-4 py-3 text-[15px] outline-none placeholder:text-ink-3 focus:border-action";

export default async function ApplyPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const [services, cities] = await Promise.all([db.service.findMany({ where: { active: true }, orderBy: { position: "asc" } }), db.city.findMany({ where: { isCapital: true }, orderBy: { name: "asc" }, select: { slug: true, name: true } })]);
  const ok = sp.ok === "1";
  const err = typeof sp.errore === "string" ? sp.errore : "";
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1fr_360px]">
      <div>
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Candidatura", href: "/candidatura/" }]} />
        <Kicker className="mb-2">Per i professionisti</Kicker>
        <h1 className="t-h1">Candida la tua attività</h1>
        <p className="t-lead mt-3 max-w-2xl">La scheda è gratuita e non si compra una posizione: entrano i professionisti con recensioni verificabili. Rivediamo ogni candidatura a mano.</p>
        {ok ? (
          <div className="mt-8 rounded-card border border-line bg-surface p-6"><p className="t-title">Candidatura ricevuta.</p><p className="t-body mt-2 text-ink-2">La esaminiamo entro pochi giorni e ti scriviamo all'email indicata.</p></div>
        ) : (
          <form action={submitApplication} className="mt-8 grid gap-4 rounded-panel border border-line bg-canvas p-6 sm:grid-cols-2 sm:p-8">
            {err && <p className="text-sm font-semibold text-brand sm:col-span-2">{err}</p>}
            <label className="block"><span className="t-meta mb-1.5 block text-ink">Nome del professionista *</span><input name="name" required className={IN} /></label>
            <label className="block"><span className="t-meta mb-1.5 block text-ink">Sito web</span><input name="website" className={IN} placeholder="https://" /></label>
            <label className="block"><span className="t-meta mb-1.5 block text-ink">Email di lavoro *</span><input name="email" type="email" required className={IN} /></label>
            <label className="block"><span className="t-meta mb-1.5 block text-ink">Telefono</span><input name="phone" type="tel" className={IN} /></label>
            <label className="block sm:col-span-2"><span className="t-meta mb-1.5 block text-ink">Città</span><select name="city" className={IN}><option value="">Scegli...</option>{cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
            <div className="sm:col-span-2"><p className="t-meta mb-2 text-ink">Servizi principali</p><div className="flex flex-wrap gap-2">{services.map((s) => <label key={s.slug} className="flex items-center gap-1.5 rounded-pill bg-surface px-3 py-1.5 text-sm"><input type="checkbox" name="services" value={s.slug} /> {s.name}</label>)}</div></div>
            <label className="block sm:col-span-2"><span className="t-meta mb-1.5 block text-ink">Presentazione</span><textarea name="message" rows={4} className={IN} placeholder="Chi siete, da quanto, clienti tipo, dove trovare le recensioni" /></label>
            <label className="absolute -left-[9999px]" aria-hidden tabIndex={-1}>Sito<input name="hp" tabIndex={-1} autoComplete="off" /></label>
            <label className="flex items-start gap-3 sm:col-span-2"><input type="checkbox" name="consenso" className="mt-1 h-4 w-4 accent-[var(--color-action)]" /><span className="t-body text-ink-2">Acconsento al trattamento dei dati per la valutazione della candidatura.</span></label>
            <div className="sm:col-span-2"><Button type="submit" arrow>Invia la candidatura</Button></div>
          </form>
        )}
      </div>
      <aside className="md:pt-24">
        <p className="t-kicker mb-2">Cosa ottieni</p>
        <ul className="t-body space-y-3 text-ink-2">
          <li><strong className="text-ink">Scheda gratuita</strong> con servizi, recensioni con fonte e contatti diretti.</li>
          <li><strong className="text-ink">Posizione meritata</strong>: la classifica dipende solo dalle recensioni, la formula è pubblica.</li>
          <li><strong className="text-ink">Richieste dei clienti</strong>: i lead compatibili con i tuoi servizi e la tua città.</li>
        </ul>
      </aside>
    </div>
  );
}
