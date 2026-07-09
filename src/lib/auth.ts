import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Utilisateur connecté + son organisation (première appartenance).
 * `cache()` déduplique l'appel au sein d'un même rendu.
 */
export const getUserAndOrg = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, organization: null };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return { user, organization: membership?.organizations ?? null };
});
