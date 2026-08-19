/**
 * Classes des champs qui n'ont pas de primitive dans `src/components/ui/`.
 *
 * Le dépôt n'a ni `select.tsx` ni `textarea.tsx` : les huit éditeurs écrivent
 * ces deux balises en HTML brut. Les classes sont donc reprises de
 * `quiz-editor.tsx` — mais posées ICI plutôt que recopiées dans les trois
 * formulaires de ce module, pour qu'un ajustement de la DA n'en laisse pas un
 * en arrière.
 *
 * Les BORNES de saisie (`maxLength`, capacité minimale) ne sont pas ici : elles
 * vivent dans `src/lib/reserver.ts` — `RESERVER_ACTIVITY_NAME_MAX`,
 * `RESERVER_CAPACITY_MIN`… — au plus près des `check` SQL dont elles sont le
 * miroir. Les redéclarer côté composants aurait fait une seconde vérité, à
 * corriger deux fois le jour où la contrainte bouge.
 */

export const champDescription =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

export const champSelect =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/**
 * Capacité proposée à la création d'un créneau. Ni une règle ni une limite —
 * la base n'exige que `capacity > 0` — seulement une valeur de départ que le
 * commerçant écrase d'un chiffre.
 */
export const CAPACITE_DEFAUT = 10;
