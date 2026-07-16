import { z } from "zod";

export const webhookUrlSchema = z.object({
  url: z
    .union([
      z.literal("").transform(() => null),
      z.string().trim().url("URL invalide").startsWith("https://", "L'URL doit commencer par https://"),
    ])
    .nullable()
    .default(null),
});
