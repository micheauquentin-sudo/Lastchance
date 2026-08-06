import { z } from "zod";
import { nonRenduVaut } from "@/lib/validations/champ-formulaire";

/** Segment ciblé — le champ non rendu vaut « tous », comme le champ vide. */
export const newsletterSegmentSchema = nonRenduVaut(
  z.enum(["all", "loyal", "new", "inactive"]),
  "all",
);

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
