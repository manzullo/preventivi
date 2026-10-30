// Impression e click sulle schede + CTA verso il form (AnalyticsEvent),
// inviati con sendBeacon. cta_click e hero_view non hanno professionista: portano
// posizione e variante hero nel meta.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { COOKIE_INTERNO } from "@/app/api/interno/route";

export const dynamic = "force-dynamic";
const WITH_AGENCY = new Set(["impression", "card_click", "contact_click"]);
const WITHOUT_AGENCY = new Set(["cta_click", "hero_view", "page_view"]);
const POSITIONS = new Set(["hero", "mid", "end", "faq", "sticky", "agency", "blog"]);

type Ev = { type: string; agency?: string; path?: string; meta?: { position?: string; hero?: string } };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { events?: Ev[]; sessionId?: string } | null;
  const events = (body?.events ?? []).filter((e) => (WITH_AGENCY.has(e.type) && typeof e.agency === "string") || WITHOUT_AGENCY.has(e.type)).slice(0, 50);
  if (!events.length) return NextResponse.json({ ok: false }, { status: 400 });
  const slugs = [...new Set(events.map((e) => e.agency).filter((x): x is string => Boolean(x)))];
  const agencies = slugs.length ? await db.agency.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } }) : [];
  const byId = new Map(agencies.map((a) => [a.slug, a.id]));
  const sessionId = body?.sessionId?.slice(0, 80);
  // Il contrassegno lo legge il server dal cookie: il browser non lo vede e non
  // può mentire in nessuna delle due direzioni.
  const interno = (await cookies()).get(COOKIE_INTERNO)?.value === "1";
  const rows: Prisma.AnalyticsEventCreateManyInput[] = [];
  for (const e of events) {
    const path = e.path?.slice(0, 300);
    if (WITH_AGENCY.has(e.type)) {
      const agencyId = byId.get(e.agency as string);
      if (agencyId) rows.push({ type: e.type, agencyId, path, sessionId, interno });
    } else {
      const meta = { position: e.meta?.position && POSITIONS.has(e.meta.position) ? e.meta.position : undefined, hero: e.meta?.hero === "dark" ? "dark" : e.meta?.hero === "light" ? "light" : undefined };
      rows.push({ type: e.type, path, sessionId, meta, interno });
    }
  }
  if (rows.length) await db.analyticsEvent.createMany({ data: rows });
  return NextResponse.json({ ok: true });
}
