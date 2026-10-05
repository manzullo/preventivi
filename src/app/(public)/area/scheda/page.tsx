import type { Metadata } from "next";
import { agencyCompleteness } from "@/modules/directory/completeness";
import { customFaq, faqToText } from "@/modules/directory/faq";
import { pageMeta } from "@/modules/directory/seo";
import { requireOwner } from "@/modules/owner/auth";
import { AreaNav } from "../AreaNav";
import { saveOwnerAgency } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ title: "La tua scheda", description: "Aggiorna i dati della tua attività.", path: "/area/scheda/", noindex: true });

const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-4 py-3 text-[15px] outline-none focus:border-action";

function Campo({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="t-meta mb-1 block text-ink">{label}</span>
      {children}
      {hint && <span className="t-meta mt-1 block">{hint}</span>}
    </label>
  );
}

export default async function AreaScheda({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const a = await requireOwner();
  const { msg } = await searchParams;
  const skills = Array.isArray(a.skills) ? (a.skills as string[]) : [];
  const social = (a.social as Record<string, string> | null) ?? {};
  const stato = agencyCompleteness({ ...a, servicesCount: a.services.length });

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <AreaNav attiva="scheda" nome={a.name} slug={a.slug} />
      {msg && <p className="mb-6 rounded-slot border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink">{msg}</p>}

      <div className="mb-8 rounded-card border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="font-semibold text-ink">Scheda completa al {stato.score}%</p>
          <span className="h-2 w-40 overflow-hidden rounded-pill bg-tonal">
            <span className="block h-full rounded-pill bg-action" style={{ width: `${stato.score}%` }} />
          </span>
        </div>
        {stato.missing.length > 0 && (
          <p className="t-body mt-2 text-ink-2">Manca ancora: {stato.missing.slice(0, 4).join(", ")}. La completezza pesa nella classifica.</p>
        )}
      </div>

      <form action={saveOwnerAgency} className="grid gap-5 sm:grid-cols-2">
        <Campo label="Come vi presentate" hint="Due o tre frasi su cosa fate e per chi. Niente slogan: contano i fatti." wide>
          <textarea name="description" rows={6} className={IN} defaultValue={a.description ?? ""} maxLength={2000} />
        </Campo>
        <Campo label="Telefono"><input name="phone" className={IN} defaultValue={a.phone ?? ""} /></Campo>
        <Campo label="WhatsApp" hint="Numero con prefisso, senza spazi."><input name="whatsapp" className={IN} defaultValue={a.whatsapp ?? ""} /></Campo>
        <Campo label="Email"><input name="email" type="email" className={IN} defaultValue={a.email ?? ""} /></Campo>
        <Campo label="Sito"><input name="website" className={IN} defaultValue={a.website ?? ""} /></Campo>
        <Campo label="Indirizzo"><input name="street" className={IN} defaultValue={a.street ?? ""} /></Campo>
        <Campo label="CAP"><input name="postalCode" className={IN} defaultValue={a.postalCode ?? ""} /></Campo>
        <Campo label="Anno di fondazione"><input name="foundedYear" type="number" className={IN} defaultValue={a.foundedYear ?? ""} /></Campo>
        <Campo label="Quante persone">
          <select name="teamSize" className={IN} defaultValue={a.teamSize ?? ""}>
            <option value="">non indicato</option>
            {["1-10", "11-50", "51-200", "200+"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Budget minimo (€)" hint="La soglia sotto la quale non prendete lavori. Aiuta a filtrare le richieste.">
          <input name="minBudget" type="number" className={IN} defaultValue={a.minBudget ?? ""} />
        </Campo>
        <Campo label="Profilo Trustpilot" hint="Il link alla tua pagina Trustpilot, se ce l'hai: lo mostriamo tra i profili della scheda.">
          <input name="trustpilot" className={IN} defaultValue={social.trustpilot ?? ""} placeholder="https://it.trustpilot.com/review/tuosito.it" />
        </Campo>
        <Campo label="Competenze" hint="Separate da virgola: SEO tecnico, Google Ads, motion graphics." wide>
          <textarea name="skills" rows={2} className={IN} defaultValue={skills.join(", ")} />
        </Campo>
        <Campo label="Domande frequenti" hint="Una per riga: Domanda? | Risposta. Compaiono in fondo alla scheda." wide>
          <textarea name="faq" rows={4} className={IN} defaultValue={faqToText(customFaq(a.faq))} placeholder="Lavorate anche da remoto? | Sì, seguiamo clienti in tutta Italia." />
        </Campo>

        <div className="sm:col-span-2">
          <button type="submit" className="rounded-pill bg-action px-6 py-3 text-sm font-semibold text-white hover:opacity-90">Salva</button>
          <p className="t-meta mt-3">
            Servizi, città e recensioni non si modificano da qui: i servizi seguono quello che dichiarate, le recensioni
            restano come le pubblicano le fonti. Per correggerli scriveteci.
          </p>
        </div>
      </form>
    </div>
  );
}
