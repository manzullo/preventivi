import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { execute } from "@/modules/ai/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { tool?: string; arguments?: Record<string, unknown>; confirmed?: boolean } | null;
  if (!body?.tool) return NextResponse.json({ ok: false, error: "Tool mancante" }, { status: 400 });
  const r = await execute(body.tool, body.arguments ?? {}, Boolean(body.confirmed));
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  if ("result" in r && body.confirmed) {
    await db.changelogEntry.create({ data: { area: "ads", action: `ai:${body.tool}`, subject: String(body.arguments?.customer_id ?? ""), diff: body.arguments as Prisma.InputJsonValue, actor: "ai-assistant (confermato)" } });
  }
  return NextResponse.json({ ok: true, ...r });
}
