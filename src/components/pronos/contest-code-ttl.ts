/**
 * L'ÉCHÉANCE DES CODES DE RETRAIT D'UN CHAMPIONNAT — cœur PUR (VIT-43).
 *
 * Ces quatre valeurs vivaient en privé dans `contest-settings.tsx`, où elles
 * n'avaient qu'un lecteur. Le studio en est un second, et c'est exactement le
 * moment où une constante recopiée commence à diverger : `CODE_TTL_MAX_DAYS`
 * borne un CHECK SQL, et deux écrans qui n'en donnent pas la même valeur, c'est
 * un formulaire qui accepte ce que l'autre refuse.
 *
 * Elles sont donc remontées ici, à côté de `contest-theme.ts` et pour la même
 * raison : aucun accès réseau, aucun JSX, aucun import server-only — lisible
 * depuis l'atelier, depuis le studio, et depuis une garde qui ne monte aucun
 * écran.
 *
 * ── L'INVARIANT QUI COMPTE, ET IL N'EST PAS ÉVIDENT ──
 *
 * L'UI parle en JOURS, la base en SECONDES, et le CHECK SQL accepte toute durée
 * dès 3 600 s (1 h). Une valeur posée par API ou en SQL direct qui n'est pas un
 * multiple exact de 86 400 s'afficherait donc ARRONDIE en jours, et le premier
 * « Enregistrer » l'écraserait — 1 h devenue 24 h, sans que personne l'ait
 * demandé. `ttlContestEditable` est ce qui l'empêche : à faux, l'écran passe en
 * lecture seule, ne rend NI champ, NI champ caché, NI bouton, et n'enregistre
 * plus tout seul. Rien n'est soumis, la base est préservée.
 */

/** Un jour, en secondes. */
export const SECONDS_PER_DAY = 86_400;
/** Bornes du CHECK SQL (3 600 s → 7 776 000 s), ramenées à des jours entiers. */
export const CODE_TTL_MIN_DAYS = 1;
export const CODE_TTL_MAX_DAYS = 90;

/**
 * Secondes → durée lisible (« 1 h », « 1 j 12 h », « 90 min »). Sert
 * uniquement à MONTRER une valeur que le champ en jours ne sait pas saisir.
 */
export function formatTtlSeconds(total: number): string {
  const parts: string[] = [];
  const days = Math.floor(total / SECONDS_PER_DAY);
  const hours = Math.floor((total % SECONDS_PER_DAY) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (days > 0) parts.push(`${days} j`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0) parts.push(`${seconds} s`);
  return parts.length > 0 ? parts.join(" ") : "0 s";
}

/** Jours entiers si la valeur en base s'écrit sans perte, sinon `null`. */
export function ttlContestJours(stored: number | null): number | null {
  return stored !== null && stored % SECONDS_PER_DAY === 0
    ? stored / SECONDS_PER_DAY
    : null;
}

/**
 * Cette durée se laisse-t-elle saisir en jours entiers, dans les bornes du
 * champ ? À faux, l'écran ne doit RIEN soumettre — voir l'en-tête.
 */
export function ttlContestEditable(stored: number | null): boolean {
  const jours = ttlContestJours(stored);
  return (
    stored === null ||
    (jours !== null && jours >= CODE_TTL_MIN_DAYS && jours <= CODE_TTL_MAX_DAYS)
  );
}

/**
 * Saisie BRUTE en jours → la valeur du champ `code_ttl_seconds`.
 *
 * `""` (« sans limite ») est une valeur LÉGITIME et voyage telle quelle : c'est
 * ce que `codeTtlSecondsSchema` replie sur `null`. Reconstruire un nombre ici
 * transformerait un champ vidé le temps de retaper en un `0` silencieux.
 */
export function ttlContestSecondes(joursBrut: string): string {
  const trimmed = joursBrut.trim();
  const parsed = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(parsed)) return "";
  return String(Math.round(parsed) * SECONDS_PER_DAY);
}
