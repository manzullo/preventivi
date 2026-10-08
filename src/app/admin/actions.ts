"use server";

// Server action dell'admin. Ogni azione ricontrolla la sessione.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma";
import { ADMIN_COOKIE, TTL_BREVE_MS, TTL_LUNGO_MS, checkCredentials, isAdmin, makeToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { savePayloadSchema } from "@/modules/leadforms/save-schema";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const pw = String(formData.get("password") ?? "");
  // Dove tornare dopo: solo indirizzi di questo sito, altrimenti il campo
  // diventa un modo per spedire la gente altrove partendo da una nostra pagina.
  const torna = String(formData.get("torna") ?? "");
  const destinazione = torna.startsWith("/") && !torna.startsWith("//") ? torna : "/admin/";
  const s = await checkCredentials(email, pw);
  if (!s) redirect(`/admin/login/?errore=1${torna ? `&torna=${encodeURIComponent(torna)}` : ""}`);
  const ricorda = formData.get("ricorda") === "1";
  const c = await cookies();
  c.set(ADMIN_COOKIE, makeToken(s.email, s.ruolo, ricorda ? TTL_LUNGO_MS : TTL_BREVE_MS), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    // Senza maxAge è un cookie di sessione: si cancella chiudendo il browser.
    ...(ricorda ? { maxAge: TTL_LUNGO_MS / 1000 } : {}),
  });
  redirect(destinazione);
}

export async function logout() {
  const c = await cookies();
  c.delete(ADMIN_COOKIE);
  redirect("/admin/login/");
}

async function guard() {
  if (!(await isAdmin())) throw new Error("Non autorizzato");
}

// ---------- Form ----------



export async function saveForm(json: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await guard();
  const parsed = savePayloadSchema.safeParse(JSON.parse(json));
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const p = parsed.data;

  const keys = p.steps.map((s) => s.key);
  if (new Set(keys).size !== keys.length) return { ok: false, error: "Chiavi degli step duplicate" };

  const slugOwner = await db.form.findUnique({ where: { slug: p.slug }, select: { id: true } });
  if (slugOwner && slugOwner.id !== p.id) return { ok: false, error: "Slug già usato da un altro form" };

  const data = { name: p.name, slug: p.slug, status: p.status, testMode: p.testMode, abGroup: p.abGroup?.trim() || null, abWeight: p.abWeight, config: p.config as unknown as Prisma.InputJsonValue };
  const form = p.id ? await db.form.update({ where: { id: p.id }, data }) : await db.form.create({ data });

  await db.$transaction(async (tx) => {
    const keepIds = p.steps.map((s) => s.id).filter((x): x is string => Boolean(x));
    await tx.formStep.deleteMany({ where: { formId: form.id, id: { notIn: keepIds } } });
    for (const [i, s] of p.steps.entries()) {
      const { type, ...rest } = s.config;
      const row = { formId: form.id, key: s.key, type, position: i, enabled: s.enabled, config: rest as unknown as Prisma.InputJsonValue };
      if (s.id) await tx.formStep.update({ where: { id: s.id }, data: row });
      else await tx.formStep.create({ data: row });
    }
    const keepConv = p.conversions.map((c) => c.id).filter((x): x is string => Boolean(x));
    await tx.formConversion.deleteMany({ where: { formId: form.id, id: { notIn: keepConv } } });
    for (const c of p.conversions) {
      const row = { formId: form.id, name: c.name, gadsId: c.gadsId, gadsLabel: c.gadsLabel, value: c.value, currency: c.currency, enabled: c.enabled, customerId: c.customerId?.replace(/\D+/g, "") || null, conversionActionId: c.conversionActionId?.replace(/\D+/g, "") || null, apiUpload: c.apiUpload };
      if (c.id) await tx.formConversion.update({ where: { id: c.id }, data: row });
      else await tx.formConversion.create({ data: row });
    }
    await tx.changelogEntry.create({ data: { area: "form", action: p.id ? "update" : "create", subject: form.slug, actor: "admin" } });
  });

  revalidatePath("/preventivo/");
  return { ok: true, id: form.id };
}

export async function deleteForm(id: string) {
  await guard();
  const f = await db.form.findUnique({ where: { id }, select: { slug: true } });
  await db.form.delete({ where: { id } });
  await db.changelogEntry.create({ data: { area: "form", action: "delete", subject: f?.slug, actor: "admin" } });
  redirect("/admin/form/");
}

export async function duplicateForm(id: string) {
  await guard();
  const src = await db.form.findUnique({ where: { id }, include: { steps: true, conversions: true } });
  if (!src) return;
  let slug = `${src.slug}-copia`;
  for (let i = 2; await db.form.findUnique({ where: { slug } }); i++) slug = `${src.slug}-copia-${i}`;
  const copy = await db.form.create({
    data: {
      name: `${src.name} (copia)`,
      slug,
      status: "draft",
      testMode: src.testMode,
      config: src.config as Prisma.InputJsonValue,
      steps: { create: src.steps.map((s) => ({ key: s.key, type: s.type, position: s.position, enabled: s.enabled, config: s.config as Prisma.InputJsonValue })) },
      conversions: { create: src.conversions.map((c) => ({ name: c.name, gadsId: c.gadsId, gadsLabel: c.gadsLabel, value: c.value, currency: c.currency, enabled: c.enabled, customerId: c.customerId, conversionActionId: c.conversionActionId, apiUpload: c.apiUpload })) },
    },
  });
  redirect(`/admin/form/${copy.id}/`);
}

export async function importForm(formData: FormData) {
  await guard();
  const raw = String(formData.get("json") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect("/admin/form/?errore=json");
  }
  const p = savePayloadSchema.omit({ id: true }).safeParse(parsed);
  if (!p.success) redirect("/admin/form/?errore=schema");
  let slug = p.data.slug;
  for (let i = 2; await db.form.findUnique({ where: { slug } }); i++) slug = `${p.data.slug}-${i}`;
  const res = await saveForm(JSON.stringify({ ...p.data, slug, status: "draft" }));
  if (!res.ok) redirect("/admin/form/?errore=schema");
  redirect(`/admin/form/${res.id}/`);
}

// ---------- Lead ----------

export async function setLeadStatus(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const price = formData.get("soldPrice");
  if (!["new", "qualified", "sold", "rejected"].includes(status)) return;
  await db.lead.update({
    where: { id },
    data: {
      status,
      soldPrice: status === "sold" && price ? Number(price) : status === "sold" ? undefined : null,
      soldAt: status === "sold" ? new Date() : null,
    },
  });
  revalidatePath("/admin/lead/");
  revalidatePath(`/admin/lead/${id}/`);
}

// ---------- Smistamento ----------

export async function proposeAssignmentAction(formData: FormData) {
  await guard();
  const leadId = String(formData.get("leadId") ?? "");
  const agencyId = String(formData.get("agencyId") ?? "");
  const bySlug = String(formData.get("agencySlug") ?? "").trim();
  const { proposeAssignment } = await import("@/modules/leads/assign");
  const id = agencyId || (bySlug ? (await db.agency.findUnique({ where: { slug: bySlug }, select: { id: true } }))?.id : undefined);
  if (!id) redirect(`/admin/lead/${leadId}/?msg=${encodeURIComponent("Professionista non trovata")}`);
  const r = await proposeAssignment(leadId, id);
  await db.changelogEntry.create({ data: { area: "lead", action: "propose", subject: leadId, diff: { agencyId: id, ok: r.ok } as Prisma.InputJsonValue, actor: "admin" } });
  revalidatePath(`/admin/lead/${leadId}/`);
  redirect(`/admin/lead/${leadId}/?msg=${encodeURIComponent(r.message)}`);
}

export async function autoAssignAction(formData: FormData) {
  await guard();
  const leadId = String(formData.get("leadId") ?? "");
  const { autoAssign } = await import("@/modules/leads/assign");
  const r = await autoAssign(leadId);
  await db.changelogEntry.create({ data: { area: "lead", action: "auto_assign", subject: leadId, diff: { ok: r.ok, message: r.message.slice(0, 500) } as Prisma.InputJsonValue, actor: "admin" } });
  revalidatePath(`/admin/lead/${leadId}/`);
  revalidatePath("/admin/lead/");
  redirect(`/admin/lead/${leadId}/?msg=${encodeURIComponent(r.message)}`);
}

export async function sendAssignmentAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const { sendAssignment } = await import("@/modules/leads/assign");
  const r = await sendAssignment(id);
  await db.changelogEntry.create({ data: { area: "lead", action: "send", subject: leadId, diff: { assignment: id, ok: r.ok } as Prisma.InputJsonValue, actor: "admin" } });
  revalidatePath(`/admin/lead/${leadId}/`);
  redirect(`/admin/lead/${leadId}/?msg=${encodeURIComponent(r.message)}`);
}

export async function assignmentStatusAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const status = String(formData.get("status") ?? "");
  const price = formData.get("price") ? Number(formData.get("price")) : null;
  const { setAssignmentStatus } = await import("@/modules/leads/assign");
  await setAssignmentStatus(id, status, price);
  await db.changelogEntry.create({ data: { area: "lead", action: `assignment_${status}`, subject: leadId, diff: { assignment: id, price } as Prisma.InputJsonValue, actor: "admin" } });
  revalidatePath(`/admin/lead/${leadId}/`);
  revalidatePath("/admin/lead/");
}

export async function removeAssignmentAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  await db.leadAssignment.delete({ where: { id } });
  revalidatePath(`/admin/lead/${leadId}/`);
}
