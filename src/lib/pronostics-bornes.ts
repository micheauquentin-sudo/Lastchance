/**
 * Bornes de forme des questions/réponses — miroir des fonctions SQL
 * `is_valid_contest_options` / `is_valid_contest_question` /
 * `is_valid_contest_answer`, réutilisées telles quelles par le Créateur de quiz
 * (`is_valid_quiz_question`).
 *
 * ── POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST VIDE DE TOUT LE RESTE ──
 *
 * Ce ne sont que des nombres et deux expressions régulières. Ils vivaient dans
 * `src/lib/pronostics.ts`, qui importe `node:crypto` en tête pour deux fonctions
 * d'identité joueur (`generatePlayerToken`, `hashPlayerToken`) — tout en bas du
 * fichier, et sans le moindre rapport avec ces bornes.
 *
 * Conséquence mesurée : `src/lib/validations/quiz.ts` importait cinq de ces
 * constantes depuis `pronostics.ts`, et `quiz-editor.tsx` (composant client)
 * importait de `validations/quiz.ts` un unique littéral de message. Le bundler
 * suivait la chaîne jusqu'à `node:crypto` et embarquait le polyfill
 * `crypto-browserify` — ~121 Ko gzip — dans deux écrans du dashboard qui ne
 * chiffrent rien.
 *
 * Ce module N'IMPORTE RIEN, et ne doit jamais rien importer : c'est la seule
 * propriété qui compte ici. Toute constante de forme partagée entre le moteur
 * serveur et un écran client a sa place ici ; toute fonction qui a besoin d'un
 * module Node n'en a aucune.
 *
 * `pronostics.ts` les ré-exporte : les importateurs serveur existants
 * (`validations/pronostics.ts`, `experience-relance.ts`) n'ont rien à changer.
 */

/** Longueur maximale de l'intitulé d'une question. */
export const QUESTION_PROMPT_MAX = 300;

/** Nombre minimal d'options d'une question `choice` / `ranking`. */
export const OPTIONS_MIN = 2;

/** Nombre maximal d'options d'une question `choice` / `ranking`. */
export const OPTIONS_MAX = 50;

/** Longueur maximale du libellé d'une option. */
export const OPTION_LABEL_MAX = 120;

/** Forme d'un identifiant d'option. */
export const OPTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** Borne d'une réponse `number` (miroir du ±1e9 SQL). */
export const NUMBER_ANSWER_MAX = 1_000_000_000;

/**
 * Durée au-delà de laquelle un match commencé n'est plus « en cours ».
 *
 * Le badge du joueur affichait « En cours 🔒 » pour TOUT match dont le coup
 * d'envoi était passé et dont le résultat n'était pas encore tombé. Sur un
 * calendrier synchronisé, un résultat qui n'arrive pas n'est pas un match qui
 * dure : c'est une synchro en retard. Un match de la semaine dernière
 * s'annonçait donc « en cours », ce qui est faux et inquiétant — le joueur
 * croit que son pronostic va encore compter.
 *
 * 100 minutes = 90 + la mi-temps. MÊME valeur que `MIN_MATCH_DURATION_MS`
 * (`src/lib/contest-sync.ts`), qui s'en sert pour décider s'il vaut la peine
 * d'interroger le fournisseur : les deux répondent à la question « ce match
 * devrait-il être fini ? », et deux valeurs différentes feraient dire à
 * l'écran l'inverse de ce que fait la synchro. Elle vit ici parce que ce
 * module n'importe RIEN et peut donc être lu par un composant client.
 */
export const DUREE_MATCH_MS = 100 * 60 * 1000;
