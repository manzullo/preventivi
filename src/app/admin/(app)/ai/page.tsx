import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { isConnected } from "@/modules/ads/google-ads";
import { getAccessibleAccountsWithInfo } from "@/modules/ads/google-ads-reports";
import { AiChat } from "./AiChat";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AiPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const [ai, connected, forms] = await Promise.all([settings.ai(), isConnected(), db.form.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const accounts = connected ? await getAccessibleAccountsWithInfo().catch(() => []) : [];
  const configured = Boolean(ai[`${ai.activeProvider}Key` as const]);
  return <AiChat accounts={accounts.map((a) => ({ id: a.id, name: a.name, manager: a.manager }))} forms={forms} initialCustomer={first(sp.customer)} initialForm={first(sp.form)} configured={configured} />;
}
