import { describe, expect, it } from "vitest";

import * as admin from "./admin";
import * as auth from "./auth";
import * as automations from "./automations";
import * as calendar from "./calendar";
import * as campaignTemplates from "./campaign-templates";
import * as campaigns from "./campaigns";
import * as champFormulaire from "./champ-formulaire";
import * as events from "./events";
import * as hunts from "./hunts";
import * as jackpot from "./jackpot";
import * as loyalty from "./loyalty";
import * as metaProgression from "./meta-progression";
import * as newsletter from "./newsletter";
import * as organizations from "./organizations";
import * as play from "./play";
import * as privacy from "./privacy";
import * as prizes from "./prizes";
import * as pronostics from "./pronostics";
import * as quiz from "./quiz";
import * as referral from "./referral";
import * as reserver from "./reserver";
import * as rewardExpiry from "./reward-expiry";
import * as skill from "./skill";
import * as sms from "./sms";
import * as team from "./team";
import * as webhooks from "./webhooks";

/**
 * GARDE MÉCANIQUE — « un champ non rendu n'est pas un champ vide », vérifié sur
 * TOUS les schémas du dossier plutôt que sur ceux dont on se souvient.
 *
 * ── Les deux invariants ──────────────────────────────────────
 *
 * A. Un champ qui TOLÈRE L'ABSENCE doit rendre pour `null` exactement ce qu'il
 *    rend pour `undefined`. `FormData.get` rend `null` — pas `undefined` — pour
 *    un champ absent du formulaire soumis : si les deux ne donnent pas la même
 *    chose, le comportement du schéma dépend de la façon dont l'appelant a lu
 *    son formulaire, ce qu'aucun schéma ne devrait savoir.
 *
 * B. Un champ REQUIS doit REFUSER `null`, jamais l'accepter. C'est le mode
 *    silencieux : `Number(null)` vaut 0, donc tout `z.coerce.number()` dont la
 *    borne basse descend à 0 avale un champ non rendu et rend 0 — sans erreur,
 *    sans trace. Cet invariant est le seul qui l'attrape, et il l'attrape même
 *    sur un schéma écrit demain.
 *
 * ── Pourquoi une garde de COMPORTEMENT et pas de source ──────
 *
 * Le registre voisin (`destructive-confirm-coverage.test.ts`) lit les sources,
 * parce qu'il inspecte du JSX et des messages d'action : il n'existe aucune
 * poignée exécutable sur « la case s'affiche-t-elle après CE refus ». Ici, si :
 * les schémas SONT la poignée. Une garde textuelle (« tout `.default(` doit
 * être adossé à un `.nullable()` ») dirait la forme et non la propriété — elle
 * rougirait sur un retour à la ligne, se tairait sur un `.catch()` qui avale
 * tout, et laisserait passer le mode silencieux, qui ne s'écrit avec NI l'un NI
 * l'autre. On vérifie donc ce que les schémas FONT.
 *
 * ── Ce qu'elle couvre ────────────────────────────────────────
 *
 * Tous les schémas exportés des 24 modules de `src/lib/validations/`, y compris
 * ceux imbriqués (objets d'un tableau, pipes, unions). L'énumération est
 * dérivée des modules : un schéma ajouté demain entre dans la couverture SANS
 * qu'on l'inscrive nulle part. C'est l'inverse du registre des confirmations
 * destructives, qui ne connaît que ce qu'on lui a nommé — et c'est possible ici
 * parce que la propriété se lit sans contexte.
 */

/* ════════════════════════════════════════════════════════════
 * LES EXCLUSIONS — nominatives, avec leur raison
 *
 * Deux familles, et une seule des deux est un « laissez-passer ».
 *
 * 1. JSON INTERNE. Ces schémas ne reçoivent JAMAIS de `FormData` : leur entrée
 *    est un objet typé d'action serveur, une valeur relue en base, ou un
 *    `JSON.parse` de champ caché. Pour eux, un `null` n'est pas un champ non
 *    rendu — c'est une CORRUPTION, et la tolérer la masquerait. Ils restent
 *    donc STRICTS, et l'invariant A est levé pour eux (l'invariant B, lui,
 *    continue de s'appliquer : un `null` doit être refusé, pas lu 0).
 *
 * 2. `null` ET ABSENCE DISENT DEUX CHOSES DIFFÉRENTES. Rare, et toujours
 *    accompagné d'un `formData.has(...)` côté action. Le cas type est
 *    `code_ttl_days` : `''` (champ à l'écran, vidé) signifie « sans limite »,
 *    l'absence signifie « ne touche pas à ce réglage ». Confondre les deux
 *    remettrait l'échéance à « sans limite » à chaque sauvegarde d'un AUTRE
 *    formulaire de la même page.
 *
 * Une exclusion se justifie en une phrase ou n'existe pas : une liste muette
 * (baseline) laisserait entrer n'importe quoi sous couvert d'antériorité.
 * ════════════════════════════════════════════════════════════ */

interface Exclusion {
  /** Préfixe de chemin — `module:schema` ou `module:schema.champ`. */
  chemin: string;
  raison: string;
}

const HORS_FORMULAIRE: Exclusion[] = [
  // ── 1. JSON interne : modules entiers ──
  {
    chemin: "campaign-templates:",
    raison:
      "Blueprint d'un modèle de campagne : relu en base ou dans le catalogue, jamais posté. Un null y est une corruption du jsonb, pas un champ non rendu.",
  },
  {
    chemin: "meta-progression:",
    raison:
      "Les 25 mutations de méta-progression passent par des entrées typées (input: { … }), aucune n'est alimentée par FormData.",
  },
  {
    chemin: "skill:",
    raison:
      "Config et tentative de défi : jsonb relu côté serveur et corps d'action typé. La tentative doit rester strictement conforme, elle décide d'un tirage.",
  },
  {
    chemin: "play:claimSchema",
    raison:
      "Corps typé de claimPrize (objet, pas FormData) — les consentements RGPD qu'il porte ne doivent jamais se déduire d'une absence.",
  },
  {
    chemin: "play:spinEngagementSchema",
    raison:
      "Aucun appelant : export sans consommateur, conservé pour l'historique du parcours d'engagement.",
  },
  {
    chemin: "referral:saveReferralProgramSchema",
    raison:
      "Réglages du parrainage : entrée typée de l'action, jamais de FormData (src/actions/referral.ts).",
  },
  {
    chemin: "referral:ensureReferralSponsorSchema",
    raison:
      "Parcours public du parrain : corps d'action typé, l'email opt-in n'a jamais transité par un FormData.",
  },
  {
    chemin: "referral:validateReferralSchema",
    raison:
      "Validation d'un filleul : corps d'action typé, appelé après le spin de preuve et jamais depuis un formulaire.",
  },

  // ── 1 bis. JSON interne : schémas isolés dans des modules par ailleurs FormData ──
  {
    chemin: "calendar:joinCalendarSchema",
    raison: "Parcours public joueur : corps d'action typé — le consentement RGPD ne doit jamais se déduire d'un champ absent.",
  },
  {
    chemin: "calendar:updateCalendarDaySchema.content_text",
    raison:
      "Édition d'une case de calendrier : entrée typée depuis l'éditeur client, jamais postée en FormData.",
  },
  {
    chemin: "events:createEventSessionSchema",
    raison: "Création d'une session live : entrée typée de l'action, aucun formulaire ne la poste.",
  },
  {
    chemin: "events:updateEventSessionSchema",
    raison: "Édition d'une session live : entrée typée de l'action, aucun formulaire ne la poste.",
  },
  {
    chemin: "events:joinEventSchema",
    raison: "Parcours public joueur : corps d'action typé, jamais un FormData de dashboard.",
  },
  {
    chemin: "events:moderateEventPlayerSchema",
    raison: "Télécommande de l'organisateur : corps d'action typé, appelé depuis l'écran de pilotage.",
  },
  {
    chemin: "events:revealEventQuestionSchema",
    raison:
      "Révélation : l'option gagnante est omise en quiz/poll et désignée en prono. L'absence est le signal, pas une valeur vide.",
  },
  {
    chemin: "hunts:claimHuntRewardSchema",
    raison: "Réclamation du lot par le joueur : corps d'action typé, jamais un FormData de dashboard.",
  },
  {
    chemin: "jackpot:participateJackpotSchema",
    raison:
      "Participation publique : le code absent est le signal « mode caisse », que la RPC tranche seule (pas d'oracle).",
  },
  {
    chemin: "reserver:reserveSlotSchema",
    raison:
      "Parcours public joueur : corps d'action typé — le consentement transactionnel ne doit JAMAIS se déduire d'un champ absent, la base portant une ÉQUIVALENCE email ⇔ consentement.",
  },
  {
    chemin: "reserver:cancelReservationSchema",
    raison:
      "Annulation par le joueur : corps d'action typé, jamais un FormData de dashboard.",
  },
  {
    chemin: "reserver:loadMyReservationsSchema",
    raison:
      "Relecture de ses réservations : corps d'action typé, l'organisation vient du contexte de la page publique.",
  },
  {
    chemin: "reserver:waitlistJoinSchema",
    raison:
      "Entrée en liste prioritaire : corps d'action typé — même équivalence email ⇔ consentement que la réservation, elle ne doit pas se déduire d'un champ absent.",
  },
  {
    chemin: "reserver:redeemInvitationSchema",
    raison:
      "Rejointe par invitation privée : corps d'action typé — le créneau absent est le signal « invitation à un créneau précis », que la RPC tranche seule.",
  },
  {
    chemin: "pronostics:registerPlayerSchema",
    raison: "Inscription d'un joueur au championnat : corps d'action typé, jamais un FormData.",
  },
  {
    chemin: "pronostics:updatePlayerSchema",
    raison: "Modification du profil joueur : corps d'action typé, jamais un FormData.",
  },
  {
    chemin: "pronostics:addMatchesSchema.matches",
    raison:
      "Saisie rapide : les lignes arrivent en JSON dans un champ caché. Une clé nulle y est une corruption du tableau, pas un champ non rendu.",
  },
  {
    chemin: "pronostics:updateContestGenericScoringSchema.values",
    raison:
      "Barème générique sérialisé en JSON (champ caché) : seules les clés PRÉSENTES sont écrites, l'absence d'une clé signifie « ne touche pas à ce palier ».",
  },
  {
    chemin: "quiz:joinQuizSchema",
    raison: "Parcours public joueur : corps d'action typé — le consentement RGPD ne doit jamais se déduire d'un champ absent.",
  },
  {
    chemin: "quiz:getQuizLeaderboardSchema",
    raison: "Lecture du classement public : corps d'action typé, la limite vient du code appelant.",
  },
  {
    chemin: "quiz:updateQuizRewardSchema.reward_label",
    raison: "Dotation d'un quiz : entrée typée de l'action, postée par l'éditeur client et non par un formulaire.",
  },
  {
    chemin: "quiz:updateQuizRewardSchema.reward_details",
    raison: "Dotation d'un quiz : entrée typée de l'action, postée par l'éditeur client et non par un formulaire.",
  },
  {
    chemin: "quiz:createQuizQuestionSchema.preset",
    raison: "Édition d'une question de quiz : entrée typée depuis l'éditeur client, jamais un FormData.",
  },
  {
    chemin: "quiz:createQuizQuestionSchema.options",
    raison: "Édition d'une question de quiz : entrée typée depuis l'éditeur client, jamais un FormData.",
  },
  {
    chemin: "quiz:updateQuizQuestionSchema.preset",
    raison: "Édition d'une question de quiz : entrée typée depuis l'éditeur client, jamais un FormData.",
  },
  {
    chemin: "quiz:updateQuizQuestionSchema.options",
    raison: "Édition d'une question de quiz : entrée typée depuis l'éditeur client, jamais un FormData.",
  },
  {
    chemin: "quiz:createQuizQuestionSchema.points",
    raison:
      "Seul champ du dossier où l'absence VAUT un défaut (1 point) mais où `null` est REFUSÉ : le barème arrive en JSON, un null y est une valeur écrite — donc une corruption — et non un champ non rendu.",
  },
  {
    chemin: "quiz:updateQuizQuestionSchema.points",
    raison:
      "Même dissymétrie que quiz:createQuizQuestionSchema.points : défaut à 1 pour l'absence, refus explicite pour un null venu du JSON.",
  },

  // ── 2. `null` et absence disent deux choses différentes ──
  {
    chemin: "calendar:updateCalendarSchema.code_ttl_days",
    raison:
      "'' = « sans limite », absence = « ne touche pas au réglage ». L'action lit ce champ par formData.has(...) : les confondre remettrait l'échéance à zéro à chaque sauvegarde d'un autre formulaire de la page.",
  },
  {
    chemin: "events:updateEventSessionSchema.code_ttl_days",
    raison: "Même dissymétrie que calendar:updateCalendarSchema.code_ttl_days.",
  },
  {
    chemin: "hunts:updateHuntSchema.code_ttl_days",
    raison: "Même dissymétrie que calendar:updateCalendarSchema.code_ttl_days.",
  },
  {
    chemin: "jackpot:updateJackpotCampaignSchema.code_ttl_days",
    raison: "Même dissymétrie que calendar:updateCalendarSchema.code_ttl_days.",
  },
  {
    chemin: "loyalty:updateLoyaltyProgramSchema.code_ttl_days",
    raison: "Même dissymétrie que calendar:updateCalendarSchema.code_ttl_days.",
  },
  {
    chemin: "quiz:updateQuizSchema.code_ttl_days",
    raison: "Même dissymétrie que calendar:updateCalendarSchema.code_ttl_days.",
  },
  {
    chemin: "pronostics:updateContestSchema.code_ttl_seconds",
    raison:
      "Même dissymétrie, en secondes : le seul champ de updateContestSchema dont l'absence ne se déduit pas de la valeur, d'où le formData.has(...) de l'action.",
  },
  {
    chemin: "prizes:updatePrizeSchema.stock_seen",
    raison:
      "Témoin d'affichage du compare-and-swap : `undefined` = page servie sans témoin, `null` = stock illimité AFFICHÉ. Les confondre rendrait le témoin inutile — c'est exactement la distinction qu'il existe pour porter.",
  },
];

const MODULES: Record<string, Record<string, unknown>> = {
  admin,
  auth,
  automations,
  calendar,
  "campaign-templates": campaignTemplates,
  campaigns,
  "champ-formulaire": champFormulaire,
  events,
  hunts,
  jackpot,
  loyalty,
  "meta-progression": metaProgression,
  newsletter,
  organizations,
  play,
  privacy,
  prizes,
  pronostics,
  quiz,
  referral,
  reserver,
  "reward-expiry": rewardExpiry,
  skill,
  sms,
  team,
  webhooks,
};

/** Vue minimale d'un schéma zod, sans dépendre de ses types publics. */
interface SchemaInterne {
  _zod: { def: Record<string, unknown> };
  safeParse(valeur: unknown): { success: boolean; data?: unknown };
}

function estSchema(valeur: unknown): valeur is SchemaInterne {
  return (
    typeof valeur === "object" &&
    valeur !== null &&
    "_zod" in valeur &&
    typeof (valeur as { safeParse?: unknown }).safeParse === "function"
  );
}

interface Champ {
  chemin: string;
  schema: SchemaInterne;
}

/**
 * Descend dans un schéma et rend TOUS ses champs nommés.
 *
 * Le parcours suit les enveloppes (`nullable`, `default`, `optional`, `pipe`)
 * jusqu'à trouver un objet, puis récurse dans ses champs. Un tableau est suivi
 * par son élément : `addMatchesSchema.matches[]` porte de vrais champs, et les
 * ignorer laisserait une moitié du dossier hors couverture.
 */
function champs(
  chemin: string,
  schema: SchemaInterne,
  vus: Set<unknown>,
  profondeur = 0,
): Champ[] {
  if (profondeur > 8 || vus.has(schema)) return [];
  vus.add(schema);
  const def = schema._zod.def;

  if (def.type === "object") {
    const forme = def.shape as Record<string, unknown>;
    const trouves: Champ[] = [];
    for (const [cle, valeur] of Object.entries(forme)) {
      if (!estSchema(valeur)) continue;
      trouves.push({ chemin: `${chemin}.${cle}`, schema: valeur });
      trouves.push(...champs(`${chemin}.${cle}`, valeur, vus, profondeur + 1));
    }
    return trouves;
  }

  const trouves: Champ[] = [];
  for (const cle of ["innerType", "element", "in", "out"]) {
    const interne = def[cle];
    if (estSchema(interne)) trouves.push(...champs(chemin, interne, vus, profondeur + 1));
  }
  const branches = def.options;
  if (Array.isArray(branches)) {
    for (const branche of branches) {
      if (estSchema(branche)) {
        trouves.push(...champs(chemin, branche, vus, profondeur + 1));
      }
    }
  }
  return trouves;
}

function tousLesChamps(): Champ[] {
  const trouves: Champ[] = [];
  for (const [nomModule, module] of Object.entries(MODULES)) {
    for (const [nom, valeur] of Object.entries(module)) {
      if (!estSchema(valeur)) continue;
      trouves.push(...champs(`${nomModule}:${nom}`, valeur, new Set()));
    }
  }
  return trouves;
}

/** Comparaison structurelle qui distingue `undefined` de l'absence de clé. */
function empreinte(valeur: unknown): string {
  return JSON.stringify(valeur, (_cle, v) => (v === undefined ? "∅undefined" : v)) ?? "∅undefined";
}

function estExclu(chemin: string): Exclusion | undefined {
  return HORS_FORMULAIRE.find(
    (e) => chemin === e.chemin || chemin.startsWith(e.chemin),
  );
}

const CHAMPS = tousLesChamps();

describe("champ non rendu — la classe est fermée au schéma", () => {
  it("le dossier est bien parcouru en entier (garde de la garde)", () => {
    // ROUGE SI : l'introspection casse (montée de version de zod, changement de
    // forme interne) et rend une liste vide ou dérisoire. Sans ce compte, la
    // garde deviendrait verte en ne vérifiant PLUS RIEN — le pire des silences,
    // et le seul défaut qu'un test de couverture ne peut pas s'auto-signaler.
    expect(CHAMPS.length).toBeGreaterThan(250);

    // Et TOUS les modules doivent apparaître, à deux exceptions nommées : elles
    // n'exportent aucun schéma d'objet, donc aucun champ à parcourir. Les citer
    // ici plutôt que soustraire un nombre évite qu'un module devenu invisible
    // (import cassé, export renommé) passe pour l'une d'elles.
    const SANS_CHAMP = new Set([
      "champ-formulaire", // les primitives elles-mêmes, pas des objets
      "reward-expiry", // un unique schéma scalaire partagé par sept modules
    ]);
    const couverts = new Set(CHAMPS.map((c) => c.chemin.split(":")[0]));
    const manquants = Object.keys(MODULES).filter(
      (m) => !couverts.has(m) && !SANS_CHAMP.has(m),
    );
    expect(manquants, `modules jamais parcourus : ${manquants.join(", ")}`).toEqual([]);
  });

  it("A — un champ qui tolère l'absence rend la MÊME chose pour null", () => {
    const fautes: string[] = [];
    for (const { chemin, schema } of CHAMPS) {
      if (estExclu(chemin)) continue;
      const sansValeur = schema.safeParse(undefined);
      if (!sansValeur.success) continue; // champ requis : voir l'invariant B
      const avecNull = schema.safeParse(null);
      if (!avecNull.success) {
        // MODE BRUYANT : le formulaire est refusé sur « received null » alors
        // que le champ est facultatif.
        fautes.push(`${chemin} — refuse null mais accepte l'absence`);
        continue;
      }
      if (empreinte(avecNull.data) !== empreinte(sansValeur.data)) {
        // MODE SILENCIEUX sur un champ à défaut : `null` ne donne pas le défaut
        // annoncé mais la valeur de coercition (0, false, …).
        fautes.push(
          `${chemin} — null donne ${empreinte(avecNull.data)}, absence donne ${empreinte(sansValeur.data)}`,
        );
      }
    }
    expect(fautes, fautes.join("\n")).toEqual([]);
  });

  it("B — un champ REQUIS refuse null, il ne le lit jamais comme une valeur", () => {
    const fautes: string[] = [];
    for (const { chemin, schema } of CHAMPS) {
      if (schema.safeParse(undefined).success) continue; // facultatif : invariant A
      const avecNull = schema.safeParse(null);
      if (avecNull.success) {
        fautes.push(
          `${chemin} — champ REQUIS qui accepte null et rend ${empreinte(avecNull.data)}`,
        );
      }
    }
    // Cet invariant N'A PAS d'exclusion, et c'est délibéré : il vaut pour le
    // JSON interne autant que pour les formulaires. Un `null` arrivé dans un
    // champ requis est une absence côté formulaire et une corruption côté JSON
    // — dans les deux cas il doit être REFUSÉ, jamais lu 0.
    expect(fautes, fautes.join("\n")).toEqual([]);
  });

  it("chaque exclusion porte une raison, et aucune n'est morte", () => {
    // ROUGE SI : une exclusion est écrite sans motif (elle redeviendrait une
    // baseline muette), ou survit à la disparition du schéma qu'elle couvrait —
    // auquel cas elle ne protège plus rien et masquerait le jour où un schéma
    // du même nom réapparaît.
    for (const exclusion of HORS_FORMULAIRE) {
      expect(exclusion.raison.length, exclusion.chemin).toBeGreaterThan(40);
      expect(
        CHAMPS.some((c) => c.chemin.startsWith(exclusion.chemin)),
        `exclusion morte : ${exclusion.chemin}`,
      ).toBe(true);
    }
    expect(new Set(HORS_FORMULAIRE.map((e) => e.chemin)).size).toBe(
      HORS_FORMULAIRE.length,
    );
  });
});
