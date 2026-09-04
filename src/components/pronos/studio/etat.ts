import { contestThemeTokens } from "@/components/pronos/contest-theme";
import {
  ttlContestEditable,
  ttlContestJours,
} from "@/components/pronos/contest-code-ttl";
import type { Contest, SeasonalTheme } from "@/types/database";

/**
 * L'ÉTAT DU STUDIO DU CHAMPIONNAT — les SIX réglages que porte `updateContest`,
 * plus rien (VIT-43).
 *
 * ── UNE SEULE CHARGE, LÀ OÙ L'ATELIER EN A TROIS ──
 *
 * `updateContest` est le seul schéma de mise à jour PARTIELLE de ce module, et
 * l'atelier s'en sert avec TROIS formulaires côte à côte, discriminés par des
 * champs cachés :
 *
 *  · le renommage ne poste que `id` + `name` ;
 *  · les données d'inscription postent `collection_settings=1`, sans quoi
 *    l'action lit `undefined` et laisse les deux booléens tranquilles ;
 *  · l'apparence poste `theme` + `fond_key` ;
 *  · l'échéance des codes poste `code_ttl_seconds`, et c'est
 *    `formData.has('code_ttl_seconds')` — pas `get()` — qui distingue
 *    « efface » de « ne touche pas », parce que `''` (« sans limite ») y est
 *    une valeur légitime.
 *
 * Les fusionner naïvement en un formulaire unique aurait écrasé des colonnes :
 * un `collect_email` non coché sur un formulaire qui porte quand même
 * `collection_settings` vaut FAUX, pas « ne touche pas ». Ce qui rend la fusion
 * sûre ici n'est pas la prudence, c'est la structure du socle : aucun contrôle
 * visible ne porte de `name`, et `ChampsCachesContest` rend la charge EN ENTIER
 * depuis cet état, à chaque rendu, quelle que soit l'étape ouverte. Il n'existe
 * alors aucun chemin par lequel un champ manque, donc aucun par lequel une
 * colonne s'efface par absence.
 *
 * ── LA SEULE EXCEPTION EST `code_ttl_seconds`, ET ELLE EST GARDÉE ──
 *
 * Une durée en base qui n'est pas un multiple exact de 86 400 s ne se laisse
 * pas écrire en jours entiers : l'atelier passe alors en LECTURE SEULE plutôt
 * que de l'arrondir. Le studio respecte ce gel — le champ caché n'est PAS
 * rendu, donc `has()` est faux, donc la colonne reste intacte. Un studio à
 * enregistrement continu qui le rendrait quand même l'écraserait sans un clic.
 *
 * ── POURQUOI LES JOURS SONT UNE CHAÎNE ──
 *
 * Même parti pris que le calendrier (VIT-39) et le quiz (VIT-41) : la saisie
 * BRUTE voyage telle quelle et se fait valider par le schéma, qui porte déjà
 * tous les messages. Reconstruire un nombre ici transformerait un champ vidé le
 * temps de retaper en un `0` silencieux.
 */
export interface EtatContest {
  name: string;
  collect_email: boolean;
  collect_phone: boolean;
  theme: SeasonalTheme;
  /** Réglage BRUT : `""` = suivre le thème, `"aucun"`, ou une clé de fond. */
  fond_key: string;
  /** Saisie BRUTE en jours ; `""` = sans limite. */
  code_ttl_days: string;
}

/**
 * L'état de départ, lu depuis la ligne. Aucun défaut n'est INVENTÉ ici — sauf
 * un, et il est REPRIS de l'atelier : `contestThemeTokens(contest.theme).key`
 * replie un thème hors palette sur « neutre », exactement comme le fait
 * `ThemeSelector`. Sans ce repli, la tuile active ne serait aucune des six et
 * le commerçant lirait une planche sans sélection.
 *
 * Le reste devient la chaîne vide, qui est ce que les schémas savent relire
 * comme « rien ». Résoudre des défauts au montage graverait en base des
 * décisions que personne n'a prises (VIT-19), et l'enregistrement automatique
 * du socle les enverrait.
 */
export function etatInitialContest(contest: Contest): EtatContest {
  const jours = ttlContestJours(contest.code_ttl_seconds);
  return {
    name: contest.name,
    collect_email: contest.collect_email,
    collect_phone: contest.collect_phone,
    theme: contestThemeTokens(contest.theme).key,
    fond_key: contest.fond_key ?? "",
    // En lecture seule, la valeur n'est PAS reprise : le champ n'existe pas et
    // rien ne doit partir. `ttlContestEditable` est la seule autorité.
    code_ttl_days:
      ttlContestEditable(contest.code_ttl_seconds) && jours !== null
        ? String(jours)
        : "",
  };
}

/**
 * LE GEL, ÉCRIT UNE FOIS, LU PAR L'ÉCRAN COMME PAR LA GARDE.
 *
 * Trois raisons de ne plus enregistrer tout seul, et elles ne se valent pas :
 *
 *  · `!peutEditer` — le rôle n'écrit pas ; mieux vaut ne rien proposer que
 *    laisser l'action refuser après coup ;
 *  · `finalized` — le championnat est déclaré DÉFINITIF. Un enregistrement
 *    automatique serait le seul chemin d'écriture restant sur un règlement que
 *    l'écran annonce figé ;
 *  · `locked` (RPC `contest_is_locked` : premier pronostic déposé, ou coup
 *    d'envoi passé) — les corrections exigent alors un MOTIF journalisé de dix
 *    caractères, qui se tape d'un trait et non par tranches de 1 200 ms. Un
 *    débounce l'enverrait au dixième caractère, au milieu d'une phrase : un
 *    motif d'audit tronqué vaut moins que pas de motif du tout.
 *
 * C'est le même verdict qui gouverne le bandeau, les champs et le bouton :
 * `CoquilleStudio` reçoit CETTE valeur comme `peutEditer`, si bien qu'un studio
 * gelé n'affiche ni « Enregistrement automatique », ni bouton « Enregistrer ».
 * Un écran qui annoncerait l'automatisme sans le faire serait le défaut
 * d'ADR-153 pris par l'autre bout.
 */
export function reglagesEditablesContest({
  peutEditer,
  locked,
  finalized,
}: {
  peutEditer: boolean;
  locked: boolean;
  finalized: boolean;
}): boolean {
  return peutEditer && !locked && !finalized;
}
