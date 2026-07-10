import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Retour OAuth (Google) : échange le code contre une session.
 * Configurer dans Supabase : Auth → URL Configuration →
 * ajouter {APP_URL}/auth/callback aux Redirect URLs.
 * Un nouvel utilisateur sans organisation est redirigé vers
 * /onboarding par le layout du dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect("/dashboard");
    }
    console.error("[auth] oauth callback:", error.message);
  }

  redirect("/login?error=oauth");
}
