import { campaignWindowState, type CampaignWindowInput } from "@/lib/campaign-window";
import { isSkillGameType, parseSkillConfig } from "@/lib/validations/skill";
import type { EtapeAtelier } from "@/components/dashboard/atelier-etapes";
import { libelleMecanique } from "@/components/dashboard/atelier-mecaniques";
import type { CampaignStatus, GameType } from "@/types/database";

/**
 * L'ÉTAPE 5 DE L'ATELIER, EN FONCTION PURE.
 *
 * « Ouvrir aux joueurs » n'a AUCUNE précondition métier en base
 * (`set_campaign_status` ne vérifie que le rôle et le droit module) : on peut
 * publier une animation sans QR code, sans un seul lot tirable, ou dont la
 * date de fin est déjà passée. Cette checklist ne referme pas ce trou — elle
 * le RACONTE, avant le geste, et renvoie sur l'étape qui le corrige.
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
 * 2. Un lot n'est tirable que si `is_losing || stock is null || stock > 0` —
 *    miroir exact de `perform_atomic_spin`. Compter un lot épuisé dans le
 *    total affichait des probabilités fausses.
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
  etape?: EtapeAtelier;
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

/**
 * Traduction du poids en langage de commerçant.
 *
 * Jumelle de `partSur10` (prize-editor.tsx) — la même phrase, au mot près.
 * Elle est recopiée ICI et nulle part ailleurs parce que l'originale vit dans
 * un module `"use client"` : l'importer depuis un Server Component en ferait
 * une référence client, donc une erreur au rendu. Le jour où `partSur10`
 * descendra dans un module pur, cette copie disparaît au profit d'un import.
 */
function partGagnanteSur10(pctGagnant: number): string {
  const sur10 = Math.round(pctGagnant / 10);
  if (sur10 <= 0) return "moins d'un client sur 10 gagne quelque chose";
  if (sur10 >= 10) return "quasiment tous vos clients gagnent quelque chose";
  return `≈ ${sur10} client${sur10 > 1 ? "s" : ""} sur 10 gagne${sur10 > 1 ? "nt" : ""} quelque chose`;
}

function estTirable(p: LotVerification): boolean {
  return p.is_active && (p.is_losing || p.stock === null || p.stock > 0);
}

function estGagnantTirable(p: LotVerification): boolean {
  return estTirable(p) && !p.is_losing && p.weight > 0;
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
  const partGagnante = partGagnanteSur10(pctGagnant);

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
        : "Aucun lot gagnant n'est tirable : ils sont désactivés, à poids nul ou en rupture de stock. Vos clients repartiraient tous bredouilles.",
    etape: "lots",
  });

  controles.push({
    cle: "poids",
    ok: poidsTotal > 0,
    titre: "Les chances de gain tiennent debout",
    detail:
      poidsTotal > 0
        ? `Poids total ${poidsTotal} — ${partGagnante}.`
        : "Le poids total est nul : aucun lot ne peut sortir, le tirage n'a rien à distribuer.",
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
          href: `/dashboard/qr-codes?campaign=${campaignId}`,
          label: "Créer le QR code",
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
