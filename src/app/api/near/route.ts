// Capoluogo con pagina città pubblicata più vicino a lat/lng + le suoi professionisti.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { haversineKm } from "@/modules/directory/geo";
import { cityScopeIds, topAgencies } from "@/modules/directory/listing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const pages = await db.landingPage.findMany({
    where: { kind: "city", published: true, city: { lat: { not: null }, lng: { not: null } } },
    select: { path: true, city: { select: { id: true, slug: true, name: true, lat: true, lng: true, isCapital: true } } },
  });
  let best: { path: string; city: NonNullable<(typeof pages)[number]["city"]>; distKm: number } | null = null;
  for (const p of pages) {
    if (!p.city) continue;
    const d = haversineKm(lat, lng, p.city.lat as number, p.city.lng as number);
    if (!best || d < best.distKm) best = { path: p.path, city: p.city, distKm: d };
  }
  if (!best) return NextResponse.json({ ok: false }, { status: 404 });
  const items = await topAgencies({ cityIds: await cityScopeIds(best.city), take: 6 });
  return NextResponse.json({ city: { slug: best.city.slug, name: best.city.name }, path: best.path, distKm: Math.round(best.distKm), items });
}
