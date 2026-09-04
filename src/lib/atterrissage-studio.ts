/**
 * OÙ ATTERRIT-ON APRÈS AVOIR CRÉÉ UNE ANIMATION (VIT-51).
 *
 * ── Le problème, et pourquoi il n'a pas de solution côté serveur seul ──
 *
 * Les sept actions de création finissent par un `redirect()`. Elles envoyaient
 * toutes vers l'ATELIER, et pour une raison honnête : le serveur ne connaît pas
 * la taille de l'écran, et l'atelier est le seul écran qui fonctionne aux deux.
 *
 * Depuis que chaque animation a son studio, cet atterrissage est devenu une
 * incohérence visible : sur un ordinateur, on crée une animation et on tombe
 * dans l'écran que le studio est censé remplacer.
 *
 * ── La réponse : c'est le FORMULAIRE qui sait ──
 *
 * Le navigateur connaît sa largeur ; le formulaire l'envoie avec le reste
 * (`ChampGrandEcran`). L'action tranche alors sans deviner.
 *
 * ── Le défaut de repli est l'ATELIER, et c'est délibéré ──
 *
 * Champ absent — JavaScript coupé, requête forgée, navigateur exotique — on
 * retombe sur l'atelier, qui marche partout. Un repli vers le studio aurait
 * envoyé un téléphone dans un écran conçu pour deux colonnes ; l'inverse ne
 * coûte qu'un clic.
 */

/** Le nom du champ caché. Partagé pour qu'aucun côté ne le recopie. */
export const CHAMP_GRAND_ECRAN = "grand_ecran";

/**
 * Le point de rupture `lg` de Tailwind, en pixels.
 *
 * C'est LA MÊME valeur que celle qui décide, en CSS, de montrer la carte
 * « Mon studio » plutôt que celle de l'atelier. Les deux doivent bouger
 * ensemble : atterrir dans un studio dont l'entrée est masquée serait pire que
 * l'incohérence qu'on répare.
 */
export const RUPTURE_LG = 1024;

/**
 * La destination après création : le studio sur grand écran, l'atelier sinon.
 *
 * `atelier` est TOUJOURS fourni par l'appelant plutôt que déduit : chaque
 * module nomme sa première étape, et une convention implicite se serait
 * décalée au premier renommage.
 */
export function destinationApresCreation(
  formData: FormData,
  studio: string,
  atelier: string,
): string {
  return formData.get(CHAMP_GRAND_ECRAN) === "1" ? studio : atelier;
}
