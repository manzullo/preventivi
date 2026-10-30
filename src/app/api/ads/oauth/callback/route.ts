import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/site";
import { handleOauthCallback } from "@/modules/ads/google-ads";

export const dynamic = "force-dynamic";

function validState(state: string | null): boolean {
  if (!state) return false;
  const [ts, sig] = state.split(".");
  if (!ts || !sig || Date.now() - Number(ts) > 15 * 60_000) return false;
  const want = createHmac("sha256", process.env.APP_SECRET || "dev-secret-change-me").update(`gads:${ts}`).digest("hex").slice(0, 32);
  return want === sig;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!validState(url.searchParams.get("state")) || !code) return NextResponse.redirect(`${BASE_URL}/admin/impostazioni/?gads=state`);
  const ok = await handleOauthCallback(code);
  return NextResponse.redirect(`${BASE_URL}/admin/impostazioni/?gads=${ok ? "ok" : "err"}`);
}
