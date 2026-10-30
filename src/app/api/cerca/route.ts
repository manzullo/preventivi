// Ricerca per nome professionista: serve la pagina /cerca/ mentre si digita.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agencyOrder } from "@/modules/directory/listing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [], total: 0 });
  const where = {
    published: true,
    OR: [{ name: { contains: q, mode: "insensitive" as const } }, { domain: { contains: q.toLowerCase() } }],
  };
  const [items, total] = await Promise.all([
    db.agency.findMany({
      where,
      select: { slug: true, name: true, rating: true, reviewCount: true, logoUrl: true, city: { select: { name: true } }, services: { select: { service: { select: { name: true } } }, take: 2, orderBy: { weight: "desc" as const } } },
      // Come negli elenchi: la priorità decisa a mano vale anche qui.
      orderBy: agencyOrder,
      take: 12,
    }),
    db.agency.count({ where }),
  ]);
  return NextResponse.json({ total, items: items.map((a) => ({ slug: a.slug, name: a.name, rating: a.rating, reviewCount: a.reviewCount, logoUrl: a.logoUrl, city: a.city?.name ?? null, services: a.services.map((s) => s.service.name) })) });
}
