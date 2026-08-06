import { campaignDisplayStatus, campaignWindowState } from "@/lib/campaign-window";
import type {
  CalendarStatus,
  CampaignStatus,
  ContestStatus,
  EventGameStatus,
  EventSessionStatus,
  HuntStatus,
  JackpotCampaignStatus,
  JackpotDrawMode,
  LoyaltyProgramStatus,
} from "@/types/database";

/**
 * LA CARTE DE L'AVENTURE — cinq étapes, un module, aucune requête.
 *
 * Le cahier (§5) demande de rendre lisible « idée → brouillon → répétition →
 * en cours → clôturée » sans remplacer les vrais boutons. Ce fichier ne parle
 * ni à la base ni à React : il transforme des MARQUEURS déjà lus et des
 * CAPACITÉS déjà calculées en cinq étapes. C'est ce qui le rend testable module
 * par module, transition par transition.
 *
 * ── POURQUOI LES MARQUEURS SONT UNE UNION DISCRIMINÉE ──
 *
 * Parce que « clôturé » ne veut pas dire la même chose deux fois. Une chasse a
 * une fin datée, un quiz a un tirage, un calendrier n'a QU'un début et un
 * nombre de cases, un passeport de fidélité n'a aucune borne temporelle du
 * tout. Une entrée plate (`{ status, endsAt? }`) aurait obligé chaque appelant
 * à traduire son module vers un vocabulaire commun — donc à décider, chacun
 * dans son coin, ce que « fini » signifie. L'union force l'inverse : le
 * compilateur exige de CHAQUE appelant les marqueurs réels de SON module, et la
 * traduction est écrite ici, une fois.
 *
 * ── CE QU'IL NE RECALCULE PAS ──
 *
 * La fenêtre d'une CAMPAGNE vient de `campaign-window.ts`, importée et non
 * recopiée : son en-tête l'interdit explicitement (« Ne pas recopier ce
 * prédicat ailleurs — elles redivergeraient au prochain changement »), et la
 * divergence en question a déjà été vécue une fois. Les huit autres modules
 * n'ont pas d'équivalent partagé : leurs clôtures sont écrites ci-dessous,
 * chacune à partir de ses propres colonnes.
 *
 * ── LE PARRAINAGE N'EST PAS SUR LA CARTE ──
 *
 * Décision prise, pas un oubli : `referral_programs.enabled` est un booléen
 * sous une campagne, il n'a ni brouillon, ni répétition, ni clôture. Une carte
 * à cinq étapes dont trois seraient structurellement inatteignables ne
 * raconterait rien.
 */

/** Phases du cahier §5, dans l'ordre. Une étape par phase, toujours cinq. */
export type PhaseAventure =
  | "idee"
  | "brouillon"
  | "repetition"
  | "en_cours"
  | "cloturee";

export type EtapeAventure = {
  key: string;
  label: string;
  description: string;
  /** Jamais posé sur une étape `blocked` — un lien qu'on ne peut pas suivre. */
  href?: string;
  status: "complete" | "current" | "upcoming" | "blocked";
  blockedReason?: string;
};

/**
 * Les marqueurs de clôture, module par module.
 *
 * Chaque entrée nomme EXACTEMENT les colonnes qui décident, et rien d'autre :
 * un appelant qui passe une ligne entière la voit acceptée (les propriétés
 * excédentaires ne sont refusées que sur un littéral), un appelant qui oublie
 * `ends_at` sur une chasse ne compile pas.
 */
export interface MarqueursParKind {
  /** Roue et jeux instantanés : fenêtre `starts_at`/`ends_at`. */
  campaign: {
    status: CampaignStatus;
    starts_at: string | null;
    ends_at: string | null;
  };
  /** Chasse au trésor : même forme de fenêtre, prédicat écrit à part. */
  hunt: {
    status: HuntStatus;
    starts_at: string | null;
    ends_at: string | null;
  };
  /**
   * Calendrier : AUCUN `ends_at` en base. La fin se déduit de `start_date` et
   * du nombre de cases — c'est la seule façon de savoir qu'un calendrier de
   * décembre est terminé le 25.
   */
  calendar: {
    status: CalendarStatus;
    start_date: string | null;
    day_count: number;
  };
  /** Quiz : le tirage clôt l'animation, l'archivage aussi. */
  quiz: {
    status: "draft" | "active" | "archived";
    draw_state: "pending" | "done";
    drawn_at: string | null;
  };
  /**
   * Jackpot : seul `date_draw` a une fin datée.
   *
   * `cycle` est demandé — et sciemment SANS effet sur la clôture. C'est la
   * preuve de la règle plutôt qu'un champ mort : un jackpot `threshold_draw`
   * qui vient de tirer repart au cycle suivant, il n'est donc pas fini. Sans
   * ce marqueur sous les yeux, « il a tiré » se lit comme « il est terminé ».
   */
  jackpot: {
    status: JackpotCampaignStatus;
    draw_mode: JackpotDrawMode;
    draw_at: string | null;
    cycle: number;
  };
  /** Passeport de fidélité : aucune borne temporelle, l'archivage seul clôt. */
  loyalty: { status: LoyaltyProgramStatus };
  /**
   * Événement live : le seul module du dépôt à porter une vraie RÉPÉTITION —
   * une session en `lobby` pendant que le jeu dort encore en brouillon.
   */
  event: {
    status: EventGameStatus;
    sessions: readonly { status: EventSessionStatus }[];
  };
  /** Pronostics : `finished` ou `finalized_at`, la finalisation fait foi. */
  pronostics: {
    status: ContestStatus;
    finalized_at: string | null;
  };
}

export type KindAventure = keyof MarqueursParKind;

export type MarqueursAventure = {
  [K in KindAventure]: { kind: K } & MarqueursParKind[K];
}[KindAventure];

/**
 * État réel de l'animation, dérivé des marqueurs.
 *
 * `prete` est l'état qui manquait aux quatre premières esquisses : une
 * animation PUBLIÉE mais pas encore jouable (campagne programmée ou en pause,
 * chasse dont la fenêtre n'a pas ouvert, calendrier qui commence lundi). La
 * confondre avec `en_cours` afficherait « ouverte aux joueurs » sur une page
 * que personne ne peut atteindre ; la confondre avec `brouillon` effacerait le
 * travail de publication déjà fait.
 */
export type EtatAventure =
  | "brouillon"
  | "repetition"
  | "prete"
  | "en_cours"
  | "cloturee";

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/** `true` si la date est lisible ET strictement passée. */
function estPassee(date: string | null, maintenant: Date): boolean {
  if (!date) return false;
  const instant = Date.parse(date);
  return Number.isFinite(instant) && instant < maintenant.getTime();
}

/** `true` si la date est lisible ET strictement future. */
function estFuture(date: string | null, maintenant: Date): boolean {
  if (!date) return false;
  const instant = Date.parse(date);
  return Number.isFinite(instant) && instant > maintenant.getTime();
}

/**
 * Fin d'un calendrier : `start_date` + `day_count` jours.
 *
 * Le calendrier n'a pas d'`ends_at` (voir `MarqueursParKind`), et la dernière
 * case reste ouverte toute sa journée : la borne est donc le LENDEMAIN de la
 * dernière case, pas le jour même. Une date de départ illisible ou un
 * `day_count` non positif rendent `null` — « pas de fin connue », donc pas de
 * clôture, jamais une clôture par accident.
 */
function finDuCalendrier(startDate: string | null, dayCount: number): number | null {
  if (!startDate) return null;
  const depart = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(depart) || dayCount <= 0) return null;
  return depart + dayCount * MS_PAR_JOUR;
}

export function etatAventure(
  marqueurs: MarqueursAventure,
  maintenant: Date = new Date(),
): EtatAventure {
  switch (marqueurs.kind) {
    case "campaign": {
      // IMPORTÉ, jamais recopié : `campaign-window.ts` est la source de vérité
      // unique de la jouabilité d'une campagne.
      const fenetre = campaignWindowState(
        { starts_at: marqueurs.starts_at, ends_at: marqueurs.ends_at },
        maintenant,
      );
      const affichage = campaignDisplayStatus(marqueurs.status, fenetre);
      switch (affichage) {
        case "draft":
          return "brouillon";
        case "archived":
        case "ended":
          return "cloturee";
        // Une campagne en pause est publiée mais injouable — même situation
        // qu'une campagne programmée, du point de vue du joueur.
        case "paused":
        case "scheduled":
          return "prete";
        case "active":
          return "en_cours";
      }
      return "en_cours";
    }

    case "hunt": {
      if (marqueurs.status === "archived") return "cloturee";
      if (marqueurs.status === "draft") return "brouillon";
      if (estPassee(marqueurs.ends_at, maintenant)) return "cloturee";
      if (estFuture(marqueurs.starts_at, maintenant)) return "prete";
      return "en_cours";
    }

    case "calendar": {
      if (marqueurs.status === "archived") return "cloturee";
      if (marqueurs.status === "draft") return "brouillon";
      const fin = finDuCalendrier(marqueurs.start_date, marqueurs.day_count);
      if (fin !== null && fin <= maintenant.getTime()) return "cloturee";
      if (estFuture(marqueurs.start_date, maintenant)) return "prete";
      return "en_cours";
    }

    case "quiz": {
      if (marqueurs.status === "archived") return "cloturee";
      // Le tirage clôt, même si le quiz est resté `active` : c'est lui qui
      // distribue les lots, plus rien ne se joue après.
      if (marqueurs.draw_state === "done" || marqueurs.drawn_at !== null) {
        return "cloturee";
      }
      if (marqueurs.status === "draft") return "brouillon";
      return "en_cours";
    }

    case "jackpot": {
      if (marqueurs.status === "archived") return "cloturee";
      if (marqueurs.status === "draft") return "brouillon";
      // Seul `date_draw` a une fin. `threshold_draw` et `rescan_win` repartent
      // au cycle suivant après chaque gain — les archiver est le seul moyen de
      // les arrêter, et c'est traité au-dessus.
      if (
        marqueurs.draw_mode === "date_draw" &&
        estPassee(marqueurs.draw_at, maintenant)
      ) {
        return "cloturee";
      }
      return "en_cours";
    }

    case "loyalty": {
      if (marqueurs.status === "archived") return "cloturee";
      if (marqueurs.status === "draft") return "brouillon";
      return "en_cours";
    }

    case "event": {
      if (marqueurs.status === "archived") return "cloturee";
      const sessions = marqueurs.sessions;
      const terminees =
        sessions.length > 0 &&
        sessions.every(
          (session) => session.status === "ended" || session.status === "archived",
        );
      if (terminees) return "cloturee";
      if (marqueurs.status === "active") return "en_cours";
      // Jeu encore en brouillon, mais une salle est ouverte ou en cours : c'est
      // exactement la répétition que le cahier décrit.
      const repete = sessions.some(
        (session) => session.status === "lobby" || session.status === "live",
      );
      return repete ? "repetition" : "brouillon";
    }

    case "pronostics": {
      if (marqueurs.status === "finished" || marqueurs.finalized_at !== null) {
        return "cloturee";
      }
      if (marqueurs.status === "draft") return "brouillon";
      return "en_cours";
    }
  }
}

/** Raccourci lisible, partagé avec « Relancer une formule ». */
export function estClotureeAventure(
  marqueurs: MarqueursAventure,
  maintenant: Date = new Date(),
): boolean {
  return etatAventure(marqueurs, maintenant) === "cloturee";
}

/**
 * Les trois capacités dont la carte a besoin.
 *
 * Sous-ensemble strict de `CapacitesModule` (`module-capabilities.ts`) : un
 * appelant passe son verdict tel quel. On ne recalcule RIEN ici — la carte est
 * un affichage, pas une garde.
 */
export interface CapacitesAventure {
  canEditDraft: boolean;
  canPublish: boolean;
  /** Phrase déjà calibrée sur le rôle. Sert de `blockedReason`. */
  message: string | null;
}

/**
 * Liens DÉJÀ autorisés par l'appelant.
 *
 * Ils arrivent filtrés — `lienSelonRole` a déjà rendu `null` ce que ce rôle ne
 * peut pas ouvrir. Ce module ne connaît ni les rôles ni les chemins réservés :
 * lui confier l'arbitrage en ferait un second endroit où le tenir.
 */
export interface LiensAventure {
  /** Éditeur du module (« Modifier le brouillon »). */
  editeur?: string | null;
  /** Aperçu joueur ou page des QR (« Testez avant d'ouvrir »). */
  apercu?: string | null;
  /** Suivi / résultats (« Voir ce que ça donne »). */
  suivi?: string | null;
}

export interface EntreeAventure {
  marqueurs: MarqueursAventure;
  capacites: CapacitesAventure;
  liens?: LiensAventure;
  maintenant?: Date;
}

const BLOCAGE_PAR_DEFAUT =
  "Cette étape n'est pas ouverte avec vos droits actuels.";

function etape(
  key: PhaseAventure,
  label: string,
  description: string,
  status: EtapeAventure["status"],
  options: { href?: string | null; blockedReason?: string | null } = {},
): EtapeAventure {
  const construite: EtapeAventure = { key, label, description, status };
  // Un lien sur une étape bloquée est précisément ce que la Carte doit éviter :
  // un bouton qui promet une action que le rôle ou le droit refusent.
  if (status !== "blocked" && options.href) construite.href = options.href;
  if (status === "blocked") {
    construite.blockedReason = options.blockedReason || BLOCAGE_PAR_DEFAUT;
  }
  return construite;
}

/**
 * Les CINQ étapes, toujours dans l'ordre du cahier.
 *
 * Deux étapes peuvent être `current` en même temps, et ce n'est pas une
 * anomalie : tant que l'animation est en brouillon, le commerçant a deux
 * gestes ouverts devant lui — finir de la préparer, et la tester. La carte les
 * montre tous les deux plutôt que d'en cacher un derrière l'autre.
 */
export function construireEtapesAventure(entree: EntreeAventure): EtapeAventure[] {
  const { marqueurs, capacites } = entree;
  const liens = entree.liens ?? {};
  const etat = etatAventure(marqueurs, entree.maintenant ?? new Date());

  const brouillon = etat === "brouillon" || etat === "repetition";
  const cloturee = etat === "cloturee";
  const publiee = etat === "prete" || etat === "en_cours" || cloturee;
  const raison = capacites.message;

  return [
    etape(
      "idee",
      "L'idée",
      "L'animation existe dans votre espace : le plus dur est fait.",
      "complete",
    ),

    // ── Brouillon ──
    !brouillon
      ? etape(
          "brouillon",
          "Le brouillon",
          "Les réglages sont posés.",
          "complete",
          { href: liens.editeur },
        )
      : capacites.canEditDraft
        ? etape(
            "brouillon",
            "Le brouillon",
            "Complétez les réglages : nom, lots, règles du jeu.",
            "current",
            { href: liens.editeur },
          )
        : etape(
            "brouillon",
            "Le brouillon",
            "La préparation de cette animation est en attente.",
            "blocked",
            { blockedReason: raison },
          ),

    // ── Répétition ──
    publiee
      ? etape(
          "repetition",
          "La répétition",
          "L'animation a été testée puis ouverte.",
          "complete",
          { href: liens.apercu },
        )
      : capacites.canPublish
        ? etape(
            "repetition",
            "La répétition",
            "Testez : ouvrez l'aperçu, scannez le QR comme le ferait un client.",
            "current",
            { href: liens.apercu },
          )
        : etape(
            "repetition",
            "La répétition",
            "L'ouverture au public demande d'activer ce module.",
            "blocked",
            { blockedReason: raison },
          ),

    // ── En cours ──
    cloturee
      ? etape("en_cours", "En cours", "L'animation a tourné.", "complete", {
          href: liens.suivi,
        })
      : etat === "en_cours"
        ? etape(
            "en_cours",
            "En cours",
            "Vos clients peuvent jouer : suivez les participations.",
            "current",
            { href: liens.suivi },
          )
        : etape(
            "en_cours",
            "En cours",
            "Rien n'est encore ouvert aux joueurs.",
            "upcoming",
          ),

    // ── Clôturée ──
    cloturee
      ? etape(
          "cloturee",
          "Clôturée",
          "C'est terminé. Relisez les résultats — et relancez la formule si elle a marché.",
          "current",
          { href: liens.suivi },
        )
      : etape(
          "cloturee",
          "Clôturée",
          "Vous y serez quand l'animation sera terminée.",
          "upcoming",
        ),
  ];
}
