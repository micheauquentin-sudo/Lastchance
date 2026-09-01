"use server";

import { revalidatePath } from "next/cache";

import {
  mapDuoChoose,
  mapDuoOptionsSaved,
  mapDuoStart,
  mapDuoState,
  mapDuoSuggestionSaved,
  type DuoStartResult,
  type DuoStateView,
} from "@/lib/duo";
import { hashLobbyToken, lireJetonLobby } from "@/lib/lobby-context";
import { monitored, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";
import { gardeEditeurJeuSalon } from "@/lib/salon-garde";
import { createClient } from "@/lib/supabase/server";
import {
  duoChooseSchema,
  duoLobbySchema,
  duoPlateauSchema,
  duoSuggestionSchema,
  type DuoPlaceEntree,
} from "@/lib/validations/duo";

// ════════════════════════════════════════════════════════════
// DUO MIROIR (L17) — deux choix scellés, une révélation simultanée
//
// ── L'IDENTITÉ EST CELLE DE LA SALLE, ET C'EST LA SEULE QUI OUVRE QUOI QUE CE
//    SOIT ──
//
// Les trois RPC de jeu exigent le hash du jeton PAR LOBBY posé par L16 :
// `lireJetonLobby(lobbyId)` puis `hashLobbyToken(...)`, tous deux importés de
// `@/lib/lobby-context`. L'identité GLOBALE `lc-player` n'est ni lue, ni
// recopiée, ni envoyée — et ce n'est pas un détail d'implémentation :
//
//   · c'est la propriété que L16 achète (un téléphone prêté le temps d'une
//     partie ne lie pas deux identités, et la base ne peut pas recoudre les
//     salles entre elles) ;
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
// ── AUCUN `revalidatePath` SUR LES CHEMINS JOUEUR ──
//
// Les trois actions de jeu sont appelées EN BOUCLE par deux téléphones posés sur
// la même table. Y poser une revalidation purgerait le cache de la route à
// chaque tic, pour tous les visiteurs, à cause d'un sondage. Le chemin
// commerçant, lui, revalide : il écrit une configuration qu'un écran rendu par
// le serveur affiche.
//
// ── AUCUN SEAU DE PRESSION NON PLUS ──
//
// Motif `getLobbyState` : verser un sondage à deux secondes dans `lobbyIp`
// noierait le seul signal que ce seau existe pour porter — une rafale
// d'OUVERTURE de salles. La borne de ces chemins est la salle elle-même : sans
// le cookie de CETTE salle, rien n'est lu et la base n'est pas touchée.
//
// ── UN REFUS DOUX EST UN RÉSULTAT, PAS UNE PANNE ──
//
// « Déjà scellé », « plateau non configuré », « indisponible » sont des issues
// NORMALES de gestes qui se sont parfaitement déroulés : la base a répondu,
// l'action a compris, il n'y a rien à réparer. Elles voyagent donc dans un
// littéral TYPÉ que le compilateur suit d'un bout à l'autre — jamais dans le
// texte d'un message, que reformuler suffirait à faire retomber dans le `else`
// générique d'un écran sans qu'aucun test ne bronche (leçon de L16,
// `components/lobby/refus.ts`, supprimé).
// ════════════════════════════════════════════════════════════

const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const NON_AUTORISE = "Action non autorisée";

/**
 * LE refus indistinct du chemin joueur, sous sa forme typée. Une seule valeur,
 * partagée par toutes les causes : salle inconnue, non-membre, salle close,
 * manche absente, fiche hors plateau. Les séparer donnerait de quoi sonder,
 * un identifiant à la fois, les parties des tables d'à côté.
 */
const REFUS_INDISPONIBLE = {
  ok: true,
  data: { etat: "indisponible" },
} as const;

// ════════════════════════════════════════════════════════════
// LE CHEMIN JOUEUR
// ════════════════════════════════════════════════════════════

/**
 * OUVRIR — OU RETROUVER — LE PLATEAU.
 *
 * IDEMPOTENTE, et c'est la base qui le tient : deux téléphones qui appellent à
 * la même seconde obtiennent LA MÊME manche (verrou consultatif sur la clé du
 * lobby, plus `unique (lobby_id)`). L'écran peut donc l'appeler à l'ouverture
 * sans se demander lequel des deux joueurs est arrivé le premier.
 *
 * ── RÉPONSE PURE : AUCUN `revalidatePath` ──
 *
 * Motif `getLobbyState`. L'action ÉCRIT pourtant, la première fois — mais elle
 * n'écrit rien qu'une page rendue par le serveur affiche, et elle est appelée
 * par chaque téléphone de la table. Revalider ferait payer à tous les visiteurs
 * du commerce le prix d'une manche qui s'ouvre.
 *
 * ── ELLE EST `monitored`, CONTRAIREMENT AU SONDAGE ──
 *
 * C'est le seul chemin de ce fichier qui INSÈRE une ligne, et il n'est parcouru
 * qu'une poignée de fois par partie. `getDuoState`, lui, tourne toutes les deux
 * secondes : l'instrumenter noierait la trace sous des lectures identiques.
 */
export async function startDuo(lobbyId: string): Promise<DuoStartResult> {
  const parsed = duoLobbySchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  // LE JETON DE CETTE SALLE — jamais l'identité globale. Voir l'en-tête.
  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  return monitored("duo.start", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("duo_start", {
        p_lobby_id: parsed.data.lobbyId,
        p_token_hash: hashLobbyToken(token),
      });
      if (error) {
        reportError("duo.start", error.message);
        return { state: "unavailable" as const };
      }
      return mapDuoStart(data);
    } catch (err) {
      reportError("duo.start", err);
      return { state: "unavailable" as const };
    }
  });
}

/**
 * Ce que rend `chooseDuo`.
 *
 * ── `deja-scelle` N'EST PAS `scelle`, ET LE RENOMMAGE EST DÉLIBÉRÉ ──
 *
 * Le contrat SQL emploie le mot deux fois, pour deux choses opposées : la clé
 * `scelle: true` d'un `ok` annonce un SUCCÈS (votre choix est scellé), tandis
 * que l'état `{"state":"scelle"}` est un REFUS (vous aviez déjà scellé un autre
 * item, et rien n'a été écrit). Laisser le mot voyager tel quel jusqu'à l'écran
 * aurait posé un piège à la première personne qui écrirait `if (etat ===
 * "scelle")` en pensant à l'un des deux.
 *
 * `revelee` accompagne le succès parce qu'il décide de l'écran suivant : c'est
 * le second sceau qui déclenche la révélation, DANS LA MÊME TRANSACTION. Celui
 * qui l'a posé n'a donc pas à attendre un sondage pour l'apprendre.
 */
export type ChooseDuoOutcome =
  | { etat: "scelle"; revelee: boolean }
  | { etat: "deja-scelle" }
  | { etat: "indisponible" };

/**
 * SCELLER SON CHOIX — immuable, et c'est tout l'objet du jeu.
 *
 * ── RIEN N'EST VÉRIFIÉ ICI DE CE QUE LA BASE VÉRIFIE ──
 *
 * Ni l'appartenance, ni le statut de la salle, ni le fait que la fiche soit sur
 * le plateau, ni qu'un choix ait déjà été scellé. Les cinq gardes sont dans
 * `duo_choose`, sous le verrou consultatif, et les rejouer côté application
 * dupliquerait des arbitrages déjà rendus — des copies qui finiraient par
 * diverger, et qui trancheraient hors du verrou, c'est-à-dire sur un état
 * périmé.
 *
 * ── LE DOUBLE-CLIC EST IDEMPOTENT, LE CHANGEMENT D'AVIS NE L'EST PAS ──
 *
 * Rejouer le MÊME item rend `ok` ; en désigner un AUTRE rend `deja-scelle` et
 * n'écrit rien. C'est ce qui empêche d'attendre que `autreAChoisi` passe à vrai
 * pour changer d'avis — l'écran ne doit donc PAS proposer de « modifier », il
 * doit montrer un choix figé.
 */
export async function chooseDuo(
  _prev: ActionResult<ChooseDuoOutcome> | null,
  formData: FormData,
): Promise<ActionResult<ChooseDuoOutcome>> {
  const parsed = duoChooseSchema.safeParse({
    lobbyId: formData.get("lobby_id"),
    itemId: formData.get("item_id"),
  });
  // Ces deux valeurs sont RELUES sur un plateau que le serveur a rendu, jamais
  // saisies au clavier : un identifiant malformé vient d'un appelant qui s'est
  // trompé de forme, et il rend le même refus muet qu'une fiche hors plateau.
  if (!parsed.success) return REFUS_INDISPONIBLE;

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return REFUS_INDISPONIBLE;

  return monitored("duo.choose", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("duo_choose", {
        p_lobby_id: parsed.data.lobbyId,
        p_token_hash: hashLobbyToken(token),
        p_item_id: parsed.data.itemId,
      });
      if (error) {
        reportError("duo.choose", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      const result = mapDuoChoose(data);
      if (result.state === "scelle") {
        return { ok: true as const, data: { etat: "deja-scelle" } as const };
      }
      if (result.state !== "ok") return REFUS_INDISPONIBLE;
      return {
        ok: true as const,
        data: { etat: "scelle", revelee: result.revelee } as const,
      };
    } catch (err) {
      reportError("duo.choose", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}

/**
 * L'ÉTAT DE LA MANCHE — l'action que l'écran rappelle en boucle.
 *
 * ── RÉPONSE PURE, ET LE CŒUR ANTI-TRICHE EST EN FACE ──
 *
 * Cette action ne filtre RIEN : c'est `duo_state` qui décide de ce qui existe
 * dans le document, et tant que la manche est ouverte, le choix de l'autre n'y
 * est pas. Un filtrage posé ici serait un filtrage posé APRÈS le transport —
 * c'est-à-dire un choix qui a déjà quitté la base, visible d'un onglet
 * « réseau ». `mapDuoState` redouble la garde par prudence (voir son en-tête),
 * il ne la remplace pas.
 *
 * NI `monitored`, NI SEAU, NI REVALIDATION : voir l'en-tête du fichier.
 */
export async function getDuoState(lobbyId: string): Promise<DuoStateView> {
  const parsed = duoLobbySchema.safeParse({ lobbyId });
  if (!parsed.success) return { state: "unavailable" };

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return { state: "unavailable" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("duo_state", {
      p_lobby_id: parsed.data.lobbyId,
      p_token_hash: hashLobbyToken(token),
    });
    if (error) {
      reportError("duo.state", error.message);
      return { state: "unavailable" };
    }
    return mapDuoState(data);
  } catch (err) {
    reportError("duo.state", err);
    return { state: "unavailable" };
  }
}

// ════════════════════════════════════════════════════════════
// LE CHEMIN COMMERÇANT
//
// LA GARDE D'ABORD, ET AVANT DE LIRE LE FORMULAIRE. `gardeEditeurJeuSalon("duo")`
// tranche la session, le rôle et le droit `duo` avant qu'un identifiant de
// fiche ne soit seulement regardé : un appelant sans droit ne doit pas
// apprendre, par la différence entre « non autorisé » et « fiche inconnue »,
// que quelque chose existe. C'est aussi elle qui fournit les DEUX valeurs que le
// client n'apporte jamais — l'organisation et l'acteur.
//
// C'ÉTAIT `gardeEditeurVitrine` JUSQU'À DUO-3b, et le droit exigé était celui
// de la Vitrine. DUO-2 vend le Duo seul : un commerçant qui l'achetait sans la
// carte se voyait refuser l'écriture de son propre plateau, avec un message qui
// lui parlait d'un produit qu'il n'avait pas cherché à acheter.
//
// L'ACTEUR VIENT DE LA SESSION, ET LES RPC LE REVÉRIFIENT. `p_actor` reçoit
// `garde.userId` ; `set_duo_options` et `set_duo_suggestion` le revérifient
// membre `owner|editor` EN SQL, parce que les deux gestes sont journalisés
// (`duo.options_set`, `duo.suggestion_set`). Les deux vérifications ne font pas
// double emploi — celle-ci rend un message utile, celle-là tient la ligne
// d'audit.
//
// LA LECTURE, ELLE, N'EST PAS ICI : `loadDuoOptions` vit dans
// `src/lib/duo-context.ts`, parce que c'est une lecture de page et non une
// action. L'exposer en `"use server"` en aurait fait un point POST de plus,
// atteignable sans qu'aucun écran ne le rende (motif `loadOrgLobbies`).
// ════════════════════════════════════════════════════════════

/**
 * Ce que rend `setDuoOptions`.
 *
 * `selection-refusee` est un RÉSULTAT et non une panne : le cas ordinaire est
 * qu'une fiche ait été supprimée de la carte entre le moment où l'écran a été
 * peint et le moment où le commerçant a validé. Il n'y a rien à réparer, il y a
 * un écran à rafraîchir — et le lui dire en « une erreur est survenue »
 * l'enverrait chercher une panne qui n'existe pas.
 */
export type SetDuoOptionsOutcome =
  | { etat: "enregistre"; options: number }
  | { etat: "selection-refusee" };

/**
 * LES PLACES POSTÉES — un champ RÉPÉTÉ, préfixé par son origine.
 *
 * L'écran poste `places` autant de fois qu'il a de places composées, chacune
 * sous la forme `fiche:<uuid>` ou `libelle:<texte>`. Le préfixe est nécessaire
 * depuis DUO-1 : une place est SOIT une fiche de la carte, SOIT un libellé
 * saisi, et un champ nu ne saurait plus dire laquelle des deux.
 *
 * ── TOUJOURS PAS DE JSON, ET POUR LA RAISON D'AVANT ──
 *
 * `JSON.parse` peut lever avant que Zod n'ait vu quoi que ce soit, et il
 * faudrait alors inventer une issue pour « le formulaire n'était pas du JSON » —
 * une phrase que le commerçant ne peut ni comprendre ni corriger. Un `indexOf`
 * suivi de deux `slice` ne lève jamais. La coupe se fait sur le PREMIER
 * deux-points, si bien qu'un libellé qui en contient (« Menu du jour : entrée,
 * plat ») traverse intact.
 *
 * ── L'ORDRE EST CELUI DU DOM, ET C'EST L'ORDRE DU PLATEAU ──
 *
 * Un navigateur poste les champs dans l'ordre du document, et `ordre` est la
 * position dans le tableau reçu. Aucun champ caché à tenir d'accord avec
 * l'affichage — c'est-à-dire aucune possibilité qu'ils se contredisent.
 *
 * Une valeur mal formée n'est PAS repliée sur un libellé : elle ressort avec une
 * origine que l'union discriminée ne connaît pas et se fait refuser. La replier
 * aurait transformé un envoi cassé en proposition affichée aux joueurs.
 */
function lirePlaces(formData: FormData): unknown[] {
  return formData.getAll("places").map((brut) => {
    const valeur = String(brut);
    const separateur = valeur.indexOf(":");
    if (separateur === -1) return { origine: "inconnue" };
    const origine = valeur.slice(0, separateur);
    const reste = valeur.slice(separateur + 1);
    if (origine === "fiche") return { origine, itemId: reste };
    if (origine === "libelle") return { origine, texte: reste };
    return { origine: "inconnue" };
  });
}

/**
 * LE COMMERÇANT COMPOSE SON PLATEAU — remplacement intégral.
 *
 * ── DEUX CHEMINS D'ÉCRITURE, ET LE PARTAGE N'EST PAS UN CONFORT ──
 *
 * Un plateau fait UNIQUEMENT de fiches passe par `set_duo_options`, comme
 * avant. Un plateau qui porte au moins un libellé saisi passe par la TABLE.
 * Ce n'est pas un choix d'architecture pris ici : c'est celui que la migration
 * 20261126120000 a écrit dans son propre commentaire de table — « set_duo_options
 * ne connaît que des tableaux de fiches et remplace le plateau EN ENTIER —
 * l'appeler efface les options saisies. Celles-ci s'écrivent par la table (RLS +
 * grants de colonnes), pas par cette RPC. »
 *
 * POURQUOI NE PAS TOUT PASSER PAR LA TABLE, alors : la RPC vérifie
 * l'appartenance des fiches EN SQL et JOURNALISE le geste (`duo.options_set`).
 * « Qui a changé le plateau » est exactement la question qu'on se pose après
 * coup, et la perdre pour tout le monde afin d'avoir un seul chemin aurait
 * coûté la ligne d'audit sans rien acheter.
 *
 * CE QUE LE CHEMIN PAR TABLE N'A PAS, ET IL FAUT LE SAVOIR : le `delete` et
 * l'`insert` sont DEUX ALLERS. Une panne entre les deux laisse le plateau VIDE
 * — pas corrompu, pas mélangé : vide, donc `duo_jouable` faux et porte publique
 * fermée. Le commerçant en est averti par un message qui lui dit quoi faire
 * (recomposer et réenregistrer), et rien ne se joue sur un plateau à moitié
 * écrit. La réparation propre est une RPC qui accepte les deux origines dans la
 * même transaction ; c'est un lot base, pas un contournement à écrire ici.
 *
 * ── LES BORNES SONT REFUSÉES ICI, L'APPARTENANCE EST REFUSÉE LÀ-BAS ──
 *
 * Cardinal, doublons et forme du libellé sont tranchés par le schéma, qui rend
 * une phrase ; la base les lèverait en 22023 ou en 23514, c'est-à-dire en
 * exception. L'existence des fiches, elle, n'est vérifiée QU'EN SQL — par la RPC
 * sur un chemin, par la FK COMPOSITE `(item_id, organization_id)` sur l'autre.
 * La relire ici aurait donné une seconde définition de « cette fiche est à
 * moi », et deux définitions finissent par diverger.
 */
export async function setDuoOptions(
  _prev: ActionResult<SetDuoOptionsOutcome> | null,
  formData: FormData,
): Promise<ActionResult<SetDuoOptionsOutcome>> {
  const garde = await gardeEditeurJeuSalon("duo");
  if (!garde.ok) return { ok: false, error: garde.error };

  const parsed = duoPlateauSchema.safeParse({
    // DE LA SESSION. Seules les places viennent du formulaire.
    organizationId: garde.organizationId,
    places: lirePlaces(formData),
  });
  // Ces refus-là se corrigent à l'écran, dans le champ d'à côté : ils gardent
  // leur message.
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const places = parsed.data.places;
  const fiches = places.flatMap((place) =>
    place.origine === "fiche" ? [place.itemId] : [],
  );
  if (fiches.length !== places.length) {
    return ecrirePlateauParTable(parsed.data.organizationId, places);
  }

  return monitored("duo.options_set", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("set_duo_options", {
        p_organization_id: parsed.data.organizationId,
        p_item_ids: fiches,
        p_actor: garde.userId,
      });
      if (error) {
        // 22023 — LA SÉLECTION, PAS LE TRANSPORT. Cardinal et doublon sont déjà
        // impossibles (le schéma les a tranchés), donc ce code ne peut plus
        // signifier qu'une chose ici : une des fiches n'existe plus, ou n'a
        // jamais été de ce commerce. La base ne dit pas laquelle des deux — et
        // c'est voulu, sans quoi un commerçant énumérerait le catalogue de son
        // voisin, une requête à la fois. Le classement se fait sur le CODE
        // SQLSTATE, jamais sur le texte du message.
        if (error.code === "22023") {
          reportError("duo.options_set.refus", error.message);
          return {
            ok: true as const,
            data: { etat: "selection-refusee" } as const,
          };
        }
        // 42501 — la garde vient pourtant de passer. Il reste deux causes : le
        // commerçant a été rétrogradé entre la garde et l'appel, ou la clé de
        // service est mal configurée. La seconde rendrait « non autorisé » à
        // tout le monde et pour toujours sans qu'aucune alerte ne parte, d'où la
        // ligne d'observation (motif `closeOrgLobby`, contre-revue L16).
        if (error.code === "42501") {
          reportError("duo.options_set.refus", error.message);
          return { ok: false as const, error: NON_AUTORISE };
        }
        reportError("duo.options_set", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      // Le COMPTE est le contenu de la réponse : le deviner ferait afficher un
      // nombre de fiches qui n'a été écrit nulle part.
      const options = mapDuoOptionsSaved(data);
      if (options === null) return { ok: false as const, error: GENERIC_ERROR };

      revalideEcransDuo();
      return {
        ok: true as const,
        data: { etat: "enregistre", options } as const,
      };
    } catch (err) {
      reportError("duo.options_set", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}

/**
 * LES DEUX ÉCRANS QUI MONTRENT LE PLATEAU.
 *
 * `/dashboard/salons/duo` est celui où le plateau se règle depuis DUO-3b ;
 * `/dashboard/vitrine` continue d'en dépendre — son étape « Les jeux » affiche
 * « prêt / pas prêt » à partir du nombre d'options, et sa vérification finale
 * compte les mêmes. Ne revalider que l'un des deux laisserait l'autre annoncer
 * un état d'hier.
 */
function revalideEcransDuo(): void {
  revalidatePath("/dashboard/salons/duo");
  revalidatePath("/dashboard/vitrine");
}

/**
 * LE PLATEAU QUI PORTE AU MOINS UN LIBELLÉ SAISI — écrit par la TABLE.
 *
 * ── LE CLIENT EST CELUI DE LA SESSION, PAS LA CLÉ DE SERVICE ──
 *
 * C'est la seule différence qui compte, et elle est volontaire. La clé de
 * service contourne la RLS : le seul rempart serait alors le filtre
 * `organization_id` de cette fonction. Avec le client de session, la policy
 * `duo_options: editor write` (`is_org_editor`) tranche EN BASE, et les grants
 * de colonnes bornent ce qui peut être écrit. Le filtre explicite est posé
 * quand même sur le `delete` — motif du dépôt : un utilisateur multi-comptes
 * est membre de plusieurs organisations, et la RLS seule ne dit pas laquelle
 * est active.
 *
 * ── L'ORDRE DES DEUX ÉCRITURES EST CELUI DE LA RPC ──
 *
 * `delete` puis `insert`, parce que `duo_options_org_ordre_unique` est vérifiée
 * PAR INSTRUCTION : insérer d'abord ferait entrer en collision la place 1
 * ancienne et la place 1 neuve.
 */
async function ecrirePlateauParTable(
  organizationId: string,
  places: DuoPlaceEntree[],
): Promise<ActionResult<SetDuoOptionsOutcome>> {
  return monitored("duo.options_set", async () => {
    try {
      const supabase = await createClient();

      const { error: erreurDelete } = await supabase
        .from("duo_options")
        .delete()
        .eq("organization_id", organizationId);
      if (erreurDelete) {
        // RIEN N'EST ENCORE PERDU ICI : le plateau d'hier est intact.
        reportError("duo.options_set", erreurDelete.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      const { error: erreurInsert } = await supabase.from("duo_options").insert(
        places.map((place, index) => ({
          organization_id: organizationId,
          item_id: place.origine === "fiche" ? place.itemId : null,
          libelle: place.origine === "libelle" ? place.texte : null,
          // La PLACE est la position dans le tableau reçu, comme dans la RPC.
          ordre: index + 1,
        })),
      );
      if (erreurInsert) {
        reportError("duo.options_set", erreurInsert.message);
        // 23503 — la FK composite : une fiche a quitté la carte entre
        // l'affichage et le clic. C'est un RÉSULTAT, pas une panne, et c'est
        // le même cas que la 22023 de la RPC.
        if (erreurInsert.code === "23503") {
          return {
            ok: true as const,
            data: { etat: "selection-refusee" } as const,
          };
        }
        // TOUT LE RESTE LAISSE LE PLATEAU VIDE, et le message le dit. Un
        // « une erreur est survenue » enverrait chercher une panne alors que le
        // geste à faire est immédiat : recomposer et réenregistrer. Le plateau
        // vide ferme la porte publique (duo_jouable est alors faux), il ne
        // fait pas jouer sur une liste à moitié écrite.
        return {
          ok: false as const,
          error:
            "Votre plateau n’a pas pu être enregistré et il est vide : recomposez-le, puis enregistrez à nouveau.",
        };
      }

      revalideEcransDuo();
      return {
        ok: true as const,
        data: { etat: "enregistre", options: places.length } as const,
      };
    } catch (err) {
      reportError("duo.options_set", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}

/**
 * Ce que rend `setDuoSuggestion`.
 *
 * `fiche-inconnue` est distinct d'`enregistre` pour la même raison que
 * `selection-refusee` : la fiche proposée a pu disparaître de la carte entre
 * l'affichage et le clic. `suggestion` porte la valeur POSÉE — `null` s'y lit
 * comme le retrait qu'il est, et c'est ce qui permet à l'écran de confirmer
 * « proposition retirée » sans le deviner.
 */
export type SetDuoSuggestionOutcome =
  | { etat: "enregistre"; suggestion: string | null }
  | { etat: "fiche-inconnue" };

/**
 * LA PROPOSITION DE LA MAISON — posée, ou retirée.
 *
 * Le champ `item_id` ABSENT ou VIDE vaut retrait : c'est la forme qu'un
 * `<select>` avec une option « aucune » poste naturellement, et exiger un
 * littéral `"null"` aurait fait dépendre un geste d'une chaîne magique que rien
 * ne garde d'accord entre l'écran et l'action.
 *
 * ELLE N'EST JAMAIS MONTRÉE PENDANT LE CHOIX : `duo_state` ne la calcule que
 * dans la branche `revelee`, et `mapDuoState` la force à `null` avant. L'afficher
 * pendant que les deux joueurs choisissent aurait surligné une réponse sur le
 * plateau.
 */
export async function setDuoSuggestion(
  _prev: ActionResult<SetDuoSuggestionOutcome> | null,
  formData: FormData,
): Promise<ActionResult<SetDuoSuggestionOutcome>> {
  const garde = await gardeEditeurJeuSalon("duo");
  if (!garde.ok) return { ok: false, error: garde.error };

  const brut = formData.get("item_id");
  const parsed = duoSuggestionSchema.safeParse({
    organizationId: garde.organizationId,
    // Champ absent ou vide = retrait. `String(brut)` n'est calculé que sur une
    // valeur présente, sinon un `File` posté deviendrait « [object File] » et
    // partirait se faire refuser comme un UUID malformé.
    itemId: brut === null || brut === "" ? null : String(brut),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  return monitored("duo.suggestion_set", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("set_duo_suggestion", {
        p_organization_id: parsed.data.organizationId,
        // `null` EST une valeur acceptée par la RPC — elle retire la
        // proposition — mais le type généré ne l'exprime pas : Supabase ne
        // marque optionnel qu'un paramètre porteur d'un DEFAULT, jamais un
        // paramètre nullable. L'assertion dit ce que le SQL dit déjà.
        p_item_id: parsed.data.itemId as string,
        p_actor: garde.userId,
      });
      if (error) {
        // 22023 — fiche inconnue OU fiche d'un autre commerce : le MÊME `raise`,
        // parce que les distinguer donnerait un oracle d'existence sur le
        // catalogue du voisin. Classement sur le SQLSTATE, jamais sur le texte.
        if (error.code === "22023") {
          reportError("duo.suggestion_set.refus", error.message);
          return {
            ok: true as const,
            data: { etat: "fiche-inconnue" } as const,
          };
        }
        if (error.code === "42501") {
          reportError("duo.suggestion_set.refus", error.message);
          return { ok: false as const, error: NON_AUTORISE };
        }
        reportError("duo.suggestion_set", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      const pose = mapDuoSuggestionSaved(data);
      if (!pose) return { ok: false as const, error: GENERIC_ERROR };

      revalideEcransDuo();
      return {
        ok: true as const,
        data: { etat: "enregistre", suggestion: pose.suggestion } as const,
      };
    } catch (err) {
      reportError("duo.suggestion_set", err);
      return { ok: false as const, error: GENERIC_ERROR };
    }
  });
}
