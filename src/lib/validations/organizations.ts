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
 * DEUX RÉGIMES, et la différence n'est pas cosmétique :
 *
 *   · Les PROFILS SOCIAUX (`instagram.com`, `tiktok.com`) sont acceptés par
 *     SUFFIXE DE POINT, chemin libre : tout le domaine sert à publier des
 *     profils, il n'y a rien de plus à borner.
 *   · GOOGLE est accepté par HÔTE EXACT et CHEMIN BORNÉ. Le suffixe `google.com`
 *     laissait passer bien plus qu'un lien d'avis : `sites.google.com/view/…`
 *     héberge des pages librement composées (un owner pouvait y maquetter un
 *     faux formulaire et le faire servir aux joueurs sous la tuile « ⭐ Donnez
 *     votre avis — Sur Google »), `www.google.com/url?q=…` et `/amp/s/…` sont
 *     des redirecteurs ouverts vers n'importe quelle destination, et
 *     `accounts.google.com` est un écran de connexion — les trois exactement ce
 *     que la liste blanche existe pour interdire. Même raison pour `goo.gl`, qui
 *     n'est admis que sur l'hôte `maps.app.goo.gl` : le suffixe acceptait
 *     `sub.evil.goo.gl`.
 *
 * `g.co` a été RETIRÉ : `g.co/kgs/…` raccourcit une fiche du Knowledge Graph,
 * pas un lien d'avis, et le domaine est un raccourcisseur Google généraliste
 * (`g.co/recover`, …) dont la destination n'appartient pas au commerce. Les
 * quatre formes conservées ci-dessous couvrent le lien que Google donne
 * réellement au commerçant pour demander un avis.
 *
 * La comparaison de suffixe est faite par POINT (`host === d` ou
 * `host.endsWith("." + d)`) et jamais par `includes` : `instagram.com.evil.com`
 * contient bien « instagram.com » mais appartient à `evil.com`.
 */
export const HOTES_INVITATION_AUTORISES = ["instagram.com", "tiktok.com"] as const;

/** `/maps` ou `/maps/…`, jamais `/mapsomething`. */
function sousChemin(chemin: string, prefixe: string): boolean {
  return chemin === prefixe || chemin.startsWith(`${prefixe}/`);
}

/**
 * Google : hôte EXACT (pas de suffixe) + chemin borné. Tout le reste du domaine
 * — sites., accounts., /url, /amp/… — est refusé par construction.
 */
const CHEMINS_GOOGLE_AUTORISES: ReadonlyArray<
  readonly [hote: string, cheminAccepte: (chemin: string) => boolean]
> = [
  // Le formulaire « Rédiger un avis » lui-même.
  ["search.google.com", (c) => sousChemin(c, "/local/writereview")],
  // La fiche sur Maps.
  ["www.google.com", (c) => sousChemin(c, "/maps")],
  ["google.com", (c) => sousChemin(c, "/maps")],
  // Forme historique de la fiche (`maps.google.com/?cid=…`), bornée à la racine
  // et à /maps pour ne pas rouvrir le redirecteur `/url`.
  ["maps.google.com", (c) => c === "/" || sousChemin(c, "/maps")],
  // Lien court de la fiche. Chemin libre : cet hôte ne sert QU'À ça.
  ["maps.app.goo.gl", () => true],
  // Lien court officiel de la fiche (`g.page/r/…/review`, ou le nom court
  // personnalisé `g.page/chez-marcel`). Même raison : le domaine entier est
  // réservé aux fiches d'établissement.
  ["g.page", () => true],
];

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
  // Aucun port : `https://instagram.com:1` n'est pas une adresse qu'Instagram
  // sert, seulement une façon de pointer un autre écouteur sur cet hôte.
  if (url.port !== "") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    HOTES_INVITATION_AUTORISES.some(
      (domaine) => host === domaine || host.endsWith(`.${domaine}`),
    )
  ) {
    return true;
  }
  // `url.pathname` est déjà normalisé par `URL` : `/maps/../url` y arrive en
  // `/url`, et ne passe donc aucune des bornes ci-dessous.
  return CHEMINS_GOOGLE_AUTORISES.some(
    ([hote, cheminAccepte]) => host === hote && cheminAccepte(url.pathname),
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
        "Lien non accepté : seuls un profil Instagram ou TikTok et un lien d'avis Google (search.google.com/local/writereview, google.com/maps, maps.app.goo.gl, g.page) sont autorisés, sans identifiant ni port dans l'adresse.",
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
