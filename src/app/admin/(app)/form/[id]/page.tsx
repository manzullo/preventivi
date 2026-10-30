import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseFormConfig } from "@/modules/leadforms/schema";
import { FormBuilder, type BuilderInitial } from "./FormBuilder";

export const dynamic = "force-dynamic";

export default async function FormEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let initial: BuilderInitial;
  if (id === "nuovo") {
    initial = { name: "Nuovo form", slug: "nuovo-form", status: "draft", testMode: false, config: parseFormConfig({}), steps: [], conversions: [] };
  } else {
    const f = await db.form.findUnique({ where: { id }, include: { steps: { orderBy: { position: "asc" } }, conversions: true } });
    if (!f) notFound();
    initial = {
      id: f.id,
      name: f.name,
      slug: f.slug,
      status: f.status as BuilderInitial["status"],
      testMode: f.testMode,
      abGroup: f.abGroup,
      abWeight: f.abWeight,
      config: parseFormConfig(f.config),
      steps: f.steps.map((s) => ({ id: s.id, key: s.key, enabled: s.enabled, config: { type: s.type, ...(s.config as object) } as BuilderInitial["steps"][number]["config"] })),
      conversions: f.conversions.map((c) => ({ id: c.id, name: c.name, gadsId: c.gadsId, gadsLabel: c.gadsLabel, value: c.value, currency: c.currency, enabled: c.enabled, customerId: c.customerId, conversionActionId: c.conversionActionId, apiUpload: c.apiUpload })),
    };
  }
  return <FormBuilder initial={initial} />;
}
