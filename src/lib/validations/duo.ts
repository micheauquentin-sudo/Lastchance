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
// plateau. Elle est documentée sur `DUO_OPTIONS_MIN_ECRAN`, où elle vit.
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
 * SCELLER — la salle et la PLACE, rien d'autre. Ou la salle et la fiche, le
 * temps d'un déploiement.
 *
 * AUCUN JETON N'EST UN CHAMP, et son absence est le point : l'empreinte
 * présentée à `duo_choose_option` sort du COOKIE DE CETTE SALLE
 * (`lireJetonLobby` + `hashLobbyToken`), et de nulle part ailleurs. Un jeton
 * reçu du formulaire ferait de l'appartenance une déclaration sur l'honneur —
 * c'est-à-dire permettrait de sceller à la place de l'autre joueur.
 *
 * AUCUNE VALIDATION QUE LA PLACE EST SUR LE PLATEAU non plus : c'est un `select`
 * de `duo_choose_option`, borné à l'organisation de la SALLE, qui rend le même
 * `unavailable` pour une place inexistante, d'un autre commerce ou retirée du
 * plateau. Le refaire ici aurait exigé de relire le plateau — donc une seconde
 * définition de « cette place est jouable », qui aurait fini par diverger de la
 * première.
 *
 * ── DEUX FORMES ACCEPTÉES, ET LA SECONDE EST TRANSITOIRE (DUO-5) ──
 *
 * `optionId` est la forme vivante : c'est la clé primaire de `duo_options`, la
 * SEULE qui désigne une place quelle que soit son origine — une proposition
 * saisie à la main n'a pas de fiche, et c'est précisément ce que ce lot rend
 * jouable.
 *
 * `itemId` est la forme d'HIER, conservée pour LA FENÊTRE DE DÉPLOIEMENT et pour
 * rien d'autre. Un onglet ouvert avant la mise en ligne poste encore `item_id`,
 * et son joueur est au milieu d'une partie à deux : le refuser lui rendrait un
 * bouton qui ne fait rien, sans qu'aucun rechargement ne lui soit suggéré. Le
 * SQL a fait le même arbitrage — la migration 20261128120000 garde
 * `duo_choose(p_item_id)` vivante, qui délègue après résolution, en écrivant
 * qu'elle existe « pour la fenêtre de déploiement ».
 *
 * ELLE S'ENLÈVE, et le geste est nommé : retirer ce membre d'union, la branche
 * `duo_choose` de `chooseDuo`, et le test qui la couvre. Rien d'autre n'en
 * dépend.
 *
 * ── POURQUOI UNE UNION ET NON DEUX CHAMPS FACULTATIFS ──
 *
 * Motif `duoPlaceSchema` : deux champs facultatifs auraient laissé écrire les
 * deux, donc laissé une place à la question « laquelle gagne ? » — question dont
 * la réponse aurait vécu dans l'action, hors de portée de ce fichier. Chaque
 * membre reste `.strict()` : la clé de l'autre forme ne traverse pas.
 */
export const duoChooseSchema = z.union([
  z.object({ lobbyId: uuid, optionId: uuid }).strict(),
  z.object({ lobbyId: uuid, itemId: uuid }).strict(),
]);

/*
 * `duoOptionsSchema` VIVAIT ICI, ET IL EST PARTI AVEC DUO-3b.
 *
 * Il ne décrivait qu'un plateau de FICHES (`itemIds: uuid[]`), c'est-à-dire la
 * seule forme possible quand le Duo exigeait la Vitrine. `duoPlateauSchema`,
 * plus bas, décrit le plateau tel qu'il est désormais — des PLACES, d'origines
 * libres — et un plateau de fiches en est le cas particulier. Le garder à côté
 * aurait laissé deux définitions de « ce plateau est acceptable », dont une
 * seule aurait été relue le jour où une borne change.
 *
 * Ce qu'il portait et qui n'est pas perdu : l'organisation et l'acteur ne sont
 * PAS des champs de formulaire (motif `orgLobbiesSchema` / `closeOrgLobbySchema`
 * de L16) — c'est écrit sur `duoPlateauSchema`, qui les tient de la garde.
 */

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

// ────────────────────────────────────────────────────────────
// DUO-1 — LES OPTIONS SAISIES À LA MAIN
//
// Le Duo se vend sans la Vitrine depuis DUO-2 : un commerçant sans carte n'a
// aucune fiche à épingler, et compose donc son plateau en ÉCRIVANT ses
// propositions. La migration 20261126120000 borne `duo_options.libelle` par
// six clauses de `check`. Ce qui suit en est le MIROIR, et rien d'autre :
// la base refuserait de toute façon, mais elle refuserait en 23514 — une
// contrainte violée, c'est-à-dire une erreur de base remontée telle quelle
// dans un formulaire, là où le commerçant attend une phrase.
// ────────────────────────────────────────────────────────────

/**
 * LA BORNE HAUTE — 120, celle de `vitrine_items.nom`.
 *
 * Ce n'est pas un nombre choisi ici : le libellé REMPLACE un nom de plat, donc
 * il porte la borne du champ qu'il remplace. Le filtre de pseudo
 * (`player_alias_is_allowed`, borne 24) n'est délibérément pas réutilisé — la
 * migration explique les deux raisons, dont celle qui compte : sa liste de mots
 * bloqués refuse « Spaghetti con vongole ».
 */
export const DUO_LIBELLE_MAX = 120;

/**
 * LES CODETS INVISIBLES ET BIDIRECTIONNELS, liste EXACTE de 20260805190000.
 *
 * Un libellé est lu par des joueurs sur un téléphone : un codet de direction
 * inversée y retourne la phrase voisine, un espace de largeur nulle fabrique
 * deux propositions visuellement identiques que l'index unique laisserait
 * passer. Les deux sont refusés en base ; ils sont nommés ici pour que le refus
 * se lise dans le champ.
 */
const CODETS_INVISIBLES = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

/** Les caractères de CONTRÔLE, refusés par `libelle !~ '[[:cntrl:]]'`. */
const CONTROLES = /[\u0000-\u001f\u007f]/;

/**
 * UNE PROPOSITION SAISIE — six règles, celles du `check`, dans son ordre.
 *
 * `[[:alnum:]]` de Postgres devient `\p{L}|\p{N}` : la classe POSIX reconnaît
 * accents et idéogrammes sur une base UTF-8, et une classe ASCII aurait refusé
 * « 冷やし中華 » là où la base l'accepte — un refus que le commerçant ne pourrait
 * ni comprendre ni corriger.
 *
 * `[[:space:]]` devient `\s`, qui couvre l'espace insécable U+00A0 comme lui :
 * un libellé fait d'un seul insécable est refusé des deux côtés.
 */
export const duoLibelleSchema = z
  .string()
  .min(1, "Écrivez la proposition")
  .max(
    DUO_LIBELLE_MAX,
    `${DUO_LIBELLE_MAX} caractères au maximum par proposition`,
  )
  .refine((v) => !/^\s/.test(v) && !/\s$/.test(v), {
    message: "Pas d'espace au début ni à la fin",
  })
  .refine((v) => !/\s\s/.test(v), {
    message: "Pas deux espaces à la suite",
  })
  .refine((v) => /[\p{L}\p{N}]/u.test(v), {
    message: "Écrivez au moins une lettre ou un chiffre",
  })
  .refine((v) => !CONTROLES.test(v) && !CODETS_INVISIBLES.test(v), {
    message: "Ce texte contient des caractères qui ne peuvent pas être écrits",
  });

/**
 * UNE PLACE DU PLATEAU — une fiche OU un libellé, jamais les deux.
 *
 * C'est la contrainte `duo_options_origine_exclusive` de la base, écrite ici
 * dans la seule forme qui la rende INEXPRIMABLE autrement : une union
 * discriminée. Un objet à deux champs facultatifs aurait laissé écrire les deux
 * et repoussé le refus jusqu'à la 23514.
 */
export const duoPlaceSchema = z.discriminatedUnion("origine", [
  z.object({ origine: z.literal("fiche"), itemId: uuid }).strict(),
  z.object({ origine: z.literal("libelle"), texte: duoLibelleSchema }).strict(),
]);

export type DuoPlaceEntree = z.infer<typeof duoPlaceSchema>;

/**
 * LE PLATEAU COMPLET — trois à six places, d'origines libres, sans doublon.
 *
 * ── L'ORGANISATION ET L'ACTEUR NE SONT PAS DES CHAMPS ──
 *
 * Motif d'`orgLobbiesSchema` / `closeOrgLobbySchema` (L16).
 * `gardeEditeurJeuSalon` les tient, et `set_duo_options` revérifie l'acteur EN
 * SQL parce que le geste est journalisé (`duo.options_set`). Aucun schéma d'ici
 * ne nomme `actor`, donc aucun appelant ne peut l'apporter — un acteur reçu du
 * client ferait de la ligne d'audit une déclaration sur l'honneur, et « qui a
 * changé le plateau » est exactement la question qu'on se pose après coup.
 *
 * ── IL DÉCRIT LES DEUX CHEMINS D'ÉCRITURE, ET UN SEUL VOCABULAIRE ──
 *
 * Un plateau fait UNIQUEMENT de fiches part par `set_duo_options` (la RPC
 * vérifie l'appartenance EN SQL et journalise) ; dès qu'une place est saisie,
 * l'écriture passe par la table, comme la migration 20261126120000 l'a écrit.
 * Ce schéma-ci est le MÊME dans les deux cas : deux schémas auraient fini par
 * refuser des choses différentes selon la composition du plateau.
 *
 * ── LES DEUX UNICITÉS SONT CELLES DE LA BASE ──
 *
 * `duo_options_org_item_unique` refuse deux fois la même fiche ;
 * `duo_options_org_libelle_unique` (index partiel) refuse deux fois le même
 * libellé. Deux places du même nom rendraient l'accord du jeu indécidable — le
 * jeu demande « avez-vous choisi la même chose », et deux « Tiramisu » ne
 * savent pas y répondre. La comparaison est EXACTE, comme l'index : la base
 * distingue « Café » de « café », et prétendre l'inverse ici refuserait une
 * saisie qu'elle accepte.
 */
export const duoPlateauSchema = z
  .object({
    organizationId: uuid,
    places: z
      .array(duoPlaceSchema)
      .min(
        DUO_OPTIONS_MIN_ECRAN,
        `Composez au moins ${DUO_OPTIONS_MIN_ECRAN} propositions`,
      )
      .max(
        DUO_OPTIONS_MAX,
        `Composez au plus ${DUO_OPTIONS_MAX} propositions`,
      )
      .refine(
        (places) => {
          const fiches = places.flatMap((p) =>
            p.origine === "fiche" ? [p.itemId] : [],
          );
          return new Set(fiches).size === fiches.length;
        },
        { message: "Une même fiche ne peut pas occuper deux places" },
      )
      .refine(
        (places) => {
          const textes = places.flatMap((p) =>
            p.origine === "libelle" ? [p.texte] : [],
          );
          return new Set(textes).size === textes.length;
        },
        { message: "Deux propositions ne peuvent pas porter le même nom" },
      ),
  })
  .strict();
