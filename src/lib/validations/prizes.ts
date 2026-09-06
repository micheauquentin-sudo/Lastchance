import { z } from "zod";
import { estEmojiConnu } from "@/lib/emoji-lexique";
import {
  entierRequis,
  nonRenduVaut,
  texteOptionnel,
} from "@/lib/validations/champ-formulaire";
import {
  isClientReportedSkillGameType,
  isSecretSkillGameType,
} from "@/lib/validations/skill";

/** Montant en euros saisi librement (« 12,50 ») → centimes, '' → null. */
const eurosToCents = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .transform((raw, ctx) => {
        const value = Number(raw.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
          ctx.addIssue({ code: "custom", message: "Montant invalide" });
          return z.NEVER;
        }
        return Math.round(value * 100);
      }),
  ])
  .nullable()
  .default(null);

export const prizeFieldsSchema = z.object({
  label: z.string().trim().min(1, "Nom du lot requis").max(80, "Nom trop long"),
  description: texteOptionnel(
    z.string().trim().max(300, "Description trop longue"),
  ),
  color: texteOptionnel(
    z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide"),
    "#7c3aed",
  ),
  /**
   * ICÔNE DU LOT — suggérée, jamais imposée.
   *
   * `''` → `null` : « aucune icône » est un choix du commerçant (le bouton
   * « Aucune » de l'éditeur), et il doit rester atteignable après en avoir
   * posé une. Un seul « rien » côté base, et c'est `null` — la contrainte SQL
   * refuse la chaîne vide pour la même raison.
   *
   * La valeur est confrontée au LEXIQUE et non à une simple longueur : le seul
   * chemin d'écriture prévu est un bouton dont les valeurs sortent du lexique,
   * et cette colonne est rendue à tous les joueurs de la roue. Un `formData`
   * forgé ne doit pas pouvoir y déposer un texte arbitraire — le champ est une
   * icône, pas un second libellé libre.
   */
  emoji: z
    .union([
      z.literal("").transform(() => null),
      z
        .string()
        .trim()
        .refine(estEmojiConnu, "Icône inconnue"),
    ])
    .nullable()
    .default(null),
  /**
   * LE POIDS DU LOT — et le cas le plus coûteux du mode SILENCIEUX.
   *
   * `z.coerce.number().min(0)` acceptait `null` : `Number(null)` vaut 0, et 0
   * passe `min(0)`. Un formulaire qui ne rendait pas « poids » créait donc un
   * lot de **poids 0** — présent sur la roue, compté dans les 12 places, et
   * JAMAIS TIRÉ. Aucune erreur, aucun message, rien à l'écran : le commerçant
   * voyait son lot et attendait des gagnants qui ne pouvaient pas exister.
   *
   * Le zéro SAISI reste accepté (`min(0)`) : mettre un lot en réserve sans le
   * supprimer est un geste légitime. C'est l'absence de saisie qui est refusée.
   */
  weight: entierRequis({
    absent: "Indiquez le poids du lot : sans lui, il ne serait jamais tiré.",
    nombre: "Poids invalide",
    entier: "Poids entier requis",
    min: [0, "Poids minimum 0"],
    max: [10000, "Poids maximum 10000"],
  }),
  is_losing: z.coerce.boolean().default(false),
  stock: z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(0)])
    .nullable()
    .default(null),
  /** Seuil d'alerte stock faible (null : pas d'alerte) — email au
   *  commerçant quand stock <= seuil, réarmé au restock (trigger). */
  low_stock_threshold: z
    .union([
      z.literal("").transform(() => null),
      z.coerce
        .number()
        .int("Seuil entier requis")
        .min(0, "Seuil minimum 0")
        .max(100000, "Seuil trop élevé"),
    ])
    .nullable()
    .default(null),
  /** Coût réel du lot (ROI) et valeur commerciale — facultatifs. */
  cost_cents: eurosToCents,
  value_cents: eurosToCents,
});

export const addPrizeSchema = prizeFieldsSchema.extend({
  wheel_id: z.string().uuid(),
});

export const updatePrizeSchema = prizeFieldsSchema.extend({
  id: z.string().uuid(),
  /**
   * TÉMOIN du stock tel qu'il était AFFICHÉ au chargement de la page.
   *
   * `prizes.stock` n'est pas un total mais le RESTANT : huit RPC de tirage
   * font `set stock = stock - 1`. Le champ « Stock » est un input non
   * contrôlé dont le `defaultValue` fige le restant du rendu, et `updatePrize`
   * réécrivait la colonne en bloc : corriger une coquille de libellé une heure
   * plus tard RECRÉDITAIT les lots consommés entre-temps, et la roue
   * redistribuait des lots qui n'existaient plus.
   *
   * Sans ce témoin, l'action ne peut pas distinguer « il a saisi cette valeur »
   * de « c'est la valeur d'il y a une heure, il n'y a pas touché » — les deux
   * arrivent au serveur sous la même forme. C'est lui qui rend le
   * compare-and-swap possible.
   *
   * ── CE QUE CE TÉMOIN N'EST PAS ──────────────────────────────
   *
   * Ce n'est PAS un contrôle d'autorisation, et il ne faut pas le lire comme
   * tel : le témoin est fourni par l'appelant, donc poster
   * `stock_seen = <valeur réelle en base>` suffit à faire passer n'importe
   * quelle réécriture du stock. Il protège de l'ACCIDENT (l'onglet resté
   * ouvert, la valeur périmée renvoyée sans intention) et de rien d'autre.
   *
   * Ce n'est pas un défaut : un `editor` a le DROIT de fixer le stock à ce
   * qu'il veut, c'est le sens même du champ. Écrit ici pour qu'un lecteur
   * futur ne compte pas sur ce témoin comme sur une garde.
   *
   * `undefined` = pas de témoin (page servie avant ce correctif) ; `null` =
   * stock illimité affiché. Les deux sont distincts et traités séparément.
   */
  stock_seen: z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(0)])
    .nullable()
    .optional(),
});

/**
 * Marqueur du refus « des lots gagnés attendent encore d'être retirés »,
 * version ROUE.
 *
 * `participations.wheel_id` cascade (00001:100), et une seconde clé composite
 * cascade aussi (00017:285-289) : supprimer une roue emportait toutes ses
 * participations, codes `GAIN-` émis et non retirés compris. Le dépôt garde
 * déjà ce danger un cran au-dessus (`CAMPAIGN_OUTSTANDING_LOSS_HINT`) ; la
 * roue, elle, ne portait qu'un `confirm()` qui ne nommait rien.
 *
 * `deleteWheel` le place dans son message et l'écran s'en sert pour ne montrer
 * la case qu'APRÈS ce refus précis — l'autre refus de cette action
 * (« impossible de supprimer la dernière roue ») ne se coche pas.
 */
export const WHEEL_OUTSTANDING_LOSS_HINT = "Cochez la case de confirmation";

export const deletePrizeSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Enum COMPLET des mécaniques (miroir du CHECK SQL wheels_game_type_check et du
 * type GameType). Valide `game_type` AVANT écriture — défense en profondeur : une
 * valeur hors registre est refusée côté action, pas seulement par la contrainte
 * base (INFO revue vague 1). Couvre roue, grattage, jeux de RÉVÉLATION (vague 1)
 * et jeux de DÉFI skill-gated (vague 2).
 */
export const gameTypeSchema = z.enum([
  "wheel",
  "scratch",
  "flip_card",
  "cups",
  "slot",
  "memory",
  "chest",
  "dice",
  "draw_card",
  "rps",
  "reflex",
  "gauge",
  "puzzle",
  "mystery_word",
  "estimate",
]);

export const updateWheelSchema = z
  .object({
    id: z.string().uuid(),
    play_limit: z.enum(["once", "daily", "weekly", "unlimited"]),
    game_type: gameTypeSchema,
    /**
     * Config du défi (jeux skill-gated) sérialisée en JSON par le formulaire.
     * Validée par game_type dans l'action (parseSkillConfig) puis persistée ; les
     * game_type non-skill remettent skill_config à null.
     */
    skill_config: z
      .union([z.literal("").transform(() => null), z.string().max(8192, "Configuration trop longue")])
      .nullable()
      .default(null),
  })
  .superRefine((data, ctx) => {
    // Jeux à SECRET vérifiable serveur (mot mystère / estimation / puzzle) :
    // `play_limit = unlimited` est INTERDIT. Sans limite, la garde
    // `limit_reached` de perform_atomic_spin est inactive et le jeton de défi
    // (réutilisable ~10 min) laisserait rejouer la même tentative en variant la
    // réponse pour extraire le secret par force brute. Une tentative par période
    // ferme cette fuite — et c'est le bon design produit (réponse secrète = une
    // chance). Défense en profondeur : la contrainte est aussi une bonne pratique
    // côté produit, appliquée ici à l'écriture commerçant.
    if (isSecretSkillGameType(data.game_type) && data.play_limit === "unlimited") {
      ctx.addIssue({
        code: "custom",
        path: ["play_limit"],
        message:
          "Ces jeux exigent une limite de participation (une tentative par période) pour rester équitables.",
      });
    }

    // Jeux dont l'ISSUE est RAPPORTÉE PAR LE CLIENT (réflexe / jauge) :
    // `unlimited` est INTERDIT pour une RAISON DIFFÉRENTE de celle ci-dessus —
    // aucun secret à protéger ici, mais aucune vérification serveur possible non
    // plus. Ces jeux n'ont rien de caché (le joueur doit voir la fenêtre de
    // réaction et la zone verte pour jouer), donc le navigateur peut toujours
    // annoncer « réussi ». Ce qui contient l'abus est la LIMITE : elle plafonne
    // le nombre d'annonces. Sous `unlimited`, la garde `limit_reached` de
    // perform_atomic_spin est inactive et la porte de compétence devient
    // décorative alors que le commerçant croit l'avoir posée.
    //
    // Calibrage : sous `unlimited` les tours sont déjà illimités pour tous, et
    // stock comme poids plafonnent toujours les lots — le tricheur supprime un
    // RALENTISSEMENT, il ne débloque pas des gains illimités. Défaut d'équité et
    // de promesse produit, pas effondrement d'économie.
    //
    // Deux branches distinctes et non fusionnées : conséquence identique,
    // raisons différentes — les fondre est ce qui avait fait oublier ces deux
    // jeux-là.
    if (
      isClientReportedSkillGameType(data.game_type) &&
      data.play_limit === "unlimited"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["play_limit"],
        message:
          "Ce défi est évalué par l'appareil du joueur : sans limite de participation, il peut être contourné à volonté. Choisissez une limite (une fois, par jour ou par semaine).",
      });
    }
  });

export const createWheelSchema = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().trim().min(1, "Nom requis").max(80, "Nom trop long"),
});

export const deleteWheelSchema = z.object({
  id: z.string().uuid(),
});

// Heure vide → null (pas de borne) ; sinon entier 0..24.
const scheduleHour = z
  .union([z.literal("").transform(() => null), z.coerce.number().int().min(0).max(24)])
  .nullable()
  .default(null);

export const updateWheelScheduleSchema = z
  .object({
    id: z.string().uuid(),
    schedule_start_hour: scheduleHour,
    schedule_end_hour: scheduleHour,
    // Jours cochés : sous-ensemble de 0=dimanche..6=samedi ; [] = tous.
    // `formData.getAll` rend `[]` et non `null` pour un champ absent — mais le
    // schéma ne doit pas en dépendre : il est aussi appelé avec des objets
    // construits à la main, et « aucun jour coché » vaut « tous les jours »
    // dans les deux cas.
    schedule_days: nonRenduVaut(
      z.array(z.coerce.number().int().min(0).max(6)),
      [],
    ),
  })
  .refine(
    (d) =>
      (d.schedule_start_hour == null) === (d.schedule_end_hour == null),
    { message: "Renseignez les deux heures ou aucune", path: ["schedule_end_hour"] },
  );
