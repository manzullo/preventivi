const DEFAULTS = { base: "http://localhost:4450", key: "" };
chrome.storage.sync.get(DEFAULTS, (v) => {
  document.getElementById("base").value = v.base;
  document.getElementById("key").value = v.key;
});
document.getElementById("salva").addEventListener("click", () => {
  const base = document.getElementById("base").value.trim() || DEFAULTS.base;
  const key = document.getElementById("key").value.trim();
  chrome.storage.sync.set({ base, key }, () => (document.getElementById("ok").textContent = "Salvato."));
});
