import { z } from "zod";

export const newsletterSegmentSchema = z
  .enum(["all", "loyal", "new", "inactive"])
  .default("all");

export const sendNewsletterSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Objet trop court.")
    .max(150, "Objet trop long (150 caractères max)."),
  body: z
    .string()
    .trim()
    .min(10, "Message trop court.")
    .max(5000, "Message trop long (5000 caractères max)."),
  segment: newsletterSegmentSchema,
});
