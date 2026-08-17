import { campaignWindowState, type CampaignWindowInput } from "@/lib/campaign-window";
import {
  AUCUN_LOT_GAGNANT_TIRABLE,
  POIDS_TOTAL_NUL,
  estGagnantTirable,
  estTirable,
} from "@/lib/lot-tirable";
import { isSkillGameType, parseSkillConfig } from "@/lib/validations/skill";
import type { EtapeRoue } from "@/components/dashboard/atelier-roue-etapes";
import { libelleMecanique } from "@/components/dashboard/atelier-mecaniques";
import { partSur10 } from "@/components/dashboard/part-sur-10";
import type { CampaignStatus, GameType } from "@/types/database";

/**
 * L'ÉTAPE 5 DE L'ATELIER, EN FONCTION PURE.
 *
 * « Ouvrir aux joueurs » n'a aucune précondition métier EN BASE
 * (`set_campaign_status` ne vérifie que le rôle et le droit module) ; depuis le
 * wagon 4, `updateCampaign` en oppose deux côté application (aucun lot gagnant
 * tirable, poids total nul). Les autres manques — pas de QR code, date de fin
 * déjà passée — restent libres : cette checklist ne les referme pas, elle les
 * RACONTE avant le geste et renvoie sur l'étape qui les corrige.
 *
 * Elle est PURE et testée : aucun réseau, aucune date implicite (`now` est un
 * paramètre), aucune décision de droit. Les gardes d'accès restent où elles
 * sont — `capacitesDuModule` côté page, `assert_module_publish_allowed` en base.
 *
 * ── DEUX PRÉDICATS QU'ON NE RECOPIE PAS ──
 *
 * 1. La jouabilité de la campagne vient de `campaignWindowState`, IMPORTÉE.
 *    Ce module porte une interdiction explicite de recopie : le dashboard et
 *    /play ont déjà divergé une fois sur cette question, une campagne
 *    « Active » en vert que plus personne ne pouvait jouer.
 * 2. La tirabilité d'un lot vient de `lib/lot-tirable.ts`, IMPORTÉE — miroir
 *    exact de `perform_atomic_spin`. Elle vivait ici, en fonctions privées, et
 *    l'action serveur qui refuse la publication devait la recopier pour dire la
 *    même chose : deux exemplaires du même prédicat, donc deux vérités à terme.
 *    La phrase de refus vient du même endroit, pour la même raison.
 */
export interface LotVerification {
  is_active: boolean;
  is_losing: boolean;
  weight: number;
  stock: number | null;
}

export interface EntreeVerification {
  campaignId: string;
  gameType: GameType;
  /** `wheels.skill_config` tel qu'il est en base (jsonb libre, souvent null). */
  skillConfig: unknown;
  prizes: LotVerification[];
  /** Un QR code existe-t-il déjà pour cette campagne ? */
  qrExistant: boolean;
  campagne: CampaignWindowInput & { status: CampaignStatus };
  /** Injectée par les tests ; le rendu serveur passe l'heure courante. */
  now?: Date;
}

export interface ControleVerification {
  cle: string;
  ok: boolean;
  titre: string;
  detail: string;
  /** Étape de l'Atelier qui corrige ce point, quand il s'y corrige. */
  etape?: EtapeRoue;
  /** Écran hors Atelier (QR codes, réglages de la campagne). */
  lien?: { href: string; label: string };
}

export interface EtatVerification {
  controles: ControleVerification[];
  toutPret: boolean;
  /** Le SEUL endroit qui publie : la page de détail, ancre `#statut`. */
  ctaHref: string;
  poidsTotal: number;
  /** « ≈ N clients sur 10 gagnent quelque chose », sur la liste COMPLÈTE. */
  partGagnante: string;
}

export function construireVerification(
  entree: EntreeVerification,
): EtatVerification {
  const { campaignId, gameType, skillConfig, prizes, qrExistant, campagne } = entree;

  const tirables = prizes.filter(estTirable);
  const poidsTotal = tirables.reduce((somme, p) => somme + p.weight, 0);
  const gagnants = prizes.filter(estGagnantTirable);
  const poidsGagnant = gagnants.reduce((somme, p) => somme + p.weight, 0);
  const pctGagnant = poidsTotal > 0 ? (poidsGagnant / poidsTotal) * 100 : 0;
  const partGagnante = partSur10(pctGagnant);

  const controles: ControleVerification[] = [];

  controles.push({
    cle: "mecanique",
    ok: true,
    titre: "La mécanique est choisie",
    detail: `Vos clients joueront à « ${libelleMecanique(gameType)} ».`,
    etape: "jeu",
  });

  if (isSkillGameType(gameType)) {
    const parse = parseSkillConfig(gameType, skillConfig);
    controles.push({
      cle: "defi",
      ok: parse.ok,
      titre: "Le défi est réglé",
      // Le message de `parseSkillConfig` est celui de Zod : parfois parlant
      // (« Au moins 2 fragments »), parfois pas (une clé absente donne
      // « expected string, received undefined »). Il est donc REPORTÉ, jamais
      // affiché seul : la phrase nomme d'abord la mécanique et la conséquence.
      detail: parse.ok
        ? "Le défi est complet. Rappel : un client qui échoue repart perdant, et sa participation est consommée."
        : `Le défi « ${libelleMecanique(gameType)} » est incomplet : sans lui, le jeu répond « Ce défi n'est pas disponible ». (${parse.error})`,
      etape: "jeu",
    });
  }

  controles.push({
    cle: "lot-gagnant",
    ok: gagnants.length > 0,
    titre: "Au moins un lot peut être gagné",
    detail:
      gagnants.length > 0
        ? `${gagnants.length} lot${gagnants.length > 1 ? "s" : ""} gagnant${gagnants.length > 1 ? "s" : ""} peu${gagnants.length > 1 ? "vent" : "t"} sortir aujourd'hui.`
        : AUCUN_LOT_GAGNANT_TIRABLE,
    etape: "lots",
  });

  controles.push({
    cle: "poids",
    ok: poidsTotal > 0,
    titre: "Les chances de gain tiennent debout",
    detail:
      poidsTotal > 0
        ? `Poids total ${poidsTotal} — ${partGagnante}.`
        : POIDS_TOTAL_NUL,
    etape: "lots",
  });

  controles.push({
    cle: "qr",
    ok: qrExistant,
    titre: "Un QR code mène au jeu",
    detail: qrExistant
      ? "Vos clients ont une porte d'entrée : le QR est prêt à imprimer."
      : "Aucun QR code n'existe pour cette campagne : même ouverte, personne ne pourrait y accéder.",
    lien: qrExistant
      ? undefined
      : {
          // Le QR se crée désormais SUR la page du jeu (bloc `#qr`) : renvoyer
          // vers l'onglet QR codes faisait quitter l'écran pour revenir.
          href: `/dashboard/campaigns/${campaignId}#qr`,
          label: "Créer le QR code sur la page du jeu",
        },
  });

  const fenetre = campaignWindowState(campagne, entree.now);
  const archivee = campagne.status === "archived";
  const fenetreOk = !archivee && fenetre !== "ended";
  controles.push({
    cle: "fenetre",
    ok: fenetreOk,
    titre: "La campagne peut s'ouvrir",
    detail: archivee
      ? "Cette campagne est clôturée : restaurez-la en brouillon avant d'ouvrir le jeu."
      : fenetre === "ended"
        ? "La date de fin est déjà passée : même ouverte, la campagne ne servirait plus personne."
        : fenetre === "scheduled"
          ? "La campagne ouvrira à sa date de début."
          : "Aucune date ne bloque l'ouverture.",
    lien: fenetreOk
      ? undefined
      : {
          href: `/dashboard/campaigns/${campaignId}`,
          label: "Régler les dates de la campagne",
        },
  });

  return {
    controles,
    toutPret: controles.every((c) => c.ok),
    ctaHref: `/dashboard/campaigns/${campaignId}#statut`,
    poidsTotal,
    partGagnante,
  };
}
