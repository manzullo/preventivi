"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { EMAIL_RE } from "@/modules/leadforms/schema";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function submitApplication(fd: FormData) {
  if (s(fd, "hp")) redirect("/candidatura/?ok=1");
  const name = s(fd, "name");
  const email = s(fd, "email");
  if (!name || !EMAIL_RE.test(email) || fd.get("consenso") !== "on") redirect(`/candidatura/?errore=${encodeURIComponent("Compila nome, email valida e consenso")}`);
  await db.application.create({
    data: {
      name,
      website: s(fd, "website") || null,
      email: email.toLowerCase(),
      phone: s(fd, "phone") || null,
      citySlug: s(fd, "city") || null,
      services: fd.getAll("services").map(String).slice(0, 10) as unknown as Prisma.InputJsonValue,
      message: s(fd, "message").slice(0, 2000) || null,
    },
  });
  await db.analyticsEvent.create({ data: { type: "application_submit", path: "/candidatura/" } });
  redirect("/candidatura/?ok=1");
}
