import type { LobbyKind } from "@/lib/lobby";
import type { SeasonalTheme } from "@/types/database";

/**
 * L'ÉTAT DU STUDIO DES SALONS — les TROIS champs que `setHabillageSalons`
 * écrit, plus rien (VIT-48).
 *
 * ── POURQUOI L'ÉTAT NE PORTE QUE L'HABILLAGE ──
 *
 * Ce studio a DEUX canaux d'écriture, et c'est le cas qu'ADR-156 a déjà
 * tranché : un studio peut en avoir deux, jamais deux états.
 *
 *  - L'HABILLAGE part par le formulaire de la coquille, depuis cet état, avec
 *    l'enregistrement automatique du socle. C'est le seul réglage
 *    d'organisation de ce module.
 *  - LE CONTENU — les questions du Duo, sa suggestion, le pack de la Bande —
 *    part par les formulaires que `DuoEditeur` et `BandeEditeur` portent DÉJÀ,
 *    chacun avec son bouton et son action. Les recopier dans cet état aurait
 *    créé un second écrivain sur les mêmes colonnes, exactement le piège que le
 *    socle referme en ne montant qu'une étape à la fois (ADR-154).
 *
 * ── `jeu` EST DANS LA CHARGE UTILE, ET IL N'EST PAS UN RÉGLAGE ──
 *
 * `setHabillageSalons` lit `jeu` pour choisir SA GARDE — `gardeEditeurJeuSalon`
 * exige le droit du jeu depuis lequel on règle — et pour rien d'autre : la
 * ligne écrite est la même quel que soit le jeu. Il vient donc du segment
 * d'URL, en prop, et n'entre jamais dans l'état : le mettre là aurait laissé
 * croire qu'on peut le changer, et l'enregistrement automatique du socle
 * reposte à chaque nouvelle référence de l'état.
 *
 * ── LES TROIS ÉTATS DE `fond_key`, ET POURQUOI C'EST UNE CHAÎNE ──
 *
 * `""` veut dire « suivre le thème », `"aucun"` veut dire « aucune image », et
 * une clé veut dire cette image-là. Ce sont TROIS valeurs, pas deux plus une
 * absence : `fondChoisi` les distingue côté joueur, et les confondre ferait
 * revenir le fond du thème chez celui qui vient de le retirer. C'est déjà le
 * parti pris de `HabillageSalons` sur le tableau de bord, et `fondKeySchema`
 * replie `""` sur `null` à l'entrée.
 */
export interface EtatSalon {
  theme: SeasonalTheme;
  /** `""` = suivre le thème, `"aucun"`, ou une clé de fond. */
  fond_key: string;
  affiche_identite: boolean;
}

/**
 * L'état de départ, lu depuis la ligne. Aucun défaut n'est INVENTÉ ici : un
 * commerce qui n'a jamais ouvert cet écran n'a pas de ligne `lobby_settings`,
 * la page rend alors les défauts des colonnes (`neutre`, « suivre le thème »,
 * enseigne affichée) et l'état les reprend tels quels.
 *
 * Résoudre ici ce que la base laisse nul aurait gravé, au premier
 * enregistrement automatique, des décisions que personne n'a prises — le défaut
 * que VIT-19 a passé un lot à défaire, et que le socle rend d'autant plus facile
 * à commettre qu'il poste tout seul.
 */
export function etatInitialSalon(source: {
  theme: SeasonalTheme;
  fondKey: string | null;
  afficheIdentite: boolean;
}): EtatSalon {
  return {
    theme: source.theme,
    fond_key: source.fondKey ?? "",
    affiche_identite: source.afficheIdentite,
  };
}

/** Ce que la coquille poste. `jeu` n'est pas dans l'état — voir l'en-tête. */
export interface ChargeSalon {
  jeu: LobbyKind;
  etat: EtatSalon;
}
