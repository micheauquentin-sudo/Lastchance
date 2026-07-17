import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cible des liens de confirmation email Supabase.
 * Configurer dans Supabase : Auth → URL Configuration →
 * emails pointant vers {APP_URL}/auth/confirm?token_hash=...&type=...
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      if (type === "recovery" && next === "/update-password") redirect(next);
      if (next && /^\/invite\/[A-Za-z0-9_.-]+$/.test(next)) redirect(next);
      redirect("/onboarding");
    }
  }

  redirect("/login?error=confirmation");
}
