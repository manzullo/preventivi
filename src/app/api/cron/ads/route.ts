// Da chiamare da uno scheduler esterno (cron del VPS, n8n):
//   GET /api/cron/ads/?key=CRON_KEY   → processa la coda upload conversioni
import { NextResponse } from "next/server";
import { processUploads } from "@/modules/ads/uploads";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.CRON_KEY || key !== process.env.CRON_KEY) return NextResponse.json({ ok: false }, { status: 401 });
  const r = await processUploads({ limit: 50 });
  return NextResponse.json({ ok: true, ...r });
}
