// Scaricamento educato per gli scraper: un User-Agent che dice chi siamo,
// robots.txt rispettato, una richiesta alla volta per sito con una pausa fra
// l'una e l'altra, nuovi tentativi solo sugli errori passeggeri. Ogni scraper
// passa da qui, così le regole sono le stesse per tutte le fonti.

const UA = process.env.SCRAPER_UA ?? "MisterWolfBot/0.1 (+https://github.com/manzullo/preventivi)";

type Rules = { disallow: string[]; allow: string[]; delayMs?: number };
const robotsCache = new Map<string, Rules>();
const lastHit = new Map<string, number>();

/** Regole di robots.txt per "*" e per il nostro bot (le nostre vincono). */
async function robots(origin: string): Promise<Rules> {
  const hit = robotsCache.get(origin);
  if (hit) return hit;
  const rules: Rules = { disallow: [], allow: [] };
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const groups: { agents: string[]; lines: [string, string][] }[] = [];
      let cur: { agents: string[]; lines: [string, string][] } | null = null;
      for (const raw of (await res.text()).split("\n")) {
        const line = raw.replace(/#.*/, "").trim();
        const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
        if (!m) continue;
        const [k, v] = [m[1].toLowerCase(), m[2].trim()];
        if (k === "user-agent") {
          if (!cur || cur.lines.length) groups.push((cur = { agents: [], lines: [] }));
          cur.agents.push(v.toLowerCase());
        } else if (cur) cur.lines.push([k, v]);
      }
      const nostro = groups.find((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().includes(a)));
      const tutti = groups.find((g) => g.agents.includes("*"));
      for (const [k, v] of (nostro ?? tutti)?.lines ?? []) {
        if (k === "disallow" && v) rules.disallow.push(v);
        if (k === "allow" && v) rules.allow.push(v);
        if (k === "crawl-delay" && Number(v) > 0) rules.delayMs = Number(v) * 1000;
      }
    }
  } catch {
    // robots.txt irraggiungibile: si procede con le pause standard.
  }
  robotsCache.set(origin, rules);
  return rules;
}

const matches = (path: string, rule: string) => {
  const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
};

/** Vero se robots.txt permette di leggere l'indirizzo (vince la regola più lunga). */
export async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  const r = await robots(u.origin);
  const path = u.pathname + u.search;
  const best = (list: string[]) => Math.max(-1, ...list.filter((x) => matches(path, x)).map((x) => x.length));
  return best(r.allow) >= best(r.disallow);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET con pausa per sito (`minDelayMs`, o il Crawl-delay del sito se più
 * lungo) e fino a 3 tentativi su 429/5xx. Lancia se robots.txt lo vieta.
 */
export async function politeGet(url: string, opts: { minDelayMs?: number; accept?: string; api?: boolean } = {}): Promise<string> {
  // `api`: un'interfaccia pubblicata apposta per i programmi (Overpass). Il
  // suo robots.txt tiene lontani i crawler, non i client: si salta il
  // controllo ma si tengono le pause.
  if (!opts.api && !(await allowed(url))) throw new Error(`robots.txt non permette ${url}`);
  const u = new URL(url);
  const r = await robots(u.origin);
  const wait = Math.max(opts.minDelayMs ?? 1500, r.delayMs ?? 0);
  for (let tentativo = 1; ; tentativo++) {
    const since = Date.now() - (lastHit.get(u.host) ?? 0);
    if (since < wait) await sleep(wait - since);
    lastHit.set(u.host, Date.now());
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: opts.accept ?? "text/html,application/xhtml+xml", "Accept-Language": "it-IT,it;q=0.9" }, signal: AbortSignal.timeout(opts.api ? 180_000 : 30_000) });
    if (res.ok) return res.text();
    if ((res.status === 429 || res.status >= 500) && tentativo < 3) {
      await sleep(wait * 4 * tentativo);
      continue;
    }
    throw new Error(`${res.status} su ${url}`);
  }
}

export { UA as SCRAPER_UA };
