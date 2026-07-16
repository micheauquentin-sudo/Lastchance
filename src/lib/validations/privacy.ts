import { z } from "zod";

export const dataRetentionSchema = z.object({
  months: z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(1).max(60)])
    .nullable()
    .default(null),
});
