import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getAuthorizationUrl } from "@/modules/ads/google-ads";

export const dynamic = "force-dynamic";

export function oauthState(): string {
  const ts = String(Date.now());
  const sig = createHmac("sha256", process.env.APP_SECRET || "dev-secret-change-me").update(`gads:${ts}`).digest("hex").slice(0, 32);
  return `${ts}.${sig}`;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.redirect(new URL("/admin/login/", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4450"));
  const url = await getAuthorizationUrl(oauthState());
  if (!url) return NextResponse.json({ ok: false, error: "Client ID mancante: salva prima le credenziali OAuth." }, { status: 400 });
  return NextResponse.redirect(url);
}
