import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estLienInvitationSur } from "@/lib/validations/organizations";

/**
 * LA SORTIE D'APRÈS-JEU (VIT-11) — ce qu'on propose quand la partie est finie.
 *
 * ── CE QUE ÇA RÉPARE ──
 *
 * Un client qui finissait un Quiz, un Duo Miroir ou un Portrait de la Bande
 * lancé depuis une Vitrine arrivait sur un écran terminal SANS AUCUNE PORTE :
 * la carte qu'il lisait cinq minutes plus tôt n'était plus joignable, et le
 * commerce n'existait plus à l'écran. Le bon moment se terminait sur un
 * cul-de-sac.
 *
 * ── AUCUNE NOUVELLE COLONNE, ET C'EST LE POINT ──
 *
 * Les trois liens sont ceux de l'organisation (`google_review_url`,
 * `instagram_url`, `tiktok_url`), déjà saisis dans les réglages et déjà servis
 * AVANT la roue par `invitationAvantJeu` (`src/lib/play-context.ts`). Demander
 * au commerçant de les ressaisir pour la sortie aurait créé deux vérités pour
 * la même adresse Instagram. Ce module lit les mêmes colonnes et applique la
 * même revalidation de forme.
 *
 * ── LA REVALIDATION EST REFAITE ICI ──
 *
 * Le schéma d'écriture l'impose déjà, mais une valeur posée avant que la liste
 * blanche n'existe, ou par un chemin qui l'ignorerait, ne doit pas atteindre
 * l'écran d'un joueur anonyme. Défense en profondeur, repli SILENCIEUX : sur
 * une lecture publique, personne n'attend de message d'erreur.
 *
 * ── CE QUE LA SORTIE N'EST PAS ──
 *
 * Aucun avis ne débloque gain, remise, jeu, accès, rang ou réservation, et
 * aucune question de satisfaction ne précède le lien — filtrer les clients
 * avant de les envoyer sur Google est interdit par les règles de Google, et
 * ce module n'a aucun moyen de le faire : il ne rend que des adresses.
 */

/** Les trois liens de l'organisation, tels qu'ils arrivent de la base. */
export interface LiensOrganisation {
  google_review_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
}

/**
 * Ce que l'écran terminal peut proposer — CONTRAT RENDU AU CLIENT.
 *
 * Une clé n'est présente QUE si sa cible est joignable : le lien a passé la
 * revalidation, ou la Vitrine est publiée. Un objet sans aucune clé n'est
 * jamais rendu — la fonction vaut alors `null`, ce qui dit à l'écran « rien à
 * proposer » sans qu'il ait à compter des clés.
 */
export interface SortieApresJeu {
  /** Slug d'une Vitrine PUBLIÉE — l'écran en fait `/v/{slug}`. */
  vitrine?: string;
  /** Page d'avis Google de l'établissement. */
  google?: string;
  instagram?: string;
  tiktok?: string;
}

/**
 * Le cœur testable : des liens bruts et un slug vers une sortie, ou `null`.
 *
 * `vitrineSlug` vaut `null` quand l'organisation n'a pas de Vitrine ou qu'elle
 * n'est pas publiée. Renvoyer le slug d'une Vitrine non publiée aurait peint
 * un bouton « retour à la carte » qui mène à un refus : une porte fermée est
 * pire que pas de porte.
 */
export function composerSortie(
  liens: LiensOrganisation,
  vitrineSlug: string | null,
): SortieApresJeu | null {
  const sur = (valeur: unknown): string | null =>
    typeof valeur === "string" && estLienInvitationSur(valeur) ? valeur : null;

  const sortie: SortieApresJeu = {};
  if (typeof vitrineSlug === "string" && vitrineSlug.length > 0) {
    sortie.vitrine = vitrineSlug;
  }
  const google = sur(liens.google_review_url);
  if (google) sortie.google = google;
  const instagram = sur(liens.instagram_url);
  if (instagram) sortie.instagram = instagram;
  const tiktok = sur(liens.tiktok_url);
  if (tiktok) sortie.tiktok = tiktok;

  return Object.keys(sortie).length > 0 ? sortie : null;
}

/** Les colonnes lues, en un seul endroit : la jointure et le test les partagent. */
const COLONNES_LIENS = "google_review_url, instagram_url, tiktok_url";

/**
 * La sortie d'une organisation, lue au serveur.
 *
 * DEUX LECTURES et non une jointure : `vitrine_settings` n'a de ligne que si
 * le commerce a une Vitrine, et une jointure gauche depuis `organizations`
 * aurait fait dépendre le résultat d'une relation nommée que le typage ne
 * garantit pas. Deux `maybeSingle` coûtent un aller-retour de plus et se
 * lisent sans note de bas de page.
 *
 * TOUTE ERREUR EST UN `null` MUET : cette lecture décore un écran terminal.
 * Faire échouer la fin d'une partie parce qu'un lien Instagram n'a pas pu être
 * lu serait un très mauvais échange.
 */
export async function sortieDeLOrganisation(
  organizationId: string | null | undefined,
): Promise<SortieApresJeu | null> {
  if (!organizationId) return null;

  try {
    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select(COLONNES_LIENS)
      .eq("id", organizationId)
      .maybeSingle();

    const { data: vitrine } = await admin
      .from("vitrine_settings")
      .select("slug, published")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const liens: LiensOrganisation = {
      google_review_url: (org?.google_review_url as string | null) ?? null,
      instagram_url: (org?.instagram_url as string | null) ?? null,
      tiktok_url: (org?.tiktok_url as string | null) ?? null,
    };

    const slug =
      vitrine && vitrine.published === true
        ? ((vitrine.slug as string | null) ?? null)
        : null;

    return composerSortie(liens, slug);
  } catch {
    return null;
  }
}

/**
 * La sortie d'un salon, par son identifiant.
 *
 * `player_lobbies.organization_id` est la seule chose à traverser : le salon
 * appartient à un commerce, et c'est ce commerce qu'on propose de retrouver.
 */
export async function sortieDuLobby(
  lobbyId: string,
): Promise<SortieApresJeu | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("player_lobbies")
      .select("organization_id")
      .eq("id", lobbyId)
      .maybeSingle();

    return await sortieDeLOrganisation(
      (data?.organization_id as string | null) ?? null,
    );
  } catch {
    return null;
  }
}
