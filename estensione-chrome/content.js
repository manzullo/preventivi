// Pulsante "Importa in Mister Wolf" sulle pagine elenco di Instapro. Parte
// solo quando lo premi tu, e manda soltanto la pagina già aperta: niente
// navigazione automatica, niente pagine successive aperte da solo.
(() => {
  if (!/^\/[a-z0-9-]+\/[a-z0-9-]+-professionisti\/[a-z0-9-]+\/?$/.test(location.pathname)) return;

  const box = document.createElement("div");
  box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;font:14px/1.4 system-ui,sans-serif;max-width:320px";
  const btn = document.createElement("button");
  btn.textContent = "Importa in Mister Wolf";
  btn.style.cssText = "background:#0b57d0;color:#fff;border:0;border-radius:999px;padding:12px 18px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)";
  const esito = document.createElement("div");
  esito.style.cssText = "display:none;margin-top:8px;background:#fff;color:#111;border:1px solid #ddd;border-radius:12px;padding:10px 12px;box-shadow:0 4px 14px rgba(0,0,0,.12)";
  box.append(btn, esito);
  document.body.append(box);

  const mostra = (testo) => {
    esito.textContent = testo;
    esito.style.display = "block";
  };

  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Importo…";
    chrome.runtime.sendMessage({ type: "importa", url: location.href, html: document.documentElement.outerHTML }, (r) => {
      btn.disabled = false;
      btn.textContent = "Importa in Mister Wolf";
      if (!r) return mostra("Nessuna risposta dall'estensione.");
      if (!r.ok) return mostra(`Non importato: ${r.errore}`);
      mostra(`Letti ${r.letti} professionisti (${r.citta}): ${r.created} nuovi, ${r.updated} aggiornati. Sono bozze.`);
    });
  });
})();
