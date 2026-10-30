import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Non autorizzato", { status: 401 });
  const { id } = await ctx.params;
  const f = await db.form.findUnique({ where: { id }, include: { steps: { orderBy: { position: "asc" } }, conversions: true } });
  if (!f) return new Response("Non trovato", { status: 404 });
  const payload = {
    name: f.name,
    slug: f.slug,
    status: f.status,
    testMode: f.testMode,
    config: f.config,
    steps: f.steps.map((s) => ({ key: s.key, enabled: s.enabled, config: { type: s.type, ...(s.config as object) } })),
    conversions: f.conversions.map((c) => ({ name: c.name, gadsId: c.gadsId, gadsLabel: c.gadsLabel, value: c.value, currency: c.currency, enabled: c.enabled, customerId: c.customerId, conversionActionId: c.conversionActionId, apiUpload: c.apiUpload })),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="form-${f.slug}.json"` },
  });
}
