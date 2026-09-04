import {
  chargeReglagesFidelite,
  type EtatFidelite,
} from "@/components/loyalty/studio/etat";

/**
 * LA CHARGE UTILE D'`updateLoyaltyProgram` — rendue EN ENTIER, à chaque rendu,
 * sur les HUIT étapes (VIT-42).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte. Les champs, les boutons radio et les
 * tuiles de fond de la colonne de gauche écrivent dans `EtatFidelite` ; ce
 * composant traduit cet état en formulaire. La conséquence est celle qu'on
 * cherche : **il n'existe aucun chemin par lequel un champ pourrait manquer**,
 * quelle que soit l'étape ouverte, parce qu'aucun champ ne dépend d'une étape
 * pour exister.
 *
 * ── ET C'EST TOUT L'ENJEU DE CE MODULE ──
 *
 * `updateLoyaltyProgram` fait un `.update(fields)` de TOUTES les colonnes de
 * son schéma : un champ retiré du formulaire arrive à `null`, ce que
 * `tierThresholdSchema` refuse (« Données invalides ») — et qu'une borne plus
 * permissive aurait écrasé à 0 en silence.
 *
 * C'est exactement pour cela que l'atelier fait poster à `LoyaltySettings` les
 * seuils de niveau qu'il n'affiche pas, et à `LoyaltyTiersForm` le nom, le
 * mode, la rotation, la fréquence et le jackpot qu'il n'affiche pas non plus.
 * Deux miroirs, tenus d'accord par une seule chose : « ils vivent sur des
 * étapes différentes, jamais à l'écran ensemble ».
 *
 * Un studio les met SUR LE MÊME ÉCRAN, avec enregistrement automatique. Les
 * miroirs deviendraient alors deux ÉCRIVAINS CONCURRENTS sur les mêmes
 * colonnes, chacun repostant une copie figée de la part de l'autre. Ils
 * disparaissent donc : il n'y a plus qu'un état, et ce composant en est
 * l'unique traduction.
 *
 * ── `code_ttl_days` EST LE CHAMP QUE `has()` DÉCIDE ──
 *
 * Côté serveur il est lu par `formData.has("code_ttl_days")` et non `get()`,
 * parce que le VIDE y est une valeur LÉGITIME — « sans limite ». Champ absent
 * ⇒ colonne intacte ; champ présent et vide ⇒ colonne effacée. Il est donc
 * rendu TOUJOURS et sans condition, et c'est ICI qu'il l'est :
 * `CodeTtlDaysField` reçoit `champCache={false}` dans l'étape « Comment le
 * client valide sa visite », sans quoi son champ vivrait dans une étape
 * démontable, hors du formulaire de réglages, et ne partirait jamais.
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ──
 *
 * L'HABILLAGE (`style`) et le PARRAINAGE (cinq colonnes) ne passent pas par ce
 * formulaire. Leurs actions dédiées existent précisément pour ne rien écraser
 * (voir leurs en-têtes dans `src/actions/loyalty.ts`) : les faire voyager ici
 * les remettrait sous le `.update()` en bloc qu'elles ont été écrites pour
 * éviter. Elles partent depuis le MÊME état, par un envoi qui leur est propre.
 */
export function ChampsCachesFidelite({
  id,
  etat,
}: {
  id: string;
  etat: EtatFidelite;
}) {
  const charge = chargeReglagesFidelite(id, etat);
  return (
    <>
      {Object.entries(charge).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
    </>
  );
}
