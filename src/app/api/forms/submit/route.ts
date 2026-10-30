import { NextResponse } from "next/server";
import { submitForm, type SubmitInput } from "@/modules/leadforms/submit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<SubmitInput> | null;
  if (!body || typeof body.formSlug !== "string" || typeof body.answers !== "object" || typeof body.contact !== "object") {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }
  const result = await submitForm({
    formSlug: body.formSlug,
    answers: body.answers ?? {},
    contact: body.contact ?? {},
    prefilled: body.prefilled,
    visitId: typeof body.visitId === "string" ? body.visitId : undefined,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    tracking: body.tracking,
    clientId: typeof body.clientId === "string" ? body.clientId : undefined,
    landingPath: typeof body.landingPath === "string" ? body.landingPath : undefined,
    honeypot: typeof body.honeypot === "string" ? body.honeypot : "",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result);
}
