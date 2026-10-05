// "Vicino a te": i professionisti pubblicati più vicini a lat/lng, ordinati per
// distanza reale (coordinate della scheda), più il link alla pagina città
// pubblicata più vicina. Se nei dintorni nessuna scheda ha coordinate si torna
// ai migliori della città più vicina.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { haversineKm } from "@/modules/directory/geo";
import { agencyCardSelect, cityScopeIds, topAgencies } from "@/modules/directory/listing";

export const dynamic = "force-dynamic";

const TAKE = 6;
// Raggi crescenti: in città bastano pochi km, in provincia serve allargare.
const RAGGI_KM = [10, 30, 80];

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
  const city = best ? { slug: best.city.slug, name: best.city.name } : null;
  const cityInfo = best ? { city, path: best.path, cityDistKm: Math.round(best.distKm) } : { city: null, path: null, cityDistKm: null };

  for (const r of RAGGI_KM) {
    const dLat = r / 111;
    const dLng = r / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
    const rows = await db.agency.findMany({
      where: { published: true, lat: { gte: lat - dLat, lte: lat + dLat }, lng: { gte: lng - dLng, lte: lng + dLng } },
      select: { ...agencyCardSelect, lat: true, lng: true },
    });
    const vicini = rows
      .map(({ lat: aLat, lng: aLng, ...a }) => ({ ...a, distKm: haversineKm(lat, lng, aLat as number, aLng as number) }))
      .filter((a) => a.distKm <= r)
      .sort((a, b) => a.distKm - b.distKm || b.score - a.score)
      .slice(0, TAKE);
    if (vicini.length >= 3 || (r === RAGGI_KM[RAGGI_KM.length - 1] && vicini.length > 0)) {
      return NextResponse.json({ mode: "distance", ...cityInfo, items: vicini.map((a) => ({ ...a, distKm: Math.round(a.distKm * 10) / 10 })) });
    }
  }

  if (!best) return NextResponse.json({ ok: false }, { status: 404 });
  const items = await topAgencies({ cityIds: await cityScopeIds(best.city), take: TAKE });
  return NextResponse.json({ mode: "city", ...cityInfo, items });
}
