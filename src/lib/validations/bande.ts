import { z } from "zod";

import { packConnu } from "@/lib/bande";

// ────────────────────────────────────────────────────────────
// PORTRAIT DE LA BANDE (L18) — les entrées, et rien d'autre
//
// Bornes applicatives calées sur les `raise` de la migration 20261019120000 :
// la base refuserait de toute façon, mais elle refuserait en 22023 — une
// exception, pas un message. Ce qui vit ici sert à rendre une phrase utile
// AVANT l'aller-retour, jamais à décider à la place de la base.
//
// AUCUN ÉCART DE PARITÉ DANS CE FICHIER, contrairement à L17 (dont le plancher
// d'écran était plus strict que celui de la base) : les trois schémas disent
// exactement ce que disent les RPC.
// ────────────────────────────────────────────────────────────

/** UUID — même définition et même message que `validations/lobby.ts`. */
const uuid = z.string().uuid("Identifiant invalide");

/**
 * Les cinq gestes qui ne prennent qu'une salle : ouvrir, sonder, révéler,
 * passer à la suite, relire le portrait.
 *
 * `.strict()` : cet identifiant est RELU (l'écran le tient de la page), jamais
 * saisi au clavier. Une clé de plus viendrait d'un appelant qui s'est trompé de
 * forme, ou qui tente sa chance ; la laisser passer lui donnerait raison.
 */
export const bandeLobbySchema = z.object({ lobbyId: uuid }).strict();

/**
 * VOTER — la salle et la cible, rien d'autre.
 *
 * ── `cibleMemberId` NUL EST UNE VALEUR, PAS UNE ABSENCE (arbitrage 1) ──
 *
 * C'est l'écart le plus visible avec `duoChooseSchema` (L17), qui exige un item.
 * Ici, `null` veut dire PASSER : la ligne de vote s'écrit, elle compte dans le
 * verrouillage de la question, et elle ne donne sa voix à personne. Le champ est
 * donc `.nullable()` et NON `.optional()` — la distinction est le geste
 * lui-même. Un schéma qui rendrait ce champ facultatif aurait confondu « j'ai
 * choisi de ne nommer personne » avec « le formulaire est arrivé amputé », et
 * l'action aurait dû deviner lequel des deux elle tenait.
 *
 * ── AUCUN JETON N'EST UN CHAMP, et son absence est le point ──
 *
 * L'empreinte présentée à `bande_vote` sort du COOKIE DE CETTE SALLE
 * (`lireJetonLobby` + `hashLobbyToken`), et de nulle part ailleurs. Un jeton
 * reçu du formulaire ferait de l'appartenance une déclaration sur l'honneur —
 * c'est-à-dire permettrait de voter à la place de quelqu'un d'autre.
 *
 * ── AUCUNE VALIDATION QUE LA CIBLE EST DE CETTE SALLE ──
 *
 * C'est une lecture de `bande_vote` qui porte TROIS conditions à la fois (la
 * cible existe, elle est de cette salle, elle n'est pas le votant) et rend le
 * même refus indistinct pour les trois. La refaire ici aurait donné une seconde
 * définition de « cette personne est nommable », et un refus distinct — donc un
 * oracle sur les membres des salles d'à côté.
 */
export const bandeVoteSchema = z
  .object({ lobbyId: uuid, cibleMemberId: uuid.nullable() })
  .strict();

/**
 * LE COMMERÇANT CHOISIT SON PACK — une des cinq clés, et rien d'autre.
 *
 * ── `organizationId` NE VIENT PAS DU FORMULAIRE, ET L'ACTEUR N'EST PAS UN CHAMP
 *
 * Motif exact de `duoOptionsSchema` (L17). `set_bande_pack` prend un `p_actor`
 * et le vérifie EN SQL membre `owner|editor`, parce que le geste est journalisé
 * (`bande.pack_set`) et surtout parce qu'il peut ALLUMER LE PACK TAQUIN : cet
 * acteur sort de `gardeEditeurVitrine().userId` et de nulle part ailleurs. Aucun
 * schéma d'ici ne le nomme, donc aucun appelant ne peut l'apporter — « qui a
 * décidé que le jeu moquerait les clients » est exactement la question qu'on se
 * pose après coup, et l'audit doit y répondre avec un nom vérifié.
 *
 * ── LA LISTE DES PACKS N'EST PAS RECOPIÉE ICI ──
 *
 * `packConnu` consulte `BANDE_PACK_CLES`, qui est déjà le miroir du `check` SQL
 * (et qu'un test de parité compare à la migration). Un `z.enum` littéral aurait
 * fait une TROISIÈME liste des mêmes cinq mots — et le jour où un pack est
 * retiré, c'est celle qu'on oublie.
 */
export const bandePackSchema = z
  .object({
    organizationId: uuid,
    pack: z
      .string()
      .refine(packConnu, { message: "Choisissez un pack de questions valide" }),
  })
  .strict();

/**
 * LA LECTURE DU RÉGLAGE, pour l'écran de configuration.
 *
 * `bande_settings` est lu par la clé de service, donc sans RLS : sa sûreté tient
 * ENTIÈREMENT au fait que l'appelant lui passe l'organisation de la session — la
 * garde est applicative, c'est `loadBandePack` qui la tient, motif
 * `loadDuoOptions`. Ce schéma existe pour qu'un `null` ne parte jamais dans le
 * filtre, pas pour accueillir une valeur venue du navigateur.
 */
export const bandePackStateSchema = z.object({ organizationId: uuid }).strict();
