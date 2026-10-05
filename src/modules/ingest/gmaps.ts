// Scraper di Google Maps fatto in casa, con un browser vero (Playwright):
// cerca "categoria città", scorre l'elenco dei risultati e apre ogni scheda
// per leggere nome, categoria, indirizzo, telefono, sito, voto, numero di
// recensioni e coordinate. Niente Apify e niente costi a risultato.
//
// Va lanciato da una macchina con un IP "normale" (il Mac, non un datacenter):
// Google mostra il consenso cookie al primo giro e, se le ricerche sono
// troppe e troppo veloci, un captcha. Le pause servono a non arrivarci.
// Google Maps cambia spesso il markup: i selettori stanno tutti in SEL.

import type { Browser, Page } from "playwright-core";
import type { IngestRecord } from "./types";

/** Selettori della pagina, in un posto solo: quando Maps cambia si tocca qui. */
const SEL = {
  feed: 'div[role="feed"]',
  risultato: 'a[href*="/maps/place/"]',
  fineElenco: "span.HlvSq, p.fontBodyMedium > span > span", // "Hai raggiunto la fine dell'elenco"
  nome: "h1",
  categoria: 'button[jsaction*="category"]',
  indirizzo: 'button[data-item-id="address"]',
  telefono: 'button[data-item-id^="phone:tel:"]',
  sito: 'a[data-item-id="authority"]',
  voto: 'div.F7nice span[aria-hidden="true"]',
  numeroRecensioni: 'div.F7nice span[aria-label*="recension"]',
  consenso: 'form[action*="consent"] button, button[aria-label*="Rifiuta tutto"], button[aria-label*="Accetta tutto"]',
};

// Sostituibile solo per le prove con una pagina finta in locale.
const MAPS_BASE = process.env.MAPS_BASE ?? "https://www.google.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms + Math.floor(Math.random() * ms * 0.5);

export type MapsPlace = {
  url: string;
  ref: string; // id della scheda Maps (0x…:0x…), stabile fra una lettura e l'altra
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  lat?: number;
  lng?: number;
  query: string;
};

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  // Sul Mac usa Chrome installato; altrove il Chromium indicato da CHROME_PATH.
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch({ headless: process.env.HEADFUL !== "1", ...(executablePath ? { executablePath } : { channel: "chrome" }) });
}

async function accettaConsenso(page: Page) {
  if (!page.url().includes("consent.google")) return;
  const b = page.locator(SEL.consenso).first();
  if (await b.count()) {
    await b.click();
    await page.waitForLoadState("domcontentloaded");
  }
}

/** Coordinate e id dalla URL di una scheda: …!3d41.89!4d12.49… e …!1s0x…:0x…! */
export function parsePlaceUrl(url: string): { ref?: string; lat?: number; lng?: number } {
  const ref = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(url)?.[1];
  const lat = Number(/!3d(-?\d+\.\d+)/.exec(url)?.[1]);
  const lng = Number(/!4d(-?\d+\.\d+)/.exec(url)?.[1]);
  return { ref, lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined };
}

/** "Via Roma 1, 00100 Roma RM" → via, CAP e comune. */
export function parseAddress(a?: string): { street?: string; postalCode?: string; city?: string } {
  if (!a) return {};
  const m = /^(.*?),\s*(\d{5})\s+(.+?)(?:\s+[A-Z]{2})?$/.exec(a.replace(/, Italia$/, "").trim());
  return m ? { street: m[1], postalCode: m[2], city: m[3] } : { street: a };
}

/** Link alle schede dell'elenco risultati, scorrendo finché ce ne sono o fino a `max`. */
async function linkRisultati(page: Page, max: number): Promise<string[]> {
  const feed = page.locator(SEL.feed);
  if (!(await feed.count())) {
    // Un solo risultato: Maps apre direttamente la scheda.
    return page.url().includes("/maps/place/") ? [page.url()] : [];
  }
  let prima = -1;
  for (let giri = 0; giri < 40; giri++) {
    const n = await page.locator(`${SEL.feed} ${SEL.risultato}`).count();
    if (n >= max || n === prima || (await page.locator(SEL.fineElenco).count())) break;
    prima = n;
    await feed.evaluate((el) => el.scrollBy(0, el.scrollHeight));
    await sleep(jitter(1200));
  }
  const hrefs = await page.locator(`${SEL.feed} ${SEL.risultato}`).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  return [...new Set(hrefs)].slice(0, max);
}

const testo = async (page: Page, sel: string) => {
  const l = page.locator(sel).first();
  return (await l.count()) ? ((await l.textContent()) ?? "").trim() || undefined : undefined;
};

async function leggiScheda(page: Page, url: string, query: string): Promise<MapsPlace | null> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(SEL.nome).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const name = await testo(page, SEL.nome);
  if (!name) return null;
  const { ref, lat, lng } = parsePlaceUrl(page.url().includes("!1s") ? page.url() : url);
  const phoneAttr = await page.locator(SEL.telefono).first().getAttribute("data-item-id").catch(() => null);
  const website = await page.locator(SEL.sito).first().getAttribute("href").catch(() => null);
  const voto = Number((await testo(page, SEL.voto))?.replace(",", "."));
  const recensioni = Number((await page.locator(SEL.numeroRecensioni).first().getAttribute("aria-label").catch(() => null))?.replace(/\D/g, ""));
  const address = (await page.locator(SEL.indirizzo).first().getAttribute("aria-label").catch(() => null))?.replace(/^Indirizzo:\s*/, "") ?? undefined;
  return {
    url,
    ref: ref ?? url,
    name,
    category: await testo(page, SEL.categoria),
    address,
    phone: phoneAttr?.replace(/^phone:tel:/, "") ?? undefined,
    website: website ?? undefined,
    rating: Number.isFinite(voto) && voto > 0 ? voto : undefined,
    reviewCount: Number.isFinite(recensioni) && recensioni > 0 ? recensioni : undefined,
    lat,
    lng,
    query,
  };
}

/**
 * Una ricerca: fino a `max` schede. `pausaMs` è la pausa media fra una
 * scheda e l'altra (con una variazione casuale).
 */
export async function searchMaps(browser: Browser, query: string, opts: { max?: number; pausaMs?: number; log?: (s: string) => void } = {}): Promise<MapsPlace[]> {
  const log = opts.log ?? (() => undefined);
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${MAPS_BASE}/maps/search/${encodeURIComponent(query)}?hl=it`, { waitUntil: "domcontentloaded" });
    await accettaConsenso(page);
    await page.locator(`${SEL.feed}, ${SEL.nome}`).first().waitFor({ timeout: 20_000 });
    if (page.url().includes("/sorry/")) throw new Error("Google ha chiesto il captcha: fermati e riprova più tardi, più piano");
    const urls = await linkRisultati(page, opts.max ?? 60);
    log(`"${query}": ${urls.length} risultati`);
    const out: MapsPlace[] = [];
    for (const u of urls) {
      await sleep(jitter(opts.pausaMs ?? 2500));
      const p = await leggiScheda(page, u, query).catch((e) => (log(`errore su ${u}: ${String(e)}`), null));
      if (p) out.push(p);
    }
    return out;
  } finally {
    await ctx.close();
  }
}

/** MapsPlace → IngestRecord (categoria nel campo categories, per il filtro). */
export function mapsToRecord(p: MapsPlace, serviceSlug: string, citySlug: string): IngestRecord {
  const a = parseAddress(p.address);
  return {
    source: "google_maps",
    sourceRef: p.ref,
    sourceUrl: p.url,
    name: p.name,
    website: p.website,
    phone: p.phone,
    street: a.street,
    postalCode: a.postalCode,
    cityName: a.city ?? citySlug,
    lat: p.lat,
    lng: p.lng,
    serviceSlugs: [serviceSlug],
    reviews: [],
    rating: p.rating,
    reviewCount: p.reviewCount,
    categories: p.category ? [p.category] : [],
  };
}
