import type { EtatSoiree } from "@/components/event/studio/etat";

/**
 * LA CHARGE UTILE D'`updateEventGame` — rendue EN ENTIER, à chaque rendu, sur
 * les SEPT étapes (VIT-47).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte. Les champs de la colonne de gauche écrivent
 * dans `EtatSoiree` ; ce composant traduit cet état en formulaire. La
 * conséquence est celle qu'on cherche : **il n'existe aucun chemin par lequel un
 * champ pourrait manquer**, quelle que soit l'étape ouverte, parce qu'aucun
 * champ ne dépend d'une étape pour exister.
 *
 * La charge est ici petite — deux champs — et c'est précisément ce qui rend la
 * règle facile à oublier. Elle vaut quand même : `updateEventGame` valide
 * `name` par `updateEventGameSchema`, et un formulaire qui ne le rendrait pas
 * ferait échouer l'enregistrement automatique à chaque frappe faite ailleurs,
 * avec une erreur que personne ne relierait à l'étape ouverte.
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ──
 *
 * Les questions et les salles ne passent pas par ce formulaire :
 * `updateEventQuestion` et `updateEventSession` prennent des OBJETS typés, pas
 * des `FormData`, et sont appelées à la main depuis `chargeRythmeEvenement` et
 * `chargeSalleEvenement`. Les mêler ici aurait fait poster le nom du jeu à
 * chaque réglage de stock, et l'inverse.
 */
export function ChampsCachesSoiree({
  id,
  etat,
}: {
  id: string;
  etat: EtatSoiree;
}) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={etat.name} />
    </>
  );
}
