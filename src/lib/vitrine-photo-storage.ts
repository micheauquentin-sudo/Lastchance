import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  cheminMobile,
  estCheminPhotoVitrine,
  VITRINE_COUVERTURE_LARGEUR_MAX,
  VITRINE_IMAGES_BUCKET,
  VITRINE_PHOTO_LARGEUR_MAX,
  VITRINE_PHOTO_LARGEUR_MOBILE,
  VITRINE_PHOTO_OCTETS_MAX,
  VITRINE_PHOTOS_MAX,
} from "@/lib/vitrine-photo";

/**
 * VIT-7 — LE PIPELINE D'IMAGES DE LA VITRINE.
 *
 * Motif de `poster-storage.ts`, dont ce module reprend la structure : une data
 * URL entre, `sharp` la normalise, deux fichiers webp sortent, et l'échec d'une
 * étape efface ce que les précédentes avaient déposé.
 *
 * ── SHARP EST L'AUTORITÉ, PAS LE NAVIGATEUR ──
 *
 * L'écran réduit déjà l'image avant de l'envoyer — pour ne pas faire transiter
 * quatre méga-octets, et parce que la limite de corps d'une action serveur est
 * basse. Mais rien de ce que le navigateur affirme n'est cru ici : le serveur
 * ré-encode dans tous les cas. C'est ce qui rend les trois promesses tenables
 * quelle que soit la porte d'entrée.
 *
 * ── LES MÉTADONNÉES SONT RETIRÉES, ET C'EST STRUCTUREL ──
 *
 * `sharp` ne recopie AUCUNE métadonnée dans sa sortie sauf si on le lui demande
 * par `withMetadata()` — qui n'est appelé nulle part ici, et ne doit pas
 * l'être. L'EXIF de localisation d'une photo prise au comptoir dirait où se
 * trouve le commerce, à la précision du GPS, sur une page publique. `.rotate()`
 * est appelé AVANT le redimensionnement : il applique l'orientation EXIF puis
 * la laisse tomber avec le reste, sans quoi une photo prise à l'horizontale
 * arriverait couchée.
 *
 * ── DEUX VARIANTES, ET LA PETITE N'EST PAS FACULTATIVE ──
 *
 * Une carte de soixante plats sert soixante images. Servir la grande à un
 * téléphone, c'est plusieurs méga-octets sur un réseau de salle de restaurant.
 * La variante 480 px est produite au même moment, jamais à la demande : une
 * génération paresseuse aurait fait payer le premier visiteur.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export class VitrinePhotoError extends Error {}

const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const OCTETS_SOURCE_MAX = 6 * 1024 * 1024;
const PIXELS_MAX = 40_000_000;

/** Ce qu'un envoi réussi laisse derrière lui. */
export interface PhotoDeposee {
  /** La clé de la grande — celle qui va en base. */
  chemin: string;
  /** Les deux clés créées, pour pouvoir tout défaire si le SQL échoue. */
  deposees: string[];
}

/**
 * La data URL → deux tampons webp.
 *
 * `fit: "inside"` et `withoutEnlargement` : on réduit, on ne recadre pas et on
 * n'agrandit jamais. Recadrer d'autorité aurait coupé la moitié d'un plat sans
 * que personne ne l'ait demandé ; agrandir aurait rendu floue une petite photo
 * en prétendant l'améliorer.
 */
async function normaliser(
  source: string,
  largeurMax: number,
): Promise<{ grande: Buffer; mobile: Buffer }> {
  const trouve = DATA_IMAGE.exec(source);
  if (!trouve) throw new VitrinePhotoError("Image invalide");

  const entree = Buffer.from(trouve[2], "base64");
  if (entree.length === 0 || entree.length > OCTETS_SOURCE_MAX) {
    throw new VitrinePhotoError("Image trop lourde");
  }

  try {
    const encoder = (largeur: number, qualite: number) =>
      sharp(entree, { failOn: "warning", limitInputPixels: PIXELS_MAX })
        .rotate()
        .resize({ width: largeur, withoutEnlargement: true, fit: "inside" })
        .webp({ quality: qualite, effort: 4 })
        .toBuffer();

    const [grande, mobile] = await Promise.all([
      encoder(largeurMax, 82),
      encoder(VITRINE_PHOTO_LARGEUR_MOBILE, 74),
    ]);

    if (grande.length > VITRINE_PHOTO_OCTETS_MAX) {
      // Le bucket refuserait de toute façon au-delà de 2 Mo : le dire ici
      // rend le refus lisible plutôt qu'un code d'erreur de Storage.
      throw new VitrinePhotoError("Image trop complexe après traitement");
    }
    return { grande, mobile };
  } catch (cause) {
    if (cause instanceof VitrinePhotoError) throw cause;
    throw new VitrinePhotoError("Fichier image invalide ou dimensions excessives");
  }
}

/** Efface des fichiers sans jamais faire échouer l'appelant. */
export async function effacerPhotos(
  chemins: Iterable<string>,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  // La variante mobile se valide en retirant son suffixe : un chemin déjà nu
  // traverse le `replace` sans changer, donc une seule règle couvre les deux.
  // Filtrer est indispensable — `remove` accepte n'importe quelle clé, et une
  // valeur relue en base qui aurait dérivé effacerait le fichier d'un autre.
  const uniques = [...new Set(chemins)].filter((chemin) =>
    estCheminPhotoVitrine(chemin.replace(/-\d+\.webp$/, ".webp")),
  );
  if (uniques.length === 0) return;
  const { error } = await admin.storage.from(VITRINE_IMAGES_BUCKET).remove(uniques);
  if (error) console.warn("[vitrine] purge Storage:", error.message);
}

/** La grande ET sa variante mobile, pour un chemin donné. */
export function cheminsDeLaPhoto(chemin: string): string[] {
  return [chemin, cheminMobile(chemin)];
}

/**
 * Combien de fiches de cette organisation portent déjà une photo.
 *
 * `head: true` : on veut le compte, pas les lignes. Une lecture complète du
 * catalogue à chaque envoi aurait coûté le prix d'une page pour un entier.
 */
export async function compterPhotosVitrine(
  organizationId: string,
  admin: AdminClient = createAdminClient(),
): Promise<number> {
  const { count, error } = await admin
    .from("vitrine_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .not("photo_path", "is", null);
  if (error) throw new VitrinePhotoError("Quota illisible");
  return count ?? 0;
}

/**
 * Dépose une image et rend sa clé.
 *
 * `upsert: false` : la clé porte un UUID neuf à chaque envoi, donc une
 * collision signalerait un défaut, pas un remplacement. Remplacer en place
 * aurait aussi laissé les caches du monde entier servir l'ancienne image sous
 * la nouvelle adresse pendant un an — `cacheControl` est posé à un an
 * précisément parce que l'adresse ne se réutilise jamais.
 */
export async function deposerPhotoVitrine(
  source: string,
  contexte: { organizationId: string; couverture?: boolean },
  admin: AdminClient = createAdminClient(),
): Promise<PhotoDeposee> {
  const { grande, mobile } = await normaliser(
    source,
    contexte.couverture ? VITRINE_COUVERTURE_LARGEUR_MAX : VITRINE_PHOTO_LARGEUR_MAX,
  );

  const chemin = `${contexte.organizationId}/${randomUUID()}.webp`;
  const deposees: string[] = [];

  try {
    for (const [cle, corps] of [
      [chemin, grande],
      [cheminMobile(chemin), mobile],
    ] as const) {
      const { error } = await admin.storage
        .from(VITRINE_IMAGES_BUCKET)
        .upload(cle, corps, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        });
      if (error) throw new VitrinePhotoError("Envoi de l'image impossible");
      deposees.push(cle);
    }
    return { chemin, deposees };
  } catch (cause) {
    // La moitié d'une photo n'est pas une photo : ce qui est monté redescend.
    await effacerPhotos(deposees, admin);
    throw cause;
  }
}

/** Le quota, vérifié AVANT de payer une conversion et un envoi. */
export async function verifierQuotaPhotos(
  organizationId: string,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  const utilisees = await compterPhotosVitrine(organizationId, admin);
  if (utilisees >= VITRINE_PHOTOS_MAX) {
    throw new VitrinePhotoError(
      `Vous avez atteint ${VITRINE_PHOTOS_MAX} fiches illustrées. Retirez une photo avant d'en ajouter une autre.`,
    );
  }
}
