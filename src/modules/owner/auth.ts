// Area titolari: si entra con un link mandato a un'email sul dominio del professionista.
// Nessuna password da custodire, cookie firmato come per l'admin.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const OWNER_COOKIE = "ma_owner";
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

const secret = () => process.env.APP_SECRET || "dev-secret-change-me";
const sign = (p: string) => createHmac("sha256", secret()).update(p).digest("hex");

export function makeOwnerToken(agencyId: string): string {
  const p = `owner.${agencyId}.${Date.now() + TTL_MS}`;
  return `${p}.${sign(p)}`;
}

/** Id del professionista nel cookie, se la firma regge e non è scaduto. */
export function readOwnerToken(t: string | undefined): string | null {
  if (!t) return null;
  const i = t.lastIndexOf(".");
  if (i < 0) return null;
  const p = t.slice(0, i);
  const sig = t.slice(i + 1);
  const [tipo, agencyId, exp] = p.split(".");
  if (tipo !== "owner" || !agencyId || !exp || Number(exp) < Date.now()) return null;
  const want = sign(p);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  return agencyId;
}

export async function currentOwnerId(): Promise<string | null> {
  const c = await cookies();
  return readOwnerToken(c.get(OWNER_COOKIE)?.value);
}

export type OwnerAgency = NonNullable<Awaited<ReturnType<typeof loadOwnerAgency>>>;

async function loadOwnerAgency(id: string) {
  return db.agency.findUnique({
    where: { id },
    include: { city: true, services: { include: { service: true }, orderBy: { weight: "desc" } } },
  });
}

/** Il professionista di chi è collegato; senza cookie valido si torna all'accesso. */
export async function requireOwner() {
  const id = await currentOwnerId();
  if (!id) redirect("/area/");
  const a = await loadOwnerAgency(id);
  if (!a) redirect("/area/?msg=Scheda+non+trovata");
  return a;
}
