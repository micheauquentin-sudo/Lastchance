"use server";

import { revalidatePath } from "next/cache";

import {
  mapBandeNext,
  mapBandePackSaved,
  mapBandeRecap,
  mapBandeReveal,
  mapBandeStart,
  mapBandeState,
  mapBandeVote,
  type BandeNextResult,
  type BandeRecapView,
  type BandeRevealResult,
  type BandeStartResult,
  type BandeStateView,
} from "@/lib/bande";
import { hashLobbyToken, lireJetonLobby } from "@/lib/lobby-context";
import { monitored, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";
import {
  bandeLobbySchema,
  bandePackSchema,
  bandeVoteSchema,
} from "@/lib/validations/bande";
import { gardeEditeurVitrine } from "@/lib/vitrine-context";

// ════════════════════════════════════════════════════════════
// PORTRAIT DE LA BANDE (L18) — nommer sans être vu
//
// ── L'IDENTITÉ EST CELLE DE LA SALLE, ET C'EST LA SEULE QUI OUVRE QUOI QUE CE
//    SOIT ──
//
// Les six RPC de jeu exigent le hash du jeton PAR LOBBY posé par L16 :
// `lireJetonLobby(lobbyId)` puis `hashLobbyToken(...)`, tous deux importés de
// `@/lib/lobby-context`. L'identité GLOBALE `lc-player` n'est ni lue, ni
// recopiée, ni envoyée — et ce n'est pas un détail d'implémentation :
//
//   · c'est la propriété que L16 achète (un téléphone prêté le temps d'une
//     partie ne lie pas deux identités, et la base ne peut pas recoudre les
//     salles entre elles) — propriété qui compte DOUBLE ici, où le jeu consiste
//     précisément à dire quelque chose de ses voisins de table ;
//   · et c'est un piège SILENCIEUX. `hashLobbyToken` préfixe le secret
//     (`lobby:`) avant de le hacher : présenter une empreinte dérivée
//     autrement — `hashPlayerToken`, le cookie global, un jeton d'un autre
//     module — ne lève AUCUNE erreur. La RPC ne trouve simplement aucun membre
//     et rend `unavailable`, partout, pour tout le monde, sans une ligne de
//     journal.
//
// SANS COOKIE DE CETTE SALLE, AUCUN APPEL. Motif `getLobbyState` : fabriquer une
// empreinte pour l'occasion écrirait une identité à quelqu'un qui n'a rien
// rejoint.
//
// L'HÔTE N'EST PAS UN RÔLE QUE L'ACTION CONNAÎT. `bande_reveal` et `bande_next`
// prennent un `p_creator_token_hash` : c'est la MÊME empreinte, celle du cookie
// de cette salle, et c'est la BASE qui la compare au `creator_token_hash` du
// lobby (motif `lock_player_lobby`, L16). Un membre ordinaire qui appellerait
// ces deux actions reçoit le refus générique — l'action ne sait pas, et n'a pas
// à savoir, qui est l'hôte.
//
// ── AUCUN `revalidatePath` SUR LES CHEMINS JOUEUR ──
//
// Les six actions de jeu sont appelées EN BOUCLE par jusqu'à douze téléphones
// posés sur la même table. Y poser une revalidation purgerait le cache de la
// route à chaque tic, pour tous les visiteurs, à cause d'un sondage. Le chemin
// commerçant, lui, revalide : il écrit une configuration qu'un écran rendu par
// le serveur affiche.
//
// ── AUCUN SEAU DE PRESSION NON PLUS ──
//
// Motif `getLobbyState` / `getDuoState` : verser un sondage à deux secondes dans
// `lobbyIp` noierait le seul signal que ce seau existe pour porter — une rafale
// d'OUVERTURE de salles. La borne de ces chemins est la salle elle-même : sans
// le cookie de CETTE salle, rien n'est lu et la base n'est pas touchée.
//
// ── UN REFUS DOUX EST UN RÉSULTAT, PAS UNE PANNE ──
//
// « Déjà voté », « indisponible », « pack inconnu » sont des issues NORMALES de
// gestes qui se sont parfaitement déroulés : la base a répondu, l'action a
// compris, il n'y a rien à réparer. Elles voyagent donc dans un littéral TYPÉ
// que le compilateur suit d'un bout à l'autre — jamais dans le texte d'un
// message, que reformuler suffirait à faire retomber dans le `else` générique
// d'un écran sans qu'aucun test ne bronche (leçon de L16).
// ════════════════════════════════════════════════════════════

const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const NON_AUTORISE = "Action non autorisée";

/**
 * LE refus indistinct du chemin joueur, sous sa forme typée. Une seule valeur,
 * partagée par toutes les causes : salle inconnue, non-membre, salle close,
 * partie absente, cible hors salle — ET LE VOTE POUR SOI-MÊME. Les séparer
 * donnerait de quoi sonder, un identifiant à la fois, la composition des tables
 * d'à côté (arbitrage 2).
 */
const REFUS_INDISPONIBLE = {
  ok: true,
  data: { etat: "indisponible" },
} as const;

// ════════════════════════════════════════════════════════════
// LE CHEMIN JOUEUR
// ════════════════════════════════════════════════════════════

/**
 * OUVRIR — OU RETROUVER — LA PARTIE.
 *
 * IDEMPOTENTE, et c'est la base qui le tient : douze téléphones qui appellent à
 * la même seconde obtiennent LA MÊME partie (verrou consultatif sur la clé du
 * lobby, plus `unique (lobby_id)`). L'écran peut donc l'appeler à l'ouverture
 * sans se demander lequel des joueurs est arrivé le premier.
 *
 * ── RÉPONSE PURE : AUCUN `revalidatePath` ──
 *
 * Motif `startDuo`. L'action ÉCRIT pourtant, la première fois — mais elle
 * n'écrit rien qu'une page rendue par le serveur affiche, et elle est appelée
 * par chaque téléphone de la table.
 *
 * ── ELLE EST `monitored`, CONTRAIREMENT AU SONDAGE ──
 *
 * C'est le chemin qui INSÈRE la partie et son premier tour, et il n'est parcouru
 * qu'une poignée de fois par soirée. `getBandeState`, lui, tourne toutes les
 * deux secondes : l'instrumenter noierait la trace sous des lectures identiques.
 */
export async function startBande(lobbyId: string): Promise<BandeStartResult> {
  const parsed = bandeLobbySchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  // LE JETON DE CETTE SALLE — jamais l'identité globale. Voir l'en-tête.
  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  return monitored("bande.start", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("bande_start", {
        p_lobby_id: parsed.data.lobbyId,
        p_token_hash: hashLobbyToken(token),
      });
      if (error) {
        reportError("bande.start", error.message);
        return { state: "unavailable" as const };
      }
      return mapBandeStart(data);
    } catch (err) {
      reportError("bande.start", err);
      return { state: "unavailable" as const };
    }
  });
}

/**
 * L'ÉTAT DE LA PARTIE — l'action que l'écran rappelle en boucle.
 *
 * ── RÉPONSE PURE, ET LE CŒUR ANTI-TRICHE EST EN FACE ──
 *
 * Cette action ne filtre RIEN : c'est `bande_state` qui décide de ce qui existe
 * dans le document, et tant que la question est ouverte, les résultats n'y sont
 * pas. Un filtrage posé ici serait un filtrage posé APRÈS le transport —
 * c'est-à-dire un décompte qui a déjà quitté la base, visible d'un onglet
 * « réseau », donc lisible par qui vote encore. `mapBandeState` redouble la
 * garde par prudence (voir son en-tête), il ne la remplace pas.
 *
 * NI `monitored`, NI SEAU, NI REVALIDATION : voir l'en-tête du fichier.
 */
export async function getBandeState(lobbyId: string): Promise<BandeStateView> {
  const parsed = bandeLobbySchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("bande_state", {
      p_lobby_id: parsed.data.lobbyId,
      p_token_hash: hashLobbyToken(token),
    });
    if (error) {
      reportError("bande.state", error.message);
      return { state: "unavailable" };
    }
    return mapBandeState(data);
  } catch (err) {
    reportError("bande.state", err);
    return { state: "unavailable" };
  }
}

/**
 * Ce que rend `voteBande`.
 *
 * ── `deja-vote` N'EST PAS `scelle`, ET LE RENOMMAGE EST DÉLIBÉRÉ ──
 *
 * Le contrat SQL emploie le mot deux fois, pour deux choses opposées : la clé
 * `scelle: true` d'un `ok` annonce un SUCCÈS (votre vote est scellé), tandis que
 * l'état `{"state":"scelle"}` est un REFUS (vous aviez déjà voté autrement, et
 * rien n'a été écrit). Laisser le mot voyager tel quel jusqu'à l'écran aurait
 * posé un piège à la première personne qui écrirait `if (etat === "scelle")` en
 * pensant à l'un des deux (leçon L17, `ChooseDuoOutcome`).
 *
 * `revelee` accompagne le succès parce qu'il décide de l'écran suivant : c'est
 * le dernier vote attendu qui déclenche la révélation, DANS LA MÊME
 * TRANSACTION. Celui qui l'a posé n'a donc pas à attendre un sondage pour
 * l'apprendre.
 */
export type VoteBandeOutcome =
  | { etat: "scelle"; revelee: boolean }
  | { etat: "deja-vote" }
  | { etat: "indisponible" };

/**
 * NOMMER QUELQU'UN — OU PASSER.
 *
 * ── LE CHAMP VIDE OU ABSENT EST UN PASSE, ET C'EST UN GESTE ──
 *
 * `cible_member_id` vide ou absent vaut `null`, et `null` veut dire PASSER
 * (arbitrage 1) : la ligne de vote s'écrit, elle compte dans le verrouillage de
 * la question, et elle ne donne sa voix à personne. C'est la forme qu'un bouton
 * « je passe » poste naturellement, et exiger un littéral `"null"` aurait fait
 * dépendre un geste d'une chaîne magique que rien ne garde d'accord entre
 * l'écran et l'action.
 *
 * C'est l'écart le plus visible avec `chooseDuo` (L17), qui refuse un item nul :
 * là-bas, ne rien choisir n'était pas un coup jouable ; ici, si.
 *
 * ── RIEN N'EST VÉRIFIÉ ICI DE CE QUE LA BASE VÉRIFIE ──
 *
 * Ni l'appartenance, ni le statut de la salle, ni le fait que la cible soit de
 * cette table, ni qu'elle ne soit pas le votant, ni qu'un vote ait déjà été
 * scellé. Les gardes sont dans `bande_vote`, sous le verrou consultatif, et les
 * rejouer côté application dupliquerait des arbitrages déjà rendus — des copies
 * qui finiraient par diverger, et qui trancheraient hors du verrou, c'est-à-dire
 * sur un état périmé.
 *
 * ── LE DOUBLE-CLIC EST IDEMPOTENT, LE CHANGEMENT D'AVIS NE L'EST PAS ──
 *
 * Rejouer le MÊME vote rend `ok` ; en désigner un AUTRE rend `deja-vote` et
 * n'écrit rien. C'est ce qui empêche d'attendre de voir la progression pour
 * changer d'avis — l'écran ne doit donc PAS proposer de « modifier », il doit
 * montrer un vote figé.
 */
export async function voteBande(
  _prev: ActionResult<VoteBandeOutcome> | null,
  formData: FormData,
): Promise<ActionResult<VoteBandeOutcome>> {
  const brut = formData.get("cible_member_id");
  const parsed = bandeVoteSchema.safeParse({
    lobbyId: formData.get("lobby_id"),
    // Champ absent ou vide = PASSE. `String(brut)` n'est calculé que sur une
    // valeur présente, sinon un `File` posté deviendrait « [object File] » et
    // partirait se faire refuser comme un UUID malformé (motif
    // `setDuoSuggestion`).
    cibleMemberId: brut === null || brut === "" ? null : String(brut),
  });
  // Ces deux valeurs sont RELUES sur une liste que le serveur a rendue, jamais
  // saisies au clavier : un identifiant malformé vient d'un appelant qui s'est
  // trompé de forme, et il rend le même refus muet qu'une cible hors salle.
  if (!parsed.success) return REFUS_INDISPONIBLE;

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return REFUS_INDISPONIBLE;

  return monitored("bande.vote", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("bande_vote", {
        p_lobby_id: parsed.data.lobbyId,
        p_token_hash: hashLobbyToken(token),
        // `null` EST une valeur acceptée par la RPC — c'est le passe — mais le
        // type généré ne l'exprime pas : Supabase ne marque optionnel qu'un
        // paramètre porteur d'un DEFAULT, jamais un paramètre nullable.
        // L'assertion dit ce que le SQL dit déjà (motif `setDuoSuggestion`).
        p_cible_member_id: parsed.data.cibleMemberId as string,
      });
      if (error) {
        reportError("bande.vote", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      const result = mapBandeVote(data);
      if (result.state === "scelle") {
        return { ok: true as const, data: { etat: "deja-vote" } as const };
      }
      if (result.state !== "ok") return REFUS_INDISPONIBLE;
      return {
        ok: true as const,
        data: { etat: "scelle", revelee: result.revelee } as const,
      };
    } catch (err) {
      reportError("bande.vote", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}

/**
 * L'HÔTE CLÔT LA QUESTION (arbitrage 7).
 *
 * Le dénominateur est FIGÉ : si quelqu'un ferme son téléphone au milieu d'une
 * question, la révélation automatique n'arrivera jamais, et sans ce geste la
 * table resterait bloquée. Les non-votants restent des ABSTENTIONS et le
 * dénominateur ne bouge pas — « 2 sur 5 » dit la vérité, là où un recalcul sur
 * les seuls votants aurait affiché 100 %.
 *
 * IDEMPOTENTE : une question déjà révélée rend `ok` sans rien écrire. Le
 * double-clic sur un bouton qu'on presse devant une table qui attend ne doit pas
 * punir.
 *
 * L'HÔTE EST RECONNU PAR LA BASE, pas ici : l'empreinte envoyée est celle du
 * cookie de cette salle, et c'est `bande_reveal` qui la compare au créateur. Un
 * membre ordinaire reçoit le refus générique.
 */
export async function revealBande(
  lobbyId: string,
): Promise<BandeRevealResult> {
  const parsed = bandeLobbySchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  return monitored("bande.reveal", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("bande_reveal", {
        p_lobby_id: parsed.data.lobbyId,
        p_creator_token_hash: hashLobbyToken(token),
      });
      if (error) {
        reportError("bande.reveal", error.message);
        return { state: "unavailable" as const };
      }
      return mapBandeReveal(data);
    } catch (err) {
      reportError("bande.reveal", err);
      return { state: "unavailable" as const };
    }
  });
}

/**
 * L'HÔTE PASSE À LA QUESTION SUIVANTE — ou clôt la partie.
 *
 * `status` distingue les deux : `en_cours` ouvre la question suivante, `recap`
 * dit que la partie est finie ET QUE LA SALLE EST FERMÉE dans la même
 * transaction (arbitrage 6). L'écran doit donc traiter `recap` comme une fin —
 * les sondages qui suivent liront une salle close, et c'est normal.
 *
 * IDEMPOTENCE PAR STRUCTURE : la garde « le tour courant est révélé » est aussi
 * ce qui empêche de sauter une question en cliquant deux fois — le tour qu'on
 * vient de créer est `ouverte`, donc un second appel refuse.
 */
export async function nextBande(lobbyId: string): Promise<BandeNextResult> {
  const parsed = bandeLobbySchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  return monitored("bande.next", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("bande_next", {
        p_lobby_id: parsed.data.lobbyId,
        p_creator_token_hash: hashLobbyToken(token),
      });
      if (error) {
        reportError("bande.next", error.message);
        return { state: "unavailable" as const };
      }
      return mapBandeNext(data);
    } catch (err) {
      reportError("bande.next", err);
      return { state: "unavailable" as const };
    }
  });
}

/**
 * LE PORTRAIT DE SESSION — qui a été nommé, sur quelles questions.
 *
 * ── C'EST UNE LECTURE, ET ELLE NE REVALIDE RIEN ──
 *
 * L'écran de fin la rappelle au rechargement, et la salle est close à ce
 * moment-là : ni `bande_recap` ni `bande_state` n'exigent une salle vivante,
 * précisément pour que la partie puisse être relue après coup. Ce qui reste
 * exigé, et qui suffit : être membre.
 *
 * ── SEULS LES TOURS RÉVÉLÉS Y ENTRENT, ET C'EST EN SQL ──
 *
 * Sans cette garde, appeler cette action pendant qu'on vote aurait lu ce que
 * `bande_state` refuse de dire. La règle « aucun résultat avant révélation »
 * vaut pour les DEUX lectures, ou elle ne vaut pour aucune — et elle est tenue
 * là où elle doit l'être, dans la RPC.
 */
export async function getBandeRecap(lobbyId: string): Promise<BandeRecapView> {
  const parsed = bandeLobbySchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("bande_recap", {
      p_lobby_id: parsed.data.lobbyId,
      p_token_hash: hashLobbyToken(token),
    });
    if (error) {
      reportError("bande.recap", error.message);
      return { state: "unavailable" };
    }
    return mapBandeRecap(data);
  } catch (err) {
    reportError("bande.recap", err);
    return { state: "unavailable" };
  }
}

// ════════════════════════════════════════════════════════════
// LE CHEMIN COMMERÇANT
//
// LA GARDE D'ABORD, ET AVANT DE LIRE LE FORMULAIRE. `gardeEditeurVitrine`
// tranche la session, le rôle et le droit `vitrine` avant qu'une clé de pack ne
// soit seulement regardée. C'est aussi elle qui fournit les DEUX valeurs que le
// client n'apporte jamais — l'organisation et l'acteur.
//
// L'ACTEUR VIENT DE LA SESSION, ET LA RPC LE REVÉRIFIE. `p_actor` reçoit
// `garde.userId` ; `set_bande_pack` le revérifie membre `owner|editor` EN SQL,
// parce que le geste est journalisé (`bande.pack_set`) et surtout parce qu'il
// peut ALLUMER LE PACK TAQUIN. Les deux vérifications ne font pas double emploi
// — celle-ci rend un message utile, celle-là tient la ligne d'audit.
//
// LA LECTURE, ELLE, N'EST PAS ICI : `loadBandePack` vit dans
// `src/lib/bande-context.ts`, parce que c'est une lecture de page et non une
// action. L'exposer en `"use server"` en aurait fait un point POST de plus,
// atteignable sans qu'aucun écran ne le rende (motif `loadDuoOptions`).
// ════════════════════════════════════════════════════════════

/**
 * Ce que rend `setBandePack`.
 *
 * `pack-inconnu` est un RÉSULTAT et non une panne, et il est REACHABLE malgré le
 * schéma : Zod refuse déjà tout ce qui n'est pas dans `BANDE_PACK_CLES`, donc la
 * 22023 ne peut plus signifier qu'une chose — la liste TypeScript et le `check`
 * SQL ont DIVERGÉ. C'est un état du dépôt, pas une faute du commerçant : lui
 * dire « une erreur est survenue » l'enverrait recliquer indéfiniment sur un
 * bouton qui ne peut pas marcher.
 */
export type SetBandePackOutcome =
  | { etat: "enregistre"; pack: string }
  | { etat: "pack-inconnu" };

/**
 * LE COMMERÇANT CHOISIT LE TON DE SON JEU.
 *
 * ── POURQUOI CE RÉGLAGE EST À L'ORGANISATION, ET PAS À L'HÔTE DE LA SALLE ──
 *
 * Arbitrage 5, et c'est la raison d'être de cette action : les questions
 * s'affichent sur un écran qui porte le nom du commerce, devant des gens qui ne
 * les ont pas choisies. Le commerçant doit pouvoir décider que le pack taquin
 * n'entre pas chez lui, et cette décision ne peut pas être révocable par le
 * premier client qui ouvre une salle.
 *
 * ── LE PACK EST COPIÉ AU DÉMARRAGE DES PARTIES ──
 *
 * Changer de pack ici ne change RIEN aux parties en cours : `bande_start` a
 * copié la clé dans `bande_parties`, précisément pour qu'une salle ne change pas
 * de ton entre sa question 3 et sa question 4. L'écran peut donc le dire sans
 * réserve — le nouveau pack vaut pour les prochaines tablées.
 */
export async function setBandePack(
  _prev: ActionResult<SetBandePackOutcome> | null,
  formData: FormData,
): Promise<ActionResult<SetBandePackOutcome>> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const parsed = bandePackSchema.safeParse({
    // DE LA SESSION. Seul le pack vient du formulaire, et il a été relu sur une
    // liste que le serveur a rendue.
    organizationId: garde.organizationId,
    pack: formData.get("pack"),
  });
  // Ce refus-là se corrige à l'écran, en choisissant un autre pack : il garde
  // son message.
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  return monitored("bande.pack_set", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("set_bande_pack", {
        p_organization_id: parsed.data.organizationId,
        p_pack: parsed.data.pack,
        p_actor: garde.userId,
      });
      if (error) {
        // 22023 — LE PACK, PAS LE TRANSPORT. Le schéma a déjà écarté toute clé
        // hors `BANDE_PACK_CLES`, donc ce code ne peut plus dire qu'une chose :
        // la liste TypeScript et le `check` SQL ont divergé. Le classement se
        // fait sur le CODE SQLSTATE, jamais sur le texte du message.
        if (error.code === "22023") {
          reportError("bande.pack_set.refus", error.message);
          return {
            ok: true as const,
            data: { etat: "pack-inconnu" } as const,
          };
        }
        // 42501 — la garde vient pourtant de passer. Il reste deux causes : le
        // commerçant a été rétrogradé entre la garde et l'appel, ou la clé de
        // service est mal configurée. La seconde rendrait « non autorisé » à
        // tout le monde et pour toujours sans qu'aucune alerte ne parte, d'où la
        // ligne d'observation (motif `setDuoOptions`).
        if (error.code === "42501") {
          reportError("bande.pack_set.refus", error.message);
          return { ok: false as const, error: NON_AUTORISE };
        }
        reportError("bande.pack_set", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      // LE PACK RENDU est le contenu de la réponse : le deviner — en réaffichant
      // ce que le formulaire portait — annoncerait un réglage qui n'a peut-être
      // pas été écrit.
      const pack = mapBandePackSaved(data);
      if (pack === null) return { ok: false as const, error: GENERIC_ERROR };

      revalidatePath("/dashboard/vitrine");
      return {
        ok: true as const,
        data: { etat: "enregistre", pack } as const,
      };
    } catch (err) {
      reportError("bande.pack_set", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}
