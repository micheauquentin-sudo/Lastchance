import { z } from "zod";
import { isValidLocalDateTime } from "@/lib/date-time";
import {
  caseACochee,
  entierRequis,
  nonRenduVaut,
  texteOptionnel,
} from "@/lib/validations/champ-formulaire";
import {
  RESERVER_ACTIVITY_DESCRIPTION_MAX,
  RESERVER_ACTIVITY_NAME_MAX,
  RESERVER_CAPACITY_MAX,
  RESERVER_CAPACITY_MIN,
  RESERVER_CODE_PATTERN,
  RESERVER_EMAIL_MAX,
  RESERVER_INVITATION_LABEL_MAX,
  RESERVER_INVITATION_MAX_USES_MAX,
  RESERVER_INVITATION_MAX_USES_MIN,
  RESERVER_INVITATION_TOKEN_PATTERN,
  RESERVER_WAITLIST_OFFER_MINUTES_MAX,
  RESERVER_WAITLIST_OFFER_MINUTES_MIN,
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

/**
 * Fenêtre de tenue d'une place proposée, en minutes.
 *
 * VIDE = `null` = « défaut du produit » (120 min), et c'est une valeur à part
 * entière, pas une absence de décision : la colonne SQL est nullable exactement
 * pour cela. Le champ non rendu vaut donc `null` lui aussi — un panneau qui
 * n'affiche pas le réglage ne demande pas de le changer.
 */
const waitlistOfferMinutesSchema = nonRenduVaut(
  z
    .string()
    .trim()
    .transform((valeur) => (valeur === "" ? null : Number(valeur)))
    .refine(
      (valeur) =>
        valeur === null ||
        (Number.isInteger(valeur) &&
          valeur >= RESERVER_WAITLIST_OFFER_MINUTES_MIN &&
          valeur <= RESERVER_WAITLIST_OFFER_MINUTES_MAX),
      `Fenêtre d'attente invalide (de ${RESERVER_WAITLIST_OFFER_MINUTES_MIN} à ${RESERVER_WAITLIST_OFFER_MINUTES_MAX} minutes, ou vide pour le réglage par défaut)`,
    ),
  null,
);

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
function exigerEmailEtConsentementEnsemble(
  valeur: { email?: string; consent: boolean },
  ctx: z.RefinementCtx,
): void {
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
}

export const reserveSlotSchema = z
  .object({
    organizationId: uuid,
    slotId: uuid,
    email: emailSchema.optional(),
    consent: z.boolean().default(false),
    turnstileToken: z.string().max(2048).optional(),
  })
  .superRefine(exigerEmailEtConsentementEnsemble);

/**
 * Rejoindre la liste prioritaire d'un créneau COMPLET.
 *
 * Forme identique à `reserveSlotSchema`, et c'est délibéré : la file collecte
 * la même adresse sous le même consentement, dans la même page, et
 * `waitlist_join` porte la MÊME équivalence SQL. Deux formes divergentes
 * auraient fait dire deux choses différentes au même écran.
 *
 * Le challenge Turnstile y figure parce que c'est un appel ÉMETTEUR : un bot
 * muni de cookies jetables peut remplir une file aussi bien qu'un créneau.
 */
export const waitlistJoinSchema = z
  .object({
    organizationId: uuid,
    slotId: uuid,
    email: emailSchema.optional(),
    consent: z.boolean().default(false),
    turnstileToken: z.string().max(2048).optional(),
  })
  .superRefine(exigerEmailEtConsentementEnsemble);

/**
 * Prendre la place qui m'est proposée.
 *
 * UN SEUL CHAMP, comme `cancelReservationSchema`. `claim_waitlist_offer` prend
 * bien une organisation, mais l'appelant n'a aucune raison de la connaître : le
 * serveur la lit sur l'entrée, sur preuve de possession (identifiant + empreinte
 * du cookie). La poster aurait laissé le navigateur désigner sous quelle
 * enseigne il prend sa place — et le filtre org-scopé de la RPC, qui rend
 * « entrée d'une AUTRE organisation » indistinguable d'« inconnue », n'aurait
 * plus rien gardé.
 *
 * Aucun email ici : l'adresse et son consentement sont REPRIS de l'entrée de
 * file, où ils ont été donnés pour ce créneau et ce commerçant.
 */
export const claimWaitlistOfferSchema = z.object({
  entryId: uuid,
});

/**
 * Quitter la file. Un seul champ, comme `cancelReservationSchema` et pour la
 * même raison : la RPC autorise par POSSESSION (identifiant + empreinte du
 * cookie) et lit l'organisation sur la ligne.
 */
export const waitlistLeaveSchema = z.object({
  entryId: uuid,
});

/**
 * Rejoindre par une invitation privée.
 *
 * ── LE JETON EST LE CLAIR, ET IL S'ARRÊTE À LA SERVER ACTION ──
 *
 * Ce schéma valide sa FORME (24 octets base64url), jamais son contenu : c'est
 * l'action qui le hache en SHA-256 non salé avant de l'envoyer à la base, et le
 * clair ne descend nulle part ailleurs — ni en base, ni dans un journal, ni
 * dans un message d'erreur.
 *
 * ── AUCUNE ORGANISATION POSTÉE ──
 *
 * Le jeton la désigne à lui seul : le serveur la lit sur l'invitation qu'il
 * résout. La demander au navigateur aurait ajouté un champ que rien ne vérifie
 * et qui, mal posé, rendrait `unavailable` sur une invitation parfaitement
 * valide.
 *
 * `slotId` est FACULTATIF : une invitation à un créneau précis le porte
 * elle-même (la RPC ignore alors ce champ), une invitation à l'échelle d'une
 * activité exige que le visiteur choisisse. Son absence dans le second cas rend
 * `unavailable`, muet comme le reste.
 */
export const redeemInvitationSchema = z
  .object({
    token: z
      .string()
      .trim()
      .regex(RESERVER_INVITATION_TOKEN_PATTERN, "Invitation invalide"),
    slotId: uuid.optional(),
    email: emailSchema.optional(),
    consent: z.boolean().default(false),
    turnstileToken: z.string().max(2048).optional(),
  })
  .superRefine(exigerEmailEtConsentementEnsemble);

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
 * Annuler AU NOM DU COMMERCE (migration 20261003120000).
 *
 * Un seul champ, et c'est le point : ni organisation, ni acteur. L'organisation
 * vient de la session du commerçant et l'acteur de son identifiant utilisateur.
 * Les poster aurait laissé un écran choisir sous quelle enseigne il annule, et
 * fait de la ligne d'audit `reservation.cancel_staff` une déclaration sur
 * l'honneur — exactement ce que `checkinReservationSchema` refuse déjà.
 */
export const cancelReservationStaffSchema = z.object({
  reservationId: uuid,
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
    waitlistOfferMinutes: waitlistOfferMinutesSchema,
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
    waitlistOfferMinutes: waitlistOfferMinutesSchema,
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

// ════════════════════════════════════════════════════════════
// Invitations privées (RES-2) — FormData du dashboard
// ════════════════════════════════════════════════════════════

/**
 * Créer une invitation.
 *
 * ── LE JETON N'EST PAS UN CHAMP, ET NE PEUT PAS L'ÊTRE ──
 *
 * Il est TIRÉ par le serveur puis haché : un jeton posté par le formulaire
 * serait un secret choisi par le navigateur, donc prévisible par qui le
 * fabrique. C'est aussi pourquoi l'action le rend UNE FOIS et une seule — la
 * base n'en conserve que l'empreinte, et le lien perdu se révoque et se recrée.
 *
 * ── UNE CIBLE, ET UNE SEULE ──
 *
 * Activité OU créneau. Le `superRefine` ci-dessous dit ce que la contrainte
 * `reservation_invitations_target_state` refuserait de toute façon, mais avec
 * un message que le commerçant comprend.
 */
export const createReserverInvitationSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Donnez un nom à cette invitation")
      .max(
        RESERVER_INVITATION_LABEL_MAX,
        `Nom trop long (${RESERVER_INVITATION_LABEL_MAX} caractères max)`,
      ),
    // `""` = « pas cette cible-là ». Un `<select>` non choisi poste la chaîne
    // vide, et la lire comme un UUID invalide ferait un message hors sujet.
    activityId: nonRenduVaut(z.union([z.literal(""), uuid]), ""),
    slotId: nonRenduVaut(z.union([z.literal(""), uuid]), ""),
    maxUses: entierRequis({
      absent: "Indiquez le nombre de places ouvertes par cette invitation.",
      nombre: "Nombre d'usages invalide",
      entier: "Nombre entier d'usages requis",
      min: [
        RESERVER_INVITATION_MAX_USES_MIN,
        "Une invitation ouvre au moins une place",
      ],
      max: [
        RESERVER_INVITATION_MAX_USES_MAX,
        `Maximum ${RESERVER_INVITATION_MAX_USES_MAX} usages — au-delà, ouvrez simplement le créneau`,
      ],
    }),
    /** Heure civile, convertie dans le fuseau de l'organisation par l'action. */
    expiresAt: texteOptionnel(
      z
        .string()
        .trim()
        .refine(
          (valeur) => valeur === "" || isValidLocalDateTime(valeur),
          "Date d'expiration invalide",
        ),
    ),
  })
  .superRefine((valeur, ctx) => {
    if (Boolean(valeur.activityId) === Boolean(valeur.slotId)) {
      ctx.addIssue({
        code: "custom",
        path: ["activityId"],
        message:
          "Choisissez une cible et une seule : une activité entière, ou un créneau précis.",
      });
    }
  });

/** Révoquer : le lien est mort. Geste de sécurité, il a fuité. */
export const revokeReserverInvitationSchema = z.object({
  id: uuid,
});

/**
 * Fermer les inscriptions. NE TOUCHE AUCUNE PLACE déjà confirmée — critère
 * d'acceptation RES-2, et la RPC ne lit même pas `reservations`.
 */
export const closeReserverInvitationSchema = z.object({
  id: uuid,
});
