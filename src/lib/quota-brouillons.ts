import "server-only";

import { capacitesDuModule } from "@/lib/module-capabilities-server";
import type { GrantableModule } from "@/lib/subscription";

/**
 * LA LIMITE DE BROUILLON, CÔTÉ ACTION.
 *
 * L'écran cache déjà le formulaire quand `canEditDraft` est faux, mais une
 * server action reste POSTable en direct : la page n'est pas une garde. Ce
 * helper est le pendant serveur, et il partage exactement le même calcul —
 * `capacitesDuModule` — pour qu'un écran et son action ne puissent pas
 * répondre différemment à la même question.
 *
 * ── CE QU'IL BORNE, ET CE QU'IL NE BORNE PAS ──
 *
 * Il borne une COURTOISIE : le brouillon gratuit d'un module non payé. Il ne
 * protège aucune recette — ce qui protège la recette est la garde de
 * publication, en base. Le contourner ne donne qu'un second brouillon, jamais
 * une expérience publiée.
 *
 * C'est aussi pourquoi il rend un refus lisible plutôt que de lever : le
 * commerçant qui atteint sa limite n'a rien fait de mal, il a atteint le bout
 * de l'essai gratuit et doit lire quoi faire ensuite.
 */
export async function refuserSiQuotaBrouillonAtteint(
  module: GrantableModule,
): Promise<{ ok: false; error: string } | null> {
  const capacites = await capacitesDuModule(module);

  if (!capacites.canExplore) {
    return {
      ok: false,
      error:
        capacites.message ??
        "Votre rôle ne permet pas de préparer une animation.",
    };
  }

  if (capacites.canEditDraft) return null;

  return {
    ok: false,
    error:
      capacites.message ??
      "Votre brouillon d'essai est déjà utilisé pour ce module.",
  };
}
