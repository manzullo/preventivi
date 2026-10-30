// Lato browser: sessione, cattura della visita (UTM/gclid/custom), eventi
// per passo verso /api/forms/track e verso il dataLayer (nomi psf_* per
// compatibilità con i container GTM già configurati).

export type Tracking = Record<string, string>;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "matchtype", "device", "network"];

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function sessionId(): string {
  const s = storage();
  const k = "ma_session";
  const cur = s?.getItem(k);
  if (cur) return cur;
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).toString();
  s?.setItem(k, id);
  return id;
}

/** Legge i parametri dall'URL e li conserva per tutta la sessione. */
export function captureTracking(customParams: string[] = []): Tracking {
  const s = storage();
  const k = "ma_tracking";
  const prev: Tracking = (() => {
    try {
      return JSON.parse(s?.getItem(k) ?? "{}");
    } catch {
      return {};
    }
  })();
  const url = new URL(window.location.href);
  const out: Tracking = { ...prev };
  for (const key of [...UTM_KEYS, ...customParams]) {
    const v = url.searchParams.get(key);
    if (v) out[key] = v.slice(0, 300);
  }
  if (!out.landing_path) out.landing_path = url.pathname + url.search;
  if (!out.referrer && document.referrer) out.referrer = document.referrer.slice(0, 500);
  s?.setItem(k, JSON.stringify(out));
  return out;
}

export function pushDataLayer(event: string, payload: Record<string, unknown>) {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event, ...payload });
}

export async function postTrack(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("/api/forms/track/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function beacon(body: Record<string, unknown>) {
  const data = JSON.stringify(body);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/forms/track/", new Blob([data], { type: "application/json" }));
  } else {
    void postTrack(body);
  }
}

/** Visita: una per sessione. La promise in volo evita i doppi invii
 * (Strict Mode in dev monta due volte gli effetti). */
let inflight: Promise<{ visitId: string | null; tracking: Tracking }> | null = null;

export function ensureVisit(clientId: string, customParams: string[]): Promise<{ visitId: string | null; tracking: Tracking }> {
  if (!inflight) inflight = ensureVisitOnce(clientId, customParams);
  return inflight;
}

async function ensureVisitOnce(clientId: string, customParams: string[]): Promise<{ visitId: string | null; tracking: Tracking }> {
  const s = storage();
  const tracking = captureTracking(customParams);
  const existing = s?.getItem("ma_visit");
  if (existing) return { visitId: existing, tracking };
  const r = await postTrack({ type: "visit", sessionId: sessionId(), clientId, tracking });
  const visitId = r && typeof r.visitId === "string" ? r.visitId : null;
  if (visitId) s?.setItem("ma_visit", visitId);
  return { visitId, tracking };
}
