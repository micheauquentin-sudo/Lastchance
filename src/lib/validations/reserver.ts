import { z } from "zod";
import { isValidLocalDateTime } from "@/lib/date-time";
import {
  caseACochee,
  entierRequis,
  nonRenduVaut,
  texteOptionnel,
} from "@/lib/validations/champ-formulaire";
import {
  QUEUE_DISPLAY_NAME_INPUT_MAX,
  QUEUE_DISPLAY_NAME_MAX,
  QUEUE_MAX_LIVE_ENTRIES_MAX,
  QUEUE_MAX_LIVE_ENTRIES_MIN,
  QUEUE_NAME_MAX,
  RESERVER_ACTIVITY_DESCRIPTION_MAX,
  RESERVER_ACTIVITY_DURATION_MAX,
  RESERVER_ACTIVITY_DURATION_MIN,
  RESERVER_ACTIVITY_NAME_MAX,
  RESERVER_ACTIVITY_PREPARATION_MAX,
  RESERVER_ACTIVITY_PROMISE_MAX,
  RESERVER_ACTIVITY_STEPS_MAX,
  RESERVER_CAPACITY_MAX,
  RESERVER_CAPACITY_MIN,
  RESERVER_CODE_PATTERN,
  RESERVER_EMAIL_MAX,
  RESERVER_PARTY_SIZE_MAX,
  RESERVER_PARTY_SIZE_MIN,
  RESERVER_STEP_BODY_FIELD,
  RESERVER_STEP_BODY_MAX,
  RESERVER_STEP_TITLE_FIELD,
  RESERVER_STEP_TITLE_MAX,
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

/**
 * Personnes que la réservation occupe (RES-5).
 *
 * DÉFAUT 1, et la SURFACE DUO envoie 2 : ce champ n'est pas une préférence du
 * joueur mais la taille du FORMAT, que l'écran recopie depuis l'activité qu'il
 * affiche. La borne 1..2 n'est qu'une garde de forme — c'est `reserve_slot` qui
 * tranche, sous verrou, en comparant la demande à l'unité du format, et qui
 * refuse `invalid_party_size` si les deux divergent. Refuser ici ce que la base
 * accepterait ferait de l'écran un second juge.
 */
const partySizeSchema = z
  .number()
  .int("Nombre entier de personnes requis")
  .min(RESERVER_PARTY_SIZE_MIN, "Une réservation vaut au moins une personne")
  .max(
    RESERVER_PARTY_SIZE_MAX,
    `Maximum ${RESERVER_PARTY_SIZE_MAX} personnes par réservation`,
  )
  .default(RESERVER_PARTY_SIZE_MIN);

export const reserveSlotSchema = z
  .object({
    organizationId: uuid,
    slotId: uuid,
    partySize: partySizeSchema,
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
 * Retirer quelqu'un de la liste prioritaire, AU NOM DU COMMERCE (revue L5,
 * E-1b). Comme ci-dessus, l'ACTEUR N'EST PAS UN CHAMP : il vient de la session,
 * et `evict_waitlist_entry` le revérifie membre owner/editor en SQL. Un `actor`
 * posté ferait de la ligne `reservation.waitlist_evict` une déclaration sur
 * l'honneur.
 */
export const evictWaitlistEntrySchema = z.object({
  entryId: uuid,
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

/**
 * Une animation d'attente (RES-4) : le quiz ou la campagne de Pause Chance
 * proposés pendant qu'on patiente.
 *
 * `""` = « aucune animation », comme `activityId` partout dans ce fichier — un
 * `<select>` remis à « aucune » poste la chaîne vide, et la lire comme un UUID
 * invalide donnerait un message hors sujet. Le champ NON RENDU vaut `""` lui
 * aussi : un panneau qui n'affiche pas le réglage ne demande pas de le changer.
 *
 * L'appartenance au locataire n'est PAS vérifiée ici et ne peut pas l'être : ce
 * module ne connaît pas l'organisation. C'est la FK COMPOSITE
 * `(wait_quiz_id, organization_id)` qui refuse le quiz du voisin — par la base,
 * pas par une vérification applicative qu'on pourrait oublier.
 */
const waitAnimationIdSchema = nonRenduVaut(z.union([z.literal(""), uuid]), "");

// ────────────────────────────────────────────────────────────
// LES EXPÉRIENCES SIGNATURE (RES-5, lot L8) — migration 20261007120000
//
// MIROIR DE CONFORT, comme le reste : les cinq colonnes portent leurs CHECK, et
// les deux contraintes CONDITIONNELLES de la table (`…_experience_duration`,
// `…_signature_steps`) refuseraient de toute façon la ligne. Ce que le
// `superRefine` ajoute, c'est un message que le commerçant comprend là où la
// base rendrait un nom de contrainte.
// ────────────────────────────────────────────────────────────

/**
 * Format de l'expérience. Le champ NON RENDU vaut `standard`, comme le défaut
 * SQL de la colonne : un panneau qui n'affiche pas le choix propose le socle.
 */
const activityKindSchema = nonRenduVaut(
  z.enum(["standard", "signature", "duo"]),
  "standard",
);

/** La phrase que le joueur lit avant de s'engager — facultative, ≤ 200. */
const activityPromiseSchema = texteOptionnel(
  z
    .string()
    .trim()
    .max(
      RESERVER_ACTIVITY_PROMISE_MAX,
      `Promesse trop longue (${RESERVER_ACTIVITY_PROMISE_MAX} caractères max)`,
    ),
);

/** Ce qu'il faut savoir avant de venir — la « préparation » ET les « instructions ». */
const activityPreparationSchema = texteOptionnel(
  z
    .string()
    .trim()
    .max(
      RESERVER_ACTIVITY_PREPARATION_MAX,
      `Préparation trop longue (${RESERVER_ACTIVITY_PREPARATION_MAX} caractères max)`,
    ),
);

/**
 * Durée annoncée, en minutes. VIDE = `null` = « non annoncée », et c'est une
 * valeur à part entière (la colonne est nullable) — motif
 * `waitlistOfferMinutesSchema`. Le `superRefine` de chaque schéma d'activité
 * l'EXIGE des deux formats nouveaux, jamais du `standard`.
 */
const activityDurationSchema = nonRenduVaut(
  z
    .string()
    .trim()
    .transform((valeur) => (valeur === "" ? null : Number(valeur)))
    .refine(
      (valeur) =>
        valeur === null ||
        (Number.isInteger(valeur) &&
          valeur >= RESERVER_ACTIVITY_DURATION_MIN &&
          valeur <= RESERVER_ACTIVITY_DURATION_MAX),
      `Durée invalide (de ${RESERVER_ACTIVITY_DURATION_MIN} à ${RESERVER_ACTIVITY_DURATION_MAX} minutes)`,
    ),
  null,
);

/** Une carte : un titre et un corps, tous deux NON VIDES (CHECK SQL). */
const experienceStepSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Donnez un titre à cette étape")
    .max(
      RESERVER_STEP_TITLE_MAX,
      `Titre d'étape trop long (${RESERVER_STEP_TITLE_MAX} caractères max)`,
    ),
  body: z
    .string()
    .trim()
    .min(1, "Décrivez cette étape")
    .max(
      RESERVER_STEP_BODY_MAX,
      `Description d'étape trop longue (${RESERVER_STEP_BODY_MAX} caractères max)`,
    ),
});

/**
 * Les étapes, telles que le formulaire les poste : TROIS PAIRES de champs, dont
 * les paires ENTIÈREMENT vides sont retirées avant validation.
 *
 * ── POURQUOI LE VIDE SE RETIRE, ET LA MOITIÉ SE REFUSE ──
 *
 * Un panneau rend toujours ses trois paires ; un Moment Signature en deux étapes
 * en laisse donc une vide, et refuser cela obligerait le commerçant à en
 * inventer une troisième. Une paire À MOITIÉ remplie, en revanche, est une
 * saisie interrompue : `experienceStepSchema` la refuse avec le message du champ
 * manquant, exactement là où la base refuserait la ligne sans un mot.
 */
const experienceStepsSchema = z.preprocess(
  (valeur) =>
    Array.isArray(valeur)
      ? valeur.filter((etape) => {
          const carte = etape as { title?: unknown; body?: unknown } | null;
          const titre =
            typeof carte?.title === "string" ? carte.title.trim() : "";
          const corps = typeof carte?.body === "string" ? carte.body.trim() : "";
          return titre !== "" || corps !== "";
        })
      : [],
  z
    .array(experienceStepSchema)
    .max(
      RESERVER_ACTIVITY_STEPS_MAX,
      `Trois étapes au maximum — la page en montre trois`,
    ),
);

/**
 * Les DEUX contraintes conditionnelles de la table, dites en français.
 *
 * La durée est exigée des deux formats nouveaux : « 20-45 min » et « capacité
 * par personne » sont des promesses faites au joueur AVANT qu'il réserve, et une
 * page immersive sans durée annoncée lui demande de s'engager sur une inconnue.
 * Les étapes, elles, ne sont exigées que de la `signature` — c'est SA définition
 * ; le Duo dit sa préparation en prose.
 */
function exigerLesChampsDuFormat(
  valeur: {
    kind: "standard" | "signature" | "duo";
    durationMinutes: number | null;
    steps: { title: string; body: string }[];
  },
  ctx: z.RefinementCtx,
): void {
  if (valeur.kind !== "standard" && valeur.durationMinutes === null) {
    ctx.addIssue({
      code: "custom",
      path: ["durationMinutes"],
      message:
        "Annoncez la durée de cette expérience : le joueur s'engage dessus avant de réserver.",
    });
  }
  if (valeur.kind === "signature" && valeur.steps.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["steps"],
      message: "Un Moment Signature se présente en une à trois étapes.",
    });
  }
}

export const createReserverActivitySchema = z
  .object({
    name: activityNameSchema,
    description: activityDescriptionSchema,
    kind: activityKindSchema,
    promise: activityPromiseSchema,
    durationMinutes: activityDurationSchema,
    steps: experienceStepsSchema,
    preparation: activityPreparationSchema,
    waitQuizId: waitAnimationIdSchema,
    waitPauseCampaignId: waitAnimationIdSchema,
  })
  .superRefine(exigerLesChampsDuFormat);

/**
 * Réglages d'une activité. `active` est l'INTERRUPTEUR — il n'existe aucune
 * suppression : le socle a délibérément retiré le `grant delete`, parce que la
 * cascade emporterait les créneaux puis l'historique des arrivées.
 */
export const updateReserverActivitySchema = z
  .object({
    id: uuid,
    name: activityNameSchema,
    description: activityDescriptionSchema,
    kind: activityKindSchema,
    promise: activityPromiseSchema,
    durationMinutes: activityDurationSchema,
    steps: experienceStepsSchema,
    preparation: activityPreparationSchema,
    active: caseACochee,
    waitQuizId: waitAnimationIdSchema,
    waitPauseCampaignId: waitAnimationIdSchema,
  })
  .superRefine(exigerLesChampsDuFormat);

/**
 * Les noms des champs d'étapes, RÉPÉTÉS — le panneau rend une paire par carte,
 * toutes sous le même nom, et la liste s'ajoute et se retire à l'écran.
 *
 * DÉFINIS DANS `@/lib/reserver` et ré-exportés ici, où le schéma qui les valide
 * les lit. Ils ont commencé à cet endroit-ci, ce qui était le bon voisinage et
 * le mauvais module : le formulaire qui doit nommer ses champs avec ces deux
 * chaînes est un composant CLIENT, et importer ce fichier-ci depuis le
 * navigateur y aurait tiré Zod et tous les schémas du module pour deux
 * littéraux. La ré-export garde le voisinage sans le coût.
 */
export {
  RESERVER_STEP_BODY_FIELD,
  RESERVER_STEP_TITLE_FIELD,
} from "@/lib/reserver";

/**
 * Assemble les paires d'un `FormData` en tableau d'étapes BRUT.
 *
 * `getAll` ET NON trois lectures indexées : les cartes sont une LISTE que le
 * commerçant allonge et raccourcit, et des noms indexés auraient laissé un trou
 * au milieu dès qu'il retire la deuxième de trois. L'ordre du `FormData` est
 * celui du document, donc celui de l'écran.
 *
 * Rien n'est validé ni nettoyé ici : les paires vides, les moitiés et les
 * longueurs sont l'affaire d'`experienceStepsSchema`. Cette fonction ne fait que
 * transposer une forme de formulaire en une forme de document.
 */
export function etapesDepuisFormData(
  formData: Pick<FormData, "getAll">,
): { title: unknown; body: unknown }[] {
  const titres = formData.getAll(RESERVER_STEP_TITLE_FIELD);
  const corps = formData.getAll(RESERVER_STEP_BODY_FIELD);
  return titres.map((titre, index) => ({
    title: titre,
    body: corps[index] ?? null,
  }));
}

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

// ════════════════════════════════════════════════════════════
// La file sereine (RES-3, lot L6) — migration 20261005120000
//
// MIROIR DE CONFORT, comme le reste du fichier : la vérité est en base — le
// plafond d'entrées vivantes compté sous verrou, l'index unique partiel « une
// identité, une entrée vivante par file », l'équivalence email ⇔ consentement,
// le vocabulaire fermé des issues.
//
// AUCUN CHAMP DE DÉLAI ICI, et il ne faut pas en ajouter : le module n'annonce
// aucun ETA (critère dur RES-3), donc aucune saisie ne peut en produire un.
// ════════════════════════════════════════════════════════════

/** Nom d'une file — 1..80, exactement le CHECK SQL. */
const queueNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la file est requis")
  .max(QUEUE_NAME_MAX, `Nom trop long (${QUEUE_NAME_MAX} caractères max)`);

/**
 * Prénom d'appel — TRONQUÉ, JAMAIS REFUSÉ.
 *
 * `queue_join` tronque à 40 caractères plutôt que d'échouer, et ce schéma fait
 * exactement pareil : refuser ici ce que la base accepte ferait de l'écran un
 * SECOND JUGE, et le refus tomberait sur quelqu'un qui est debout dans le
 * magasin, pour un ornement d'écran. La seule borne qui refuse est celle de
 * DÉFENSE — on ne rogne pas une chaîne non bornée choisie par l'appelant.
 */
const queueDisplayNameSchema = z
  .string()
  .trim()
  .max(QUEUE_DISPLAY_NAME_INPUT_MAX, "Prénom trop long")
  .transform((valeur) => valeur.slice(0, QUEUE_DISPLAY_NAME_MAX).trim())
  .optional();

/**
 * Plafond d'entrées vivantes — `between 1 and 200`, exactement le CHECK SQL.
 * Au-delà de 200, « chacun son tour » cesse de décrire une file d'accueil.
 */
const queueMaxLiveEntriesSchema = entierRequis({
  absent: "Indiquez le nombre de personnes que la file peut accueillir.",
  nombre: "Plafond invalide",
  entier: "Nombre entier de personnes requis",
  min: [QUEUE_MAX_LIVE_ENTRIES_MIN, "Une file accueille au moins une personne"],
  max: [
    QUEUE_MAX_LIVE_ENTRIES_MAX,
    `Maximum ${QUEUE_MAX_LIVE_ENTRIES_MAX} personnes en file`,
  ],
});

/**
 * Rejoindre une file d'accueil.
 *
 * ── NI ORGANISATION, NI IDENTITÉ POSTÉES ──
 *
 * L'identité vient du cookie `lc-player`, côté serveur. L'ORGANISATION vient de
 * la FILE, résolue par le serveur : la poster aurait laissé le navigateur
 * désigner sous quelle enseigne il prend son rang, et le refus muet de la RPC —
 * qui rend « file d'une AUTRE organisation » indistinguable d'« inconnue » —
 * n'aurait plus rien gardé.
 *
 * Même équivalence email ⇔ consentement que le reste du module : la base la
 * porte (`reservation_queue_entries_consent_state`), et une adresse sans
 * consentement serait une donnée personnelle sans finalité. RIEN N'EST ENVOYÉ
 * au MVP — le champ est stocké pour un envoi ultérieur, et le consentement doit
 * donc être donné pour cet envoi-là, pas déduit.
 */
export const queueJoinSchema = z
  .object({
    queueId: uuid,
    displayName: queueDisplayNameSchema,
    email: emailSchema.optional(),
    consent: z.boolean().default(false),
    turnstileToken: z.string().max(2048).optional(),
  })
  .superRefine(exigerEmailEtConsentementEnsemble);

/**
 * Quitter la file. Un seul champ, motif `waitlistLeaveSchema` : la RPC autorise
 * par POSSESSION (identifiant d'entrée + empreinte du cookie) et lit la file et
 * son organisation sur la ligne.
 */
export const queueLeaveSchema = z.object({
  entryId: uuid,
});

/**
 * Relire l'état d'une file — le scrutin des deux écrans.
 *
 * Un seul champ, et c'est TOUT ce dont les deux lectures ont besoin : le
 * visiteur est identifié par son cookie, le commerçant par sa session. Poster
 * une organisation ici l'aurait rendue choisissable côté client sur le chemin
 * exact où `queue_staff_state` ne vérifie AUCUNE appartenance.
 */
export const queueStateSchema = z.object({
  queueId: uuid,
});

/**
 * Appeler le suivant. NI acteur, NI organisation : le premier vient de la
 * session, la seconde de l'appartenance du membre. Un `actor` posté ferait de
 * la ligne d'audit `reservation.queue_call` une déclaration sur l'honneur, et
 * une organisation postée ouvrirait l'écran d'accueil du voisin —
 * `queue_staff_state` ne vérifie AUCUNE appartenance.
 */
export const queueCallNextSchema = z.object({
  queueId: uuid,
});

/**
 * Constater l'issue d'une personne APPELÉE.
 *
 * `outcome` est un vocabulaire FERMÉ de deux mots, et `left` n'en fait pas
 * partie : partir est un geste du joueur (`queue_leave`), pas un constat du
 * comptoir. Une valeur hors vocabulaire fait LEVER la RPC — c'est un bogue de
 * l'appelant, pas un refus métier — et ce schéma l'arrête avant l'aller-retour.
 */
export const queueResolveSchema = z.object({
  entryId: uuid,
  outcome: z.enum(["served", "no_show"]),
});

/**
 * Défaire un appel erroné (« j'ai appelé Camille, c'était Dominique »).
 * L'entrée redevient `waiting`, EN TÊTE de file — conséquence, pas écriture.
 */
export const queueReopenEntrySchema = z.object({
  entryId: uuid,
});

/**
 * Créer une file d'accueil.
 *
 * ── L'ACTIVITÉ EST OPTIONNELLE, ET C'EST LE CŒUR DU MODÈLE ──
 *
 * Une file « Comptoir » doit exister sans rien réserver — boulangerie du samedi
 * matin, stand de marché, bureau de retrait : c'est le cas DOMINANT. `""` =
 * « aucune activité », comme partout ailleurs dans ce fichier ; un `<select>`
 * non choisi poste la chaîne vide, et la lire comme un UUID invalide donnerait
 * un message hors sujet.
 *
 * `status` est TOLÉRANT À L'ABSENCE et vaut `open` : c'est le défaut SQL, et une
 * file se configure d'un nom et d'un plafond — contrairement à un créneau, qui
 * naît en brouillon parce qu'il faut en relire les heures avant de l'ouvrir.
 */
export const createReserverQueueSchema = z.object({
  name: queueNameSchema,
  activityId: nonRenduVaut(z.union([z.literal(""), uuid]), ""),
  maxLiveEntries: queueMaxLiveEntriesSchema,
  status: nonRenduVaut(z.enum(["open", "paused", "closed"]), "open"),
  waitQuizId: waitAnimationIdSchema,
  waitPauseCampaignId: waitAnimationIdSchema,
});

/**
 * Réglages d'une file — dont son interrupteur `status`.
 *
 * IL N'EXISTE AUCUNE SUPPRESSION : le socle a retiré le `grant delete`, parce
 * que la cascade emporterait les entrées du jour, donc les compteurs de servis
 * et d'absents. `closed` ferme sans rien effacer, exactement comme
 * `active = false` sur une activité.
 *
 * `paused` N'EST PAS `closed`, et la distinction est réelle au comptoir : la
 * pause refuse les nouvelles arrivées mais laisse SERVIR ceux qui attendent
 * déjà — « je ferme la file, je finis les douze qui sont là ».
 */
export const updateReserverQueueSchema = z.object({
  queueId: uuid,
  name: queueNameSchema,
  activityId: nonRenduVaut(z.union([z.literal(""), uuid]), ""),
  maxLiveEntries: queueMaxLiveEntriesSchema,
  status: z.enum(["open", "paused", "closed"]),
  waitQuizId: waitAnimationIdSchema,
  waitPauseCampaignId: waitAnimationIdSchema,
});

// ════════════════════════════════════════════════════════════
// Le MODE ATTENTE ACTIVE (RES-4) — migration 20261006120000
//
// AUCUNE ORGANISATION N'EST POSTÉE, sur aucun de ces trois schémas, et c'est
// l'invariant du lot : le serveur la résout depuis la SOURCE (l'entrée de file
// ou la réservation) ou depuis la SESSION. La poster aurait laissé le
// navigateur choisir sous quelle enseigne il joue son tour offert — et le refus
// muet des RPC, qui rend « source d'une AUTRE organisation » indistinguable
// d'« inconnue », n'aurait plus rien gardé.
//
// AUCUNE CAMPAGNE NON PLUS : elle vient du PARENT de la session (la file ou
// l'activité), jamais de l'appelant. C'est ce qui rend « gains décidés côté
// serveur à valeur plafonnée » vrai plutôt que promis.
// ════════════════════════════════════════════════════════════

/**
 * Ouvrir — ou retrouver — sa session d'attente.
 *
 * EXACTEMENT UNE SOURCE, comme le `num_nonnulls(…) = 1` de la table : une
 * session qui pointerait à la fois une entrée en file et une réservation
 * n'aurait aucune configuration parente déterminée. Le refus est posé ici pour
 * éviter l'aller-retour ; la base le redirait, mais par une erreur illisible.
 */
export const waitSessionOpenSchema = z
  .object({
    queueEntryId: uuid
      .nullish()
      .transform((v) => v ?? undefined),
    reservationId: uuid
      .nullish()
      .transform((v) => v ?? undefined),
  })
  .superRefine((valeur, ctx) => {
    const posees = [valeur.queueEntryId, valeur.reservationId].filter(
      (v) => v !== undefined,
    ).length;
    if (posees !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["queueEntryId"],
        message: "Une seule source d'attente est attendue",
      });
    }
  });

/**
 * Consommer LA Pause Chance de sa session. Un seul champ : la RPC autorise par
 * POSSESSION (identifiant de session + empreinte du cookie) et lit la campagne
 * cible sur le parent.
 */
export const waitUsePauseSchema = z.object({
  sessionId: uuid,
});

/**
 * Échanger le jeton d'octroi contre le tour. MÊME forme de jeton que les quatre
 * tours offerts déjà livrés — 48 hexadécimaux, le CHECK SQL recopié.
 */
export const waitConsumeSpinSchema = z.object({
  sessionId: uuid,
  grantToken: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{48}$/, "Jeton de tour offert invalide"),
});
