import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { chat, type ChatContext } from "@/modules/ai/chat";
import type { ChatMessage } from "@/modules/ai/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { messages?: ChatMessage[]; context?: ChatContext } | null;
  if (!body || !Array.isArray(body.messages)) return NextResponse.json({ ok: false, error: "Messaggi non validi" }, { status: 400 });
  const r = await chat(body.messages.slice(-40), body.context ?? {});
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, text: r.text, tool_calls: r.tool_calls, usage: r.usage });
}
