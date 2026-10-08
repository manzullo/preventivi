// Riceve la pagina che hai davanti dal content script e la manda al Mister
// Wolf locale. Non apre pagine e non scarica nulla da Instapro.
const DEFAULTS = { base: "http://localhost:4450", key: "" };

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "importa") return false;
  chrome.storage.sync.get(DEFAULTS, async ({ base, key }) => {
    if (!key) return reply({ ok: false, errore: "Manca la chiave: aprila dalle opzioni dell'estensione." });
    try {
      const r = await fetch(`${base.replace(/\/$/, "")}/api/import/pagina/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, url: msg.url, html: msg.html }),
      });
      reply(await r.json());
    } catch {
      reply({ ok: false, errore: `Non raggiungo ${base}: il sito sul Mac è acceso?` });
    }
  });
  return true;
});
