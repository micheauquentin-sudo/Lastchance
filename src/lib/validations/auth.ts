import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(72, "Mot de passe trop long"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const onboardingSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(1, "Le nom de votre établissement est requis")
    .max(120, "Nom trop long"),
});
