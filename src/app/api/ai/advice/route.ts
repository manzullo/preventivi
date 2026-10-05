import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { advice, type AdviceLevel } from "@/modules/ai/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { level?: AdviceLevel; customerId?: string; formId?: string; days?: number; scopeId?: string; goal?: string };
  const r = await advice(b);
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, ...r });
}
