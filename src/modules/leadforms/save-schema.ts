// Payload di salvataggio del builder (usato dalla server action e dall'import).

import { z } from "zod";
import { formConfigSchema, stepConfigSchema } from "./schema";

export const savePayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["draft", "active", "archived"]),
  testMode: z.boolean(),
  abGroup: z.string().nullable().optional(),
  abWeight: z.number().int().min(1).max(100).default(50),
  config: formConfigSchema,
  steps: z.array(
    z.object({
      id: z.string().optional(),
      key: z.string().regex(/^[a-z0-9_]+$/),
      enabled: z.boolean(),
      config: stepConfigSchema,
    }),
  ),
  conversions: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      gadsId: z.string().min(1),
      gadsLabel: z.string().min(1),
      value: z.number().nullable(),
      currency: z.string().default("EUR"),
      enabled: z.boolean(),
      customerId: z.string().nullable().optional(),
      conversionActionId: z.string().nullable().optional(),
      apiUpload: z.boolean().default(false),
    }),
  ),
});
export type SavePayload = z.infer<typeof savePayloadSchema>;
