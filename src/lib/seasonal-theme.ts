import type { SeasonalTheme } from "@/types/database";

/**
 * La palette saisonnière PARTAGÉE, énumérée une seule fois à l'exécution.
 *
 * `SeasonalTheme` (src/types/database.ts) dit ce qui est valide au COMPILATEUR ;
 * un type s'efface à l'exécution et ne peut donc rien refermer sur une valeur
 * relue en base. Cette liste est sa contrepartie exécutable — et elle est
 * `satisfies readonly SeasonalTheme[]`, donc une clé inventée ici ne compile pas.
 *
 * ── Pourquoi un module à part ────────────────────────────────
 *
 * Le dépôt portait déjà DEUX recopies privées de la même garde — `asTheme` dans
 * `lib/calendar.ts` et son jumeau dans `lib/quiz.ts` (celui-là garde son propre
 * vocabulaire : les thèmes de quiz nomment un usage métier, pas une saison). Le
 * thème des pronostics en aurait fait une troisième, et la troisième copie est
 * celle qu'on oublie de mettre à jour : le jour où une clé s'ajoute au CHECK
 * SQL, un module l'affiche et l'autre la replie silencieusement sur « neutre ».
 *
 * ── Ce que ce module ne fait PAS ─────────────────────────────
 *
 * Il ne valide pas une SAISIE. Une valeur inconnue arrivant d'un formulaire doit
 * être REFUSÉE (zod, côté `validations/`), pas repliée : le commerçant a le droit
 * de savoir que son enregistrement n'a pas pris. Le repli ci-dessous sert la
 * LECTURE — une colonne relue dont le CHECK aurait changé sans que ce code le
 * sache. C'est la même dissymétrie que `caseACochee` : la tolérance porte sur ce
 * qu'on lit, jamais sur ce qu'on écrit.
 */
export const SEASONAL_THEMES = [
  // Neutre d'abord (le défaut), puis les saisons, puis les univers — le même
  // ordre que `CALENDAR_THEME_ORDER` / `CONTEST_THEME_ORDER` côté sélecteurs.
  "neutre",
  "noel",
  "saint_valentin",
  "anniversaire",
  "soldes",
  "festival",
  "prairie",
  "musique",
  "football",
  "restaurant",
  "espace",
] as const satisfies readonly SeasonalTheme[];

/** Le thème servi quand la valeur relue est hors vocabulaire ou absente. */
export const DEFAULT_SEASONAL_THEME: SeasonalTheme = "neutre";

/**
 * Referme le vocabulaire d'une valeur relue en base sur `SeasonalTheme`, avec
 * repli sur « neutre ».
 *
 * Le générateur de types élargit un `text` borné par un CHECK en `string` —
 * Postgres ne transporte pas ses contraintes. Sans cette garde, l'affirmation
 * serait un simple cast, et une valeur hors palette voyagerait jusqu'à l'écran
 * du joueur pour n'y correspondre à aucune entrée de la table des styles.
 */
export function asSeasonalTheme(value: unknown): SeasonalTheme {
  return (SEASONAL_THEMES as readonly string[]).includes(value as string)
    ? (value as SeasonalTheme)
    : DEFAULT_SEASONAL_THEME;
}
