/**
 * « PEUT-ON OUVRIR CETTE CAGNOTTE ? » — LA SEULE RÉPONSE DU DÉPÔT.
 *
 * `activationBlocker` vivait en fonction PRIVÉE dans `src/actions/jackpot.ts` :
 * le serveur refusait l'activation un motif à la fois, et l'écran, lui, se
 * contentait d'un paragraphe STATIQUE (« renseignez le lot, un stock d'au
 * moins 1… », jackpot-editor.tsx) qui ne calculait rien. Le commerçant
 * découvrait ce qui manquait APRÈS avoir cliqué « Ouvrir aux joueurs », une
 * fois par refus.
 *
 * Ce module est l'extraction de cette fonction, à l'identique — mêmes motifs,
 * même ORDRE, mêmes phrases. Il est consommé par l'action ET par l'étape
 * « La vérification » de l'atelier. Recopier le prédicat côté écran aurait
 * fabriqué deux vérités sur l'ouverture d'une cagnotte ; c'est exactement ce
 * que `atelier-verification-state.ts` refuse de faire avec `campaignWindowState`.
 *
 * PUR : aucun réseau, aucune date implicite (`now` est un paramètre).
 */

import type { ControleActivation } from "./controle";

/** Les cinq colonnes dont dépend le refus — et rien d'autre. */
export interface CampagneActivableJackpot {
  draw_mode: string;
  threshold: number;
  draw_at: string | null;
  reward_stock: number;
  reward_label: string;
}

/**
 * Campagne prête à l'activation ? Message de refus sinon (`null` = OK).
 *
 * Miroir EXACT de l'ancienne fonction privée de l'action : ne pas réordonner
 * les tests, le premier motif rencontré est celui que lit le commerçant.
 */
export function blocageActivationJackpot(
  campagne: CampagneActivableJackpot,
  maintenant: Date = new Date(),
): string | null {
  if (!campagne.reward_label.trim()) {
    return "Renseignez le lot avant d'activer la campagne.";
  }
  if (campagne.reward_stock < 1) {
    return "Indiquez un stock d'au moins 1 lot avant d'activer (0 = en pause).";
  }
  if (campagne.threshold < 1) {
    return "L'objectif de la jauge doit valoir au moins 1.";
  }
  if (campagne.draw_mode === "date_draw") {
    if (
      !campagne.draw_at ||
      new Date(campagne.draw_at).getTime() <= maintenant.getTime()
    ) {
      return "Planifiez le tirage à une date et heure futures avant d'activer.";
    }
  }
  return null;
}

/** Un point de la liste de vérification (voir `activation/controle.ts`). */
export type { ControleActivation };

export interface EntreeActivationJackpot extends CampagneActivableJackpot {
  status: string;
  validation_mode: string;
  public_slug: string | null;
  code_ttl_days: number | null;
  /** Injectée par les tests ; le rendu serveur passe l'heure courante. */
  now?: Date;
}

export interface EtatActivationJackpot {
  controles: ControleActivation[];
  /** Ce que la liste ne juge pas, mais que le commerçant doit savoir. */
  rappels: string[];
  /** Vrai quand plus AUCUN motif bloquant ne subsiste. */
  toutPret: boolean;
  /** Le message qu'opposerait le serveur aujourd'hui (`null` = aucun). */
  blocage: string | null;
}

export function construireActivationJackpot(
  entree: EntreeActivationJackpot,
): EtatActivationJackpot {
  const maintenant = entree.now ?? new Date();
  const blocage = blocageActivationJackpot(entree, maintenant);

  const lotOk = entree.reward_label.trim().length > 0;
  const stockOk = entree.reward_stock >= 1;
  const objectifOk = entree.threshold >= 1;
  const dateFuture =
    entree.draw_at !== null &&
    new Date(entree.draw_at).getTime() > maintenant.getTime();
  const tirageOk = entree.draw_mode !== "date_draw" || dateFuture;

  const controles: ControleActivation[] = [
    {
      cle: "lot",
      ok: lotOk,
      bloquant: true,
      titre: "Le lot est nommé",
      detail: lotOk
        ? `Vos clients joueront pour « ${entree.reward_label.trim()} ».`
        : "Aucun lot n'est renseigné : l'ouverture sera refusée, et la page publique n'aurait rien à annoncer.",
      etape: "reglages",
    },
    {
      cle: "stock",
      ok: stockOk,
      bloquant: true,
      titre: "Un gagnant au moins est prévu",
      detail: stockOk
        ? `${entree.reward_stock} gagnant${entree.reward_stock > 1 ? "s" : ""} au maximum : ce nombre plafonne votre engagement, quel que soit le nombre de participants.`
        : "Le stock est à 0, c'est-à-dire « en pause » : aucun tirage n'aurait lieu, et l'ouverture sera refusée.",
      etape: "reglages",
    },
    {
      cle: "objectif",
      ok: objectifOk,
      bloquant: true,
      titre: "La jauge a un objectif",
      detail: objectifOk
        ? `La cagnotte se déclenche à ${entree.threshold} participation${entree.threshold > 1 ? "s" : ""}.`
        : "L'objectif de la jauge doit valoir au moins 1 : sans lui, la cagnotte n'a rien à atteindre.",
      etape: "reglages",
    },
    {
      cle: "tirage",
      ok: tirageOk,
      bloquant: true,
      titre: "Le tirage peut avoir lieu",
      detail:
        entree.draw_mode === "date_draw"
          ? dateFuture
            ? "Le gagnant sera tiré au sort à la date prévue, parmi tous les participants."
            : "La date du tirage est absente ou déjà passée : en mode « Tirage à date », l'ouverture sera refusée."
          : entree.draw_mode === "rescan_win"
            ? "Gain instantané au rescan : une participation peut emporter la cagnotte dès l'objectif atteint."
            : "Tirage à l'objectif : le gagnant est désigné quand la jauge est pleine.",
      etape: "reglages",
    },
    {
      cle: "url",
      ok: entree.public_slug !== null && entree.public_slug !== "",
      bloquant: false,
      titre: "L'adresse publique est fixée",
      detail:
        entree.public_slug
          ? `Vos QR pointeront sur …/jackpot/${entree.public_slug}.`
          : "Aucune adresse lisible n'est posée : une adresse sera générée à l'ouverture. Fixez-la AVANT d'imprimer vos QR, sinon vous imprimerez l'identifiant technique.",
      etape: "reglages",
    },
  ];

  const rappels: string[] = [
    entree.code_ttl_days === null
      ? "Le code JACKPOT- remis au gagnant n'a pas de date limite : il restera présentable en caisse indéfiniment."
      : `Le gagnant aura ${entree.code_ttl_days} jour${entree.code_ttl_days > 1 ? "s" : ""} pour présenter son code JACKPOT- en caisse, à partir du tirage.`,
    entree.validation_mode === "rotating_code"
      ? "Mode « Code au comptoir » : un écran doit afficher le code tournant pendant les heures d'ouverture, sinon personne ne peut participer."
      : "Mode « Validation en caisse » : vos clients présentent le QR de leur page, vous le scannez pour valider la participation.",
    "Ouvrir la cagnotte ne se fait qu'à un seul endroit : la carte « Statut de la campagne », sur la page de suivi.",
  ];

  return {
    controles,
    rappels,
    toutPret: controles.filter((c) => c.bloquant).every((c) => c.ok),
    blocage,
  };
}
