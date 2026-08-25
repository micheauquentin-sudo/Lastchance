import { revaliderVitrinePublique } from "@/lib/revalidate-vitrine";
import { createClient } from "@/lib/supabase/server";
import { gardeEditeurVitrine } from "@/lib/vitrine-context";

/**
 * Purge ISR demandée après une création locale dans l'éditeur de Vitrine.
 *
 * Cette route n'accepte aucune identité ni aucun slug : la session détermine
 * seule l'organisation. La création reste une Server Action afin de conserver
 * ses erreurs de formulaire ; la purge sort de sa réponse car `revalidatePath`
 * dans une Server Action fait naviguer le routeur RSC en cours.
 */
export async function POST(): Promise<Response> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return new Response(null, { status: 403 });

  const supabase = await createClient();
  await revaliderVitrinePublique(supabase, garde.organizationId);
  return new Response(null, { status: 204 });
}
