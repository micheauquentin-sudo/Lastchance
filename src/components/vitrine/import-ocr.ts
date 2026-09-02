/**
 * LIRE UNE CARTE PHOTOGRAPHIÉE (VIT-18) — dans le navigateur, et nulle part ailleurs.
 *
 * ── LA CARTE NE QUITTE PAS LE COMMERCE, ET C'EST LA CONTRAINTE DE DÉPART ──
 *
 * `import-fichier.ts` porte déjà cette promesse en toutes lettres : « le PDF
 * d'un restaurant reste chez le restaurant ; seul le texte qu'il contient
 * remonte ». Un service de reconnaissance en ligne l'aurait brisée — l'image
 * serait partie chez un tiers, avec les prix, les fournisseurs et parfois le
 * nom du chef.
 *
 * Le moteur tourne donc DANS le navigateur, en WebAssembly, et ses fichiers
 * sont servis depuis NOTRE domaine (`/ocr/`). Rien n'est appelé à l'extérieur,
 * pas même un CDN : un hôte tiers interrogé depuis le navigateur du commerçant
 * reste un hôte tiers, qui voit son adresse IP et l'existence de la démarche.
 *
 * ── CE QUE ÇA COÛTE, ET POURQUOI ON L'ASSUME ──
 *
 * 4,1 Mo au PREMIER import (moteur 2,8 Mo + dictionnaire français 1,1 Mo),
 * mis en cache par le navigateur ensuite. C'est beaucoup, et c'est pourquoi
 * rien n'est chargé tant qu'aucune image n'est envoyée : l'import d'un `.csv`
 * ou d'un PDF texte ne paie pas un octet de tout cela.
 *
 * Le cœur choisi est le LSTM SANS SIMD. La variante SIMD fait exactement la
 * même taille et va plus vite, mais elle exige un navigateur récent : pour un
 * import de carte, qu'on fait une fois, la JUSTESSE prime sur la vitesse, et un
 * moteur qui refuse de démarrer sur un téléphone un peu ancien serait une
 * fonctionnalité qui n'existe que pour ceux qui n'en ont pas besoin.
 *
 * ── LE DICTIONNAIRE EST LE « RAPIDE », ET C'EST DIT À L'ÉCRAN ──
 *
 * `tessdata_fast` (1,1 Mo) contre 15 Mo pour le complet. Il lit correctement
 * une carte nette et se trompe sur une photo de travers. L'écran d'import
 * montre déjà le résultat AVANT de créer quoi que ce soit — c'est ce qui rend
 * cette imprécision acceptable : on relit, on corrige, puis on crée.
 */

/** Ce que le module rend — jamais d'exception à l'appelant. */
export type ResultatOcr =
  | { ok: true; texte: string }
  | { ok: false; raison: string };

const REFUS_MOTEUR =
  "La lecture d'image n'a pas pu démarrer sur cet appareil. Collez le texte de votre carte ci-dessus, ou envoyez un PDF d'origine, un .csv ou un .xlsx.";
const REFUS_VIDE =
  "Aucun texte lisible n'a été trouvé sur cette image. Une photo bien à plat, bien éclairée et cadrée sur la carte donne de meilleurs résultats — sinon, collez le texte ci-dessus.";

/**
 * LA TAILLE AU-DELÀ DE LAQUELLE ON REFUSE AVANT DE LIRE.
 *
 * La reconnaissance est linéaire en pixels : une photo de 12 Mpx prend des
 * dizaines de secondes sur un téléphone, pendant lesquelles l'onglet est figé.
 * On borne donc l'image AVANT, par redimensionnement, plutôt que de laisser
 * l'appareil ramer puis échouer.
 */
const LARGEUR_MAX = 2000;

/**
 * Réduit l'image si elle dépasse `LARGEUR_MAX`, en gardant ses proportions.
 *
 * ── POURQUOI RÉDUIRE AMÉLIORE LE RÉSULTAT, ET NE LE DÉGRADE PAS ──
 *
 * Contre l'intuition : au-delà d'environ 2000 pixels de large, une carte de
 * restaurant n'a plus de détail utile à offrir — le texte y fait déjà des
 * dizaines de pixels de haut. Ce qui reste, c'est du grain de capteur, que le
 * moteur interprète comme des caractères. Réduire enlève donc du bruit et du
 * temps de calcul, pas de l'information.
 */
async function imageBornee(fichier: File): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier);
  try {
    if (bitmap.width <= LARGEUR_MAX) return fichier;
    const echelle = LARGEUR_MAX / bitmap.width;
    const largeur = LARGEUR_MAX;
    const hauteur = Math.round(bitmap.height * echelle);
    const toile = document.createElement("canvas");
    toile.width = largeur;
    toile.height = hauteur;
    const ctx = toile.getContext("2d");
    if (!ctx) return fichier;
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    const blob = await new Promise<Blob | null>((resolve) =>
      toile.toBlob(resolve, "image/png"),
    );
    return blob ?? fichier;
  } finally {
    // `close()` libère la mémoire graphique tout de suite. Sans lui, une carte
    // envoyée trois fois de suite garde trois bitmaps pleine résolution.
    bitmap.close();
  }
}

/**
 * Lit le texte d'une image. Ne lève JAMAIS : tout échec devient un refus
 * portant une phrase que le commerçant peut suivre.
 *
 * `onProgress` reçoit une fraction entre 0 et 1. Elle n'est pas décorative :
 * la reconnaissance prend dix à trente secondes sur un téléphone, et un écran
 * qui ne bouge pas pendant ce temps se lit comme une panne.
 */
export async function texteDepuisImage(
  fichier: File,
  onProgress?: (fraction: number) => void,
): Promise<ResultatOcr> {
  let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | null =
    null;
  try {
    // L'IMPORT EST DYNAMIQUE, ET C'EST LE POINT. `tesseract.js` et son moteur
    // ne doivent pas peser sur le paquet de l'écran d'import : un commerçant
    // qui colle son texte ou envoie un `.csv` ne paie rien de tout cela.
    const { createWorker } = await import("tesseract.js");
    const image = await imageBornee(fichier);

    worker = await createWorker("fra", 1, {
      // TOUT VIENT DE NOTRE DOMAINE. Ces trois chemins sont la raison d'être
      // de `public/ocr/` : sans eux, la bibliothèque irait chercher son moteur
      // et son dictionnaire sur un CDN public.
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/tesseract-core-lstm.js",
      langPath: "/ocr",
      // ── SANS CETTE LIGNE, RIEN NE FONCTIONNE (VIT-29) ──
      //
      // Par défaut, `tesseract.js` fabrique son fil d'exécution depuis une URL
      // `blob:` qui se contente d'importer le script ci-dessus. Or un fil né
      // d'un `blob:` HÉRITE de la politique de sécurité de la page qui l'a
      // créé — et le tableau de bord n'autorise pas `'wasm-unsafe-eval'`.
      //
      // À `false`, le fil naît directement de `/ocr/worker.min.js`, une URL de
      // notre domaine : il tire alors sa politique de la RÉPONSE de ce
      // fichier, que `next.config.ts` sert avec la permission nécessaire
      // (`buildOcrWorkerCsp`). La page, elle, ne la reçoit toujours pas.
      //
      // C'est le geste qui permet de n'ouvrir qu'un fichier au lieu de tout le
      // back-office. Le remettre à `true` ne casserait rien de visible : le
      // moteur échouerait simplement à démarrer, et l'écran afficherait son
      // refus poli — d'où la garde dans `import-ocr.test.ts`.
      workerBlobURL: false,
      // Le dictionnaire est servi NON compressé : `public/` ne compresse pas,
      // et laisser la bibliothèque chercher un `.gz` produirait un 404 muet
      // suivi d'un repli sur le CDN — exactement ce qu'on veut éviter.
      gzip: false,
      logger: onProgress
        ? (m: { status: string; progress: number }) => {
            if (m.status === "recognizing text") onProgress(m.progress);
          }
        : undefined,
    });

    const { data } = await worker.recognize(image);
    const texte = (data.text ?? "").trim();
    if (!texte) return { ok: false, raison: REFUS_VIDE };
    return { ok: true, texte };
  } catch {
    // Moteur indisponible, WebAssembly refusé, mémoire insuffisante : le
    // commerçant n'a que faire de la cause, il a besoin de la porte de sortie.
    return { ok: false, raison: REFUS_MOTEUR };
  } finally {
    // TERMINER LE WORKER, TOUJOURS. Il tient le moteur entier en mémoire —
    // plusieurs dizaines de méga-octets — et un onglet qui en garde trois
    // finit par être tué par le navigateur, sans message.
    if (worker) await worker.terminate().catch(() => {});
  }
}
