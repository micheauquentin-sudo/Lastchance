"use server";

import { revalidatePath } from "next/cache";

import {
  mapCloseLobbyAsOrg,
  mapCreateLobby,
  mapJoinLobby,
  mapKickLobby,
  mapLeaveLobby,
  mapLobbyState,
  mapLockLobby,
  type LeaveLobbyResult,
  type LobbyKind,
  type LobbyStateView,
} from "@/lib/lobby";
import {
  genererJetonLobby,
  hashLobbyToken,
  lireJetonLobby,
  observerPressionLobby,
  poserJetonLobby,
  resoudreCommerceLobby,
  resoudreLobbyParCode,
  supprimerJetonLobby,
} from "@/lib/lobby-context";
import { monitored, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";
import {
  closeOrgLobbySchema,
  createLobbySchema,
  joinLobbySchema,
  kickLobbySchema,
  lobbyIdSchema,
} from "@/lib/validations/lobby";
import { gardeEditeurVitrine } from "@/lib/vitrine-context";

// ════════════════════════════════════════════════════════════
// SOCLE DE LOBBY (L16) — ouvrir une salle, y entrer, la regarder vivre
//
// ── CONTRÔLE D'ABUS : CE QUI EXISTE, ET CE QUI A ÉTÉ ÉCARTÉ (ADR-109 §A4) ──
//
// §A4 nommait le seau IP « protection réelle contre l'abus » ; ADR-032
// interdit pourtant le refus sur clé partagée en parcours public. La tension
// est TRANCHÉE par l'amendement §A4 (revue L16, M-1) — la voici, honnête :
//   1. Seau IP-SEULE, ICI, en observabilité pure et fail-open (`lobbyIp`) —
//      il OBSERVE, il ne refuse pas.
//   2. Quota par organisation — EN SQL, sous verrou consultatif, dans
//      `create_player_lobby`, et DURCI : seules les salles habitées ou
//      récentes comptent. Il BORNE, il ne ferme pas : un attaquant qui
//      rejoint et verrouille sa propre salle tient une place pour trois
//      requêtes (E-1, contre-revue L16). Aucun prédicat sur une appartenance
//      attestée par cookie ne distingue N cookies de N personnes — le levier
//      n'est pas ici. Ce qui est fait : TTL verrouillé d'une heure, et le
//      commerçant voit et ferme ses salles. Ce qui reste à trancher est au
//      bilan (Turnstile ou failClosed sur la création seule).
//   3. TTL : trente minutes, UNE heure après verrouillage (ramené de quatre —
//      une partie dure quinze minutes, et quatre heures étaient devenues la
//      durée de vie d'une salle-squat), plafond dur de vingt-quatre heures en
//      `check`. En SQL également.
//   4. Plafond par cookie joueur — ÉCARTÉ. §A4 le dit décoratif : il ne protège
//      rien qu'un joueur motivé ne contourne en effaçant son cookie.
//
// ── AUCUN TURNSTILE, ET C'EST UNE DÉCISION, PAS UN OUBLI ──
//
// Le challenge anti-robot est opposé, partout ailleurs dans ce produit, sur les
// chemins qui DISTRIBUENT quelque chose : un lot, un code encaissable en caisse,
// une place limitée. Un lobby ne distribue RIEN — il est gratuit, il n'émet
// aucun code de retrait, et le remplir de faux joueurs ne prend rien à personne
// d'autre que ses onze voisins de salle. Y poser un Turnstile ferait payer une
// friction (et un tiers script) à tous les joueurs pour borner un abus dont le
// seul gain est de gêner une tablée de café. Les gardes actées sont l'IP, le
// quota et le TTL — elles suffisent, et §A4 les a arbitrées comme telles.
//
// ── LE REFUS EST INDISTINCT, ET IL LE RESTE ICI ──
//
// `unavailable` recouvre : slug malformé, adresse inconnue, droit `vitrine`
// fermé, code inventé, code expiré, salle close. Aucune action de ce fichier ne
// distingue ces causes — les séparer donnerait de quoi énumérer, six caractères
// à la fois, la vie sociale des commerces d'à côté.
//
// ── UN REFUS DOUX EST UN RÉSULTAT, PAS UNE PANNE ──
//
// « Salle complète », « porte fermée », « quota atteint », « indisponible » sont
// des issues NORMALES de gestes qui se sont parfaitement déroulés : la base a
// répondu, l'action a compris, il n'y a rien à réparer. Elles voyagent donc dans
// `data.etat`, TYPÉ, et `{ ok: false }` reste réservé aux vraies pannes — RPC en
// erreur, exception, saisie que le joueur peut corriger lui-même.
//
// Le canal a changé pour une raison précise : l'écran classait ces refus en
// cherchant des fragments dans le TEXTE du message (`components/lobby/refus.ts`,
// supprimé). Reformuler une phrase de ce fichier suffisait alors à faire
// retomber un refus dans le `else` générique, sans qu'aucun test ni aucun
// typecheck ne le signale. Le discriminant est maintenant un littéral que le
// compilateur suit d'un bout à l'autre.
// ════════════════════════════════════════════════════════════

const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
/** LA phrase du refus indistinct — ce qu'il en reste : `lockLobby`. */
const INDISPONIBLE = "Cette salle n'est pas disponible.";

/**
 * LE refus indistinct, sous sa forme typée. Une seule valeur, partagée par
 * toutes les causes, et assignable aux deux contrats ci-dessous.
 */
const REFUS_INDISPONIBLE = {
  ok: true,
  data: { etat: "indisponible" },
} as const;

/**
 * Ce que rend `createLobby` : une salle ouverte, ou l'une des deux façons de ne
 * pas en ouvrir. `quota` se distingue d'`indisponible` parce qu'il appelle un
 * geste différent — réessayer plus tard, plutôt que renoncer.
 */
export type CreateLobbyOutcome =
  | { etat: "cree"; lobbyId: string; joinCode: string }
  | { etat: "quota" }
  | { etat: "indisponible" };

/**
 * OUVRIR UNE SALLE depuis la vitrine d'un commerce.
 *
 * L'hôte est membre de sa propre salle (invariant de `create_player_lobby`), et
 * c'est son cookie — posé APRÈS la création — qui lui donnera plus tard le droit
 * de verrouiller et de voir le code de partage.
 *
 * `joinCode` EST rendu à l'appelant : il vient d'être créé par lui, et c'est la
 * seule chose qu'il ait à montrer à sa tablée. Ce qui n'est jamais rendu, c'est
 * le JETON — il reste dans le cookie httpOnly.
 */
export async function createLobby(
  _prev: ActionResult<CreateLobbyOutcome> | null,
  formData: FormData,
): Promise<ActionResult<CreateLobbyOutcome>> {
  const parsed = createLobbySchema.safeParse({
    slug: formData.get("slug"),
    kind: formData.get("kind"),
    capacite: formData.get("capacite"),
    pseudo: formData.get("pseudo"),
  });
  // Un slug malformé ne se distingue pas d'un slug inconnu : les deux sont LE
  // MÊME résultat `indisponible`, et pas une panne — l'adresse vient de l'URL,
  // le joueur n'a rien à y corriger. Les autres champs, eux, sont SAISIS par
  // lui : leur message lui appartient, se corrige au clavier, et ne trahit rien
  // du commerce — donc `{ ok: false }`.
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === "slug") return REFUS_INDISPONIBLE;
    return { ok: false, error: issue.message };
  }

  // LE SEAU AVANT TOUT, et avant la moindre lecture en base : `slug` vient du
  // client, donc une rafale qui boucle sur des adresses inventées n'atteint
  // jamais un commerce résolu. Un compteur posé après la résolution ne verrait
  // rien d'elle — c'est-à-dire exactement le balayage qu'il existe pour rendre
  // visible (motif `reserverPageIpCeiling`, wagon 7).
  await observerPressionLobby("create");

  return monitored("lobby.create", () => createLobbyInner(parsed.data));
}

async function createLobbyInner(parsed: {
  slug: string;
  kind: LobbyKind;
  capacite: number;
  pseudo: string;
}): Promise<ActionResult<CreateLobbyOutcome>> {
  try {
    const commerce = await resoudreCommerceLobby(parsed.slug);
    if (!commerce) return REFUS_INDISPONIBLE;

    // Le jeton est fabriqué AVANT l'appel — la RPC en a besoin pour inscrire
    // l'hôte comme premier membre — mais le cookie n'est posé qu'après.
    const token = genererJetonLobby();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_player_lobby", {
      p_organization_id: commerce.organizationId,
      p_kind: parsed.kind,
      p_capacite: parsed.capacite,
      p_creator_token_hash: hashLobbyToken(token),
      p_pseudo: parsed.pseudo,
    });
    if (error) {
      reportError("lobby.create", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapCreateLobby(data);
    if (result.state === "quota") return { ok: true, data: { etat: "quota" } };
    if (result.state !== "created") return REFUS_INDISPONIBLE;

    await poserJetonLobby(result.lobbyId, token);
    return {
      ok: true,
      data: {
        etat: "cree",
        lobbyId: result.lobbyId,
        joinCode: result.joinCode,
      },
    };
  } catch (err) {
    reportError("lobby.create", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Ce que rend `joinLobby` : une place obtenue, ou l'une des trois façons de ne
 * pas entrer. `complet` et `verrouille` sont distincts d'`indisponible` parce
 * que la base les distingue déjà — et parce qu'ils appellent des gestes
 * différents (demander une salle plus grande, ou constater que la partie a
 * commencé sans vous).
 */
export type JoinLobbyOutcome =
  | {
      etat: "joined";
      lobbyId: string;
      kind: LobbyKind;
      capacite: number;
      rang: number;
    }
  | { etat: "complet" }
  | { etat: "verrouille" }
  | { etat: "indisponible" };

/**
 * ENTRER PAR LE CODE.
 *
 * Aucune organisation n'est demandée ni résolue : `join_code` est unique sur
 * toute la table, donc il désigne son locataire à lui seul. Exiger le commerce
 * obligerait l'écran à le connaître avant d'avoir résolu le code — c'est-à-dire
 * à le deviner.
 *
 * IDEMPOTENT : rejouer le même code avec le même cookie rend la même place, au
 * caractère près. Le double-clic sur « rejoindre » ne crée pas deux membres, et
 * le cookie n'est réécrit que s'il n'existait pas.
 */
export async function joinLobby(
  _prev: ActionResult<JoinLobbyOutcome> | null,
  formData: FormData,
): Promise<ActionResult<JoinLobbyOutcome>> {
  const parsed = joinLobbySchema.safeParse({
    code: formData.get("code"),
    pseudo: formData.get("pseudo"),
  });
  // Un code MALFORMÉ rend le même refus qu'un code inventé — c'est le contrat
  // de `join_player_lobby`, et le trahir ici donnerait un oracle sur l'alphabet
  // et la longueur des codes qui ont existé.
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === "code") return REFUS_INDISPONIBLE;
    return { ok: false, error: issue.message };
  }

  // Même raison que `createLobby` : le code vient du client, et c'est une rafale
  // sur des codes inventés que ce compteur doit rendre visible.
  await observerPressionLobby("join");

  return monitored("lobby.join", () => joinLobbyInner(parsed.data));
}

async function joinLobbyInner(parsed: {
  code: string;
  pseudo: string;
}): Promise<ActionResult<JoinLobbyOutcome>> {
  try {
    // ── RÉSOUDRE LA SALLE AVANT D'ÉCRIRE, ET C'EST L'IDEMPOTENCE QUI L'EXIGE ──
    //
    // Motif exact de `joinEvent`. Le cookie est keyé par l'identifiant de la
    // salle : sans le connaître, on ne peut pas RELIRE celui qui existe déjà, on
    // ne peut qu'en fabriquer un neuf. Or l'idempotence de `join_player_lobby`
    // tient sur `(lobby, token_hash)` — un jeton neuf est un membre neuf. Un
    // double-clic sur « rejoindre » aurait donc mangé deux places d'une salle
    // qui en compte deux à douze, et personne n'aurait vu passer d'erreur.
    //
    // MÊME RÉSOLVEUR QUE LA PAGE, et c'est le point : une seule définition de
    // « ce code mène quelque part » (statut ouvrable ET non expiré). Deux
    // requêtes différentes auraient fini par diverger, et l'écart se serait vu
    // comme un écran de salon peint sur une salle que l'action refuse.
    const salle = await resoudreLobbyParCode(parsed.code);
    if (!salle) return REFUS_INDISPONIBLE;
    const lobbyId = salle.lobbyId;

    const admin = createAdminClient();

    // Le jeton existant est RÉUTILISÉ tel quel : re-rejoindre la même salle,
    // c'est y être déjà. Sinon on en fabrique un, posé seulement en cas de
    // succès (plus bas), pour ne pas laisser un cookie orphelin sur une salle
    // pleine ou close.
    const existant = await lireJetonLobby(lobbyId);
    const token = existant ?? genererJetonLobby();

    const { data, error } = await admin.rpc("join_player_lobby", {
      p_join_code: parsed.code,
      p_token_hash: hashLobbyToken(token),
      p_pseudo: parsed.pseudo,
    });
    if (error) {
      reportError("lobby.join", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapJoinLobby(data);
    if (result.state === "full") return { ok: true, data: { etat: "complet" } };
    if (result.state === "locked") {
      return { ok: true, data: { etat: "verrouille" } };
    }
    if (result.state !== "joined") return REFUS_INDISPONIBLE;

    if (!existant) await poserJetonLobby(result.lobbyId, token);
    return {
      ok: true,
      data: {
        etat: "joined",
        lobbyId: result.lobbyId,
        kind: result.kind,
        capacite: result.capacite,
        rang: result.rang,
      },
    };
  } catch (err) {
    reportError("lobby.join", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * L'ÉTAT DE LA SALLE — l'action que l'écran rappelle toutes les trois secondes.
 *
 * ── RÉPONSE PURE : AUCUN `revalidatePath`, ET C'EST LE POINT ──
 *
 * C'est une LECTURE, appelée en boucle par chaque téléphone de la table. Y
 * poser une revalidation ferait purger le cache de la route à chaque tic, pour
 * tous les visiteurs, à cause d'un sondage qui n'écrit rien. Cette action ne
 * renvoie donc qu'un document, et ne touche à rien.
 *
 * ── PAS DE COMPTEUR DE PRESSION ICI NON PLUS ──
 *
 * Verser un sondage à trois secondes dans `lobbyIp` noierait le seul signal que
 * ce seau existe pour porter — une rafale d'OUVERTURE de salles. Quatre écrans
 * laissés ouverts produisent 4 800 lectures en dix minutes, huit fois le seuil,
 * sans le moindre abus. C'est la distinction que `jackpotStateIp` et
 * `reserverPageIp` tiennent déjà entre lire et faire ; ici, plutôt qu'une série
 * de plus, la borne est la salle elle-même : sans le cookie de CETTE salle,
 * cette action ne lit rien et ne touche pas la base.
 *
 * SANS COOKIE, AUCUN APPEL : `lobby_state` exige une empreinte membre, et lui en
 * fabriquer une pour regarder une salle écrirait une identité à quelqu'un qui
 * n'a rien rejoint (motif `getQueuePublicState`).
 */
export async function getLobbyState(lobbyId: string): Promise<LobbyStateView> {
  const parsed = lobbyIdSchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("lobby_state", {
      p_lobby_id: parsed.data.lobbyId,
      p_token_hash: hashLobbyToken(token),
    });
    if (error) {
      reportError("lobby.state", error.message);
      return { state: "unavailable" };
    }
    return mapLobbyState(data);
  } catch (err) {
    reportError("lobby.state", err);
    return { state: "unavailable" };
  }
}

/**
 * FERMER LA PORTE — réservé à l'hôte, et c'est la base qui le tient.
 *
 * `lock_player_lobby` compare `p_creator_token_hash` à la colonne de la ligne :
 * un membre ordinaire qui appellerait cette action présenterait son propre
 * jeton et recevrait `unavailable`. Rien n'est donc vérifié ici — le faire
 * dupliquerait un arbitrage déjà rendu, et la copie finirait par diverger.
 *
 * LE REFUS EST UN SEUL MOT, y compris pour « vous êtes encore seul » : `lock`
 * est le FILET, pas le message. L'écran sait avant de cliquer qu'il doit
 * désactiver le bouton, puisque `getLobbyState` lui rend déjà la liste des
 * membres.
 */
export async function lockLobby(
  lobbyId: string,
): Promise<ActionResult<{ expiresAt: string }>> {
  const parsed = lobbyIdSchema.safeParse({ lobbyId });
  if (!parsed.success) return { ok: false, error: INDISPONIBLE };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { ok: false, error: INDISPONIBLE };

  return monitored("lobby.lock", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("lock_player_lobby", {
        p_lobby_id: parsed.data.lobbyId,
        p_creator_token_hash: hashLobbyToken(token),
      });
      if (error) {
        reportError("lobby.lock", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      const result = mapLockLobby(data);
      return result.state === "locked"
        ? { ok: true as const, data: { expiresAt: result.expiresAt } }
        : { ok: false as const, error: INDISPONIBLE };
    } catch (err) {
      reportError("lobby.lock", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}

/**
 * SORTIR.
 *
 * Deux issues seulement, et `left` est de très loin la plus large : salle
 * inconnue, jeton non membre, salle déjà close — tout cela est une sortie.
 * `locked` est la seule exception : l'hôte a fermé la porte, on ne sort plus.
 *
 * SANS COOKIE, C'EST `left` SANS APPEL : ne pas être dans une salle est le
 * résultat que cette action produit. Répondre autre chose laisserait un écran
 * croire qu'il y est encore.
 *
 * LE COOKIE EST EFFACÉ AVEC LA SORTIE, et c'est ce qui rend la sortie visible :
 * la page décide quel écran peindre en regardant ce cookie, donc le laisser en
 * place ferait revenir le partant dans une salle d'attente où `lobby_state` ne
 * le reconnaît plus. Seul `locked` y échappe — la porte est fermée, on n'est pas
 * sorti, et jeter l'identité laisserait un membre sans titre dans sa propre
 * salle.
 */
export async function leaveLobby(
  lobbyId: string,
): Promise<ActionResult<LeaveLobbyResult>> {
  const parsed = lobbyIdSchema.safeParse({ lobbyId });
  if (!parsed.success) return { ok: true, data: { state: "left" } };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { ok: true, data: { state: "left" } };

  return monitored("lobby.leave", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("leave_player_lobby", {
        p_lobby_id: parsed.data.lobbyId,
        p_token_hash: hashLobbyToken(token),
      });
      if (error) {
        reportError("lobby.leave", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }
      const result = mapLeaveLobby(data);
      if (result.state === "left") {
        await supprimerJetonLobby(parsed.data.lobbyId);
      }
      return { ok: true as const, data: result };
    } catch (err) {
      reportError("lobby.leave", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}

/**
 * Ce que rend `kickLobbyMember` : une place libérée, une place qui l'était déjà,
 * ou le refus indistinct. Les deux premiers SONT des succès — l'état voulu par
 * l'hôte est atteint dans les deux cas — et ils restent malgré tout distincts
 * parce que la base les distingue, et parce qu'un retrait qui n'a rien retiré
 * mérite d'être visible en supervision plutôt que confondu avec un retrait.
 */
export type KickLobbyOutcome =
  | { etat: "retire" }
  | { etat: "deja-parti" }
  | { etat: "indisponible" };

/**
 * RETIRER UNE PLACE — l'hôte récupère un siège pris par erreur.
 *
 * ── C'EST LE JETON DE L'HÔTE QUI PART, JAMAIS CELUI DE LA CIBLE ──
 *
 * `p_creator_token_hash` reçoit le jeton du COOKIE DE L'APPELANT : c'est lui
 * qui doit prouver qu'il est le créateur de cette salle, et c'est la seule
 * chose que la RPC vérifie. La cible, elle, est désignée par son RANG — le
 * nombre que l'hôte a sous les yeux dans `lobby_state`, qui ne lui rend jamais
 * l'empreinte de personne (propriétés STATE-7 / STATE-8 du lot). Envoyer ici le
 * jeton d'un autre membre serait à la fois impossible (l'application ne le
 * possède pas) et le contraire de ce que la garde mesure.
 *
 * ── SANS COOKIE, AUCUN APPEL ──
 *
 * Motif de `lockLobby` et `getLobbyState` : sans jeton de CETTE salle, il n'y a
 * pas d'hôte à présenter, et fabriquer une empreinte pour l'occasion écrirait
 * une identité à quelqu'un qui n'a rien ouvert. Le refus est rendu ici, sans
 * toucher la base.
 *
 * ── LE RANG EST VALIDÉ AVANT LE DÉPART, ET C'EST TOUT L'OBJET DU SCHÉMA ──
 *
 * `kick_player_lobby` lève une 22023 sur un rang nul ou < 1. Une exception
 * n'est pas un refus : elle remonterait en panne générique là où il n'y a rien
 * à réparer. `kickLobbySchema` la rend impossible à provoquer.
 *
 * ── LE RANG SE DÉCALE, ET L'APPELANT DOIT RELIRE ──
 *
 * Retirer le rang 2 fait REMONTER l'ancien rang 3 à la place 2. Rejouer cette
 * action avec un rang lu sur une liste d'avant retirerait donc CELLE QUI A PRIS
 * LA PLACE. Rien ici ne peut l'empêcher — le rang est un ordre, pas un
 * identifiant, et c'est la propriété que la base crée. L'écran relit
 * `lobby_state` entre deux retraits (voir `salon-lobby.tsx`).
 */
export async function kickLobbyMember(
  lobbyId: string,
  rang: number,
): Promise<ActionResult<KickLobbyOutcome>> {
  const parsed = kickLobbySchema.safeParse({ lobbyId, rang });
  if (!parsed.success) return REFUS_INDISPONIBLE;

  // LE JETON DE L'HÔTE — celui du cookie de cette salle, porté par l'appelant.
  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return REFUS_INDISPONIBLE;

  return monitored("lobby.kick", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("kick_player_lobby", {
        p_lobby_id: parsed.data.lobbyId,
        p_creator_token_hash: hashLobbyToken(token),
        p_rang: parsed.data.rang,
      });
      if (error) {
        reportError("lobby.kick", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      // Non-créateur, salle verrouillée, close, morte, ou rang de l'hôte : un
      // seul mot pour les cinq. Les séparer apprendrait à un membre ordinaire,
      // par la différence entre « refusé » et « rang vide », qui se trouve dans
      // une salle dont la base lui refuse justement la liste.
      const result = mapKickLobby(data);
      if (result.state !== "ok") return REFUS_INDISPONIBLE;
      return {
        ok: true as const,
        data: result.kicked
          ? ({ etat: "retire" } as const)
          : ({ etat: "deja-parti" } as const),
      };
    } catch (err) {
      reportError("lobby.kick", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}

/**
 * Ce que rend `closeOrgLobby` : une salle fermée, une salle qui l'était déjà, ou
 * le refus indistinct. Les deux premiers SONT des succès — l'état voulu par le
 * commerçant est atteint — et ils restent distincts parce que la base les
 * distingue, et parce qu'une fermeture qui n'a rien fermé signale un écran en
 * retard sur la base plutôt qu'un geste effectif.
 */
export type CloseOrgLobbyOutcome =
  | { etat: "ferme" }
  | { etat: "deja-ferme" }
  | { etat: "indisponible" };

/**
 * LE COMMERÇANT FERME UNE SALLE DE CHEZ LUI — contrepartie du finding E-1.
 *
 * ── POURQUOI CE GESTE EXISTE ──
 *
 * Le quota par organisation BORNE l'abus, il ne le ferme pas : un attaquant qui
 * ouvre une salle, y entre avec son propre code et la verrouille tient une place
 * pour trois requêtes, jusqu'à l'expiration. Le TTL raccourci (une heure après
 * verrouillage) réduit la fenêtre ; celle-ci la referme À LA DEMANDE. Sans ce
 * geste, le déni serait subi et invisible — avec lui, il est visible
 * (`loadOrgLobbies`) et RÉVERSIBLE, et chaque fermeture rend immédiatement sa
 * place au quota, sans attendre aucun cron.
 *
 * ── LA GARDE D'ABORD, ET AVANT DE LIRE LE FORMULAIRE ──
 *
 * `gardeEditeurVitrine` tranche la session et le rôle avant que `lobby_id` ne
 * soit seulement regardé : un appelant sans droit ne doit pas apprendre, par la
 * différence entre « non autorisé » et « identifiant invalide », qu'une salle
 * existe. C'est aussi elle qui fournit les DEUX valeurs que le client ne fournit
 * jamais — l'organisation et l'acteur.
 *
 * ── L'ACTEUR VIENT DE LA SESSION, ET LA RPC LE REVÉRIFIE ──
 *
 * `p_actor` reçoit `garde.userId`. La RPC ne le croit pas sur parole : elle le
 * revérifie membre `owner|editor` EN SQL, parce que le geste est journalisé
 * (`lobby.closed_by_org`). Les deux vérifications ne font pas double emploi —
 * celle-ci rend un message utile, celle-là tient la ligne d'audit.
 *
 * ── LE 42501 EST UN RÉSULTAT, PAS UNE PANNE ──
 *
 * La RPC refuse d'un seul mot — acteur non habilité, salle inconnue, salle d'un
 * AUTRE locataire — pour ne pas donner à un commerçant un compteur d'activité de
 * ses voisins, une requête à la fois. Le cas le plus banal est bénin : la salle
 * a été purgée entre l'affichage de la liste et le clic. Le remonter en panne
 * ferait remplir la supervision d'erreurs que personne n'a à réparer, donc il
 * rend `indisponible` — mais il laisse quand même une ligne d'OBSERVATION,
 * parce que le même code couvre « l'appelant n'est pas `service_role` » : une
 * clé mal configurée serait sinon indiscernable d'une course, et muette.
 *
 * ── LA REVALIDATION VAUT AUSSI POUR `deja-ferme` ──
 *
 * C'est même le cas où elle sert le plus : la ligne cliquée ne correspond plus à
 * rien en base, donc l'écran est en retard, et c'est exactement ce qu'un
 * rafraîchissement corrige. Ne revalider que sur `closed` aurait laissé la ligne
 * fantôme à l'écran précisément quand elle est fantôme.
 */
export async function closeOrgLobby(
  _prev: ActionResult<CloseOrgLobbyOutcome> | null,
  formData: FormData,
): Promise<ActionResult<CloseOrgLobbyOutcome>> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const parsed = closeOrgLobbySchema.safeParse({
    // DE LA SESSION, tous les deux. Seul `lobby_id` vient du formulaire, et il
    // a été relu sur une liste que le serveur a rendue.
    organizationId: garde.organizationId,
    lobbyId: formData.get("lobby_id"),
  });
  if (!parsed.success) return REFUS_INDISPONIBLE;

  return monitored("lobby.close_as_org", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("close_player_lobby_as_org", {
        p_organization_id: parsed.data.organizationId,
        p_lobby_id: parsed.data.lobbyId,
        p_actor: garde.userId,
      });
      if (error) {
        if (error.code === "42501") {
          // TRACÉ SANS ÊTRE UNE PANNE. Le refus est bénin dans son cas
          // ordinaire (salle purgée entre l'affichage et le clic), mais 42501
          // recouvre AUSSI « l'appelant n'est pas `service_role` » — c'est-à-dire
          // une clé de service mal configurée, qui se lirait alors « salon
          // indisponible » pour tout le monde et pour toujours, sans qu'aucune
          // alerte ne parte (contre-revue L16, INFO). Une ligne d'observation
          // coûte peu ; une rafale de ces lignes est le seul signal qui
          // distinguerait la panne de la course.
          reportError("lobby.close_as_org.refus", error.message);
          return REFUS_INDISPONIBLE;
        }
        reportError("lobby.close_as_org", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      const result = mapCloseLobbyAsOrg(data);
      if (result.state !== "ok") return REFUS_INDISPONIBLE;

      revalidatePath("/dashboard/vitrine");
      return {
        ok: true as const,
        data: result.closed
          ? ({ etat: "ferme" } as const)
          : ({ etat: "deja-ferme" } as const),
      };
    } catch (err) {
      reportError("lobby.close_as_org", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}
