import { z } from "zod";

import { formatPlayerAlias, isAllowedPlayerAlias } from "@/lib/player-alias";
import { entierRequis } from "@/lib/validations/champ-formulaire";
import {
  LOBBY_CAPACITE_MAX,
  LOBBY_CAPACITE_MIN,
  LOBBY_DUO_CAPACITE,
  LOBBY_KINDS,
} from "@/lib/lobby";

// ────────────────────────────────────────────────────────────
// SOCLE DE LOBBY (L16) — les entrées, et rien d'autre
//
// Bornes applicatives STRICTEMENT égales aux `check` SQL de la migration
// 20261017120000 : la base refuserait de toute façon, mais elle refuserait en
// 22023 — une exception, pas un message. Ce qui vit ici sert à rendre une phrase
// utile AVANT l'aller-retour, jamais à décider à la place de la base.
//
// AUCUN SCHÉMA DE CE FICHIER N'AJOUTE UNE GARDE que le SQL n'aurait pas. Un
// schéma plus permissif que le `check` produirait une 22023 illisible ; un
// schéma plus strict refuserait ici ce que la base accepte, et le joueur ne
// pourrait pas le savoir. La parité est donc l'objectif, dans les deux sens.
// ────────────────────────────────────────────────────────────

/** UUID d'un lobby — l'identifiant que l'écran porte d'un appel à l'autre. */
const uuid = z.string().uuid("Identifiant invalide");

/**
 * Adresse publique du commerce qui HÉBERGE le lobby (`vitrine_settings.slug`).
 *
 * Miroir du `check (slug ~ '^[a-z0-9-]{3,60}$')` de la migration
 * 20261011120000. Recopié ici plutôt qu'importé de `validations/vitrine.ts` :
 * le schéma de là-bas est un schéma de SAISIE COMMERÇANT — il porte des
 * messages qui parlent de « votre adresse » et refuse le vocabulaire réservé,
 * deux choses qui n'ont aucun sens sur un chemin public où le slug vient de
 * l'URL et jamais d'un clavier.
 *
 * SON REFUS N'EST PAS UN MESSAGE : l'appelant le replie sur le refus indistinct
 * (voir `createLobby`), sans quoi un slug malformé se distinguerait d'un slug
 * inconnu — c'est-à-dire un oracle sur les adresses qui existent.
 */
export const lobbySlugSchema = z
  .string()
  .transform((saisie) => saisie.trim().toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9-]{3,60}$/, "Adresse invalide"));

/**
 * Code de partage à six caractères, alphabet SANS I/O/0/1 — miroir exact du
 * `check` de `player_lobbies.join_code` et de la normalisation que
 * `join_player_lobby` applique en tête (`upper` + `btrim`).
 *
 * La casse et les espaces sont TOLÉRÉS ici parce qu'ils le sont là-bas : le
 * code se dicte à voix haute à une table de café, et refuser « abc def » aurait
 * fait porter au joueur une exigence que la base ne pose pas.
 */
export const lobbyJoinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, "Code d'accès invalide");

/**
 * Pseudo affiché aux autres membres — 1..24, miroir du `check` SQL, avec le
 * détourage de `player-alias` (motif `validations/events.ts`).
 *
 * Les caractères de CONTRÔLE et de FORMATAGE Unicode sont refusés : aucun
 * risque XSS (React échappe), mais un `U+202E` permettrait d'usurper
 * visuellement le pseudo d'un autre membre de la salle — et une salle est
 * précisément l'endroit où l'on se reconnaît par son pseudo.
 *
 * REFUSÉ, JAMAIS TRONQUÉ : c'est le choix de `create_player_lobby`, et il vaut
 * ici pour la même raison — la personne est devant un clavier et peut corriger.
 */
export const lobbyPseudoSchema = z
  .string()
  .transform(formatPlayerAlias)
  .pipe(
    z
      .string()
      .min(1, "Votre pseudo est requis")
      .max(24, "Pseudo trop long (24 caractères max)")
      .refine(isAllowedPlayerAlias, { message: "Choisissez un autre pseudo" }),
  );

/** Les deux formats de salle. Liste FERMÉE, miroir du `check (kind in …)`. */
export const lobbyKindSchema = z.enum(LOBBY_KINDS, {
  error: "Format de salle inconnu",
});

/**
 * Capacité d'une BANDE — deux à douze, miroir du `check (capacite between 2
 * and 12)`. Jamais consultée pour un duo (voir `createLobbySchema`).
 */
const lobbyCapaciteSchema = entierRequis({
  absent: "Indiquez combien vous serez",
  nombre: "Le nombre de joueurs doit être un nombre",
  entier: "Le nombre de joueurs doit être un nombre entier",
  min: [LOBBY_CAPACITE_MIN, `Une salle accueille au moins ${LOBBY_CAPACITE_MIN} joueurs`],
  max: [LOBBY_CAPACITE_MAX, `Une salle accueille au plus ${LOBBY_CAPACITE_MAX} joueurs`],
});

/**
 * Ouvrir une salle.
 *
 * ── DUO NE NÉGOCIE PAS SA CAPACITÉ, ET NE LA CONTESTE PAS NON PLUS ──
 *
 * `create_player_lobby` IGNORE `p_capacite` quand `p_kind = 'duo'` ; ce schéma
 * fait exactement la même chose, et c'est délibéré. Valider la capacité d'un duo
 * aurait refusé un formulaire dont le champ « combien serez-vous » n'est même
 * pas rendu — le joueur aurait lu un message sur un champ qu'il n'a jamais vu.
 *
 * Le champ absent (`null`) reste donc un refus PARLANT pour une bande, et un
 * non-événement pour un duo. C'est la distinction que `entierRequis` existe pour
 * tenir, appliquée à la seule branche qui la demande.
 */
export const createLobbySchema = z
  .object({
    slug: lobbySlugSchema,
    kind: lobbyKindSchema,
    // Non validé à ce rang : la branche `duo` ne doit pas payer le refus d'un
    // champ qu'elle n'a pas rendu. Le verdict est rendu dans le `transform`.
    capacite: z.union([z.string(), z.number(), z.null()]).optional(),
    pseudo: lobbyPseudoSchema,
    /**
     * Jeton Turnstile (LOBBY-1) — borne de LONGUEUR, rien d'autre.
     *
     * Ce champ est la seule exception à « aucun schéma d'ici n'ajoute une garde
     * que le SQL n'aurait pas » : il n'a aucun `check` en face, parce qu'il ne
     * part JAMAIS en base. Il part vers Cloudflare, et c'est précisément ce qui
     * exige la borne — `verifyTurnstile` refuse au-delà de 2048, mais il le
     * ferait après avoir accepté la valeur. La franchir ICI garantit que
     * l'appel sortant se fait sur `parsed.data`, jamais sur le corps brut
     * (INFO-1 de la revue L4, même arbitrage que `validations/reserver.ts`).
     */
    turnstileToken: z.string().max(2048).optional(),
  })
  .transform((saisie, ctx) => {
    if (saisie.kind === "duo") {
      return { ...saisie, capacite: LOBBY_DUO_CAPACITE };
    }
    const verdict = lobbyCapaciteSchema.safeParse(saisie.capacite ?? null);
    if (!verdict.success) {
      ctx.addIssue({
        code: "custom",
        message: verdict.error.issues[0].message,
        path: ["capacite"],
      });
      return z.NEVER;
    }
    return { ...saisie, capacite: verdict.data };
  });

/** Entrer par le code. Aucune organisation : le code désigne son locataire. */
export const joinLobbySchema = z.object({
  code: lobbyJoinCodeSchema,
  pseudo: lobbyPseudoSchema,
});

/** Les trois gestes qui ne prennent qu'un lobby : état, verrou, sortie. */
export const lobbyIdSchema = z.object({ lobbyId: uuid });

/**
 * LA SUPERVISION COMMERÇANT (contrepartie E-1) — deux schémas, un invariant.
 *
 * ── L'ACTEUR N'EST PAS UN CHAMP, ET SON ABSENCE EST LE POINT ──
 *
 * `close_player_lobby_as_org` prend un `p_actor` et le vérifie EN SQL membre
 * `owner|editor`, parce que le geste est journalisé (`lobby.closed_by_org`).
 * Cet acteur sort de la SESSION — `gardeEditeurVitrine().userId` — et de nulle
 * part ailleurs. Aucun schéma d'ici ne le nomme, donc aucun appelant ne peut
 * l'apporter : un acteur reçu du client ferait de la ligne d'audit une
 * déclaration sur l'honneur, et « qui a fermé la salle de mes clients » est
 * exactement la question qu'on se pose après coup. Même arbitrage que
 * `set_vitrine_slug`, même raison.
 *
 * ── `organizationId` NON PLUS NE VIENT PAS DU FORMULAIRE ──
 *
 * `org_player_lobbies` est `security definer` et n'interroge AUCUNE
 * appartenance : elle rend les salles de l'organisation qu'on lui nomme. Sa
 * sûreté tient ENTIÈREMENT au fait que l'appelant lui passe l'organisation de la
 * session. Ce schéma existe pour qu'un `null` ne parte jamais — la RPC lèverait
 * une 22023, une exception plutôt qu'un refus — pas pour accueillir une valeur
 * venue du navigateur.
 *
 * ── `.strict()`, MOTIF `kickLobbySchema` ──
 *
 * Ces identifiants sont RELUS (session, liste rendue par le serveur), jamais
 * saisis au clavier. Une clé de plus — `actor`, `organization_id` posté —
 * viendrait d'un appelant qui s'est trompé de forme, ou qui tente sa chance ; la
 * laisser passer en silence lui donnerait raison.
 */
export const orgLobbiesSchema = z.object({ organizationId: uuid }).strict();

export const closeOrgLobbySchema = z
  .object({ organizationId: uuid, lobbyId: uuid })
  .strict();

/**
 * RETIRER UNE PLACE — l'hôte désigne un RANG, jamais un jeton.
 *
 * ── CE SCHÉMA EXISTE POUR QU'UNE 22023 NE PARTE JAMAIS ──
 *
 * `kick_player_lobby` lève `invalid rank` (22023) sur un rang nul ou inférieur
 * à un : la base traite cela comme un bogue de l'appelant, et elle a raison —
 * ces deux valeurs ne peuvent pas venir de `lobby_state`, qui ne rend que des
 * rangs à partir de 1. Une exception n'est pas un refus : elle remonterait en
 * panne générique là où il n'y a rien à réparer côté joueur.
 *
 * AUCUN PLAFOND, ET C'EST LA PARITÉ QUI L'EXIGE. Un rang au-delà de la liste est
 * une RÉPONSE de la RPC (`kicked:false`, l'occupant venait de partir), pas un
 * refus. Borner à douze ici refuserait à l'écran une valeur que la base accepte,
 * et le joueur n'aurait aucun moyen de le savoir.
 *
 * `.strict()` : ces deux valeurs sont RELUES sur `lobby_state`, jamais saisies
 * au clavier. Une troisième clé viendrait d'un appelant qui s'est trompé de
 * forme, et la laisser passer en silence lui donnerait raison.
 */
export const kickLobbySchema = z
  .object({
    lobbyId: uuid,
    rang: z
      .number("Rang invalide")
      .int("Rang invalide")
      .min(1, "Rang invalide"),
  })
  .strict();
