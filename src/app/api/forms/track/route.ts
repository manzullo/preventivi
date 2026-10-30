import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hashIp, recordStepEvent, recordVisit } from "@/modules/leadforms/tracking";
import { COOKIE_INTERNO } from "@/app/api/interno/route";

export const dynamic = "force-dynamic";

type Body = {
  type?: string;
  sessionId?: string;
  clientId?: string;
  formId?: string;
  stepId?: string;
  path?: string;
  tracking?: Record<string, string>;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.sessionId !== "string" || !body.sessionId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const interna = (await cookies()).get(COOKIE_INTERNO)?.value === "1";

  if (body.type === "visit") {
    const t = body.tracking ?? {};
    const visitId = await recordVisit({
      interna,
      sessionId: body.sessionId,
      clientId: body.clientId,
      landingPath: t.landing_path,
      referrer: t.referrer,
      utmSource: t.utm_source,
      utmMedium: t.utm_medium,
      utmCampaign: t.utm_campaign,
      utmTerm: t.utm_term,
      utmContent: t.utm_content,
      gclid: t.gclid,
      gbraid: t.gbraid,
      wbraid: t.wbraid,
      matchType: t.matchtype,
      device: t.device,
      network: t.network,
      ipHash: hashIp(ip),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true, visitId });
  }

  if ((body.type === "step_view" || body.type === "step_completed") && body.formId && body.stepId) {
    await recordStepEvent({ type: body.type, formId: body.formId, stepId: body.stepId, sessionId: body.sessionId, path: body.path });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
