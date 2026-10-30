"use server";

import { revalidatePath } from "next/cache";
import { respondToAssignment } from "@/modules/leads/assign";

export async function acceptLeadAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  await respondToAssignment(token, "accepted");
  revalidatePath(`/lead/${token}/`);
}

export async function declineLeadAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  await respondToAssignment(token, "declined");
  revalidatePath(`/lead/${token}/`);
}
