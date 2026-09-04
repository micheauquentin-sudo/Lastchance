import { chargeJeuRoue, type EtatRoue } from "@/components/wheel/studio/etat";

/**
 * LA CHARGE UTILE D'`updateWheel` — rendue EN ENTIER, à chaque rendu, sur les
 * NEUF étapes (VIT-46).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` DE RÉGLAGE DE ROUE ──
 *
 * Aucun contrôle visible n'en porte : les radios de mécanique, les champs du
 * défi et la liste « Chaque client peut jouer » écrivent dans `EtatRoue`, et
 * ce composant traduit cet état en formulaire. La conséquence est celle qu'on
 * cherche : **il n'existe aucun chemin par lequel un champ pourrait manquer**,
 * quelle que soit l'étape ouverte.
 *
 * ── ET C'EST TOUT L'ENJEU ──
 *
 * `updateWheelSchema` exige `id`, `game_type` et `play_limit` ENSEMBLE : un
 * champ requis non rendu arrive à `null` et l'action refuse — invariant B des
 * gardes `champ-formulaire-coverage`. Dans l'atelier, cette exigence FORÇAIT
 * la mécanique et la limite à partager une étape, parce qu'une étape y est une
 * navigation et rend un formulaire neuf. Ici elle ne force plus rien : la
 * charge est rendue depuis l'état, toujours complète, et le regroupement des
 * deux réglages reste par choix PRODUIT (voir `etapes.ts`).
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ──
 *
 * Le STYLE et le CRÉNEAU ne passent pas par ce formulaire. Ils ont leurs
 * propres actions — `updateWheelStyle`, `updateWheelSchedule` — et les faire
 * voyager ici les mettrait sous le `.update()` d'`updateWheel`, qui n'écrit
 * pas ces colonnes : elles seraient tout simplement ignorées, en silence. Ils
 * partent depuis le MÊME état, par un envoi qui leur est propre
 * (`useAutoSaveManuel`, voir `roue-studio.tsx`).
 *
 * Les LOTS non plus : `addPrize` / `updatePrize` / `deletePrize` sont atomiques
 * par ligne — un compare-and-swap sur `stock_seen` l'exige — et gardent chacun
 * leur `<form>` dans l'étape « Les gains ».
 */
export function ChampsCachesRoue({
  id,
  etat,
}: {
  id: string;
  etat: EtatRoue;
}) {
  const charge = chargeJeuRoue(id, etat);
  return (
    <>
      {Object.entries(charge).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
    </>
  );
}
