"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings, smtpSchema, siteSchema, trackingSchema, whatsappSchema } from "@/lib/settings";
import { leadText } from "@/modules/notify/dispatch";
import { sendEmail } from "@/modules/notify/email";
import { sendWhatsapp } from "@/modules/notify/whatsapp";

async function guard() {
  if (!(await isAdmin())) throw new Error("Non autorizzato");
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveSmtp(fd: FormData) {
  await guard();
  const prev = await settings.smtp();
  await settings.saveSmtp(
    smtpSchema.parse({
      host: str(fd, "host"),
      port: Number(str(fd, "port")) || 587,
      secure: fd.get("secure") === "on",
      user: str(fd, "user"),
      pass: str(fd, "pass") || prev.pass,
      from: str(fd, "from"),
      fromName: str(fd, "fromName"),
      replyTo: str(fd, "replyTo"),
    }),
  );
  revalidatePath("/admin/impostazioni/");
}

export async function saveWhatsapp(fd: FormData) {
  await guard();
  const prev = await settings.whatsapp();
  await settings.saveWhatsapp(
    whatsappSchema.parse({
      provider: str(fd, "provider") || "none",
      evolutionUrl: str(fd, "evolutionUrl"),
      evolutionInstance: str(fd, "evolutionInstance"),
      evolutionKey: str(fd, "evolutionKey") || prev.evolutionKey,
      callmebotKey: str(fd, "callmebotKey") || prev.callmebotKey,
    }),
  );
  revalidatePath("/admin/impostazioni/");
}

export async function saveTracking(fd: FormData) {
  await guard();
  await settings.saveTracking(trackingSchema.parse({ gtmId: str(fd, "gtmId"), ga4Id: str(fd, "ga4Id"), clarityId: str(fd, "clarityId") }));
  revalidatePath("/admin/impostazioni/");
}

export async function saveSite(fd: FormData) {
  await guard();
  await settings.saveSite(siteSchema.parse({
    nearbyBlock: fd.get("nearbyBlock") === "on",
    nearbyGroups: str(fd, "nearbyGroups") || 3,
    nearbyPerGroup: str(fd, "nearbyPerGroup") || 4,
    nearbyCap: str(fd, "nearbyCap") || 10,
    whatsappCta: fd.get("whatsappCta") === "on",
    faqAuto: fd.get("faqAuto") === "on",
    heroTest: fd.get("heroTest") === "on",
    heroStyle: str(fd, "heroStyle") || "auto",
  }));
  revalidatePath("/", "layout");
}

export async function saveNotification(fd: FormData) {
  await guard();
  const id = str(fd, "id");
  const list = (k: string) => str(fd, k).split(",").map((x) => x.trim()).filter(Boolean);
  const minValue = str(fd, "minValue");
  const data = {
    name: str(fd, "name") || "Notifica",
    channel: str(fd, "channel") || "email",
    recipients: list("recipients") as unknown as Prisma.InputJsonValue,
    formId: str(fd, "formId") || null,
    rules: {
      minValue: minValue ? Number(minValue) : undefined,
      services: list("services"),
      cities: list("cities"),
      excludeTest: fd.get("includeTest") !== "on",
    } as Prisma.InputJsonValue,
    enabled: fd.get("enabled") === "on",
  };
  if (id) await db.notification.update({ where: { id }, data });
  else await db.notification.create({ data });
  revalidatePath("/admin/impostazioni/");
}

export async function deleteNotification(fd: FormData) {
  await guard();
  await db.notification.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/admin/impostazioni/");
}

export async function testNotification(fd: FormData): Promise<void> {
  await guard();
  const n = await db.notification.findUnique({ where: { id: str(fd, "id") } });
  if (!n) return;
  const recipients = (Array.isArray(n.recipients) ? n.recipients : []) as string[];
  const text = `[TEST] ${leadText({ id: "test", name: "Mario Rossi", company: "Azienda di prova", email: "mario@example.com", phone: "+39 333 0000000", budget: "1000-3000", timing: "1m", description: "Messaggio di prova dalle impostazioni.", service: { plural: "Professionisti SEO" }, city: { name: "Roma" }, utmSource: "test", gclid: null, clientId: "migliori-agenzie" })}`;
  let status = "sent";
  let error: string | undefined;
  try {
    if (n.channel === "email") await sendEmail(recipients, "[TEST] Notifica lead", text);
    else await sendWhatsapp(recipients, text);
  } catch (e) {
    status = "failed";
    error = String(e).slice(0, 500);
  }
  await db.notificationLog.create({ data: { notificationId: n.id, status, error, payload: { test: true, recipients } as Prisma.InputJsonValue } });
  revalidatePath("/admin/impostazioni/");
}

// ---------- AI Assistant ----------

export async function saveAi(fd: FormData) {
  await guard();
  const { aiSchema } = await import("@/lib/settings");
  const prev = await settings.ai();
  const keep = (k: keyof typeof prev) => str(fd, k) || (prev[k] as string);
  await settings.saveAi(
    aiSchema.parse({
      activeProvider: str(fd, "activeProvider") || "claude",
      temperature: Number(str(fd, "temperature").replace(",", ".")) || 0.7,
      maxTokens: Number(str(fd, "maxTokens")) || 4096,
      claudeKey: keep("claudeKey"), claudeModel: str(fd, "claudeModel"),
      openaiKey: keep("openaiKey"), openaiModel: str(fd, "openaiModel"),
      geminiKey: keep("geminiKey"), geminiModel: str(fd, "geminiModel"),
      deepseekKey: keep("deepseekKey"), deepseekModel: str(fd, "deepseekModel"),
      kieaiKey: keep("kieaiKey"), kieaiModel: str(fd, "kieaiModel"),
    }),
  );
  await db.changelogEntry.create({ data: { area: "settings", action: "ai_providers", actor: "admin" } });
  revalidatePath("/admin/impostazioni/");
}

export async function testAi() {
  await guard();
  const { testConnection } = await import("@/modules/ai/provider");
  const r = await testConnection();
  const { redirect } = await import("next/navigation");
  redirect(`/admin/impostazioni/?ai=${r.ok ? "ok" : "err"}-${encodeURIComponent(r.message.slice(0, 160))}`);
}
