import { z } from "zod";
import { gameTypeSchema } from "@/lib/validations/prizes";
import {
  isClientReportedSkillGameType,
  isSecretSkillGameType,
  isSkillGameType,
  parseSkillConfig,
} from "@/lib/validations/skill";
import { wheelStyleSchema } from "@/lib/wheel-style";

/**
 * Place de marché de campagnes — validation du BLUEPRINT et des entrées
 * des actions.
 *
 * La base ne garantit que deux choses sur `campaign_templates.blueprint`
 * (migration 20260802120000) : c'est un OBJET jsonb, et il pèse ≤ 32 Ko.
 * C'est volontaire — un CHECK figé imposerait une migration à chaque
 * nouveau champ. La FORME est donc entièrement de la responsabilité de ce
 * module, et elle est vérifiée AUX DEUX BOUTS : à l'écriture d'un modèle
 * privé, et à sa RELECTURE avant application (un blueprint écrit par une
 * version antérieure, ou trafiqué, ne doit jamais produire une campagne
 * incohérente).
 *
 * Les bornes sont les MIROIRS de celles déjà appliquées aux tables
 * cibles : lots (`prizeFieldsSchema`), style de roue (`wheelStyleSchema`),
 * réglages de campagne (`updateCampaignClaimSchema`). Un blueprint valide
 * ici produit donc, par construction, des lignes acceptables par
 * `campaigns` / `wheels` / `prizes`.
 */

/** Un modèle ne transporte pas une roue entière : 20 lots suffisent. */
export const BLUEPRINT_MAX_PRIZES = 20;
/** Textes d'email suggérés — INERTES (aucun scénario activé). */
export const BLUEPRINT_MAX_EMAILS = 6;
/** Durée relative : au moins un jour, au plus un an. */
export const BLUEPRINT_MIN_DURATION_DAYS = 1;
export const BLUEPRINT_MAX_DURATION_DAYS = 365;

/** Miroir de prizeFieldsSchema (bornes identiques à la table `prizes`). */
const blueprintPrizeSchema = z.object({
  label: z.string().trim().min(1, "Nom du lot requis").max(80, "Nom trop long"),
  description: z.string().trim().max(300, "Description trop longue").default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide"),
  weight: z.number().int("Poids entier requis").min(0, "Poids minimum 0").max(10000, "Poids maximum 10000"),
  is_losing: z.boolean(),
  // Stock ENTIER ≥ 0, ou null (illimité). Un modèle du CATALOGUE ne
  // propose jamais de gagnant illimité — c'est un invariant de contenu,
  // vérifié par les tests du catalogue, pas une règle de forme : un
  // commerçant qui enregistre SA campagne en modèle a le droit d'y avoir
  // mis un lot sans stock, et l'enregistrement ne doit pas échouer pour
  // ça.
  stock: z.number().int("Stock entier requis").min(0, "Stock minimum 0").max(1_000_000, "Stock trop élevé").nullable().default(null),
  cost_cents: z.number().int().min(0).max(100_000_000).nullable().default(null),
});

const blueprintEmailSchema = z.object({
  moment: z.enum(["annonce", "gagnant", "rappel", "fin"]),
  subject: z.string().trim().min(1, "Objet requis").max(150, "Objet trop long"),
  body: z.string().trim().min(1, "Message requis").max(2000, "Message trop long"),
});

const engagementActionSchema = z.object({
  enabled: z.boolean().optional(),
  url: z.string().trim().max(300, "Lien trop long").optional(),
});

/** Miroir de EngagementConfig (les quatre actions connues, toutes facultatives). */
const engagementSchema = z
  .object({
    newsletter: engagementActionSchema.optional(),
    instagram: engagementActionSchema.optional(),
    tiktok: engagementActionSchema.optional(),
    google_review: engagementActionSchema.optional(),
  })
  .default({});

export const campaignBlueprintSchema = z
  .object({
    version: z.literal(1),
    texts: z.object({
      campaignName: z.string().trim().min(1, "Nom de la campagne requis").max(120, "Nom trop long"),
      wheelName: z.string().trim().min(1, "Nom du jeu requis").max(80, "Nom trop long"),
      // Borne alignée sur wheelStyleSchema.title : au-delà, le style
      // résolu retomberait sur les défauts et le préréglage serait perdu.
      wheelTitle: z.string().trim().min(1, "Accroche requise").max(80, "Accroche trop longue"),
    }),
    visual: z.object({
      preset: z.string().trim().min(1).max(24),
      style: wheelStyleSchema.partial().optional(),
    }),
    game: z.object({
      // Enum RÉEL des 15 mécaniques (miroir du CHECK SQL wheels_game_type_check).
      game_type: gameTypeSchema,
      skill_config: z.record(z.string(), z.unknown()).nullable().default(null),
    }),
    prizes: z
      .array(blueprintPrizeSchema)
      // Contrainte technique : un jeu exige au moins deux lots pour être
      // jouable. En dessous, le brouillon créé serait inutilisable.
      .min(2, "Un modèle doit proposer au moins 2 lots")
      .max(BLUEPRINT_MAX_PRIZES, "Trop de lots dans ce modèle"),
    rules: z.object({
      play_limit: z.enum(["once", "daily", "weekly", "unlimited"]),
      collect_email: z.boolean(),
      collect_phone: z.boolean(),
      // Miroir de updateCampaignClaimSchema.
      code_ttl_seconds: z
        .number()
        .int("Nombre entier de secondes requis")
        .min(10, "Minimum 10 secondes")
        .max(600, "Maximum 600 secondes (10 min)")
        .nullable()
        .default(null),
      engagement: engagementSchema,
      // min(1) et NON min(0) : `campaigns.budget_cents` porte un CHECK `> 0`.
      // Un blueprint à 0 passait Zod puis faisait échouer l'INSERT de campagne
      // (fail-closed, mais avec un message d'erreur incompréhensible).
      budget_cents: z.number().int().min(1).max(100_000_000).nullable().default(null),
    }),
    // Durée RELATIVE : un modèle ne porte JAMAIS de date absolue, sinon
    // il périme (un « Noël » enregistré le 1er décembre serait mort le 26).
    durationDays: z
      .number()
      .int("Nombre entier de jours requis")
      .min(BLUEPRINT_MIN_DURATION_DAYS, "Durée minimum 1 jour")
      .max(BLUEPRINT_MAX_DURATION_DAYS, "Durée maximum 365 jours"),
    emails: z.array(blueprintEmailSchema).max(BLUEPRINT_MAX_EMAILS, "Trop de textes d'email").default([]),
  })
  .superRefine((blueprint, ctx) => {
    // Au moins un lot GAGNANT : un jeu 100 % perdant n'a aucun sens comme
    // modèle et ne récompenserait personne.
    if (!blueprint.prizes.some((prize) => !prize.is_losing)) {
      ctx.addIssue({
        code: "custom",
        path: ["prizes"],
        message: "Un modèle doit proposer au moins un lot gagnant",
      });
    }
    // Tirage possible : au moins un poids non nul, sinon aucune issue
    // n'est atteignable et la roue se bloque.
    if (blueprint.prizes.every((prize) => prize.weight === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["prizes"],
        message: "Au moins un lot doit avoir un poids supérieur à 0",
      });
    }

    // Jeux de DÉFI (skill-gated) : le défi vit dans `skill_config`. Un
    // modèle qui porte un game_type de défi sans config valide produirait
    // un jeu injouable — on le refuse ici plutôt qu'à l'exécution.
    if (isSkillGameType(blueprint.game.game_type)) {
      const parsed = parseSkillConfig(blueprint.game.game_type, blueprint.game.skill_config);
      if (!parsed.ok) {
        ctx.addIssue({
          code: "custom",
          path: ["game", "skill_config"],
          message: parsed.error,
        });
      }
      // Miroir strict de updateWheelSchema : sous `unlimited`, la garde
      // `limit_reached` de perform_atomic_spin est inactive et le secret
      // du défi devient extractible par force brute.
      if (isSecretSkillGameType(blueprint.game.game_type) && blueprint.rules.play_limit === "unlimited") {
        ctx.addIssue({
          code: "custom",
          path: ["rules", "play_limit"],
          message:
            "Ces jeux exigent une limite de participation (une tentative par période) pour rester équitables.",
        });
      }
      // Second miroir d'updateWheelSchema, pour une RAISON distincte : réflexe
      // et jauge sont évalués par l'appareil du joueur (aucun secret à cacher,
      // donc aucune vérification serveur possible). Sous `unlimited`, la garde
      // `limit_reached` est inactive et la porte devient décorative. Sans cette
      // branche, un modèle publié rouvrirait la configuration que
      // updateWheelSchema refuse.
      if (
        isClientReportedSkillGameType(blueprint.game.game_type) &&
        blueprint.rules.play_limit === "unlimited"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["rules", "play_limit"],
          message:
            "Ce défi est évalué par l'appareil du joueur : sans limite de participation, il peut être contourné à volonté. Choisissez une limite (une fois, par jour ou par semaine).",
        });
      }
    } else if (blueprint.game.skill_config !== null) {
      // Pas de secret résiduel sur un jeu sans défi (miroir de updateWheel,
      // qui remet skill_config à null pour tout game_type non-skill).
      ctx.addIssue({
        code: "custom",
        path: ["game", "skill_config"],
        message: "Ce type de jeu ne prend pas de configuration de défi",
      });
    }
  });

export type CampaignBlueprintParsed = z.infer<typeof campaignBlueprintSchema>;

/* ────────────────────────────────────────────────────────────
 * Entrées des actions
 * ──────────────────────────────────────────────────────────── */

/**
 * Appliquer un modèle : SOIT une clé du catalogue Lastchance, SOIT l'uuid
 * d'un modèle privé — jamais les deux, jamais aucun. L'organisation et le
 * rôle ne sont JAMAIS dans l'entrée : ils viennent de la session.
 */
export const applyCampaignTemplateSchema = z
  .object({
    templateKey: z.string().trim().min(1).max(48).optional(),
    templateId: z.string().uuid().optional(),
  })
  .refine(
    (input) => Boolean(input.templateKey) !== Boolean(input.templateId),
    { message: "Choisissez un modèle" },
  );

/** Enregistrer une campagne existante comme modèle privé réutilisable. */
export const saveCampaignAsTemplateSchema = z.object({
  campaignId: z.string().uuid(),
  // Miroir du CHECK SQL (1..80 après btrim) et de l'unicité (organization_id, name).
  name: z.string().trim().min(1, "Nom du modèle requis").max(80, "Nom trop long"),
  // Miroir du CHECK SQL (≤ 300). '' est normalisé en null à l'écriture.
  description: z.string().trim().max(300, "Description trop longue").default(""),
});

export const deleteCampaignTemplateSchema = z.object({
  id: z.string().uuid(),
});
