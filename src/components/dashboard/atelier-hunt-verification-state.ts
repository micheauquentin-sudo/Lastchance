import {
  manquesActivationChasse,
  HUNT_MIN_STEPS,
} from "@/lib/activation/hunts";
import type { EtapeChasse } from "@/components/dashboard/atelier-hunt-etapes";

/**
 * L'ÉTAPE 4 DE L'ATELIER DE LA CHASSE, EN FONCTION PURE.
 *
 * Deux des quatre points sont la précondition SERVEUR, importée et non
 * recopiée (`manquesActivationChasse`) : ce sont exactement les deux refus que
 * `setHuntStatus` oppose au commerçant, dits AVANT le clic plutôt qu'après.
 *
 * Les deux autres sont ce que le serveur NE vérifie PAS, et que personne ne
 * disait :
 *  · un stock de lots déjà épuisé — la chasse s'ouvre, les joueurs la
 *    terminent, et repartent avec « il n'y a plus de lot » ;
 *  · une fenêtre `ends_at` déjà passée — la chasse s'ouvre et les pages
 *    d'étapes restent indisponibles.
 *
 * Elle ne referme aucun de ces trous : elle les RACONTE, puis renvoie sur
 * l'unique écran qui publie (`#statut` de la vue suivi). Pure et testée :
 * aucun réseau, `now` est un paramètre.
 */
export interface EntreeVerificationChasse {
  huntId: string;
  /** `hunts.reward_label` (colonne NOT NULL). */
  rewardLabel: string;
  /** `hunts.reward_stock` — null = ILLIMITÉ, pas « zéro ». */
  rewardStock: number | null;
  /** `hunts.reward_claimed_count` : codes de retrait déjà émis. */
  rewardClaimedCount: number;
  stepCount: number;
  endsAt: string | null;
  /** Injectée par les tests ; le rendu serveur passe l'heure courante. */
  now?: Date;
}

export interface ControleChasse {
  cle: string;
  ok: boolean;
  titre: string;
  detail: string;
  /** Étape de l'atelier qui corrige ce point. */
  etape: EtapeChasse;
}

export interface EtatVerificationChasse {
  controles: ControleChasse[];
  toutPret: boolean;
  /** Le SEUL endroit qui publie : la vue suivi, ancre `#statut`. */
  ctaHref: string;
}

export function construireVerificationChasse(
  entree: EntreeVerificationChasse,
): EtatVerificationChasse {
  const { huntId, rewardLabel, rewardStock, rewardClaimedCount, stepCount } =
    entree;

  const manques = new Set(
    manquesActivationChasse({ rewardLabel, stepCount }),
  );

  const controles: ControleChasse[] = [];

  controles.push({
    cle: "parcours",
    ok: !manques.has("etapes"),
    titre: `Le parcours compte au moins ${HUNT_MIN_STEPS} étapes`,
    detail: manques.has("etapes")
      ? `${stepCount} étape${stepCount > 1 ? "s" : ""} pour l'instant : une chasse en compte ${HUNT_MIN_STEPS} au minimum, sinon elle serait terminée dès le premier scan.`
      : `${stepCount} étapes à tamponner, chacune avec son propre QR code.`,
    etape: "parcours",
  });

  controles.push({
    cle: "lot",
    ok: !manques.has("lot"),
    titre: "Le lot final est renseigné",
    detail: manques.has("lot")
      ? "Aucun lot final : c'est ce que le joueur retire en caisse en arrivant au bout. Sans lui, l'ouverture aux joueurs est refusée."
      : `Le joueur qui termine repart avec « ${rewardLabel.trim()} », à retirer en caisse.`,
    etape: "chasse",
  });

  // Le stock d'une chasse est FACULTATIF — vide = illimité. C'est l'inverse du
  // passeport de fidélité, où il est obligatoire et fini. Le même mot n'engage
  // donc pas la même chose d'un module à l'autre, et ce contrôle le dit.
  const restant =
    rewardStock === null ? null : Math.max(0, rewardStock - rewardClaimedCount);
  controles.push({
    cle: "stock",
    ok: restant === null || restant > 0,
    titre: "Il reste des lots à distribuer",
    detail:
      restant === null
        ? "Stock laissé vide : le lot est illimité, rien ne borne le nombre de codes émis."
        : restant > 0
          ? `${restant} lot${restant > 1 ? "s" : ""} encore disponible${restant > 1 ? "s" : ""} sur les ${rewardStock} prévus.`
          : `Stock épuisé (${rewardClaimedCount} code${rewardClaimedCount > 1 ? "s" : ""} déjà émis sur ${rewardStock}) : les joueurs qui terminent seront informés qu'il n'y a plus de lot. Laissez le stock vide pour le rendre illimité.`,
    etape: "chasse",
  });

  const maintenant = entree.now ?? new Date();
  const fin = entree.endsAt ? new Date(entree.endsAt) : null;
  const finPassee = fin !== null && fin.getTime() <= maintenant.getTime();
  controles.push({
    cle: "fenetre",
    ok: !finPassee,
    titre: "La fenêtre de jeu est ouverte",
    detail: finPassee
      ? "La date de fin est déjà passée : même ouverte, les pages d'étapes resteraient indisponibles pour vos joueurs."
      : fin === null
        ? "Aucune date de fin : la chasse reste jouable tant que vous ne la clôturez pas."
        : "La date de fin n'est pas encore atteinte.",
    etape: "chasse",
  });

  return {
    controles,
    toutPret: controles.every((c) => c.ok),
    ctaHref: `/dashboard/hunts/${huntId}#statut`,
  };
}
