"use client";

import {
  VITRINE_PHOTO_DATA_URL_MAX,
  VITRINE_PHOTO_LARGEUR_MAX,
} from "@/lib/vitrine-photo";

/**
 * VIT-7 — RÉDUIRE L'IMAGE AVANT DE L'ENVOYER.
 *
 * ── POURQUOI CÔTÉ NAVIGATEUR, ALORS QUE LE SERVEUR RÉ-ENCODE ──
 *
 * Pas pour la qualité — `sharp` est l'autorité et refait tout. Pour la TAILLE
 * DU CORPS : une action serveur accepte 1 Mo par défaut, et une photo de
 * téléphone en pèse quatre. Sans cette réduction, l'envoi échouerait dans le
 * framework, avant d'atteindre la moindre ligne de code capable d'expliquer
 * pourquoi.
 *
 * ── L'EXIF DISPARAÎT ICI AUSSI, ET C'EST GRATUIT ──
 *
 * Un canvas ne transporte aucune métadonnée : ce qui en sort n'a ni date, ni
 * appareil, ni coordonnées GPS. `imageOrientation: "from-image"` applique
 * l'orientation EXIF au moment du décodage — sans elle, une photo prise à
 * l'horizontale arriverait couchée, puisque la balise qui la redressait vient
 * d'être perdue. Le serveur retire de toute façon les métadonnées ; c'est une
 * ceinture en plus de la bretelle, sur le seul chemin où le fichier d'origine
 * existe encore.
 *
 * ── LE BUDGET EST TENU PAR BOUCLE, PAS PAR ESPOIR ──
 *
 * Une photo très détaillée reste lourde même réduite. On baisse donc la
 * qualité, puis la largeur, jusqu'à tenir dans le budget — et on renonce
 * explicitement plutôt que d'envoyer quelque chose qui sera refusé plus loin.
 */

export class ImageClientError extends Error {}

const QUALITES = [0.82, 0.72, 0.62, 0.52];
const FACTEURS = [1, 0.75, 0.55];

/**
 * Un fichier image → une data URL webp qui tient dans le budget.
 *
 * Lève `ImageClientError` avec une phrase montrable : cette fonction est
 * appelée depuis un gestionnaire d'événement, et son message va à l'écran tel
 * quel.
 */
export async function preparerImageVitrine(
  fichier: File,
  largeurMax: number = VITRINE_PHOTO_LARGEUR_MAX,
  budget: number = VITRINE_PHOTO_DATA_URL_MAX,
): Promise<string> {
  if (!fichier.type.startsWith("image/")) {
    throw new ImageClientError("Ce fichier n’est pas une image.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    throw new ImageClientError("Cette image n’a pas pu être lue.");
  }

  try {
    for (const facteur of FACTEURS) {
      const largeur = Math.max(
        1,
        Math.round(Math.min(bitmap.width, largeurMax) * facteur),
      );
      const hauteur = Math.max(
        1,
        Math.round((bitmap.height / bitmap.width) * largeur),
      );

      const toile = document.createElement("canvas");
      toile.width = largeur;
      toile.height = hauteur;
      const contexte = toile.getContext("2d");
      if (!contexte) {
        throw new ImageClientError("Cet appareil ne sait pas préparer l’image.");
      }
      contexte.drawImage(bitmap, 0, 0, largeur, hauteur);

      for (const qualite of QUALITES) {
        const url = toile.toDataURL("image/webp", qualite);
        // Un navigateur qui ne sait pas encoder en webp rend un PNG sans le
        // dire. Le serveur l'accepterait, mais autant le savoir ici : la
        // vérification coûte une comparaison de préfixe.
        if (!url.startsWith("data:image/")) {
          throw new ImageClientError("Cette image n’a pas pu être convertie.");
        }
        if (url.length <= budget) return url;
      }
    }
  } finally {
    bitmap.close();
  }

  throw new ImageClientError(
    "Cette image reste trop lourde. Essayez une photo moins grande.",
  );
}
