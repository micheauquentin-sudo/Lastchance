import { z } from "zod";
import { isValidLocalDateTime } from "@/lib/date-time";
import {
  caseACochee,
  entierRequis,
  texteOptionnel,
} from "@/lib/validations/champ-formulaire";
import {
  RESERVER_ACTIVITY_DESCRIPTION_MAX,
  RESERVER_ACTIVITY_NAME_MAX,
  RESERVER_CAPACITY_MAX,
  RESERVER_CAPACITY_MIN,
  RESERVER_CODE_PATTERN,
  RESERVER_EMAIL_MAX,
} from "@/lib/reserver";

// ────────────────────────────────────────────────────────────
// Réserver (RES-1b) — schémas d'entrée
//
// MIROIR DE CONFORT, PAS AUTORITÉ. La vérité est dans la migration
// 20261002120000 : capacité sous verrou, unicité par identité, fenêtre de
// check-in, équivalence email ⇔ consentement. Ces schémas ne servent qu'à
// rendre un message utile AVANT l'aller-retour — jamais à décider à la place
// de la base.
//
// Bornes applicatives ≤ CHECK SQL : le nom accepte 120 caractères comme la
// base, la capacité s'arrête à 500 là où le SQL n'impose que `> 0` (500 est une
// borne d'écran de comptoir, pas une règle métier).
// ────────────────────────────────────────────────────────────

const uuid = z.string().uuid("Identifiant invalide");

/** Nom d'une activité — 1..120, exactement le CHECK SQL. */
const activityNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de l'activité est requis")
  .max(
    RESERVER_ACTIVITY_NAME_MAX,
    `Nom trop long (${RESERVER_ACTIVITY_NAME_MAX} caractères max)`,
  );

/** Description facultative — le champ non rendu vaut la chaîne vide. */
const activityDescriptionSchema = texteOptionnel(
  z
    .string()
    .trim()
    .max(
      RESERVER_ACTIVITY_DESCRIPTION_MAX,
      `Description trop longue (${RESERVER_ACTIVITY_DESCRIPTION_MAX} caractères max)`,
    ),
);

/**
 * Capacité d'un créneau — FINIE et strictement positive (CHECK SQL).
 *
 * Le plancher est 1 et non 0, pour la raison écrite dans la migration : un
 * créneau à zéro place n'est pas un créneau fermé (`status` dit cela), c'est une
 * promesse d'attente sans issue affichée comme une offre.
 */
const capacitySchema = entierRequis({
  absent: "Indiquez le nombre de places du créneau.",
  nombre: "Capacité invalide",
  entier: "Nombre entier de places requis",
  min: [RESERVER_CAPACITY_MIN, "Un créneau doit offrir au moins une place"],
  max: [RESERVER_CAPACITY_MAX, `Maximum ${RESERVER_CAPACITY_MAX} places`],
});

/**
 * Heure civile saisie par le commerçant (`datetime-local`, sans offset).
 * La conversion en instant se fait côté action, dans le fuseau de
 * l'organisation (`zonedDateTimeToIso`) — jamais ici : ce module ne connaît pas
 * l'organisation.
 */
const localDateTimeSchema = z
  .string()
  .trim()
  .min(1, "Date et heure requises")
  .refine(isValidLocalDateTime, "Date et heure invalides");

/** Adresse email, bornée à 254 (RFC 5321) comme le CHECK SQL. */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email invalide")
  .max(RESERVER_EMAIL_MAX, "Email trop long (254 caractères max)");

/** Code court présenté au comptoir — normalisé avant la forme. */
const checkinCodeSchema = z
  .string({ error: "Saisissez le code de réservation." })
  .trim()
  .toUpperCase()
  .refine(
    (value) => RESERVER_CODE_PATTERN.test(value),
    "Code de réservation invalide (8 caractères)",
  );

// ════════════════════════════════════════════════════════════
// Parcours public (entrées TYPÉES : ces actions ne reçoivent pas de FormData)
// ════════════════════════════════════════════════════════════

/**
 * Prendre une place. L'identité du joueur N'EST PAS un champ : elle vient du
 * cookie `lc-player`, côté serveur.
 *
 * ── EMAIL ET CONSENTEMENT VOYAGENT ENSEMBLE, OU PAS DU TOUT ──
 *
 * La base porte une ÉQUIVALENCE (`reservations_consent_state`), pas une
 * implication : une adresse sans consentement est une donnée personnelle
 * conservée sans base légale, et un consentement sans adresse ne consent à
 * rien. Le `superRefine` ci-dessous dit exactement cela, avec un message que le
 * joueur comprend — la contrainte SQL, elle, refuserait la ligne sans un mot.
 */
export const reserveSlotSchema = z
  .object({
    organizationId: uuid,
    slotId: uuid,
    email: emailSchema.optional(),
    consent: z.boolean().default(false),
    turnstileToken: z.string().max(2048).optional(),
  })
  .superRefine((valeur, ctx) => {
    const adresse = valeur.email?.trim() ?? "";
    if (adresse && !valeur.consent) {
      ctx.addIssue({
        code: "custom",
        path: ["consent"],
        message:
          "Cochez la case pour recevoir votre confirmation par email, ou laissez l'adresse vide.",
      });
    }
    if (!adresse && valeur.consent) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Indiquez une adresse email pour recevoir votre confirmation.",
      });
    }
  });

/**
 * Annuler sa réservation. Aucune organisation demandée : la RPC autorise par
 * POSSESSION (identifiant + empreinte du cookie) et lit l'organisation sur la
 * ligne.
 */
export const cancelReservationSchema = z.object({
  reservationId: uuid,
});

/** « Mes réservations chez ce commerçant » — bornée à une organisation. */
export const loadMyReservationsSchema = z.object({
  organizationId: uuid,
});

/**
 * Valider une arrivée. L'ACTEUR N'EST PAS UN CHAMP : il vient de la session
 * authentifiée, et l'organisation de son appartenance. Un `actor` posté serait
 * une déclaration sur l'honneur — l'audit de check-in ne vaudrait plus rien.
 */
export const checkinReservationSchema = z.object({
  code: checkinCodeSchema,
});

// ════════════════════════════════════════════════════════════
// Dashboard commerçant (FormData)
// ════════════════════════════════════════════════════════════

export const createReserverActivitySchema = z.object({
  name: activityNameSchema,
  description: activityDescriptionSchema,
});

/**
 * Réglages d'une activité. `active` est l'INTERRUPTEUR — il n'existe aucune
 * suppression : le socle a délibérément retiré le `grant delete`, parce que la
 * cascade emporterait les créneaux puis l'historique des arrivées.
 */
export const updateReserverActivitySchema = z.object({
  id: uuid,
  name: activityNameSchema,
  description: activityDescriptionSchema,
  active: caseACochee,
});

/**
 * Créer un créneau. Les deux bornes sont des heures CIVILES ; leur cohérence
 * (`ends_at > starts_at`) se vérifie ici sur la comparaison lexicographique de
 * deux `YYYY-MM-DDTHH:mm`, qui est l'ordre chronologique pour ce format à
 * longueur fixe. La base garde sa propre contrainte
 * (`reservation_slots_window_check`) : celle-ci ne fait qu'éviter l'aller-retour.
 */
export const createReserverSlotSchema = z
  .object({
    activityId: uuid,
    startsAt: localDateTimeSchema,
    endsAt: localDateTimeSchema,
    capacity: capacitySchema,
  })
  .superRefine((valeur, ctx) => {
    if (valeur.endsAt <= valeur.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La fin du créneau doit suivre son début.",
      });
    }
  });

/**
 * Corriger un créneau (heures, capacité).
 *
 * ── POURQUOI CETTE ACTION EXISTE, ALORS QUE RIEN NE SE SUPPRIME ──
 *
 * Le socle a retiré le `grant delete` : un créneau saisi à la mauvaise heure ne
 * peut PAS être effacé. L'édition est donc le seul chemin de correction — sans
 * elle, la seule issue serait de fermer le créneau fautif et d'en créer un
 * second, en laissant le premier dans l'agenda du commerçant pour toujours.
 *
 * Baisser la capacité est sûr : `reserve_slot` relit la capacité SOUS le verrou,
 * dans le même instantané que son comptage — une place accordée sur l'ancien
 * chiffre est précisément le défaut que le socle a corrigé.
 */
export const updateReserverSlotSchema = z
  .object({
    id: uuid,
    startsAt: localDateTimeSchema,
    endsAt: localDateTimeSchema,
    capacity: capacitySchema,
  })
  .superRefine((valeur, ctx) => {
    if (valeur.endsAt <= valeur.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La fin du créneau doit suivre son début.",
      });
    }
  });

/**
 * Ouvrir, refermer ou remettre en brouillon un créneau.
 *
 * Fermer ne touche à AUCUNE réservation déjà confirmée (critère d'acceptation
 * RES-2) : c'est un état d'INSCRIPTION, pas une annulation de masse.
 */
export const updateReserverSlotStatusSchema = z.object({
  id: uuid,
  status: z.enum(["draft", "open", "closed"]),
});
