"use server";

import { revalidatePath } from "next/cache";

import { LOBBY_KINDS, type LobbyKind } from "@/lib/lobby";
import { monitored, reportError } from "@/lib/monitoring";
import { gardeEditeurJeuSalon } from "@/lib/salon-garde";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";
import { habillageSalonsSchema } from "@/lib/validations/salon-habillage";

// ════════════════════════════════════════════════════════════
// L'HABILLAGE DES SALONS (SALON-1) — un réglage, deux jeux
//
// ── POURQUOI UNE ACTION D'ADMINISTRATION, ET PAS UN `UPDATE` ──
//
// `lobby_settings` n'accorde à `authenticated` qu'un `select`. L'écriture passe
// par `set_lobby_habillage`, rendue au seul `service_role`, et ce n'est pas une
// précaution décorative : la RPC JOURNALISE le geste (`lobby.habillage_set`).
// Un `PATCH` PostgREST direct habillerait le salon sans laisser de trace, et la
// question « qui a mis le nom du commerce sur cet écran, et quand » n'aurait
// plus qu'une réponse sur deux.
//
// La RPC revérifie l'acteur EN SQL (`owner|editor`) : la garde ci-dessous ne la
// remplace pas, elle donne juste un message lisible avant l'aller-retour.
// ════════════════════════════════════════════════════════════

const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const NON_AUTORISE = "Action non autorisée";

/**
 * Ce que rend `setHabillageSalons`.
 *
 * `refuse` est un RÉSULTAT et non une panne, et il est atteignable malgré le
 * schéma : zod a déjà écarté tout thème hors palette et tout fond hors
 * catalogue, donc une 22023 ne peut plus dire qu'une chose — la liste de ce
 * dépôt et le `check` SQL ont DIVERGÉ. C'est un état du dépôt, pas une faute du
 * commerçant : lui répondre « une erreur est survenue » l'enverrait recliquer
 * indéfiniment sur un bouton qui ne peut pas marcher (motif `setBandePack`).
 */
export type SetHabillageSalonsOutcome =
  | { etat: "enregistre" }
  | { etat: "refuse" };

function estJeuDeSalon(valeur: unknown): valeur is LobbyKind {
  return (
    typeof valeur === "string" && (LOBBY_KINDS as readonly string[]).includes(valeur)
  );
}

/**
 * LE COMMERÇANT HABILLE SES SALONS.
 *
 * ── LE RÉGLAGE EST À L'ORGANISATION, DONC IL VAUT POUR LES DEUX JEUX ──
 *
 * Duo Miroir et Portrait de la Bande partagent UNE coquille — celle du socle,
 * qui précède le jeu qu'on y jouera — et `lobby_settings` porte donc une ligne
 * par organisation, pas une par jeu. L'écran de réglages le dit en toutes
 * lettres ; cette action n'a rien à faire du jeu depuis lequel elle est
 * appelée, sinon choisir la garde à passer.
 *
 * ── LE `jeu` NE SERT QU'À LA GARDE ──
 *
 * `gardeEditeurJeuSalon` exige le droit DU jeu, et c'est la bonne borne : un
 * commerçant qui n'a acheté que le Duo règle son salon depuis l'écran du Duo.
 * Que le réglage habille aussi la Bande ne lui donne pas la Bande — il n'a
 * toujours pas d'écran pour l'ouvrir. Un segment inconnu est refusé plutôt que
 * replié sur le premier jeu : un repli ferait passer la garde d'un jeu que le
 * commerçant n'a pas demandé.
 */
export async function setHabillageSalons(
  _prev: ActionResult<SetHabillageSalonsOutcome> | null,
  formData: FormData,
): Promise<ActionResult<SetHabillageSalonsOutcome>> {
  const jeu = formData.get("jeu");
  if (!estJeuDeSalon(jeu)) return { ok: false, error: NON_AUTORISE };

  const garde = await gardeEditeurJeuSalon(jeu);
  if (!garde.ok) return { ok: false, error: garde.error };

  const parsed = habillageSalonsSchema.safeParse({
    // DE LA SESSION. Rien de ce qui identifie le locataire ne vient du
    // formulaire ; seuls le décor et son affichage en viennent.
    organizationId: garde.organizationId,
    theme: formData.get("theme"),
    fondKey: formData.get("fond_key"),
    afficheIdentite: formData.get("affiche_identite"),
  });
  // Ce refus-là se corrige à l'écran, en choisissant autre chose : il garde son
  // message.
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  return monitored("lobby.habillage_set", async () => {
    try {
      const admin = createAdminClient();
      const { error } = await admin.rpc("set_lobby_habillage", {
        p_organization_id: parsed.data.organizationId,
        p_theme: parsed.data.theme,
        p_fond_key: parsed.data.fondKey,
        p_affiche_identite: parsed.data.afficheIdentite,
        p_actor: garde.userId,
      });
      if (error) {
        // 22023 — LE DÉCOR, PAS LE TRANSPORT. Classement sur le SQLSTATE,
        // jamais sur le texte du message.
        if (error.code === "22023") {
          reportError("lobby.habillage_set.refus", error.message);
          return { ok: true as const, data: { etat: "refuse" } as const };
        }
        // 42501 — la garde vient pourtant de passer. Il reste deux causes : le
        // commerçant a été rétrogradé entre la garde et l'appel, ou la clé de
        // service est mal configurée. La seconde rendrait « non autorisé » à
        // tout le monde et pour toujours sans qu'aucune alerte ne parte, d'où la
        // ligne d'observation (motif `setBandePack`).
        if (error.code === "42501") {
          reportError("lobby.habillage_set.refus", error.message);
          return { ok: false as const, error: NON_AUTORISE };
        }
        reportError("lobby.habillage_set", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      // LES DEUX ÉCRANS DE RÉGLAGES, parce que le réglage est le même pour les
      // deux jeux : ne rafraîchir que celui d'où part le geste laisserait
      // l'autre afficher l'ancien décor jusqu'au prochain rechargement, et le
      // commerçant croirait à deux réglages distincts.
      //
      // AUCUN CHEMIN JOUEUR : `/lobby/[code]` est `force-dynamic`, elle relit à
      // chaque ouverture.
      for (const cle of LOBBY_KINDS) revalidatePath(`/dashboard/salons/${cle}`);

      return { ok: true as const, data: { etat: "enregistre" } as const };
    } catch (err) {
      reportError("lobby.habillage_set", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}
