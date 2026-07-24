/**
 * Place de marché de campagnes — CATALOGUE et BLUEPRINT (module PUR).
 *
 * Un MODÈLE fournit sept promesses d'un coup : le visuel, le jeu, les
 * textes, les récompenses suggérées, les emails, la durée et les règles.
 * Le commerçant part de là au lieu de tout configurer.
 *
 * Deux sources, délibérément asymétriques (cf. migration
 * 20260802120000_campaign_templates.sql) :
 *   • le CATALOGUE Lastchance (10 modèles) vit ICI, en code versionné —
 *     retoucher un texte est un commit, pas une migration ;
 *   • les modèles PRIVÉS du commerçant vivent dans `campaign_templates`,
 *     strictement org-scopés, et portent le MÊME blueprint.
 *
 * Ce module est NEUTRE : aucun import server-only, aucune I/O, aucune
 * date implicite. `blueprintToDraft` est une fonction PURE — c'est elle
 * qui transforme une recette (durée RELATIVE en jours) en valeurs
 * concrètes (dates absolues), et elle est testée à ce titre.
 *
 * ── Deux invariants portés par ce fichier ──
 *  1. Un modèle ne contient JAMAIS de date absolue : `durationDays`
 *     seulement. Sinon un modèle « Noël » périme au 26 décembre.
 *  2. Les `emails` ne sont QUE des textes suggérés. Rien ici n'active un
 *     scénario : `blueprintToDraft` les recopie tels quels dans le
 *     brouillon, et l'action d'application ne les écrit nulle part.
 *     Un modèle appliqué par curiosité n'écrit jamais à un client.
 */

import { getPreset, resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { EngagementConfig, GameType, PlayLimit } from "@/types/database";

/** Version de forme du blueprint (le jsonb stocké la porte). */
export const CAMPAIGN_BLUEPRINT_VERSION = 1 as const;

/** Durée retenue quand une campagne enregistrée n'a pas de période. */
export const DEFAULT_TEMPLATE_DURATION_DAYS = 14;

/** Moment suggéré d'un texte d'email — indicatif, jamais un déclencheur. */
export type BlueprintEmailMoment = "annonce" | "gagnant" | "rappel" | "fin";

/** Lot suggéré par un modèle. `stock` fini = plafond économique (ADR-031). */
export interface BlueprintPrize {
  label: string;
  description: string;
  /** Couleur du segment (#rrggbb). */
  color: string;
  /** Poids de tirage (entier ≥ 0). */
  weight: number;
  is_losing: boolean;
  /**
   * Stock suggéré. FINI sur tout lot GAGNANT — un modèle ne propose
   * jamais un gain illimité (ADR-031 : le stock est le plafond réel de
   * la campagne). `null` sur le lot PERDANT, et seulement là : un « pas
   * de chance » ne coûte rien et ne doit jamais s'épuiser, sinon la roue
   * perdrait son segment perdant et ne distribuerait plus que des gains.
   */
  stock: number | null;
  /** Coût réel unitaire en centimes (ROI / budget) — null si inconnu. */
  cost_cents: number | null;
}

/** Texte d'email suggéré — INERTE (aucune automatisation associée). */
export interface BlueprintEmail {
  moment: BlueprintEmailMoment;
  subject: string;
  body: string;
}

/** La recette complète d'une campagne, sans aucune valeur absolue. */
export interface CampaignBlueprint {
  version: typeof CAMPAIGN_BLUEPRINT_VERSION;
  /** Tous les textes portés par le modèle. */
  texts: {
    /** Nom de la campagne créée (dashboard). */
    campaignName: string;
    /** Nom de la roue / du jeu. */
    wheelName: string;
    /** Accroche affichée au joueur sur /play (→ `style.title`, ≤ 80). */
    wheelTitle: string;
  };
  /** Préréglage visuel existant + surcharges éventuelles. */
  visual: {
    /** Clé d'un préréglage de `WHEEL_PRESETS` (kermesse, neon, …). */
    preset: string;
    style?: Partial<WheelStyle>;
  };
  /** Mécanique de jeu (+ config du défi pour les jeux skill-gated). */
  game: {
    game_type: GameType;
    /** Config du défi — non nulle uniquement sur un game_type de DÉFI. */
    skill_config: Record<string, unknown> | null;
  };
  prizes: BlueprintPrize[];
  rules: {
    play_limit: PlayLimit;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
    engagement: EngagementConfig;
    budget_cents: number | null;
  };
  /** Durée RELATIVE en jours (1..365) — jamais de dates absolues. */
  durationDays: number;
  /** Textes d'email suggérés, INERTES. */
  emails: BlueprintEmail[];
}

/** Entrée du catalogue Lastchance (vignette de la place de marché). */
export interface CampaignTemplate {
  key: string;
  label: string;
  /** Pitch commerçant : quand et pourquoi utiliser ce modèle. */
  description: string;
  emoji: string;
  blueprint: CampaignBlueprint;
}

/** Valeurs CONCRÈTES prêtes à écrire, produites par `blueprintToDraft`. */
export interface CampaignDraft {
  campaign: {
    name: string;
    /** Toujours `draft` : rien n'est jouable tant que le commerçant n'active pas. */
    status: "draft";
    starts_at: string;
    ends_at: string;
    /**
     * Toujours `false`. `run_campaign_schedule()` (pg_cron, 10 min) fait
     * passer une campagne `draft` en `active` dès que
     * `auto_schedule and starts_at <= now()` — un modèle appliqué avec
     * `auto_schedule = true` et une date de début à maintenant se
     * publierait donc TOUT SEUL dans les dix minutes. Interdit : la
     * programmation reste un choix explicite du commerçant.
     */
    auto_schedule: false;
    budget_cents: number | null;
    engagement: EngagementConfig;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
  };
  wheel: {
    name: string;
    style: WheelStyle;
    game_type: GameType;
    play_limit: PlayLimit;
    skill_config: Record<string, unknown> | null;
  };
  prizes: Array<BlueprintPrize & { position: number }>;
  /**
   * Textes suggérés, transportés pour affichage seulement. Aucun
   * consommateur de `CampaignDraft` ne doit les écrire en base ni les
   * envoyer : activer un scénario reste une action explicite du
   * commerçant dans automation_settings.
   */
  emails: BlueprintEmail[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recette → valeurs concrètes. PURE : `now` est fourni par l'appelant
 * (aucun `Date.now()` caché), et la fonction ne jette jamais — un style
 * corrompu retombe sur les défauts via `resolveWheelStyle`.
 */
export function blueprintToDraft(
  blueprint: CampaignBlueprint,
  now: Date,
): CampaignDraft {
  const startsAt = new Date(now.getTime());
  const endsAt = new Date(now.getTime() + blueprint.durationDays * DAY_MS);
  const preset = getPreset(blueprint.visual.preset);

  const style = resolveWheelStyle({
    ...(preset?.style ?? {}),
    ...(blueprint.visual.style ?? {}),
    ...(preset ? { preset: preset.key } : {}),
    // L'accroche du modèle EST le titre de la roue. Tronquée à la borne
    // du schéma : au-delà, resolveWheelStyle retomberait sur TOUS les
    // défauts et le préréglage serait perdu.
    title: blueprint.texts.wheelTitle.slice(0, 80),
  });

  return {
    campaign: {
      name: blueprint.texts.campaignName,
      status: "draft",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      auto_schedule: false,
      budget_cents: blueprint.rules.budget_cents,
      engagement: blueprint.rules.engagement,
      collect_email: blueprint.rules.collect_email,
      collect_phone: blueprint.rules.collect_phone,
      code_ttl_seconds: blueprint.rules.code_ttl_seconds,
    },
    wheel: {
      name: blueprint.texts.wheelName,
      style,
      game_type: blueprint.game.game_type,
      play_limit: blueprint.rules.play_limit,
      skill_config: blueprint.game.skill_config,
    },
    prizes: blueprint.prizes.map((prize, index) => ({ ...prize, position: index })),
    emails: blueprint.emails,
  };
}

/* ────────────────────────────────────────────────────────────
 * Le catalogue Lastchance — 10 modèles
 *
 * Chaque modèle choisit une mécanique qui a du SENS pour l'occasion
 * (retourner une carte à la Saint-Valentin, ouvrir un coffre à Noël,
 * gratter pour la fête des Mères…) et un préréglage visuel EXISTANT de
 * src/lib/wheel-style.ts, surchargé seulement quand la saison l'impose
 * (rouge/rose, orange/violet, vert/or).
 *
 * Contrainte technique commune : au moins un lot GAGNANT et un lot
 * PERDANT — sans quoi le jeu n'est pas jouable. Les stocks des lots
 * gagnants sont FINIS et volontairement prudents : le commerçant les
 * relit dans son brouillon avant d'activer.
 * ──────────────────────────────────────────────────────────── */

/** Lot perdant standard — jamais de stock (cf. BlueprintPrize.stock). */
function losing(label: string, description: string, weight: number): BlueprintPrize {
  return {
    label,
    description,
    color: "#64748b",
    weight,
    is_losing: true,
    stock: null,
    cost_cents: null,
  };
}

/** Lot gagnant — stock FINI obligatoire. */
function winning(
  label: string,
  description: string,
  color: string,
  weight: number,
  stock: number,
): BlueprintPrize {
  return { label, description, color, weight, is_losing: false, stock, cost_cents: null };
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: "saint_valentin",
    label: "Saint-Valentin",
    description:
      "Une semaine de jeu pour les amoureux : on retourne une carte, on gagne un dessert à partager ou une remise sur l'addition.",
    emoji: "💘",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Saint-Valentin",
        wheelName: "Les cartes des amoureux",
        wheelTitle: "Retournez une carte, l'amour vous sourit !",
      },
      visual: {
        preset: "candy",
        style: {
          ringColor: "#ffffff",
          pointerColor: "#e11d48",
          bgFrom: "#fecdd3",
          bgTo: "#e11d48",
          buttonFrom: "#e11d48",
          buttonTo: "#fb7185",
        },
      },
      game: { game_type: "flip_card", skill_config: null },
      prizes: [
        winning("Dessert à partager offert", "Un dessert pour deux, offert par la maison.", "#e11d48", 15, 25),
        winning("−10 % sur l'addition", "Remise immédiate sur votre note.", "#fb7185", 25, 80),
        winning("Coupe de champagne offerte", "Une coupe pour trinquer à deux.", "#fda4af", 10, 30),
        winning("Une rose pour votre moitié", "À emporter en repartant.", "#f43f5e", 15, 50),
        losing("Ce sera pour la prochaine fois", "Merci d'avoir joué — repassez nous voir !", 35),
      ],
      rules: {
        play_limit: "once",
        collect_email: false,
        collect_phone: false,
        code_ttl_seconds: 300,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 7,
      emails: [
        {
          moment: "annonce",
          subject: "Notre jeu de la Saint-Valentin est ouvert",
          body: "Bonjour,\n\nPour la Saint-Valentin, scannez le QR code en boutique et retournez une carte : desserts à partager, remises et petites attentions vous attendent.\n\nÀ très vite !",
        },
        {
          moment: "gagnant",
          subject: "Votre cadeau de la Saint-Valentin vous attend",
          body: "Bravo !\n\nVotre lot est réservé. Présentez votre code en boutique avant la fin du jeu pour en profiter.\n\nBelle Saint-Valentin !",
        },
        {
          moment: "rappel",
          subject: "Il reste quelques jours pour tenter votre chance",
          body: "Bonjour,\n\nLe jeu de la Saint-Valentin se termine bientôt et il reste des lots à gagner. Passez en boutique et scannez le QR code.\n\nÀ bientôt !",
        },
      ],
    },
  },
  {
    key: "halloween",
    label: "Halloween",
    description:
      "Dix jours d'ambiance sorcière : trois chaudrons, un seul cache la bonne surprise. Idéal pour attirer les familles.",
    emoji: "🎃",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Halloween",
        wheelName: "Les chaudrons d'Halloween",
        wheelTitle: "Choisissez un chaudron… si vous l'osez !",
      },
      visual: {
        preset: "neon",
        style: {
          ringColor: "#f97316",
          lightColorA: "#f97316",
          lightColorB: "#a855f7",
          segmentBorderColor: "#f97316",
          pointerColor: "#f97316",
          bgFrom: "#3b0764",
          bgTo: "#0c0a09",
          buttonFrom: "#f97316",
          buttonTo: "#a855f7",
        },
      },
      game: { game_type: "cups", skill_config: null },
      prizes: [
        winning("Bonbons offerts", "Une poignée de bonbons pour les petits monstres.", "#f97316", 30, 150),
        winning("Boisson chaude offerte", "Chocolat, thé ou café au choix.", "#a855f7", 20, 60),
        winning("−15 % sur votre achat", "Remise immédiate en caisse.", "#22c55e", 12, 40),
        winning("Une part de gâteau offerte", "La part du jour, offerte par la maison.", "#eab308", 8, 30),
        losing("Le chaudron était vide…", "Aucun sort ce coup-ci — retentez demain !", 30),
      ],
      rules: {
        play_limit: "once",
        collect_email: false,
        collect_phone: false,
        code_ttl_seconds: 300,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 10,
      emails: [
        {
          moment: "annonce",
          subject: "Halloween commence chez nous",
          body: "Bonjour,\n\nTrois chaudrons, une surprise cachée : venez tenter votre chance en boutique jusqu'à Halloween. Bonbons, boissons offertes et remises à gagner.\n\nÀ vous de jouer !",
        },
        {
          moment: "gagnant",
          subject: "Votre surprise d'Halloween est réservée",
          body: "Bravo !\n\nPrésentez votre code en boutique pour récupérer votre lot avant la fin du jeu.\n\nÀ très vite !",
        },
      ],
    },
  },
  {
    key: "noel",
    label: "Noël",
    description:
      "Un coffre à ouvrir chaque jour pendant tout décembre : le format qui fait revenir les clients avant les fêtes.",
    emoji: "🎄",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Noël",
        wheelName: "Le coffre de Noël",
        wheelTitle: "Ouvrez votre cadeau de Noël",
      },
      visual: {
        preset: "luxe",
        style: {
          ringColor: "#facc15",
          pointerColor: "#dc2626",
          bgFrom: "#14532d",
          bgTo: "#052e16",
          buttonFrom: "#dc2626",
          buttonTo: "#facc15",
        },
      },
      game: { game_type: "chest", skill_config: null },
      prizes: [
        winning("−10 % sur vos achats", "Remise immédiate en caisse.", "#dc2626", 28, 200),
        winning("Un chocolat offert", "La petite douceur de Noël.", "#a16207", 22, 250),
        winning("Emballage cadeau offert", "On emballe vos cadeaux, c'est offert.", "#16a34a", 15, 100),
        winning("Bon d'achat de 10 €", "Valable sur votre prochaine visite.", "#facc15", 5, 40),
        losing("Pas de cadeau aujourd'hui", "Revenez ouvrir le coffre demain !", 30),
      ],
      rules: {
        play_limit: "daily",
        collect_email: true,
        collect_phone: false,
        code_ttl_seconds: 300,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 24,
      emails: [
        {
          moment: "annonce",
          subject: "Un cadeau à ouvrir chaque jour jusqu'à Noël",
          body: "Bonjour,\n\nChaque jour de décembre, un coffre vous attend en boutique : chocolats, remises, emballages offerts et bons d'achat. Une ouverture par jour et par personne.\n\nJoyeuses fêtes !",
        },
        {
          moment: "gagnant",
          subject: "Votre cadeau de Noël est réservé",
          body: "Bravo !\n\nVotre lot vous attend en boutique — présentez simplement votre code en caisse.\n\nJoyeuses fêtes !",
        },
        {
          moment: "fin",
          subject: "Dernier jour pour ouvrir votre coffre",
          body: "Bonjour,\n\nC'est le dernier jour du calendrier : passez en boutique pour ouvrir votre coffre une dernière fois.\n\nMerci pour cette belle fin d'année !",
        },
      ],
    },
  },
  {
    key: "ouverture_boutique",
    label: "Ouverture de boutique",
    description:
      "Deux semaines pour faire connaître la boutique : la roue classique, l'email récupéré, et un premier fichier client qui se constitue.",
    emoji: "🎉",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Ouverture de la boutique",
        wheelName: "La roue de l'ouverture",
        wheelTitle: "On ouvre ! Tournez la roue pour fêter ça",
      },
      visual: { preset: "kermesse" },
      game: { game_type: "wheel", skill_config: null },
      prizes: [
        winning("−10 % sur votre premier achat", "Remise de bienvenue, immédiate en caisse.", "#f5793b", 30, 200),
        winning("Un café offert", "Pour faire connaissance autour d'un café.", "#fcca59", 22, 150),
        winning("Bon d'achat de 5 €", "Valable dès votre prochaine visite.", "#f296bd", 12, 80),
        winning("Le lot du chef", "Une surprise choisie par la maison.", "#8b5cf6", 6, 25),
        losing("Pas de chance cette fois", "Merci de votre visite — revenez nous voir !", 30),
      ],
      rules: {
        play_limit: "once",
        collect_email: true,
        collect_phone: false,
        code_ttl_seconds: 300,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 14,
      emails: [
        {
          moment: "annonce",
          subject: "Nous ouvrons nos portes — venez jouer !",
          body: "Bonjour,\n\nNotre boutique ouvre ses portes. Pour fêter ça, une roue vous attend : remises de bienvenue, cafés offerts et bons d'achat pendant deux semaines.\n\nAu plaisir de vous accueillir !",
        },
        {
          moment: "gagnant",
          subject: "Merci pour votre visite — votre lot vous attend",
          body: "Bravo et merci d'être passé !\n\nPrésentez votre code en caisse pour récupérer votre lot.\n\nÀ très bientôt !",
        },
        {
          moment: "rappel",
          subject: "Vous n'avez pas encore joué ?",
          body: "Bonjour,\n\nLa roue de l'ouverture tourne encore quelques jours. Passez en boutique, scannez le QR code et tentez votre chance.\n\nÀ bientôt !",
        },
      ],
    },
  },
  {
    key: "anniversaire_boutique",
    label: "Anniversaire de la boutique",
    description:
      "Une semaine festive pour souffler les bougies : un jeu de paires à retrouver et des lots plus généreux que d'habitude.",
    emoji: "🎂",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Anniversaire de la boutique",
        wheelName: "Le jeu des paires d'anniversaire",
        wheelTitle: "Retrouvez les paires, c'est notre anniversaire !",
      },
      visual: { preset: "fiesta" },
      game: { game_type: "memory", skill_config: null },
      prizes: [
        winning("−20 % sur votre achat", "Notre remise d'anniversaire, une fois par personne.", "#ef4444", 20, 100),
        winning("Une part de gâteau offerte", "On souffle les bougies avec vous.", "#facc15", 25, 120),
        winning("Bon d'achat de 10 €", "Valable sur votre prochaine visite.", "#22c55e", 10, 50),
        winning("Le cadeau surprise", "Un lot choisi par l'équipe.", "#f97316", 5, 20),
        losing("Pas de paire cette fois", "Merci d'avoir joué — revenez demain !", 40),
      ],
      rules: {
        play_limit: "once",
        collect_email: false,
        collect_phone: false,
        code_ttl_seconds: 300,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 7,
      emails: [
        {
          moment: "annonce",
          subject: "C'est notre anniversaire, on vous gâte",
          body: "Bonjour,\n\nNous fêtons l'anniversaire de la boutique toute la semaine : retrouvez les paires en boutique et repartez avec une remise, une part de gâteau ou un bon d'achat.\n\nMerci de nous suivre depuis le début !",
        },
        {
          moment: "gagnant",
          subject: "Votre cadeau d'anniversaire est réservé",
          body: "Bravo !\n\nVotre lot vous attend en caisse, il suffit de présenter votre code.\n\nMerci d'être là !",
        },
      ],
    },
  },
  {
    key: "match_football",
    label: "Match de football",
    description:
      "Trois jours autour d'un match : un lancer de dé avant, pendant ou après la rencontre, dans une ambiance pelouse.",
    emoji: "⚽",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Soirée match",
        wheelName: "Le dé du match",
        wheelTitle: "Lancez le dé avant le coup d'envoi !",
      },
      visual: {
        preset: "classic",
        style: {
          ringColor: "#16a34a",
          lightColorA: "#ffffff",
          lightColorB: "#4ade80",
          pointerColor: "#ffffff",
          bgFrom: "#166534",
          bgTo: "#052e16",
          buttonFrom: "#16a34a",
          buttonTo: "#4ade80",
        },
      },
      game: { game_type: "dice", skill_config: null },
      prizes: [
        winning("Une boisson offerte", "À consommer pendant le match.", "#16a34a", 28, 120),
        winning("Planche à partager offerte", "Pour la mi-temps, entre supporters.", "#f59e0b", 10, 30),
        winning("−15 % sur l'addition", "Remise immédiate sur votre note.", "#3b82f6", 17, 60),
        winning("La tournée du but", "Une boisson offerte à votre table.", "#ef4444", 5, 20),
        losing("Tir à côté !", "Pas de chance — retentez au prochain match.", 40),
      ],
      rules: {
        play_limit: "once",
        collect_email: false,
        collect_phone: false,
        code_ttl_seconds: 300,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 3,
      emails: [
        {
          moment: "annonce",
          subject: "On regarde le match ensemble",
          body: "Bonjour,\n\nLe match se joue chez nous : lancez le dé en arrivant et tentez de gagner une boisson, une planche à partager ou une remise sur l'addition.\n\nRéservez votre table, on vous attend !",
        },
        {
          moment: "gagnant",
          subject: "Votre lot du match vous attend",
          body: "Bravo !\n\nPrésentez votre code au comptoir pour récupérer votre lot pendant la soirée.\n\nBon match !",
        },
      ],
    },
  },
  {
    key: "fete_des_meres",
    label: "Fête des Mères",
    description:
      "Une semaine avant la fête : une carte à gratter douce et un geste offert pour accompagner l'achat cadeau.",
    emoji: "💐",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Fête des Mères",
        wheelName: "La carte à gratter des mamans",
        wheelTitle: "Grattez la carte et gâtez votre maman",
      },
      visual: { preset: "candy" },
      game: { game_type: "scratch", skill_config: null },
      prizes: [
        winning("Emballage cadeau offert", "On emballe joliment votre cadeau.", "#ec4899", 30, 150),
        winning("−10 % sur votre cadeau", "Remise immédiate en caisse.", "#f9a8d4", 22, 100),
        winning("Une fleur offerte", "À glisser avec le cadeau.", "#fbcfe8", 13, 60),
        winning("Bon d'achat de 10 €", "Pour revenir nous voir.", "#f97316", 5, 30),
        losing("Rien sous le grattage", "Merci d'avoir joué — bonne fête à votre maman !", 30),
      ],
      rules: {
        play_limit: "once",
        collect_email: false,
        collect_phone: false,
        code_ttl_seconds: 300,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 7,
      emails: [
        {
          moment: "annonce",
          subject: "Fête des Mères : grattez, on vous gâte",
          body: "Bonjour,\n\nJusqu'à la fête des Mères, grattez votre carte en boutique : emballage offert, remise sur votre cadeau ou fleur à glisser dans le paquet.\n\nÀ très vite !",
        },
        {
          moment: "gagnant",
          subject: "Votre attention pour la fête des Mères",
          body: "Bravo !\n\nPrésentez votre code en caisse et nous nous occupons du reste.\n\nBelle fête à votre maman !",
        },
      ],
    },
  },
  {
    key: "happy_hour",
    label: "Happy hour",
    description:
      "Le rendez-vous quotidien : une machine à sous rapide, une participation par jour, des lots pensés pour le comptoir.",
    emoji: "🍻",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Happy hour",
        wheelName: "La machine de l'happy hour",
        wheelTitle: "Alignez trois symboles avant la fin de l'happy hour !",
      },
      visual: { preset: "neon" },
      game: { game_type: "slot", skill_config: null },
      prizes: [
        winning("La deuxième boisson offerte", "Deux consommations pour le prix d'une.", "#22d3ee", 25, 200),
        winning("Planche à grignoter offerte", "À partager au comptoir.", "#f0abfc", 10, 40),
        winning("−20 % sur votre commande", "Remise immédiate à la note.", "#a78bfa", 15, 80),
        winning("Cocktail maison offert", "Le cocktail du moment, offert.", "#06b6d4", 5, 25),
        losing("Raté d'un symbole !", "Revenez demain, la machine tourne tous les jours.", 45),
      ],
      rules: {
        play_limit: "daily",
        collect_email: false,
        collect_phone: false,
        code_ttl_seconds: 120,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 7,
      emails: [
        {
          moment: "annonce",
          subject: "L'happy hour se joue maintenant",
          body: "Bonjour,\n\nChaque jour pendant l'happy hour, tentez votre chance à la machine : deuxième boisson offerte, planche à grignoter ou remise sur la note. Une participation par jour.\n\nÀ ce soir !",
        },
        {
          moment: "gagnant",
          subject: "Votre lot happy hour vous attend au comptoir",
          body: "Bravo !\n\nMontrez votre code au comptoir tout de suite : le code n'est valable que quelques minutes.\n\nBonne soirée !",
        },
      ],
    },
  },
  {
    key: "soldes",
    label: "Soldes",
    description:
      "Toute la période des soldes : on tire une carte pour découvrir sa remise, une fois par semaine, pour faire revenir en magasin.",
    emoji: "🏷️",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Soldes",
        wheelName: "La carte des soldes",
        wheelTitle: "Tirez une carte et découvrez votre remise",
      },
      visual: { preset: "cartoon" },
      game: { game_type: "draw_card", skill_config: null },
      prizes: [
        winning("−10 % supplémentaires", "En plus des soldes, sur votre passage en caisse.", "#3b82f6", 30, 300),
        winning("−20 % supplémentaires", "En plus des soldes, article au choix.", "#facc15", 15, 120),
        winning("Bon d'achat de 15 €", "Valable après les soldes.", "#ef4444", 8, 60),
        winning("Article offert (jusqu'à 10 €)", "À choisir dans la sélection en magasin.", "#22c55e", 2, 20),
        losing("Pas de remise cette fois", "Retentez la semaine prochaine !", 45),
      ],
      rules: {
        play_limit: "weekly",
        collect_email: true,
        collect_phone: false,
        code_ttl_seconds: 600,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 30,
      emails: [
        {
          moment: "annonce",
          subject: "Les soldes commencent — et votre remise aussi",
          body: "Bonjour,\n\nPendant toutes les soldes, tirez une carte en magasin et découvrez une remise supplémentaire. Une carte par semaine et par personne.\n\nÀ très vite en boutique !",
        },
        {
          moment: "gagnant",
          subject: "Votre remise supplémentaire est réservée",
          body: "Bravo !\n\nPrésentez votre code en caisse pour appliquer votre remise sur vos achats.\n\nBons achats !",
        },
        {
          moment: "fin",
          subject: "Derniers jours des soldes",
          body: "Bonjour,\n\nLes soldes se terminent : c'est le moment de tirer une dernière carte et de profiter d'une remise supplémentaire.\n\nÀ bientôt !",
        },
      ],
    },
  },
  {
    key: "lancement_produit",
    label: "Lancement de produit",
    description:
      "Trois semaines pour faire découvrir une nouveauté : la roue met la dégustation et l'essai gratuit en avant.",
    emoji: "🚀",
    blueprint: {
      version: CAMPAIGN_BLUEPRINT_VERSION,
      texts: {
        campaignName: "Lancement de produit",
        wheelName: "La roue de la nouveauté",
        wheelTitle: "Une nouveauté arrive — tournez la roue pour la découvrir",
      },
      visual: { preset: "minimal" },
      game: { game_type: "wheel", skill_config: null },
      prizes: [
        winning("Dégustation offerte", "Goûtez la nouveauté, c'est offert.", "#18181b", 30, 200),
        winning("−15 % sur la nouveauté", "Remise immédiate sur le nouveau produit.", "#3f3f46", 20, 120),
        winning("Échantillon à emporter", "Un format découverte à essayer chez vous.", "#71717a", 12, 100),
        winning("Le produit offert", "Un exemplaire de la nouveauté, offert.", "#a1a1aa", 3, 15),
        losing("Pas cette fois", "Merci de votre curiosité — repassez nous voir !", 35),
      ],
      rules: {
        play_limit: "once",
        collect_email: true,
        collect_phone: false,
        code_ttl_seconds: 600,
        engagement: {},
        budget_cents: null,
      },
      durationDays: 21,
      emails: [
        {
          moment: "annonce",
          subject: "Notre nouveauté arrive — venez la découvrir",
          body: "Bonjour,\n\nNous lançons un nouveau produit. Tournez la roue en boutique pour tenter une dégustation offerte, un échantillon à emporter ou une remise de lancement.\n\nOn a hâte d'avoir votre avis !",
        },
        {
          moment: "gagnant",
          subject: "Votre découverte vous attend",
          body: "Bravo !\n\nPrésentez votre code en boutique pour découvrir la nouveauté.\n\nDites-nous ce que vous en pensez !",
        },
        {
          moment: "rappel",
          subject: "Vous n'avez pas encore goûté ?",
          body: "Bonjour,\n\nLe jeu de lancement se termine bientôt : passez en boutique et tentez votre chance avant la fin.\n\nÀ bientôt !",
        },
      ],
    },
  },
];

/** Modèle du catalogue par sa clé (undefined si la clé est inconnue). */
export function getCampaignTemplate(key: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((template) => template.key === key);
}

/** Le catalogue dans son ordre d'affichage (l'ordre de déclaration). */
export function listCampaignTemplates(): CampaignTemplate[] {
  return CAMPAIGN_TEMPLATES;
}
