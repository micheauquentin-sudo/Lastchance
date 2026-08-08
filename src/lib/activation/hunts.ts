import type { EtapeChasse } from "@/components/dashboard/atelier-hunt-etapes";

/**
 * « PEUT-ON OUVRIR CETTE CHASSE AUX JOUEURS ? » — EN FONCTION PURE.
 *
 * Ce verdict vivait EN LIGNE dans `setHuntStatus` (src/actions/hunts.ts), donc
 * inaccessible à tout écran. L'atelier a besoin de le raconter AVANT le geste,
 * et le recopier aurait créé deux vérités sur une même question — la faute que
 * `atelier-verification-state.ts` interdit explicitement en important
 * `campaignWindowState` plutôt qu'en le réécrivant.
 *
 * Il est donc extrait ici, PUR et testé, et il a exactement deux lecteurs :
 * l'action (qui refuse) et l'étape « La vérification » (qui explique). Les
 * messages sont ceux que l'action renvoyait, au caractère près : ils sont lus
 * par le commerçant dans les deux endroits, et la garde d'activation en base
 * (`assert_module_publish_allowed`) reste, elle, où elle est.
 *
 * Ce module ne dit RIEN du droit d'abonnement ni du rôle : ce sont des
 * questions d'autorisation, tranchées ailleurs et avant.
 */

/** Miroir de la garde serveur et du CHECK de complétion : 2 étapes minimum. */
export const HUNT_MIN_STEPS = 2;

export interface EtatActivationChasse {
  /** `hunts.reward_label` tel qu'il est en base (colonne NOT NULL, souvent ""). */
  rewardLabel: string;
  /** Nombre de lignes `hunt_steps` de cette chasse. */
  stepCount: number;
}

/** Ce qui manque, dans l'ordre où l'action le refusait. */
export type ManqueActivationChasse = "lot" | "etapes";

export const MESSAGES_ACTIVATION_CHASSE: Record<ManqueActivationChasse, string> =
  {
    lot: "Renseignez le lot final avant d'activer la chasse.",
    etapes: `Ajoutez au moins ${HUNT_MIN_STEPS} étapes avant d'activer la chasse.`,
  };

/**
 * TOUT ce qui manque, pas seulement le premier manque. L'action n'en montre
 * qu'un (elle refuse au premier), l'atelier les montre tous : corriger un
 * point pour en découvrir un second est précisément ce que l'étape de
 * vérification existe pour éviter.
 */
export function manquesActivationChasse(
  etat: EtatActivationChasse,
): ManqueActivationChasse[] {
  const manques: ManqueActivationChasse[] = [];
  if (!etat.rewardLabel.trim()) manques.push("lot");
  if (etat.stepCount < HUNT_MIN_STEPS) manques.push("etapes");
  return manques;
}

/**
 * Le message de refus de `setHuntStatus`, ou `null` si l'ouverture est
 * possible. L'ordre des manques est celui que l'action appliquait : le lot
 * d'abord, les étapes ensuite.
 */
export function refusActivationChasse(
  etat: EtatActivationChasse,
): string | null {
  const [premier] = manquesActivationChasse(etat);
  return premier ? MESSAGES_ACTIVATION_CHASSE[premier] : null;
}

/**
 * L'ÉTAPE 4 DE L'ATELIER DE LA CHASSE, EN FONCTION PURE.
 *
 * Elle vivait sous `src/components/dashboard/` alors qu'elle ne rend rien :
 * six autres modules tenaient déjà le même calcul sous `src/lib/activation/`,
 * et la chercher au bon endroit menait à un fichier qui n'avait que les
 * `string[]` de la précondition serveur. Elle est ici, avec eux.
 *
 * Deux des quatre points sont la précondition SERVEUR, réutilisée et non
 * recopiée (`manquesActivationChasse`, juste au-dessus) : ce sont exactement
 * les deux refus que `setHuntStatus` oppose au commerçant, dits AVANT le clic
 * plutôt qu'après.
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
