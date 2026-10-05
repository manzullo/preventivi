import { db } from "@/lib/db";

export function normalizeDomain(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Risolve nome o slug di città su City (prima match esatto, poi capoluogo con lo stesso nome). */
export async function resolveCity(nameOrSlug?: string): Promise<{ id: string; slug: string } | null> {
  if (!nameOrSlug) return null;
  const slug = slugify(nameOrSlug);
  const c = await db.city.findFirst({ where: { OR: [{ slug }, { name: { equals: nameOrSlug.trim(), mode: "insensitive" } }] }, select: { id: true, slug: true }, orderBy: { isCapital: "desc" } });
  return c;
}

/** Slug professionista unico: nome-città, con suffisso numerico se occupato. */
export async function uniqueAgencySlug(name: string, citySlug?: string, keepId?: string): Promise<string> {
  const base = slugify(citySlug ? `${name} ${citySlug}` : name) || "professionista";
  let slug = base;
  for (let i = 2; ; i++) {
    const hit = await db.agency.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === keepId) return slug;
    slug = `${base}-${i}`;
  }
}
