// Bozze del form (lead parziali): upsert a ogni passo, lettura per riprendere.
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const formSlug = u.searchParams.get("form") ?? "";
  const sessionId = u.searchParams.get("session") ?? "";
  if (!formSlug || !sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  const form = await db.form.findUnique({ where: { slug: formSlug }, select: { id: true } });
  if (!form) return NextResponse.json({ ok: false }, { status: 404 });
  const d = await db.formDraft.findUnique({ where: { formId_sessionId: { formId: form.id, sessionId } } });
  if (!d || d.converted) return NextResponse.json({ ok: true, draft: null });
  return NextResponse.json({ ok: true, draft: { answers: d.answers, contact: d.contact, lastStepKey: d.lastStepKey } });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { formSlug?: string; sessionId?: string; answers?: Record<string, unknown>; contact?: Record<string, string>; lastStepKey?: string; clientId?: string; landingPath?: string } | null;
  if (!b?.formSlug || !b.sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  const form = await db.form.findUnique({ where: { slug: b.formSlug }, select: { id: true } });
  if (!form) return NextResponse.json({ ok: false }, { status: 404 });
  const contact = b.contact ? Object.fromEntries(Object.entries(b.contact).filter(([k]) => k !== "hp").map(([k, v]) => [k, String(v).slice(0, 300)])) : undefined;
  await db.formDraft.upsert({
    where: { formId_sessionId: { formId: form.id, sessionId: b.sessionId.slice(0, 80) } },
    create: { formId: form.id, sessionId: b.sessionId.slice(0, 80), answers: (b.answers ?? {}) as Prisma.InputJsonValue, contact: contact as Prisma.InputJsonValue | undefined, lastStepKey: b.lastStepKey?.slice(0, 60), clientId: b.clientId?.slice(0, 80), landingPath: b.landingPath?.slice(0, 300) },
    update: { answers: (b.answers ?? {}) as Prisma.InputJsonValue, contact: contact as Prisma.InputJsonValue | undefined, lastStepKey: b.lastStepKey?.slice(0, 60) },
  });
  return NextResponse.json({ ok: true });
}
