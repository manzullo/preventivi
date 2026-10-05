// Google Ads API: port di PSF_Google_Ads_API (plugin 3.22.2). Stessi
// endpoint, stesse query GAQL, stesse regole (hash Enhanced Conversions,
// template di tracking, sub-account MCC, cache). Le credenziali stanno in
// Setting "gads" con i segreti cifrati.

import { createHash } from "node:crypto";
import { debug } from "@/lib/debug";
import { settings } from "@/lib/settings";
import { BASE_URL } from "@/lib/site";

export const API_VERSION = "v21";
const API_BASE = "https://googleads.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const SCOPE =
  "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/tagmanager.readonly https://www.googleapis.com/auth/analytics.readonly";

// ---------- helper ----------

export type Row = Record<string, unknown>;
export const digits = (v: unknown) => String(v ?? "").replace(/\D+/g, "");
export const HOUR = 3600_000;
export const MINUTE = 60_000;

/** Legge "a.b.c" da un oggetto annidato. */
export function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Row)[k] : undefined), obj);
}
export const s = (v: unknown, d = ""): string => (v === undefined || v === null ? d : String(v));
export const n = (v: unknown): number => Number(v ?? 0) || 0;
export const micros = (v: unknown): number => n(v) / 1_000_000;

const cache = new Map<string, { exp: number; val: unknown }>();
export function cacheGet<T>(key: string): T | undefined {
  const c = cache.get(key);
  if (!c) return undefined;
  if (c.exp < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return c.val as T;
}
export function cacheSet(key: string, val: unknown, ttl: number) {
  cache.set(key, { exp: Date.now() + ttl, val });
}
export function clearCache() {
  for (const k of [...cache.keys()]) if (k.startsWith("gads:")) cache.delete(k);
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
export const gaqlEscape = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Google Ads accetta solo LAST_7/14/30_DAYS: altrimenti BETWEEN. */
export function dateClause(days: number, allTime = false, from?: string, to?: string): string {
  const clean = (x?: string) => (x ? x.replace(/[^0-9-]/g, "") : undefined);
  const df = clean(from);
  const dt = clean(to);
  if (allTime) return `segments.date BETWEEN '2018-01-01' AND '${today()}'`;
  if (df && dt) return `segments.date BETWEEN '${df}' AND '${dt}'`;
  if ([7, 14, 30].includes(days)) return `segments.date DURING LAST_${days}_DAYS`;
  return `segments.date BETWEEN '${daysAgo(Math.max(0, days - 1))}' AND '${today()}'`;
}

// ---------- OAuth ----------

export function getRedirectUri(): string {
  return `${BASE_URL}/api/ads/oauth/callback/`;
}

export async function getAuthorizationUrl(state: string): Promise<string> {
  const g = await settings.gads();
  if (!g.clientId) return "";
  const p = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // forza il rilascio del refresh_token ogni volta
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function handleOauthCallback(code: string): Promise<boolean> {
  const g = await settings.gads();
  if (!g.clientId || !g.clientSecret || !code) {
    await settings.patchGads({ lastError: "Missing client_id/client_secret/code" });
    return false;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: getRedirectUri(), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
  const raw = await res.text();
  let body: Row = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* corpo non JSON */
  }
  if (res.status !== 200 || !body.refresh_token) {
    await settings.patchGads({ lastError: `Token exchange failed: ${raw.slice(0, 500)}` });
    return false;
  }
  const patch: Parameters<typeof settings.patchGads>[0] = {
    refreshToken: s(body.refresh_token),
    accessToken: s(body.access_token),
    accessExpires: Date.now() + (n(body.expires_in) || 3600) * 1000 - 60_000,
    lastError: "",
  };
  // Email dell'account connesso (best effort)
  try {
    const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${s(body.access_token)}` }, signal: AbortSignal.timeout(10_000) });
    if (info.ok) {
      const j = (await info.json()) as Row;
      if (j.email) patch.accountEmail = s(j.email);
    }
  } catch {
    /* ignorato */
  }
  await settings.patchGads(patch);
  return true;
}

export async function getAccessToken(): Promise<string | null> {
  const g = await settings.gads();
  if (g.accessToken && Date.now() < g.accessExpires) return g.accessToken;
  if (!g.refreshToken || !g.clientId || !g.clientSecret) {
    await settings.patchGads({ lastError: "Missing OAuth credentials for refresh" });
    return null;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: g.refreshToken, client_id: g.clientId, client_secret: g.clientSecret, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const raw = res ? await res.text() : "";
  let body: Row = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* corpo non JSON */
  }
  if (!body.access_token) {
    await settings.patchGads({ lastError: `Refresh token failed: ${raw.slice(0, 500)}` });
    return null;
  }
  await settings.patchGads({ accessToken: s(body.access_token), accessExpires: Date.now() + (n(body.expires_in) || 3600) * 1000 - 60_000 });
  return s(body.access_token);
}

export async function disconnect(): Promise<void> {
  const g = await settings.gads();
  if (g.refreshToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(g.refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  }
  await settings.patchGads({ refreshToken: "", accessToken: "", accessExpires: 0, accountEmail: "" });
  clearCache();
}

export async function isConnected(): Promise<boolean> {
  const g = await settings.gads();
  return Boolean(g.refreshToken && g.developerToken);
}

// ---------- Enhanced Conversions ----------

export function hashUserData(value: string | null | undefined): string {
  if (!value) return "";
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** E.164 approssimato: se manca il prefisso e ha 9-11 cifre, assume Italia. */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const t = phone.trim();
  const plus = t.startsWith("+");
  const d = t.replace(/\D+/g, "");
  if (!d) return "";
  if (plus) return `+${d}`;
  if (d.length >= 9 && d.length <= 11) return `+39${d}`;
  return `+${d}`;
}

async function headers(extra: Record<string, string> = {}): Promise<Record<string, string> | null> {
  const token = await getAccessToken();
  const g = await settings.gads();
  if (!token || !g.developerToken) return null;
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, "developer-token": g.developerToken, "Content-Type": "application/json", ...extra };
  const mcc = digits(g.loginCustomerId);
  if (mcc) h["login-customer-id"] = mcc;
  return h;
}

export type UploadArgs = {
  customerId: string;
  conversionActionId: string;
  gclid: string;
  conversionDatetime?: string;
  value?: number | null;
  currency?: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  orderId?: string;
};

export type UploadResult = { success: boolean; error: string | null; httpCode: number; response: unknown };

export async function uploadClickConversion(a: UploadArgs): Promise<UploadResult> {
  const customerId = digits(a.customerId);
  const actionId = digits(a.conversionActionId);
  if (!customerId || !actionId || !a.gclid) return { success: false, error: "Missing customer_id/conversion_action_id/gclid", httpCode: 0, response: null };
  const h = await headers();
  if (!h) return { success: false, error: (await settings.gads()).lastError || "No access token / developer token", httpCode: 0, response: null };

  const conversion: Row = {
    conversionAction: `customers/${customerId}/conversionActions/${actionId}`,
    conversionDateTime: a.conversionDatetime || formatConversionDateTime(new Date()),
    conversionValue: Number(a.value ?? 0),
    currencyCode: a.currency || "EUR",
    gclid: a.gclid,
  };
  if (a.orderId) conversion.orderId = a.orderId;
  const identifiers: Row[] = [];
  if (a.email) identifiers.push({ hashedEmail: hashUserData(a.email) });
  if (a.phone) identifiers.push({ hashedPhoneNumber: hashUserData(normalizePhone(a.phone)) });
  if (a.firstName || a.lastName) {
    const address: Row = {};
    if (a.firstName) address.hashedFirstName = hashUserData(a.firstName);
    if (a.lastName) address.hashedLastName = hashUserData(a.lastName);
    identifiers.push({ addressInfo: address });
  }
  if (identifiers.length) conversion.userIdentifiers = identifiers;

  const res = await fetch(`${API_BASE}/${API_VERSION}/customers/${customerId}:uploadClickConversions`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ conversions: [conversion], partialFailure: true, validateOnly: false }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => ({ status: 0, text: async () => String(e) }) as Response);
  const raw = await res.text();
  let body: Row = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* corpo non JSON */
  }
  if (res.status !== 200) {
    const err = `HTTP ${res.status}: ${raw.slice(0, 800)}`;
    await settings.patchGads({ lastError: err });
    return { success: false, error: err, httpCode: res.status, response: body };
  }
  if (pick(body, "partialFailureError.code")) {
    const err = `Partial failure: ${JSON.stringify(body.partialFailureError)}`;
    await settings.patchGads({ lastError: err });
    return { success: false, error: err, httpCode: res.status, response: body };
  }
  return { success: true, error: null, httpCode: res.status, response: body };
}

/** 'YYYY-MM-DD HH:MM:SS+TZ' nel fuso dell'account (default Europe/Rome). */
export function formatConversionDateTime(d: Date, tz = "Europe/Rome"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "longOffset" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const off = get("timeZoneName").replace("GMT", "") || "+00:00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour").replace("24", "00")}:${get("minute")}:${get("second")}${off.length === 3 ? `${off}:00` : off}`;
}

// ---------- Lettura ----------

export async function listAccessibleCustomers(): Promise<string[]> {
  const h = await headers();
  if (!h) return [];
  const res = await fetch(`${API_BASE}/${API_VERSION}/customers:listAccessibleCustomers`, { headers: h, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res || res.status !== 200) {
    await settings.patchGads({ lastError: `listAccessibleCustomers failed: ${res ? (await res.text()).slice(0, 300) : "network"}` });
    return [];
  }
  const body = (await res.json()) as { resourceNames?: string[] };
  return (body.resourceNames ?? []).map((rn) => rn.match(/customers\/(\d+)/)?.[1] ?? "").filter(Boolean);
}

/** GAQL search. null = errore (già loggato). */
export async function search(customerId: string, query: string): Promise<Row[] | null> {
  const h = await headers();
  if (!h) return null;
  const cid = digits(customerId);
  const res = await fetch(`${API_BASE}/${API_VERSION}/customers/${cid}/googleAds:search`, { method: "POST", headers: h, body: JSON.stringify({ query }), signal: AbortSignal.timeout(25_000) }).catch((e) => ({ status: 0, text: async () => String(e), json: async () => ({}) }) as Response);
  if (res.status !== 200) {
    const raw = await res.text();
    const err = `search HTTP ${res.status}: ${raw.slice(0, 500)}`;
    await settings.patchGads({ lastError: err });
    const expected403 = res.status === 403 && (raw.includes("USER_PERMISSION_DENIED") || raw.includes("CUSTOMER_NOT_ENABLED"));
    if (expected403) void debug.warn("gads_api", "search 403 (sub-account skipped)", { customerId: cid });
    else void debug.error("gads_api", `search HTTP ${res.status}`, { customerId: cid, query: query.slice(0, 300), body: raw.slice(0, 800) });
    return null;
  }
  const body = (await res.json()) as { results?: Row[] };
  return body.results ?? [];
}

export async function testConnection(): Promise<{ success: boolean; customers: string[]; error: string | null }> {
  const token = await getAccessToken();
  if (!token) return { success: false, customers: [], error: `Cannot get access token: ${(await settings.gads()).lastError}` };
  const customers = await listAccessibleCustomers();
  if (!customers.length) return { success: false, customers: [], error: (await settings.gads()).lastError || "No customers accessible" };
  return { success: true, customers, error: null };
}

export type CustomerInfo = { id: string; name: string; currency: string; timezone: string; manager: boolean };

// ---------- Mutate (base) ----------
// Le mutazioni specifiche (keyword, località, campagne) stanno in
// google-ads-mutations.ts; i report in google-ads-reports.ts.

export type MutateResult = { success: true; response: unknown } | { error: string; code?: number; raw?: string };

export async function mutate(customerId: string, endpointSuffix: string, body: unknown): Promise<MutateResult> {
  const h = await headers();
  if (!h) return { error: `No access token / developer token: ${(await settings.gads()).lastError}` };
  const cid = digits(customerId);
  const res = await fetch(`${API_BASE}/${API_VERSION}/customers/${cid}/${endpointSuffix}`, { method: "POST", headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }).catch((e) => ({ status: 0, text: async () => String(e) }) as Response);
  const raw = await res.text();
  let json: Row = {};
  try {
    json = JSON.parse(raw);
  } catch {
    /* corpo non JSON */
  }
  if (res.status === 0 || res.status >= 400) {
    const msg = s(pick(json, "error.message")) || `HTTP ${res.status}: ${raw.slice(0, 300)}`;
    void debug.error("gads_api", `mutate HTTP ${res.status}`, { endpoint: endpointSuffix, msg, body: raw.slice(0, 800) });
    return { error: msg, code: res.status, raw };
  }
  void debug.info("gads_api", `mutate ok: ${endpointSuffix}`, { customerId: cid });
  clearCache(); // dati freschi al prossimo caricamento
  return { success: true, response: json };
}

