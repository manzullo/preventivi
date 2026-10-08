// Google Tag Manager API (sola lettura): port di PSF_GTM_API. Stesso token
// OAuth di Google Ads (scope tagmanager.readonly), throttle 1 chiamata/s,
// cooldown 5 minuti dopo un 429.

import { debug } from "@/lib/debug";
import { settings } from "@/lib/settings";
import { getAccessToken } from "./google-ads";

const API_BASE = "https://tagmanager.googleapis.com/tagmanager/v2";
const DAY = 86_400_000;
const HOUR = 3_600_000;

const cache = new Map<string, { exp: number; val: unknown }>();
let cooldownUntil = 0;
let lastCall = 0;

function cget<T>(k: string): T | undefined {
  const c = cache.get(k);
  if (!c || c.exp < Date.now()) return undefined;
  return c.val as T;
}
const cset = (k: string, v: unknown, ttl: number) => cache.set(k, { exp: Date.now() + ttl, val: v });

export function clearGtmCache() {
  cache.clear();
  cooldownUntil = 0;
}

async function apiGet(path: string): Promise<Record<string, unknown> | null> {
  if (cooldownUntil > Date.now()) {
    void debug.warn("gtm_api", `Skip ${path}: 429 cooldown (${Math.round((cooldownUntil - Date.now()) / 1000)}s remaining)`);
    return null;
  }
  const since = Date.now() - lastCall;
  if (lastCall && since < 1000) await new Promise((r) => setTimeout(r, 800));
  lastCall = Date.now();

  const token = await getAccessToken();
  if (!token) {
    void debug.error("gtm_api", `no access token for ${path}`);
    return null;
  }
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }).catch((e) => ({ status: 0, text: async () => String(e) }) as Response);
  const raw = await res.text();
  if (res.status === 429) {
    cooldownUntil = Date.now() + 300_000;
    await settings.patchGads({ lastError: `GTM API 429 (rate limit) on ${path}: cooldown 5 min attivo` });
    void debug.warn("gtm_api", `429 rate limit on ${path}, cooldown 5min`, { body: raw.slice(0, 500) });
    return null;
  }
  if (res.status !== 200) {
    await settings.patchGads({ lastError: `GTM API ${path} HTTP ${res.status}: ${raw.slice(0, 300)}` });
    void debug.error("gtm_api", `HTTP ${res.status} on ${path}`, { body: raw.slice(0, 800) });
    return null;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type GtmAccount = { id: string; name: string; path: string };
export type GtmContainer = { id: string; publicId: string; name: string; path: string; usageContext: string[]; accountName?: string; accountId?: string };

export async function listAccounts(): Promise<GtmAccount[] | null> {
  const c = cget<GtmAccount[]>("accounts");
  if (c?.length) return c;
  const body = await apiGet("/accounts");
  if (!body) return null;
  const out = ((body.account as Record<string, unknown>[] | undefined) ?? []).map((a) => ({ id: String(a.accountId), name: String(a.name ?? ""), path: String(a.path ?? "") }));
  if (out.length) cset("accounts", out, DAY);
  return out;
}

export async function listContainers(accountId: string): Promise<GtmContainer[] | null> {
  const key = `containers:${accountId}`;
  const c = cget<GtmContainer[]>(key);
  if (c?.length) return c;
  const body = await apiGet(`/accounts/${accountId}/containers`);
  if (!body) return null;
  const out = ((body.container as Record<string, unknown>[] | undefined) ?? []).map((x) => ({ id: String(x.containerId), publicId: String(x.publicId ?? ""), name: String(x.name ?? ""), path: String(x.path ?? ""), usageContext: (x.usageContext as string[] | undefined) ?? [] }));
  if (out.length) cset(key, out, DAY);
  return out;
}

export type LiveVersion = { versionId: string; name: string; description: string; fingerprint: string; tagCount: number; triggerCount: number; variableCount: number; tags: { id: string; name: string; type: string; paused: boolean; firingCount: number }[]; triggers: { id: string; name: string; type: string }[] };

export async function getLiveVersion(containerPath: string): Promise<LiveVersion | null> {
  const key = `live:${containerPath}`;
  const c = cget<LiveVersion>(key);
  if (c) return c;
  const b = await apiGet(`/${containerPath.replace(/^\//, "")}/versions:live`);
  if (!b) return null;
  const tags = (b.tag as Record<string, unknown>[] | undefined) ?? [];
  const triggers = (b.trigger as Record<string, unknown>[] | undefined) ?? [];
  const out: LiveVersion = {
    versionId: String(b.containerVersionId ?? ""),
    name: String(b.name ?? ""),
    description: String(b.description ?? ""),
    fingerprint: String(b.fingerprint ?? ""),
    tagCount: tags.length,
    triggerCount: triggers.length,
    variableCount: ((b.variable as unknown[] | undefined) ?? []).length,
    tags: tags.map((t) => ({ id: String(t.tagId ?? ""), name: String(t.name ?? ""), type: String(t.type ?? ""), paused: Boolean(t.paused), firingCount: ((t.firingTriggerId as unknown[] | undefined) ?? []).length })),
    triggers: triggers.map((t) => ({ id: String(t.triggerId ?? ""), name: String(t.name ?? ""), type: String(t.type ?? "") })),
  };
  cset(key, out, HOUR);
  return out;
}

export async function discoverAllContainers(): Promise<GtmContainer[]> {
  const accounts = await listAccounts();
  if (!accounts) return [];
  const out: GtmContainer[] = [];
  for (const a of accounts) {
    const cs = await listContainers(a.id);
    for (const c of cs ?? []) out.push({ ...c, accountName: a.name, accountId: a.id });
  }
  return out;
}
