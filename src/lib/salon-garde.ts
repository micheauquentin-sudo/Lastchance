import "server-only";

import { getUserAndOrg } from "@/lib/auth";
import type { LobbyKind } from "@/lib/lobby";
import { droitEffectifModule } from "@/lib/subscription";
import { entreeModule } from "@/platform/experiences/catalog";

/**
 * LA PORTE DES RÉGLAGES D'UN JEU DE SALON (DUO-3b).
 *
 * ── POURQUOI ELLE EXISTE, ET CE QU'ELLE REMPLACE ──
 *
 * `loadDuoOptions`, `loadBandePack` et les trois actions d'écriture des deux
 * jeux passaient par `gardeEditeurVitrine` — la garde du droit `vitrine`. Son
 * en-tête assumait ce choix et nommait lui-même ce qui le ferait tomber :
 * « un salon jouable hors vitrine, ou un plateau vendu séparément ». LES DEUX
 * SONT ARRIVÉS.
 *
 *   · `20261022120000_salons_sans_vitrine` : `create_player_lobby` n'exige plus
 *     `vitrine`, et `/dashboard/salons/[jeu]` sert déjà l'adresse publique
 *     depuis le slug d'organisation pour les commerces sans carte ;
 *   · DUO-2 : `duo` et `bande` sont vendables seuls, 12 €/mois chacun.
 *
 * Un commerçant qui achète le Duo seul était donc VERROUILLÉ HORS DE SES
 * PROPRES RÉGLAGES par une garde qui parlait d'un autre produit — et le message
 * qu'il lisait (« Votre offre ne comprend pas la Vitrine ») désignait une offre
 * qu'il n'avait pas cherché à acheter.
 *
 * ── ELLE N'EST PAS PLUS PERMISSIVE QU'AVANT, POUR PRESQUE TOUT LE MONDE ──
 *
 * `duo` et `bande` sont compris dans les CINQ offres (`src/lib/plans.ts`) :
 * quiconque avait `vitrine` a aussi le jeu. Ce que ce changement ouvre est le
 * cas neuf — le jeu sans la carte — et rien d'autre.
 *
 * ── CE QU'ELLE NE TIENT PAS ──
 *
 * Elle rend un message, elle ne tient pas la porte. Les gardes réelles restent
 * la RLS (`is_org_editor` sur `duo_options` et `bande_settings`) et les
 * vérifications d'acteur EN SQL de `set_duo_options`, `set_duo_suggestion` et
 * `set_bande_pack`. Motif exact de `gardeEditeurVitrine`, dont elle reprend
 * l'ordre des trois questions : session, rôle, droit.
 */
export type GardeSalon =
  | { ok: true; organizationId: string; userId: string }
  | { ok: false; error: string };

const NON_AUTHENTIFIE = "Session expirée, reconnectez-vous.";
const NOT_EDITOR = "Action non autorisée";

/**
 * Le refus de droit NOMME LE JEU, et il le prend au catalogue.
 *
 * Recopier « Duo Miroir » ici en aurait fait une seconde source de vérité pour
 * un libellé que `MODULE_CATALOG` porte déjà — le motif exact que
 * `/dashboard/salons/[jeu]` a suivi quand il a cessé d'écrire son titre.
 */
function sansDroit(jeu: LobbyKind): string {
  const fiche = entreeModule(jeu);
  return `Votre offre ne comprend pas ${fiche ? fiche.label : "ce jeu"}.`;
}

export async function gardeEditeurJeuSalon(
  jeu: LobbyKind,
): Promise<GardeSalon> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, error: NON_AUTHENTIFIE };
  // LE CAISSIER EST EXCLU, motif `gardeEditeurVitrine` : composer un plateau
  // est de la configuration, pas un geste de comptoir.
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: NOT_EDITOR };
  }
  if (!droitEffectifModule(jeu, organization)) {
    return { ok: false, error: sansDroit(jeu) };
  }
  return { ok: true, organizationId: organization.id, userId: user.id };
}
