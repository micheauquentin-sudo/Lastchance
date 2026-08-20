import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { cheminsPublicsVitrine, VITRINE_PUBLIQUE_OUVERTE } from "@/lib/vitrine";

/**
 * PURGE LES PAGES PUBLIQUES D'UNE VITRINE — depuis N'IMPORTE QUEL module.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME (revue sécurité L13, M3) ──
 *
 * `/v/{slug}` est servie en ISR (60 s), et VIT-3 y a ajouté un annuaire de
 * portes DÉRIVÉ de quatre autres modules : les activités actives, les files
 * `open`, les offres `open` et les quiz `active`. Ces quatre drapeaux ne se
 * changent pas depuis l'écran de la vitrine — ils se changent depuis
 * `/dashboard/reservations` et `/dashboard/quiz`, qui ne revalidaient que leurs
 * propres pages.
 *
 * Conséquence, dans les deux sens et la seconde qui compte : un commerçant qui
 * FERME sa file voyait la vitrine continuer à l'annoncer — une porte fantôme
 * qui envoie le visiteur sur une page close, signée du commerce ; et celui qui
 * en OUVRE une la cherchait en vain sur sa propre carte. Une minute, à chaque
 * fois, sur le geste dont l'écran venait de confirmer le succès.
 *
 * ── POURQUOI ICI, ET NI DANS `@/lib/vitrine` NI DANS `@/actions/vitrine` ──
 *
 * `@/lib/vitrine` porte le vocabulaire et il est importé par des composants
 * `"use client"` (`reglages-vitrine.tsx`) : y poser `revalidatePath` ferait
 * entrer du code serveur dans un bundle client.
 *
 * `@/actions/vitrine` est un fichier `"use server"` : TOUT ce qu'il exporte
 * devient un point d'entrée appelable depuis le navigateur. Exporter cette
 * fonction — qui prend un client Supabase et un identifiant d'organisation —
 * aurait ouvert un endpoint pour rendre un helper accessible à deux appelants.
 *
 * Reste donc un module `server-only` dans `src/lib`, motif EXACT de
 * `revalidate-play.ts` : même forme, même client passé par l'appelant, même
 * best-effort.
 *
 * ── LE DRAPEAU RESTE TESTÉ, ET IL SERT ENCORE ──
 *
 * `VITRINE_PUBLIQUE_OUVERTE` refermé, aucune page publique n'existe : rien
 * n'est en cache, il n'y a rien à purger, et la lecture du slug serait payée
 * pour rien à chaque geste de Réserver ou du Quiz. La garde n'est pas un
 * vestige — c'est ce qui rend l'interrupteur d'urgence gratuit.
 *
 * ── LE COÛT, ET POURQUOI IL EST ACCEPTÉ ──
 *
 * Une lecture de slug par geste, arbitrage déjà tranché en L11 pour les gestes
 * éditoriaux de la vitrine. Un commerce SANS adresse publique n'a pas de page :
 * la fonction sort en silence, sans revalider quoi que ce soit et sans rien
 * dire à l'appelant — ce n'est pas une erreur, c'est l'absence de vitrine.
 *
 * LES DEUX LANGUES, pas seulement la française : `cheminsPublicsVitrine` dérive
 * la liste de `VITRINE_LANGUES`. Ne purger que `/v/{slug}` laisserait la page
 * anglaise annoncer l'ancienne porte — l'incohérence la plus difficile à voir,
 * parce que c'est celle que le commerçant francophone ne regarde jamais.
 *
 * `slugConnu` évite la lecture quand l'appelant l'a déjà en main.
 */
export async function revaliderVitrinePublique(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  slugConnu?: string | null,
): Promise<void> {
  if (!VITRINE_PUBLIQUE_OUVERTE) return;

  let slug = slugConnu ?? null;
  if (!slug) {
    const { data } = await supabase
      .from("vitrine_settings")
      .select("slug")
      .eq("organization_id", organizationId)
      .maybeSingle();
    slug = data?.slug ?? null;
  }
  // Pas d'adresse = pas de page publique.
  if (!slug) return;
  for (const chemin of cheminsPublicsVitrine(slug)) revalidatePath(chemin);
}
