import type { ChargeSalon } from "@/components/salons/studio/etat";

/**
 * LA CHARGE UTILE DU STUDIO DES SALONS — rendue EN ENTIER, à chaque rendu, sur
 * TOUTES les étapes des DEUX jeux (VIT-48).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte : les tuiles de palette, le sélecteur de
 * fond et la case d'enseigne écrivent dans `EtatSalon`, et ce composant traduit
 * cet état en formulaire. La conséquence est celle qu'on cherche — **il
 * n'existe aucun chemin par lequel un champ pourrait manquer**, quelle que soit
 * l'étape ouverte, parce qu'aucun champ ne dépend d'une étape pour exister.
 *
 * ── ET LE PIÈGE EXISTE BEL ET BIEN ICI ──
 *
 * `setHabillageSalons` lit `theme`, `fond_key` et `affiche_identite` d'un seul
 * `FormData` et appelle `set_lobby_habillage`, qui réécrit la ligne en bloc. Un
 * champ absent n'est pas « laissé tel quel » : `habillageSalonsSchema` le lit
 * `null`, et `fond_key` absent redeviendrait « suivre le thème » chez quelqu'un
 * qui venait de choisir une image. Sur les étapes « Vos questions » ou « Le QR
 * de vos tables », aucun contrôle d'habillage n'est monté — c'est exactement là
 * que l'oubli se produirait, et exactement pourquoi ces champs sont rendus sans
 * condition.
 *
 * ── `affiche_identite` EST UNE CHAÎNE, PAS UNE CASE ──
 *
 * `z.enum(["true","false"]).nullable().default("true")` : une case décochée
 * n'envoie RIEN, et se taire serait alors indiscernable du défaut, qui est de
 * se nommer. Le booléen de l'état est donc écrit en toutes lettres — c'est déjà
 * ce que fait `HabillageSalons` sur le tableau de bord, et le champ caché y
 * porte le même commentaire.
 *
 * ── `jeu` NE SERT QU'À LA GARDE, ET IL EST POURTANT OBLIGATOIRE ──
 *
 * L'action commence par `if (!estJeuDeSalon(jeu)) return NON_AUTORISE` : sans
 * ce champ, chaque enregistrement automatique se ferait refuser sans que rien
 * n'explique pourquoi. Il ne décrit pas la ligne écrite — elle est la même pour
 * les deux jeux — il décrit le DROIT qu'on fait valoir pour l'écrire.
 */
export function ChampsCachesSalon({ charge }: { charge: ChargeSalon }) {
  return (
    <>
      {/* La garde de l'action, pas un réglage. Voir l'en-tête. */}
      <input type="hidden" name="jeu" value={charge.jeu} />
      <input type="hidden" name="theme" value={charge.etat.theme} />
      {/* TOUJOURS RENDU, même vide : `""` est la valeur « suivre le thème »,
          que `fondKeySchema` replie sur `null`. L'omettre une seule fois
          rendrait impossible d'y revenir. */}
      <input type="hidden" name="fond_key" value={charge.etat.fond_key} />
      {/* TOUJOURS RENDU, et en toutes lettres : une case décochée n'envoie
          rien, et l'action ferait alors valoir son défaut « true ». */}
      <input
        type="hidden"
        name="affiche_identite"
        value={charge.etat.affiche_identite ? "true" : "false"}
      />
    </>
  );
}
