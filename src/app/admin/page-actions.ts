"use server";

// Pagine CMS (statiche e blog) e override SEO delle landing page.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { RESERVED_SLUGS } from "@/lib/site";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const pagePath = (kind: string, slug: string) => (kind === "blog" ? `/blog/${slug}/` : `/${slug}/`);

export async function savePage(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const back = (msg: string) => redirect(`/admin/pagine/${id || "nuova"}/?msg=${encodeURIComponent(msg)}`);
  const kind = str(fd, "kind") === "blog" ? "blog" : "static";
  const title = str(fd, "title");
  if (!title) back("Titolo obbligatorio");
  const slug = slugify(str(fd, "slug") || title);
  if (!slug) back("Slug non valido");
  if (kind === "static" && RESERVED_SLUGS.has(slug)) back("Slug riservato al sistema");
  const clash = await db.page.findFirst({ where: { slug, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) back("Slug già usato da un'altra pagina");
  if (kind === "static") {
    const [svc, city, reg] = await Promise.all([
      db.service.findUnique({ where: { slug }, select: { id: true } }),
      db.city.findUnique({ where: { slug }, select: { id: true } }),
      db.region.findUnique({ where: { slug }, select: { id: true } }),
    ]);
    if (svc || city || reg) back("Slug già usato da un servizio, una città o una regione");
  }
  const published = fd.get("published") === "on";
  const existing = id ? await db.page.findUnique({ where: { id } }) : null;
  const data = {
    kind,
    title,
    slug,
    description: str(fd, "description") || null,
    body: String(fd.get("body") ?? ""),
    published,
    publishedAt: published ? (existing?.publishedAt ?? new Date()) : (existing?.publishedAt ?? null),
  };
  const page = id ? await db.page.update({ where: { id }, data }) : await db.page.create({ data });
  // Rinomina di una pagina pubblicata: 301 dal vecchio path (convenzione guidalocation).
  if (existing?.published && (existing.slug !== slug || existing.kind !== kind)) {
    const from = pagePath(existing.kind, existing.slug);
    const to = pagePath(kind, slug);
    if (from !== to) {
      await db.redirect.upsert({ where: { fromPath: from }, create: { fromPath: from, toPath: to, status: 301 }, update: { toPath: to, status: 301 } });
    }
  }
  await db.changelogEntry.create({ data: { area: "site", action: id ? "page_update" : "page_create", subject: pagePath(kind, slug), actor: "admin" } });
  revalidatePath("/", "layout");
  redirect(`/admin/pagine/${page.id}/?msg=${encodeURIComponent("Salvata")}`);
}

export async function removePage(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const page = await db.page.findUnique({ where: { id } });
  if (page) {
    await db.page.deleteMany({ where: { id } });
    await db.changelogEntry.create({ data: { area: "site", action: "page_remove", subject: pagePath(page.kind, page.slug), actor: "admin" } });
    revalidatePath("/", "layout");
  }
  redirect("/admin/pagine/?msg=" + encodeURIComponent("Pagina eliminata"));
}

export async function saveLandingMeta(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const row = await db.landingPage.update({
    where: { id },
    data: { metaTitle: str(fd, "metaTitle") || null, metaDescription: str(fd, "metaDescription") || null },
    select: { path: true },
  });
  revalidatePath(row.path);
  const q = str(fd, "q");
  redirect(`/admin/seo/?msg=${encodeURIComponent(`Salvata ${row.path}`)}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
}
