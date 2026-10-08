import { notFound } from "next/navigation";
import { EmbedFrame } from "./EmbedFrame";
import { db } from "@/lib/db";
import { FormEngine } from "@/modules/leadforms/engine/FormEngine";
import { cookies } from "next/headers";
import { getPublicForm, pickVariantSlug } from "@/modules/leadforms/forms";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EmbedPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const bucketRaw = (await cookies()).get("ma_ab")?.value;
  const form = await getPublicForm(await pickVariantSlug(slug, bucketRaw !== undefined ? Number(bucketRaw) : null));
  if (!form) notFound();
  const prefilled: Record<string, string> = {};
  const serviceSlug = first(sp.servizio);
  const citySlug = first(sp.citta);
  if (serviceSlug && (await db.service.findUnique({ where: { slug: serviceSlug } }))) prefilled.servizio = serviceSlug;
  if (citySlug && (await db.city.findUnique({ where: { slug: citySlug } }))) prefilled.citta = citySlug;
  return (
    <EmbedFrame>
      <FormEngine form={form} prefilled={prefilled} clientId={first(sp.client) || form.config.clientId} />
    </EmbedFrame>
  );
}
