// Competenze dichiarate dai professionisti ("Siti web", "SEO tecnico", "WordPress").
// Sono un elenco di testi dentro Agency.skills, non una tabella: qui si contano,
// si trasformano in indirizzi leggibili e si interrogano.
import { db } from "@/lib/db";
import { slugify } from "@/modules/ingest/normalize";

/** Sotto questa soglia una competenza non merita una pagina: troppo poche schede. */
export const SKILL_MIN = 15;

export type Competenza = { slug: string; nome: string; totale: number };

/** Tutte le competenze con quanti professionisti pubblicati le dichiarano. */
export async function competenze(opts: { min?: number; cityIds?: string[] } = {}): Promise<Competenza[]> {
  const min = opts.min ?? SKILL_MIN;
  const righe = await db.agency.findMany({
    where: { published: true, ...(opts.cityIds ? { cityId: { in: opts.cityIds } } : {}) },
    select: { skills: true },
  });
  const conta = new Map<string, { nome: string; n: number }>();
  for (const r of righe) {
    const lista = Array.isArray(r.skills) ? (r.skills as unknown[]) : [];
    // Una scheda che ripete la stessa competenza non vale doppio.
    const viste = new Set<string>();
    for (const s of lista) {
      const nome = String(s).trim();
      if (nome.length < 3 || nome.length > 40) continue;
      const slug = slugify(nome);
      if (!slug || viste.has(slug)) continue;
      viste.add(slug);
      const c = conta.get(slug);
      if (c) c.n += 1;
      else conta.set(slug, { nome, n: 1 });
    }
  }
  return [...conta.entries()]
    .filter(([, v]) => v.n >= min)
    .map(([slug, v]) => ({ slug, nome: v.nome, totale: v.n }))
    .sort((a, b) => b.totale - a.totale || a.nome.localeCompare(b.nome));
}

/** Nome esatto della competenza a partire dall'indirizzo, o niente se non esiste. */
export async function competenzaDaSlug(slug: string): Promise<Competenza | null> {
  const tutte = await competenze({ min: 1 });
  return tutte.find((c) => c.slug === slug) ?? null;
}

/**
 * Condizione per i professionisti che dichiarano una competenza.
 * Il confronto è sul testo esatto salvato nella scheda: `array_contains` guarda
 * dentro l'elenco JSON senza scorrere tutte le righe a mano.
 */
export function whereCompetenza(nome: string) {
  return { skills: { array_contains: [nome] } };
}

/**
 * Sotto questa soglia l'incrocio competenza × città resta vivo ma senza farsi
 * indicizzare: una pagina con due schede non aiuta chi cerca e i motori la
 * scartano come doppione magro della competenza nazionale.
 */
export const SKILL_CITY_MIN = 5;

export type CittaCompetenza = { id: string; slug: string; name: string; totale: number };

/**
 * Le città dove quella competenza ha abbastanza professionisti, con il conteggio.
 * Il perimetro è quello degli elenchi: un capoluogo si porta dietro i comuni
 * che gli fanno riferimento, altrimenti "Roma" conterebbe meno di quello che
 * la pagina di Roma mostra davvero.
 */
export async function cittaDiCompetenza(nome: string, min = SKILL_CITY_MIN): Promise<CittaCompetenza[]> {
  const [capoluoghi, minori, professionisti] = await Promise.all([
    db.city.findMany({ where: { isCapital: true }, select: { id: true, slug: true, name: true } }),
    db.city.findMany({ where: { isCapital: false }, select: { id: true, capitalSlug: true } }),
    db.agency.findMany({
      where: { published: true, cityId: { not: null }, ...whereCompetenza(nome) },
      select: { cityId: true },
    }),
  ]);

  // Ogni comune minore porta il suo conteggio al capoluogo di riferimento.
  const capoluogoDi = new Map<string, string>();
  const idPerSlug = new Map(capoluoghi.map((c) => [c.slug, c.id]));
  for (const m of minori) {
    const capId = m.capitalSlug ? idPerSlug.get(m.capitalSlug) : undefined;
    if (capId) capoluogoDi.set(m.id, capId);
  }

  const conta = new Map<string, number>();
  for (const a of professionisti) {
    const id = capoluogoDi.get(a.cityId!) ?? a.cityId!;
    conta.set(id, (conta.get(id) ?? 0) + 1);
  }

  return capoluoghi
    .map((c) => ({ ...c, totale: conta.get(c.id) ?? 0 }))
    .filter((c) => c.totale >= min)
    .sort((a, b) => b.totale - a.totale || a.name.localeCompare(b.name));
}

/**
 * Tutte le coppie competenza × città sopra soglia, in una passata sola.
 * La sitemap le chiede per ogni pezzo che genera: chiamare `cittaDiCompetenza`
 * settantasette volte per pezzo vorrebbe dire centinaia di query per rifare un
 * file che cambia una volta all'ora.
 */
export async function coppieCompetenzaCitta(min = SKILL_CITY_MIN): Promise<{ skill: string; citta: string }[]> {
  const [lista, capoluoghi, minori, professionisti] = await Promise.all([
    competenze(),
    db.city.findMany({ where: { isCapital: true }, select: { id: true, slug: true } }),
    db.city.findMany({ where: { isCapital: false }, select: { id: true, capitalSlug: true } }),
    db.agency.findMany({ where: { published: true, cityId: { not: null } }, select: { cityId: true, skills: true } }),
  ]);

  const slugCapoluogo = new Map(capoluoghi.map((c) => [c.id, c.slug]));
  const idPerSlug = new Map(capoluoghi.map((c) => [c.slug, c.id]));
  for (const m of minori) {
    const capId = m.capitalSlug ? idPerSlug.get(m.capitalSlug) : undefined;
    if (capId) slugCapoluogo.set(m.id, slugCapoluogo.get(capId)!);
  }

  // Dal nome scritto nella scheda al suo indirizzo, solo per le competenze che
  // hanno già una pagina: le altre non avranno nemmeno l'incrocio.
  const slugDiNome = new Map(lista.map((c) => [c.nome, c.slug]));
  const conta = new Map<string, number>();
  for (const a of professionisti) {
    const citta = slugCapoluogo.get(a.cityId!);
    if (!citta) continue;
    const viste = new Set<string>();
    for (const s of Array.isArray(a.skills) ? (a.skills as unknown[]) : []) {
      const skill = slugDiNome.get(String(s).trim());
      if (!skill || viste.has(skill)) continue;
      viste.add(skill);
      const k = `${skill}|${citta}`;
      conta.set(k, (conta.get(k) ?? 0) + 1);
    }
  }

  return [...conta.entries()]
    .filter(([, n]) => n >= min)
    .map(([k]) => ({ skill: k.split("|")[0], citta: k.split("|")[1] }));
}

export type ServizioPrevalente = { slug: string; plural: string; name: string };

/**
 * La categoria di chi dichiara la competenza (per "Riparazione caldaia" di
 * solito Idraulici): serve a riempire la pagina con gli altri professionisti
 * di quella categoria quando chi dichiara la competenza sono pochi.
 */
export async function servizioPrevalente(nome: string, cityIds?: string[]): Promise<ServizioPrevalente | null> {
  const righe = await db.agencyService.findMany({
    where: { agency: { published: true, ...(cityIds ? { cityId: { in: cityIds } } : {}), ...whereCompetenza(nome) } },
    select: { service: { select: { slug: true, plural: true, name: true } } },
  });
  const conta = new Map<string, { s: ServizioPrevalente; n: number }>();
  for (const r of righe) {
    const c = conta.get(r.service.slug);
    if (c) c.n += 1;
    else conta.set(r.service.slug, { s: r.service, n: 1 });
  }
  return [...conta.values()].sort((a, b) => b.n - a.n)[0]?.s ?? null;
}
