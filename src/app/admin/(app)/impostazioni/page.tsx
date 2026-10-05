import { deleteNotification, saveNotification, saveSite, saveSmtp, saveTracking, saveWhatsapp, testNotification } from "@/app/admin/settings-actions";
import { gadsDisconnect, gadsTest, saveGads, setDefaultCustomer } from "@/app/admin/ads-actions";
import { saveAi, testAi } from "@/app/admin/settings-actions";
import { PROVIDERS } from "@/modules/ai/provider";
import { getRedirectUri, isConnected } from "@/modules/ads/google-ads";
import { getAccessibleAccountsWithInfo } from "@/modules/ads/google-ads-reports";
import { Button } from "@/design/ui";
import { db } from "@/lib/db";
import { HERO_STYLES, settings } from "@/lib/settings";
import { BASE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";
function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="t-meta mb-1 block text-ink">{label}</span>
      {children}
      {hint && <span className="t-meta mt-1 block text-ink-3">{hint}</span>}
    </label>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-canvas p-5">
      <p className="t-title mb-4">{title}</p>
      {children}
    </section>
  );
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const gadsMsg = typeof sp.gads === "string" ? sp.gads : "";
  const [gads, connected, ai] = await Promise.all([settings.gads(), isConnected(), settings.ai()]);
  const aiMsg = typeof sp.ai === "string" ? sp.ai : "";
  const accounts = connected ? await getAccessibleAccountsWithInfo().catch(() => []) : [];
  const site = await settings.site();
  const [smtp, wa, tr, forms, notifications, logs] = await Promise.all([
    settings.smtp(),
    settings.whatsapp(),
    settings.tracking(),
    db.form.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.notification.findMany({ orderBy: { name: "asc" } }),
    db.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { notification: { select: { name: true } } } }),
  ]);
  const rulesOf = (n: (typeof notifications)[number]) => (n.rules ?? {}) as { minValue?: number; services?: string[]; cities?: string[]; excludeTest?: boolean };

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="t-h1">Impostazioni</h1>

      <Card title="Email (SMTP)">
        <form action={saveSmtp} className="grid gap-3 sm:grid-cols-3">
          <F label="Host"><input name="host" className={IN} defaultValue={smtp.host} placeholder="smtp.example.com" /></F>
          <F label="Porta"><input name="port" type="number" className={IN} defaultValue={smtp.port} /></F>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="secure" defaultChecked={smtp.secure} /> TLS implicito (465)</label>
          <F label="Utente"><input name="user" className={IN} defaultValue={smtp.user} /></F>
          <F label="Password"><input name="pass" type="password" className={IN} placeholder={smtp.pass ? "•••••• (salvata)" : ""} /></F>
          <F label="Mittente (casella che spedisce)"><input name="from" className={IN} defaultValue={smtp.from} placeholder="noreply@alessandromanzullo.it" /></F>
          <F label="Nome visibile"><input name="fromName" className={IN} defaultValue={smtp.fromName} placeholder="Preventivi" /></F>
          <F label="Risposte a"><input name="replyTo" className={IN} defaultValue={smtp.replyTo} placeholder="manzullo@gmail.com" /></F>
          <div className="sm:col-span-3"><Button type="submit" className="min-h-10 px-5 py-2 text-sm">Salva SMTP</Button></div>
        </form>
      </Card>

      <Card title="WhatsApp">
        <form action={saveWhatsapp} className="grid gap-3 sm:grid-cols-2">
          <F label="Provider">
            <select name="provider" className={IN} defaultValue={wa.provider}>
              <option value="none">disattivo</option>
              <option value="evolution">Evolution API (self-hosted)</option>
              <option value="callmebot">CallMeBot</option>
            </select>
          </F>
          <div />
          <F label="Evolution: URL"><input name="evolutionUrl" className={IN} defaultValue={wa.evolutionUrl} placeholder="https://evolution.example.com" /></F>
          <F label="Evolution: istanza"><input name="evolutionInstance" className={IN} defaultValue={wa.evolutionInstance} /></F>
          <F label="Evolution: API key"><input name="evolutionKey" type="password" className={IN} placeholder={wa.evolutionKey ? "•••••• (salvata)" : ""} /></F>
          <F label="CallMeBot: API key"><input name="callmebotKey" type="password" className={IN} placeholder={wa.callmebotKey ? "•••••• (salvata)" : ""} /></F>
          <div className="sm:col-span-2"><Button type="submit" className="min-h-10 px-5 py-2 text-sm">Salva WhatsApp</Button></div>
        </form>
      </Card>

      <Card title="Sito pubblico">
        <form action={saveSite} className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="nearbyBlock" defaultChecked={site.nearbyBlock} /> blocco "Nei dintorni" nei listing servizio × città (card dei professionisti delle città vicine)</label>
          <F label="Città vicine (gruppi)"><input name="nearbyGroups" type="number" min={1} max={5} className={IN} defaultValue={site.nearbyGroups} /></F>
          <F label="Professionisti per città"><input name="nearbyPerGroup" type="number" min={1} max={6} className={IN} defaultValue={site.nearbyPerGroup} /></F>
          <F label="Massimo totale"><input name="nearbyCap" type="number" min={1} max={20} className={IN} defaultValue={site.nearbyCap} /></F>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsappCta" defaultChecked={site.whatsappCta} /> bottone WhatsApp nelle schede</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="faqAuto" defaultChecked={site.faqAuto} /> FAQ automatiche nelle schede</label>
          <div className="sm:col-span-3">
            <span className="t-meta mb-1 block text-ink">Faccia della fascia in cima agli elenchi</span>
            <select name="heroStyle" className={IN} defaultValue={site.heroStyle}>
              {HERO_STYLES.map((h) => (
                <option key={h.valore} value={h.valore}>
                  {h.nome} — {h.nota}
                </option>
              ))}
            </select>
            <span className="t-meta mt-1 block">
              Vale per tutti gli elenchi. Con &quot;a caso&quot; il confronto fra chiara e scura finisce in Performance.
            </span>
          </div>
          <div className="flex items-end"><Button type="submit" className="min-h-10 px-5 py-2 text-sm">Salva</Button></div>
        </form>
      </Card>

      <Card title="Tracking di default">
        <form action={saveTracking} className="grid gap-3 sm:grid-cols-3">
          <F label="GTM container"><input name="gtmId" className={IN} defaultValue={tr.gtmId} placeholder="GTM-XXXXXXX" /></F>
          <F label="GA4 ID"><input name="ga4Id" className={IN} defaultValue={tr.ga4Id} placeholder="G-XXXXXXX" /></F>
          <F label="Clarity" hint="mappe dei clic e registrazioni: scrive cookie di terze parti, serve l'avviso">
            <input name="clarityId" className={IN} defaultValue={tr.clarityId} placeholder="abcdefghij" />
          </F>
          <div className="flex items-end"><Button type="submit" className="min-h-10 px-5 py-2 text-sm">Salva</Button></div>
        </form>
      </Card>


      <Card title="Google Ads">
        {gadsMsg && (
          <p className={`mb-3 text-sm font-semibold ${gadsMsg.startsWith("ok") || gadsMsg.startsWith("test-ok") ? "text-ok" : "text-brand"}`}>
            {gadsMsg === "ok" ? "Account collegato." : gadsMsg === "err" ? `Collegamento fallito: ${gads.lastError.slice(0, 200)}` : gadsMsg === "state" ? "Stato OAuth non valido, riprova." : gadsMsg.startsWith("test-ok") ? `Connessione ok: ${gadsMsg.replace("test-ok-", "")} account accessibili.` : `Test fallito: ${decodeURIComponent(gadsMsg.replace("test-err-", ""))}`}
          </p>
        )}
        <p className="t-meta mb-3">Stessi dati del plugin: developer token, client OAuth (tipo web) con redirect URI <code>{getRedirectUri()}</code>, MCC opzionale. I segreti sono cifrati.</p>
        <form action={saveGads} className="grid gap-3 sm:grid-cols-2">
          <F label="Developer token"><input name="developerToken" type="password" className={IN} placeholder={gads.developerToken ? "•••••• (salvato)" : ""} /></F>
          <F label="OAuth client ID"><input name="clientId" className={IN} defaultValue={gads.clientId} /></F>
          <F label="OAuth client secret"><input name="clientSecret" type="password" className={IN} placeholder={gads.clientSecret ? "•••••• (salvato)" : ""} /></F>
          <F label="Login customer ID (MCC, opzionale)"><input name="loginCustomerId" className={IN} defaultValue={gads.loginCustomerId} placeholder="1234567890" /></F>
          <F label="Account di default (upload e arricchimento)"><input name="defaultCustomerId" className={IN} defaultValue={gads.defaultCustomerId} placeholder="1234567890" /></F>
          <div className="flex items-end"><Button type="submit" className="min-h-10 px-5 py-2 text-sm">Salva credenziali</Button></div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {connected ? (
            <>
              <span className="text-sm">Collegato{gads.accountEmail ? ` come ${gads.accountEmail}` : ""}.</span>
              <form action={gadsTest}><Button type="submit" variant="outline" className="min-h-9 px-4 py-1.5 text-sm">Testa connessione</Button></form>
              <form action={gadsDisconnect}><Button type="submit" variant="text" className="text-sm text-ink-2">Scollega</Button></form>
            </>
          ) : (
            <Button href="/api/ads/oauth/start/" arrow className="min-h-10 px-5 py-2 text-sm">Collega Google Ads</Button>
          )}
        </div>
        {accounts.length > 0 && (
          <div className="mt-4">
            <p className="t-kicker mb-2">Account accessibili</p>
            <ul className="space-y-1 text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span><strong>{a.name}</strong> · {a.id}{a.manager ? " · MCC" : ""} · {a.currency}</span>
                  {a.id === gads.defaultCustomerId ? <span className="t-kicker text-ok">default</span> : (
                    <form action={setDefaultCustomer}><input type="hidden" name="customerId" value={a.id} /><button type="submit" className="text-xs font-bold text-action">usa come default</button></form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>


      <Card title="AI Assistant">
        {aiMsg && <p className={`mb-3 text-sm font-semibold ${aiMsg.startsWith("ok") ? "text-ok" : "text-brand"}`}>{aiMsg.startsWith("ok") ? `Connessione ok: ${decodeURIComponent(aiMsg.slice(3))}` : `Test fallito: ${decodeURIComponent(aiMsg.slice(4))}`}</p>}
        <form action={saveAi} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Provider attivo">
              <select name="activeProvider" className={IN} defaultValue={ai.activeProvider}>
                {Object.entries(PROVIDERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
            </F>
            <F label="Temperature"><input name="temperature" className={IN} defaultValue={ai.temperature} /></F>
            <F label="Max token risposta"><input name="maxTokens" type="number" className={IN} defaultValue={ai.maxTokens} /></F>
          </div>
          {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((k) => {
            const keyField = `${k}Key` as const;
            const modelField = `${k}Model` as const;
            return (
              <div key={k} className="grid gap-3 rounded-slot border border-line p-3 sm:grid-cols-[180px_1fr_1fr]">
                <p className="t-meta self-center font-semibold text-ink">{PROVIDERS[k].label}</p>
                <input name={keyField} type="password" className={IN} placeholder={ai[keyField] ? "•••••• (salvata)" : "API key"} />
                <select name={modelField} className={IN} defaultValue={ai[modelField] || PROVIDERS[k].defaultModel}>
                  {Object.entries(PROVIDERS[k].models).map(([m, label]) => <option key={m} value={m}>{label}</option>)}
                </select>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="min-h-10 px-5 py-2 text-sm">Salva AI</Button>
            <Button type="submit" formAction={testAi} variant="outline" className="min-h-10 px-5 py-2 text-sm">Testa provider attivo</Button>
          </div>
        </form>
      </Card>

      <Card title="Regole di notifica">
        <p className="t-meta mb-4">A ogni lead, ogni regola attiva valuta i filtri e invia su email o WhatsApp. Destinatari separati da virgola.</p>
        {[...notifications, null].map((n) => {
          const r = n ? rulesOf(n) : {};
          const recipients = n ? ((Array.isArray(n.recipients) ? n.recipients : []) as string[]).join(", ") : "";
          return (
            <form key={n?.id ?? "new"} action={saveNotification} className="mb-4 grid gap-3 rounded-slot border border-dashed border-line p-4 sm:grid-cols-4">
              {n && <input type="hidden" name="id" value={n.id} />}
              <F label="Nome"><input name="name" className={IN} defaultValue={n?.name ?? ""} placeholder={n ? "" : "Nuova regola"} /></F>
              <F label="Canale">
                <select name="channel" className={IN} defaultValue={n?.channel ?? "email"}>
                  <option value="email">email</option>
                  <option value="whatsapp">whatsapp</option>
                </select>
              </F>
              <F label="Destinatari"><input name="recipients" className={IN} defaultValue={recipients} placeholder="a@b.it, +39333..." /></F>
              <F label="Solo per il form">
                <select name="formId" className={IN} defaultValue={n?.formId ?? ""}>
                  <option value="">tutti</option>
                  {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </F>
              <F label="Valore minimo"><input name="minValue" type="number" className={IN} defaultValue={r.minValue ?? ""} /></F>
              <F label="Solo servizi (slug)"><input name="services" className={IN} defaultValue={r.services?.join(", ") ?? ""} /></F>
              <F label="Solo città (slug)"><input name="cities" className={IN} defaultValue={r.cities?.join(", ") ?? ""} /></F>
              <div className="flex flex-wrap items-end gap-4 pb-1 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" name="enabled" defaultChecked={n ? n.enabled : true} /> attiva</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="includeTest" defaultChecked={r.excludeTest === false} /> anche test</label>
              </div>
              <div className="flex flex-wrap gap-3 sm:col-span-4">
                <Button type="submit" className="min-h-10 px-5 py-2 text-sm">{n ? "Salva" : "Aggiungi regola"}</Button>
                {n && (
                  <>
                    <Button type="submit" formAction={testNotification} variant="outline" className="min-h-10 px-5 py-2 text-sm">Invia test</Button>
                    <Button type="submit" formAction={deleteNotification} variant="text" className="text-sm text-ink-2">Elimina</Button>
                  </>
                )}
              </div>
            </form>
          );
        })}
      </Card>

      <Card title="Ultimi invii">
        {logs.length === 0 ? <p className="t-meta">Nessun invio registrato.</p> : logs.map((l) => (
          <p key={l.id} className="text-sm">{l.createdAt.toLocaleString("it-IT")} · {l.notification.name} · <strong>{l.status}</strong>{l.error ? ` · ${l.error}` : ""}</p>
        ))}
      </Card>

      <Card title="Embed su altri siti">
        <p className="t-meta mb-3">Incolla dove vuoi il form. <code>data-client</code> distingue il sito di origine nei lead e nel dataLayer.</p>
        <pre className="overflow-x-auto rounded-slot bg-surface p-3 text-xs">{`<div data-ma-form="preventivo"></div>
<script src="${BASE_URL}/embed/loader/preventivo/" data-client="partyspot" async></script>`}</pre>
      </Card>
    </div>
  );
}
