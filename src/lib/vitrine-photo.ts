/**
 * VIT-7 — LES PHOTOS DE LA VITRINE, CÔTÉ LECTURE.
 *
 * Ce module est lu par le NAVIGATEUR autant que par le serveur : il ne contient
 * que la convention de nommage, la validation d'un chemin et la construction
 * d'une adresse publique. Le pipeline d'images (sharp, envoi, suppression) vit
 * dans `vitrine-photo-storage.ts`, qui est `server-only`.
 *
 * ── DEUX VARIANTES, UNE SEULE COLONNE ──
 *
 * La base stocke UN chemin. La variante mobile s'en déduit par suffixe :
 *
 *     org/uuid.webp        →  la grande, jusqu'à 1200 px
 *     org/uuid-480.webp    →  celle que sert un téléphone
 *
 * Une seconde colonne aurait doublé le nombre d'états possibles — dont
 * « grande présente, petite absente », qu'aucun écran n'aurait su peindre. Le
 * suffixe est calculé PAR CE MODULE, à l'écriture comme à la lecture : la
 * convention n'existe qu'ici, et une seule fonction la change.
 *
 * ── UNE ADRESSE, PAS UN CHEMIN, DANS `photo_path` ──
 *
 * La colonne porte la CLÉ Storage (`org/uuid.webp`), jamais une URL complète.
 * Une URL en base aurait figé le nom du bucket et le domaine du projet dans
 * chaque ligne — et il aurait fallu réécrire la table le jour d'un changement.
 */

/** Le bucket, créé par la migration 20261023120000. */
export const VITRINE_IMAGES_BUCKET = "vitrine-images";

/** La largeur de la variante mobile, et le suffixe qui la nomme. */
export const VITRINE_PHOTO_LARGEUR_MOBILE = 480;
const SUFFIXE_MOBILE = `-${VITRINE_PHOTO_LARGEUR_MOBILE}`;

/** Bornes du pipeline. La sortie est toujours du webp — le bucket l'impose. */
export const VITRINE_PHOTO_LARGEUR_MAX = 1200;
export const VITRINE_COUVERTURE_LARGEUR_MAX = 1600;
export const VITRINE_PHOTO_OCTETS_MAX = 2 * 1024 * 1024;

/**
 * La data URL d'une image envoyée par l'écran, en CARACTÈRES.
 *
 * Bornée bien en dessous de la limite de corps d'une action serveur (1 Mo par
 * défaut) : au-delà, le refus viendrait du framework, sans message lisible ni
 * moyen de comprendre quoi faire. L'écran compresse jusqu'à tenir dans ce
 * budget, et le serveur ré-encode ensuite de toute façon.
 */
export const VITRINE_PHOTO_DATA_URL_MAX = 900_000;

/** Le texte alternatif, borné comme la colonne (`between 1 and 200`). */
export const VITRINE_PHOTO_ALT_MAX = 200;

/**
 * Combien de fiches d'une organisation peuvent porter une photo.
 *
 * LE QUOTA EST UN NOMBRE DE FICHIERS, pas un volume : chaque image est déjà
 * bornée à 2 Mo par le bucket, et compter des octets aurait demandé une lecture
 * du Storage à chaque envoi. 300 fiches illustrées dépassent largement une
 * carte de restaurant ; au-delà, ce n'est plus une carte, c'est un catalogue.
 */
export const VITRINE_PHOTOS_MAX = 300;

/**
 * `{uuid}/{uuid}.webp` — organisation, puis fichier.
 *
 * LE PRÉFIXE D'ORGANISATION EST DANS LE CHEMIN, et c'est ce qui rend une photo
 * attribuable : une valeur relue en base qui ne commencerait pas par
 * l'organisation attendue ne doit pas être servie. Le motif refuse aussi tout
 * `..`, toute barre supplémentaire et toute extension autre que `.webp`.
 */
const CHEMIN_PHOTO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function estCheminPhotoVitrine(valeur: unknown): valeur is string {
  return typeof valeur === "string" && CHEMIN_PHOTO.test(valeur);
}

/** La clé de la variante mobile, dérivée de celle de la grande. */
export function cheminMobile(chemin: string): string {
  return chemin.replace(/\.webp$/, `${SUFFIXE_MOBILE}.webp`);
}

/**
 * L'adresse publique d'une photo, ou `null` si le chemin n'est pas des nôtres.
 *
 * `null` PLUTÔT QU'UNE CHAÎNE VIDE : un `src=""` fait recharger la page
 * courante dans certains navigateurs, et un `<img>` sans source vaut mieux que
 * pas d'image du tout.
 */
export function urlPhotoVitrine(chemin: string | null | undefined): string | null {
  return estCheminPhotoVitrine(chemin) ? urlDansBucket(chemin) : null;
}

/**
 * L'adresse d'une clé DÉJÀ VALIDÉE — ou dérivée d'une clé validée.
 *
 * SÉPARÉE DE LA VALIDATION, ET C'EST LE POINT. La variante mobile porte un
 * suffixe (`-480`) que `CHEMIN_PHOTO` refuse par construction : la revalider
 * la faisait échouer à tous les coups, et `sourcesPhotoVitrine` repliait
 * silencieusement sur la grande. La petite image n'aurait donc JAMAIS été
 * servie — un défaut invisible, puisque la page restait correcte, simplement
 * plus lourde. Le contrôle porte sur la clé d'ORIGINE ; ce qui en est dérivé
 * ici est sûr parce qu'on l'a dérivé.
 */
function urlDansBucket(cle: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  const encode = cle.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${VITRINE_IMAGES_BUCKET}/${encode}`;
}

/** Les deux adresses d'une photo — grande et mobile — ou `null`. */
export function sourcesPhotoVitrine(
  chemin: string | null | undefined,
): { grande: string; mobile: string } | null {
  if (!estCheminPhotoVitrine(chemin)) return null;
  const grande = urlDansBucket(chemin);
  if (!grande) return null;
  // Le repli sur la grande n'est pas décoratif : une photo dont la petite
  // variante manque doit rester affichable plutôt que disparaître.
  return { grande, mobile: urlDansBucket(cheminMobile(chemin)) ?? grande };
}

/**
 * Le `srcset` d'une photo, prêt à poser sur un `<img>`.
 *
 * Chaîne vide quand il n'y a rien à proposer : React n'émet alors pas
 * l'attribut, ce qui est exactement ce qu'on veut.
 */
export function srcSetPhotoVitrine(chemin: string | null | undefined): string {
  const sources = sourcesPhotoVitrine(chemin);
  if (!sources) return "";
  return `${sources.mobile} ${VITRINE_PHOTO_LARGEUR_MOBILE}w, ${sources.grande} ${VITRINE_PHOTO_LARGEUR_MAX}w`;
}

/**
 * Le texte alternatif servi à l'écran.
 *
 * SANS ALTERNATIVE SAISIE, L'IMAGE EST DÉCORATIVE : `alt=""` la retire de
 * l'arbre d'accessibilité, ce qui est honnête. Y mettre le nom du plat aurait
 * fait lire deux fois la même chose à un lecteur d'écran — le nom est déjà à
 * côté, en texte.
 */
export function altPhotoVitrine(alt: string | null | undefined): string {
  return typeof alt === "string" && alt.trim() ? alt.trim() : "";
}
