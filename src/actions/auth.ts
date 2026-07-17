"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  clearActiveOrganizationCookie,
  setActiveOrganizationCookie,
} from "@/lib/active-organization-cookie";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import {
  loginSchema,
  onboardingSchema,
  signupSchema,
} from "@/lib/validations/auth";
import { slugify, randomCode, type ActionResult } from "@/lib/utils";
import { clientIpFromHeaders } from "@/lib/request-ip";

/**
 * Redirection post-auth optionnelle (ex : accepter une invitation
 * d'équipe). Liste blanche stricte — jamais de redirection ouverte
 * vers une URL arbitraire fournie par le client.
 */
function safeNext(next: FormDataEntryValue | null): string | null {
  return typeof next === "string" && /^\/invite\/[A-Za-z0-9_.-]+$/.test(next)
    ? next
    : null;
}

/** IP source de la requête (pour le rate limiting de l'auth). */
async function requestIp(): Promise<string> {
  const h = await headers();
  return clientIpFromHeaders(h);
}

export async function signup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const next = safeNext(formData.get("next"));

  const ip = await requestIp();
  if (
    !(await rateLimit(rateLimitBucket("auth:signup", ip), RATE_LIMITS.authSignup))
  ) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
    };
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

  // Confirmation email désactivée → session immédiate → onboarding
  // (ou vers l'invitation d'équipe en attente, le cas échéant).
  // Sinon, l'utilisateur doit cliquer le lien reçu par email.
  if (data.session) redirect(next ?? "/onboarding");
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
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const next = safeNext(formData.get("next"));

  const ip = await requestIp();
  if (
    !(await rateLimit(rateLimitBucket("auth:login", ip), RATE_LIMITS.authLogin))
  ) {
    return {
      ok: false,
      error: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: "Email ou mot de passe incorrect" };
  }

  redirect(next ?? "/dashboard");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearActiveOrganizationCookie();
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
    return { ok: false, error: parsed.error.issues[0].message };
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

  const { data: newOrgId, error } = await supabase.rpc("create_organization", {
    org_name: parsed.data.organizationName,
    org_slug: slug,
  });

  if (error) {
    console.error("[auth] create_organization:", error.message);
    return { ok: false, error: "Impossible de créer l'établissement" };
  }

  await writeAuditLog({
    organizationId: typeof newOrgId === "string" ? newOrgId : null,
    actor: user.id,
    action: "organization.create",
    metadata: { slug },
  });

  if (typeof newOrgId === "string") {
    await setActiveOrganizationCookie(newOrgId);
  }

  redirect("/dashboard");
}
