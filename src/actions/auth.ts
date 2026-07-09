"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  onboardingSchema,
  signupSchema,
} from "@/lib/validations/auth";
import { firstIssue, type ActionResult } from "@/lib/action-result";
import { slugify, randomCode } from "@/lib/utils";

export async function signup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    console.error("[auth] signup:", error.message);
    return {
      ok: false,
      error:
        error.code === "user_already_exists"
          ? "Un compte existe déjà avec cet email"
          : "Impossible de créer le compte, réessayez",
    };
  }

  // Confirmation email désactivée → session immédiate → onboarding.
  // Sinon, l'utilisateur doit cliquer le lien reçu par email.
  if (data.session) redirect("/onboarding");
  return { ok: true, data: undefined };
}

export async function login(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: "Email ou mot de passe incorrect" };
  }

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createOrganization(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse({
    organizationName: formData.get("organizationName"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Déjà membre d'une org → direction dashboard.
  const { data: existing } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existing) redirect("/dashboard");

  const base = slugify(parsed.data.organizationName) || "commerce";
  // Suffixe aléatoire : évite les collisions sans requête préalable.
  const slug = `${base.slice(0, 40)}-${randomCode(4).toLowerCase()}`;

  const { error } = await supabase.rpc("create_organization", {
    org_name: parsed.data.organizationName,
    org_slug: slug,
  });

  if (error) {
    console.error("[auth] create_organization:", error.message);
    return { ok: false, error: "Impossible de créer l'établissement" };
  }

  redirect("/dashboard");
}
