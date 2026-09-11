import "server-only";

/**
 * SHARP, CHARGÉ AU DERNIER MOMENT — et pourquoi ce module existe.
 *
 * ── LE DÉFAUT QU'IL FERME, MESURÉ EN PRODUCTION ──
 *
 * `sharp` porte un binaire natif. Quand la plateforme n'embarque pas ses
 * dépendances `@img/*`, le module échoue au CHARGEMENT :
 *
 *     ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
 *
 * Un `import sharp from "sharp"` en tête de fichier fait alors tomber TOUT le
 * module qui le contient — et, avec lui, tout ce que ce module exporte. Le
 * 2026-08-23, `src/actions/vitrine.ts` importait `vitrine-photo-storage` : le
 * commerçant ne pouvait plus enregistrer l'ADRESSE de sa vitrine, geste qui ne
 * touche aucune image, et l'écran ne rendait qu'un « Enregistrement
 * impossible ». Rien dans le message ne pouvait mener aux photos.
 *
 * ── CE QUE LE CHARGEMENT DIFFÉRÉ CHANGE, ET CE QU'IL NE CHANGE PAS ──
 *
 * Il NE RÉPARE PAS `sharp` : si le binaire manque, traiter une image échouera
 * toujours. Il BORNE la panne à ce qu'elle concerne — un envoi d'image — au
 * lieu de la laisser emporter les vingt autres actions du même fichier. Une
 * dépendance native ne doit jamais décider si un formulaire de texte
 * fonctionne.
 *
 * Le coût est d'un `await` au premier appel de chaque instance ; les suivants
 * lisent le cache de modules. Aucune image n'est traitée sur un chemin où
 * cette latence compte.
 */
let chargementSharp: Promise<typeof import("sharp").default> | null = null;

export async function chargerSharp() {
  chargementSharp ??= import("sharp").then((charge) => {
    const sharp = charge.default;
    // Défense durable contre le décodeur HEIF/AVIF vulnérable : la règle est
    // posée une seule fois au chargement central, avant qu'un appelant puisse
    // construire un pipeline à partir d'une image non fiable.
    sharp.block({ operation: ["VipsForeignLoadHeif"] });
    return sharp;
  });
  return chargementSharp;
}
