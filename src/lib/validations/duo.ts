import { z } from "zod";

import { DUO_OPTIONS_MAX } from "@/lib/duo";

// ────────────────────────────────────────────────────────────
// DUO MIROIR (L17) — les entrées, et rien d'autre
//
// Bornes applicatives calées sur les `raise` de la migration 20261018120000 :
// la base refuserait de toute façon, mais elle refuserait en 22023 — une
// exception, pas un message. Ce qui vit ici sert à rendre une phrase utile
// AVANT l'aller-retour, jamais à décider à la place de la base.
//
// UNE SEULE EXCEPTION À LA PARITÉ, ET ELLE EST ASSUMÉE : la borne basse du
// plateau. Elle est documentée sur `duoOptionsSchema`, où elle vit.
// ────────────────────────────────────────────────────────────

/** UUID — même définition et même message que `validations/lobby.ts`. */
const uuid = z.string().uuid("Identifiant invalide");

/**
 * LE PLANCHER DE L'ÉCRAN — TROIS, ET LA BASE EN ACCEPTE DEUX.
 *
 * C'est le seul endroit de ce fichier où l'application est PLUS STRICTE que le
 * SQL, et l'écart est voulu des deux côtés :
 *
 *   · le cahier demande « 3 à 6 » — un duel à deux cartes n'a presque pas de
 *     jeu, et le proposer au commerçant serait lui proposer de le rater ;
 *   · `set_duo_options` et `duo_start` s'arrêtent à DEUX parce qu'une garde
 *     d'intégrité ne doit refuser que ce qui rend le jeu IMPOSSIBLE. Surtout,
 *     une sélection de six fiches peut TOMBER à deux toute seule, par cascade
 *     de suppression d'une fiche de la carte : refuser deux en base aurait fait
 *     échouer une partie en cours pour une modification faite au comptoir.
 *
 * L'écart n'a donc qu'un sens, et c'est le bon : on refuse de COMPOSER un
 * plateau de deux, on n'interdit pas d'en JOUER un qui a maigri tout seul.
 */
export const DUO_OPTIONS_MIN_ECRAN = 3;

/**
 * Les trois gestes joueur qui ne prennent qu'une salle : ouvrir, sonder.
 *
 * `.strict()` : cet identifiant est RELU (l'écran le tient de la page), jamais
 * saisi au clavier. Une clé de plus viendrait d'un appelant qui s'est trompé de
 * forme, ou qui tente sa chance ; la laisser passer lui donnerait raison.
 */
export const duoLobbySchema = z.object({ lobbyId: uuid }).strict();

/**
 * SCELLER — la salle et la fiche, rien d'autre.
 *
 * AUCUN JETON N'EST UN CHAMP, et son absence est le point : l'empreinte
 * présentée à `duo_choose` sort du COOKIE DE CETTE SALLE (`lireJetonLobby` +
 * `hashLobbyToken`), et de nulle part ailleurs. Un jeton reçu du formulaire
 * ferait de l'appartenance une déclaration sur l'honneur — c'est-à-dire
 * permettrait de sceller à la place de l'autre joueur.
 *
 * AUCUNE VALIDATION QUE LA FICHE EST SUR LE PLATEAU non plus : c'est un `exists`
 * de `duo_choose`, qui porte l'organisation et rend le même `unavailable` pour
 * une fiche inexistante, d'un autre commerce ou non épinglée. Le refaire ici
 * aurait exigé de relire le plateau — donc une seconde définition de « cette
 * fiche est jouable », qui aurait fini par diverger de la première.
 */
export const duoChooseSchema = z
  .object({ lobbyId: uuid, itemId: uuid })
  .strict();

/**
 * LE COMMERÇANT COMPOSE SON PLATEAU — trois à six fiches, sans doublon.
 *
 * ── `organizationId` NE VIENT PAS DU FORMULAIRE, ET L'ACTEUR N'EST PAS UN CHAMP
 *
 * Motif exact d'`orgLobbiesSchema` / `closeOrgLobbySchema` (L16).
 * `set_duo_options` prend un `p_actor` et le vérifie EN SQL membre
 * `owner|editor`, parce que le geste est journalisé (`duo.options_set`) : cet
 * acteur sort de `gardeEditeurVitrine().userId` et de nulle part ailleurs.
 * Aucun schéma d'ici ne le nomme, donc aucun appelant ne peut l'apporter — un
 * acteur reçu du client ferait de la ligne d'audit une déclaration sur
 * l'honneur, et « qui a changé le plateau » est exactement la question qu'on se
 * pose après coup.
 *
 * ── LE DOUBLON EST REFUSÉ ICI PARCE QU'IL L'EST LÀ-BAS ──
 *
 * `set_duo_options` lève `duplicate duo option item` (22023) : deux fois la même
 * fiche occuperait deux places du plateau. Le refuser ici n'ajoute AUCUNE règle,
 * il rend une phrase là où la base rendrait une exception — motif exact de
 * `kickLobbySchema`.
 */
export const duoOptionsSchema = z
  .object({
    organizationId: uuid,
    itemIds: z
      .array(uuid)
      .min(
        DUO_OPTIONS_MIN_ECRAN,
        `Choisissez au moins ${DUO_OPTIONS_MIN_ECRAN} fiches`,
      )
      .max(DUO_OPTIONS_MAX, `Choisissez au plus ${DUO_OPTIONS_MAX} fiches`)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Une même fiche ne peut pas occuper deux places",
      }),
  })
  .strict();

/**
 * LA PROPOSITION DE LA MAISON — une fiche, ou `null` pour la retirer.
 *
 * `null` EST UN GESTE, PAS UNE ERREUR : le commerçant qui ne veut plus rien
 * proposer doit pouvoir le dire, et `set_duo_suggestion` l'accepte
 * explicitement. Rendre ce champ requis aurait obligé l'écran à inventer une
 * seconde action « effacer » — et le journal aurait porté deux verbes pour un
 * seul geste.
 */
export const duoSuggestionSchema = z
  .object({ organizationId: uuid, itemId: uuid.nullable() })
  .strict();

/**
 * LA LECTURE DE L'ÉCRAN DE CONFIGURATION.
 *
 * `duo_options_state` est `security definer` et n'interroge AUCUNE appartenance :
 * elle rend le plateau de l'organisation qu'on lui nomme. Sa sûreté tient
 * ENTIÈREMENT au fait que l'appelant lui passe l'organisation de la session — la
 * garde est applicative, c'est `loadDuoOptions` qui la tient, et c'est le même
 * arbitrage qu'`org_player_lobbies`. Ce schéma existe pour qu'un `null` ne parte
 * jamais (la RPC lèverait une 22023), pas pour accueillir une valeur venue du
 * navigateur.
 */
export const duoOptionsStateSchema = z
  .object({ organizationId: uuid })
  .strict();
