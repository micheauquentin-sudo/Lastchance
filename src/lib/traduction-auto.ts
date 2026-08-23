import {
  TRADUCTION_CARACTERES_MAX,
  TRADUCTION_CHAMPS_MAX,
} from "@/lib/traduction-fournisseur";
import type {
  ChampTraductionVitrine,
  CibleTraductionVitrine,
  TraductionEtatView,
} from "@/lib/vitrine";

/**
 * VIT-6 — CE QUI PART CHEZ LE FOURNISSEUR, ET RIEN D'AUTRE.
 *
 * ── LE FILTRE EST LE PRODUIT ──
 *
 * Google facture au caractère. Envoyer la carte entière à chaque demande
 * coûterait le prix d'une carte entière à chaque demande, pour réécrire des
 * traductions déjà justes. Ne partent donc que les champs `absent` ou
 * `perime` — ce que `vitrine_translation_state` calcule déjà, et ce que la
 * contrainte `version_source >= cible.updated_at` garantit ensuite.
 *
 * LE CACHE N'EST PAS UNE OPTIMISATION : c'est `vitrine_translations`, avec sa
 * clé (organisation, cible, langue, champ) et sa version source. Ce module ne
 * fait que lui demander ce qui lui manque.
 *
 * ── CE QUI NE PART JAMAIS ──
 *
 * Prix, disponibilité, badges et allergènes ne sont pas des champs traduisibles
 * — la base l'impose par un `check`, pas ce module par une politesse. Les deux
 * premiers sont communs aux langues ; les deux derniers sont un vocabulaire
 * fermé, traduit une fois pour toutes à la main. Aucun texte non publié, aucun
 * fichier, aucune image ne sort d'ici : la sélection part de l'état de
 * traduction, qui ne connaît que des champs déjà en base.
 */

export interface ChampATraduire {
  cibleType: CibleTraductionVitrine;
  cibleId: string;
  /** « Velouté de potiron », « Réglages » — pour le compte rendu, pas pour la base. */
  libelle: string;
  /** LA VERSION VUE, repostée telle quelle : le modèle de fraîcheur en dépend. */
  version: string;
  champ: ChampTraductionVitrine;
  /** Le français courant, celui qui sera traduit. */
  texte: string;
}

export interface SelectionTraduction {
  retenus: ChampATraduire[];
  /** Ce que l'appel va coûter, en caractères facturés. */
  caracteres: number;
  /**
   * Une borne a été atteinte alors qu'il restait des champs.
   *
   * L'écran le DIT et invite à relancer : une troncature silencieuse aurait
   * laissé croire qu'une carte est entièrement traduite alors qu'il en manque
   * la moitié — le mode d'échec qui ressemble à un succès.
   */
  tronquee: boolean;
  /** Champs écartés faute de version source lisible (document tronqué). */
  sansVersion: number;
}

export interface BornesTraduction {
  caracteresMax: number;
  champsMax: number;
}

const BORNES_PAR_DEFAUT: BornesTraduction = {
  caracteresMax: TRADUCTION_CARACTERES_MAX,
  champsMax: TRADUCTION_CHAMPS_MAX,
};

/**
 * L'état de traduction → la liste exacte des champs à envoyer.
 *
 * L'ORDRE EST CELUI DE L'ÉTAT, et il compte : `vitrine_translation_state` rend
 * les réglages puis le catalogue dans l'ordre du commerçant. Une troncature
 * garde donc le début de la carte, pas un échantillon arbitraire.
 */
export function champsATraduire(
  etat: TraductionEtatView,
  bornes: BornesTraduction = BORNES_PAR_DEFAUT,
): SelectionTraduction {
  const retenus: ChampATraduire[] = [];
  let caracteres = 0;
  let tronquee = false;
  let sansVersion = 0;

  for (const cible of etat.cibles) {
    for (const champ of cible.champs) {
      if (champ.etat === "frais") continue;

      const texte = champ.texteSource.trim();
      // Un champ source vide n'a rien à traduire : `vitrine_translation_state`
      // le rend quand il n'a pas retrouvé la source, et l'envoyer aurait fait
      // écrire une traduction du vide.
      if (!texte) continue;

      // Sans version, `upsert_vitrine_translation` refuserait l'écriture de
      // toute façon. On compte pour le dire, on n'envoie pas pour rien.
      if (!cible.version) {
        sansVersion += 1;
        continue;
      }

      if (
        retenus.length >= bornes.champsMax ||
        caracteres + texte.length > bornes.caracteresMax
      ) {
        tronquee = true;
        continue;
      }

      retenus.push({
        cibleType: cible.cibleType,
        cibleId: cible.cibleId,
        libelle: cible.libelle,
        version: cible.version,
        champ: champ.champ,
        texte,
      });
      caracteres += texte.length;
    }
  }

  return { retenus, caracteres, tronquee, sansVersion };
}

/** Des champs en paquets de `taille`, pour ne pas faire une requête par plat. */
export function decouperEnLots<T>(elements: T[], taille: number): T[][] {
  if (taille < 1) return elements.length ? [elements] : [];
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) {
    lots.push(elements.slice(i, i + taille));
  }
  return lots;
}

/**
 * Le compte rendu rendu au commerçant.
 *
 * Il dit les CARACTÈRES, pas seulement les champs : c'est l'unité de
 * facturation, et la seule qui permette de comprendre ce qu'une relance
 * coûtera.
 */
export function messageCompteRendu(
  ecrits: number,
  caracteres: number,
  tronquee: boolean,
): string {
  if (ecrits === 0) {
    return "Rien à traduire : tout est déjà à jour en anglais.";
  }
  const debut = `${ecrits} champ${ecrits > 1 ? "s" : ""} traduit${
    ecrits > 1 ? "s" : ""
  } (${caracteres.toLocaleString("fr-FR")} caractères).`;
  return tronquee
    ? `${debut} La limite d'un envoi est atteinte : relancez pour continuer.`
    : `${debut} Relisez-les : ce sont des traductions automatiques.`;
}
