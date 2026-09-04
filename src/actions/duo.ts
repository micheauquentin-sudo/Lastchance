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
 * Ni l'appartenance, ni le statut de la salle, ni le fait que la place soit sur
 * le plateau, ni qu'un choix ait déjà été scellé. Les cinq gardes sont dans
 * `duo_choose_option`, sous le verrou consultatif, et les rejouer côté
 * application dupliquerait des arbitrages déjà rendus — des copies qui
 * finiraient par diverger, et qui trancheraient hors du verrou, c'est-à-dire sur
 * un état périmé.
 *
 * ── LE DOUBLE-CLIC EST IDEMPOTENT, LE CHANGEMENT D'AVIS NE L'EST PAS ──
 *
 * Rejouer la MÊME place rend `ok` ; en désigner une AUTRE rend `deja-scelle` et
 * n'écrit rien. C'est ce qui empêche d'attendre que `autreAChoisi` passe à vrai
 * pour changer d'avis — l'écran ne doit donc PAS proposer de « modifier », il
 * doit montrer un choix figé.
 *
 * ── LA PLACE, ET LA FICHE LE TEMPS D'UN DÉPLOIEMENT (DUO-5) ──
 *
 * `option_id` désigne une place quelle que soit son origine : c'est ce qui rend
 * enfin scellable une proposition SAISIE À LA MAIN, laquelle n'a pas de fiche à
 * présenter et retombait donc sur le refus muet.
 *
 * `item_id` reste accepté, et l'appel part alors sur `duo_choose` — la porte
 * d'hier, que la migration 20261128120000 a délibérément gardée vivante pour
 * cette fenêtre et qui délègue à `duo_choose_option` après résolution. Un onglet
 * ouvert avant la mise en ligne poste encore cette forme, au milieu d'une partie
 * à deux ; la refuser rendrait un bouton inerte à quelqu'un qui n'a aucune
 * raison de penser à recharger. La branche s'enlève avec le membre d'union
 * correspondant de `duoChooseSchema`, où le geste est écrit.
 *
 * LES DEUX CHEMINS SONT LE MÊME QUANT AUX DROITS : même RPC en bout de course,
 * même empreinte tirée du cookie de CETTE salle, aucune garde en moins.
 */
export async function chooseDuo(
  _prev: ActionResult<ChooseDuoOutcome> | null,
  formData: FormData,
): Promise<ActionResult<ChooseDuoOutcome>> {
  const lobbyId = formData.get("lobby_id");
  const brutOption = formData.get("option_id");
  // L'OBJET SOUMIS NE PORTE QU'UNE FORME. Le construire avec les deux clés,
  // l'une à `null`, aurait fait échouer les deux membres `.strict()` de l'union
  // — un refus muet sur un formulaire pourtant valide.
  const parsed = duoChooseSchema.safeParse(
    brutOption === null
      ? { lobbyId, itemId: formData.get("item_id") }
      : { lobbyId, optionId: brutOption },
  );
  // Ces deux valeurs sont RELUES sur un plateau que le serveur a rendu, jamais
  // saisies au clavier : un identifiant malformé vient d'un appelant qui s'est
  // trompé de forme, et il rend le même refus muet qu'une place hors plateau.
  if (!parsed.success) return REFUS_INDISPONIBLE;

  const token = await lireJetonLobby(parsed.data.lobbyId);
  if (!token) return REFUS_INDISPONIBLE;

  return monitored("duo.choose", async () => {
    try {
      const admin = createAdminClient();
      const tokenHash = hashLobbyToken(token);
      const { data, error } =
        "optionId" in parsed.data
          ? await admin.rpc("duo_choose_option", {
              p_lobby_id: parsed.data.lobbyId,
              p_token_hash: tokenHash,
              p_option_id: parsed.data.optionId,
            })
          : await admin.rpc("duo_choose", {
              p_lobby_id: parsed.data.lobbyId,
              p_token_hash: tokenHash,
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
// `garde.userId` ; `set_duo_options`, `set_duo_plateau` et `set_duo_suggestion`
// le revérifient membre `owner|editor` EN SQL, parce que les trois gestes sont
// journalisés (`duo.options_set` pour les deux premiers, `duo.suggestion_set`).
// Les deux vérifications ne font pas double emploi — celle-ci rend un message
// utile, celle-là tient la ligne d'audit.
//
// LES TROIS ÉCRITURES PASSENT PAR LA CLÉ DE SERVICE, ET C'EST CE QUI REND LA
// GARDE OBLIGATOIRE (DUO-5). Ces RPC sont `security definer`, accordées au seul
// `service_role` : le client de session recevrait un 42501, et rien ne
// fonctionnerait. La contrepartie est que la RLS ne tranche plus rien sur ce
// chemin — l'appartenance est tenue par la garde ci-dessus et par le `p_actor`
// revérifié en SQL, jamais par une policy. Une écriture ajoutée ici sans passer
// par `gardeEditeurJeuSalon` écrirait donc chez le voisin sans que rien ne
// l'arrête.
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
 * avant. Un plateau qui porte au moins un libellé saisi passe par
 * `set_duo_plateau`. Ce n'est pas un choix d'architecture pris ici : c'est celui
 * que la migration 20261126120000 a écrit dans son propre commentaire de table —
 * « set_duo_options ne connaît que des tableaux de fiches et remplace le plateau
 * EN ENTIER — l'appeler efface les options saisies. »
 *
 * ── LES DEUX SONT DÉSORMAIS DES RPC, ET LE CHEMIN PAR TABLE A DISPARU (DUO-5) ──
 *
 * Jusqu'ici la seconde branche écrivait par la TABLE, en `delete` puis `insert`
 * depuis le client de session : DEUX allers, dont une panne entre les deux
 * laissait le plateau VIDE alors que le commerçant croyait avoir enregistré. La
 * migration 20261128120000 a livré `set_duo_plateau`, qui prend les deux
 * origines en UNE transaction, vérifie l'appartenance des fiches en SQL et
 * journalise sous le MÊME nom d'action (`duo.options_set`).
 *
 * POURQUOI LES DEUX BRANCHES SURVIVENT QUAND MÊME : `set_duo_options` est la
 * porte que les plateaux de fiches empruntent depuis L17, couverte par ses
 * assertions pgTAP, et elle est déjà atomique. Faire passer par une RPC neuve
 * des plateaux qui n'en ont pas besoin aurait déplacé un risque sans réparer
 * quoi que ce soit. Ce qui devait disparaître est l'écriture NON ATOMIQUE, et
 * elle a disparu.
 *
 * ── LES BORNES SONT REFUSÉES ICI, L'APPARTENANCE EST REFUSÉE LÀ-BAS ──
 *
 * Cardinal, doublons et forme du libellé sont tranchés par le schéma, qui rend
 * une phrase ; la base les lèverait en 22023 ou en 23514, c'est-à-dire en
 * exception. L'existence des fiches, elle, n'est vérifiée QU'EN SQL — par l'une
 * ou l'autre RPC, qui rendent la même 22023. La relire ici aurait donné une
 * seconde définition de « cette fiche est à moi », et deux définitions finissent
 * par diverger.
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
    return ecrirePlateauEnUneTransaction(
      parsed.data.organizationId,
      // DE LA SESSION, comme pour `set_duo_options` juste en dessous. Voir
      // l'en-tête de section : l'acteur ne traverse jamais le formulaire.
      garde.userId,
      places,
    );
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
  // LE STUDIO EST HORS DE `/dashboard`, il n'est atteint par aucune des lignes
  // ci-dessus : Next revalide un CHEMIN, pas une ressource (VIT-48). Sans ce
  // jumeau, un plateau enregistré depuis `/studio/salon/duo` n'y apparaîtrait
  // jamais — sur l'écran même où l'on vient vérifier. C'est le défaut VIT-37,
  // et `revalidation-studio.test.ts` échoue s'il manque.
  revalidatePath("/studio/salon/duo");
  // LE STUDIO DE LA VITRINE EST HORS DE `/dashboard` (VIT-48). Son étape
  // « Ce qui paraît » montre les jeux — donc le plateau du Duo et le pack
  // de la Bande. Sans ce jumeau, on règle son plateau et l'écran qui
  // l'affiche reste sur l'état d'hier. C'est le défaut VIT-37, sur un
  // troisième écran.
  revalidatePath("/dashboard/vitrine");
  revalidatePath("/vitrine-studio");
}

/**
 * LE PLATEAU QUI PORTE AU MOINS UN LIBELLÉ SAISI — écrit EN UNE TRANSACTION.
 *
 * ── LE NOM A CHANGÉ PARCE QUE L'IMPLÉMENTATION A CHANGÉ (DUO-5) ──
 *
 * Elle s'appelait `ecrirePlateauParTable`, et c'était exact : elle faisait un
 * `delete` puis un `insert` depuis le client de session. Une panne entre les
 * deux laissait le plateau VIDE — pas corrompu, mais vide, sur un réglage que le
 * commerçant croyait enregistré. `set_duo_plateau` (migration 20261128120000)
 * fait les deux instructions dans SA transaction : ou le plateau neuf est là, ou
 * l'ancien est intact. Garder l'ancien nom aurait laissé une fonction qui ment
 * sur ce qu'elle fait.
 *
 * ── LE CLIENT DEVIENT CELUI DE LA CLÉ DE SERVICE, ET C'EST LE POINT SENSIBLE ──
 *
 * `set_duo_plateau` est `security definer` et n'est accordée qu'à
 * `service_role` : le client de session recevrait un 42501, et le chemin ne
 * marcherait tout simplement pas. Ce changement RETIRE le filet de la RLS
 * (`duo_options: editor write`) qui tranchait jusqu'ici en base.
 *
 * TROIS CHOSES LE REMPLACENT, ET AUCUNE N'EST FACULTATIVE :
 *
 *   1. `gardeEditeurJeuSalon("duo")` a déjà tranché la session, le rôle et le
 *      droit du jeu AVANT que le formulaire ne soit lu — c'est elle qui fournit
 *      l'organisation, et c'est pour cela que le client ne peut pas l'apporter.
 *      C'est exactement le chemin que `setDuoOptions` emprunte déjà pour
 *      `set_duo_options`, RPC `service_role` elle aussi : ce lot n'ouvre pas une
 *      porte neuve, il fait passer une seconde branche par la porte existante.
 *   2. `set_duo_plateau` REVÉRIFIE l'acteur en SQL (`organization_members`,
 *      rôle `owner|editor`) avant de regarder la moindre place, et rend 42501
 *      sinon. Les deux vérifications ne font pas double emploi : celle-ci rend
 *      un message utile, celle-là tient la ligne d'audit `duo.options_set`.
 *   3. L'organisation et l'acteur viennent tous deux de la GARDE. Un acteur reçu
 *      du formulaire ferait de la ligne d'audit une déclaration sur l'honneur.
 *
 * ── LA FORME DE L'ENVOI ──
 *
 * Un tableau d'OBJETS À UNE SEULE CLÉ, `item_id` ou `libelle`, jamais les deux :
 * la RPC compte `num_nonnulls(item_id, libelle) <> 1` et refuserait une place
 * qui porte les deux, fût-ce à `null`. L'ORDRE DU TABLEAU EST L'ORDRE DU
 * PLATEAU (`with ordinality` en face), comme la position postée l'était.
 */
async function ecrirePlateauEnUneTransaction(
  organizationId: string,
  acteur: string,
  places: DuoPlaceEntree[],
): Promise<ActionResult<SetDuoOptionsOutcome>> {
  return monitored("duo.options_set", async () => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("set_duo_plateau", {
        p_organization_id: organizationId,
        p_places: places.map((place) =>
          place.origine === "fiche"
            ? { item_id: place.itemId }
            : { libelle: place.texte },
        ),
        p_actor: acteur,
      });
      if (error) {
        // 22023 — LA SÉLECTION, PAS LE TRANSPORT, et le classement se fait sur
        // le SQLSTATE comme en face. Cardinal, origines, forme des
        // identifiants et doublons sont déjà impossibles ici (le schéma les a
        // tranchés) : il ne reste qu'`unknown duo option item`, c'est-à-dire
        // une fiche disparue de la carte entre l'affichage et le clic. Rien à
        // réparer, un écran à rafraîchir.
        if (error.code === "22023") {
          reportError("duo.options_set.refus", error.message);
          return {
            ok: true as const,
            data: { etat: "selection-refusee" } as const,
          };
        }
        // 42501 — la garde vient pourtant de passer. Mêmes deux causes que sur
        // `set_duo_options` : commerçant rétrogradé entre-temps, ou clé de
        // service mal configurée. La seconde rendrait « non autorisé » à tout
        // le monde et pour toujours sans qu'aucune alerte ne parte.
        if (error.code === "42501") {
          reportError("duo.options_set.refus", error.message);
          return { ok: false as const, error: NON_AUTORISE };
        }
        // PLUS DE MESSAGE « votre plateau est vide » : il n'y a plus d'état
        // intermédiaire à décrire. Une panne ici laisse le plateau d'HIER
        // intact, et le geste à refaire est le geste ordinaire — réessayer.
        reportError("duo.options_set", error.message);
        return { ok: false as const, error: GENERIC_ERROR };
      }

      // Le COMPTE est le contenu de la réponse, comme sur `set_duo_options` :
      // le deviner ferait afficher un nombre qui n'a été écrit nulle part.
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
