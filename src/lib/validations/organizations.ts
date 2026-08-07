import { z } from "zod";
import { texteOptionnel } from "@/lib/validations/champ-formulaire";

/**
 * Les hôtes autorisés pour les trois liens d'invitation avant-jeu.
 *
 * POURQUOI UNE LISTE BLANCHE, et pas seulement `https://` : ce lien est rendu à
 * des joueurs ANONYMES, sur une page publique servie par l'établissement. On ne
 * laisse donc pas une organisation y inscrire n'importe quel domaine — un
 * `https://` valide suffirait sinon à faire de /play un relais de redirection
 * vers du hameçonnage, avec la caution visuelle du commerce.
 *
 * La liste couvre exactement les trois destinations que l'écran propose :
 *   · `instagram.com`, `tiktok.com` — les profils sociaux ;
 *   · `google.com` (`search.google.com/local/writereview`, `www.google.com/maps`),
 *     `g.page` (`g.page/r/…/review`), `goo.gl` (`maps.app.goo.gl/…`) et `g.co` —
 *     les cinq formes sous lesquelles Google distribue un lien d'avis.
 *
 * La comparaison est faite par SUFFIXE DE POINT (`host === d` ou
 * `host.endsWith("." + d)`) et jamais par `includes` : `instagram.com.evil.com`
 * contient bien « instagram.com » mais appartient à `evil.com`.
 */
export const HOTES_INVITATION_AUTORISES = [
  "instagram.com",
  "tiktok.com",
  "google.com",
  "g.page",
  "goo.gl",
  "g.co",
] as const;

/** Longueur maximale, alignée sur le CHECK de la colonne (`≤ 300`). */
export const LIEN_INVITATION_MAX = 300;

/**
 * Ce lien est-il servable à un joueur anonyme ?
 *
 * Utilisé aux DEUX bouts, et c'est délibéré : à l'ÉCRITURE par le schéma
 * ci-dessous (le commerçant doit apprendre que son lien est refusé), et à la
 * LECTURE par `lib/play-context.ts` (défense en profondeur — même patron de
 * repli silencieux que `asSeasonalTheme`, une valeur relue dont la garde
 * d'écriture aurait changé n'atteint pas l'écran du joueur).
 *
 * `''` est REFUSÉ ici : c'est « non renseigné », pas un lien. Le schéma le
 * traite à part, la lecture l'écarte de la même façon.
 */
export function estLienInvitationSur(valeur: string): boolean {
  if (valeur === "" || valeur.length > LIEN_INVITATION_MAX) return false;
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // Identifiants dans l'URL (`https://qui:quoi@instagram.com`) : patron de
  // `lib/webhook-url.ts`. Ils ne servent ici qu'à masquer l'hôte réel dans la
  // barre d'adresse du joueur.
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return HOTES_INVITATION_AUTORISES.some(
    (domaine) => host === domaine || host.endsWith(`.${domaine}`),
  );
}

/**
 * Un des trois liens. `''` = effacement (la colonne n'a pas de `null`
 * concurrent : '' est la seule façon de dire « non renseigné »).
 */
const lienInvitation = texteOptionnel(
  z
    .string()
    .trim()
    .max(LIEN_INVITATION_MAX, "Lien trop long")
    .refine((v) => v === "" || v.startsWith("https://"), {
      message: "Le lien doit commencer par https://",
    })
    .refine((v) => v === "" || estLienInvitationSur(v), {
      message:
        "Lien non accepté : seuls les liens Instagram, TikTok et Google sont autorisés, sans identifiant dans l'adresse.",
    }),
);

/**
 * Les trois liens de l'établissement proposés au joueur AVANT le jeu.
 *
 * Portée ORGANISATION (et non campagne) : ce sont les comptes de la maison, la
 * campagne ne décide que de les proposer ou non (`prejeu_invitation`).
 */
export const updateOrganizationSocialLinksSchema = z.object({
  google_review_url: lienInvitation,
  instagram_url: lienInvitation,
  tiktok_url: lienInvitation,
});
