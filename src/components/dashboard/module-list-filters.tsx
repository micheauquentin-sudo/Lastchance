import Link from "next/link";
import { sanitizeSearchTerm } from "@/lib/utils";
import { libelleEtat, type EtatAnimation } from "@/components/ui/status-badge";

/**
 * LE FILTRE DES SEPT LISTES DE MODULES, ÉCRIT UNE FOIS.
 *
 * Quiz, calendriers, chasses, pronostics, jackpots, passeports et événements
 * rendaient jusqu'ici la MÊME liste : tri figé sur `created_at desc`, aucun
 * paramètre d'URL, et — le plus coûteux — aucun `.range()`. Un commerçant à
 * trois cents quiz recevait trois cents quiz, à chaque affichage.
 *
 * Les sept pages ont la même forme, elles reçoivent donc la même commande.
 * Écrire sept formulaires jumeaux, c'est garantir qu'ils divergeront : le
 * huitième module copierait celui qu'il a sous la main, pas le bon.
 *
 * CE QUI RESTE PROPRE À CHAQUE PAGE, et qui ne peut pas monter ici : la liste
 * de ses statuts RÉELS. Les sept tables n'ont pas le même `check` — `finished`
 * n'existe que sur `contests`, `archived` sur les six autres. Chaque page passe
 * donc les siens, relevés sur sa contrainte, et le composant ne fait que les
 * habiller du vocabulaire des pastilles (`status-badge.tsx`), pour que le
 * filtre emploie exactement les mots que portent les cartes en dessous.
 */

/** 20 lignes : une page d'écran sans défilement infini, un `range` borné. */
export const MODULE_PAGE_SIZE = 20;

/** Un statut brut de la table, et l'état joueur sous lequel il s'affiche. */
export type StatutModule = { value: string; etat: EtatAnimation };

export type FiltresModule = {
  /** La saisie brute, pour repeupler le champ. */
  q: string;
  /**
   * La même, échappée pour un `ilike`. ⚠ `sanitizeSearchTerm` retire `%`, `,`,
   * `(`, `)` et `\` mais PAS `*`, que PostgREST traduit lui-même en joker
   * (`docs/bugs.md`). Une recherche sur `*` rend donc toute la liste — ce qui
   * n'expose rien de plus que la liste non filtrée, seul écran concerné ici.
   * Aucun appelant n'aggrave ce trou, et aucun ne le contourne à sa façon.
   */
  terme: string;
  /** `""` si absent OU hors des statuts réels de la table. */
  statut: string;
  page: number;
  /** Bornes du `.range()`, une ligne de plus que la page (astuce `hasNext`). */
  from: number;
  to: number;
  actif: boolean;
};

export function litFiltresModule(
  params: { q?: string; statut?: string; page?: string },
  statuts: readonly StatutModule[],
): FiltresModule {
  const q = (params.q ?? "").trim().slice(0, 80);
  /**
   * Un statut hors de la table est IGNORÉ plutôt que transmis : envoyé tel
   * quel, il rendrait un écran vide sans un mot d'explication, alors que le
   * `<select>` montre « Tous les états » — deux commandes qui se contredisent.
   */
  const statut = statuts.some((s) => s.value === params.statut)
    ? (params.statut as string)
    : "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * MODULE_PAGE_SIZE;
  return {
    q,
    terme: sanitizeSearchTerm(q),
    statut,
    page,
    from,
    // Une ligne de plus que la page : son existence suffit à savoir qu'il y a
    // une suite, sans payer un `count: "exact"` sur toute la table.
    to: from + MODULE_PAGE_SIZE,
    actif: Boolean(q || statut),
  };
}

/** Les paramètres à reporter sur « Précédent / Suivant ». */
export function paramsPagination(filtres: FiltresModule) {
  return {
    q: filtres.q || undefined,
    statut: filtres.statut || undefined,
  };
}

/**
 * Coupe la page de sa ligne excédentaire et dit s'il y a une suite.
 * `rows` est modifié en place, comme le fait déjà la page QR codes.
 */
export function couperPage<T>(rows: T[]): { lignes: T[]; hasNext: boolean } {
  const hasNext = rows.length > MODULE_PAGE_SIZE;
  if (hasNext) rows.pop();
  return { lignes: rows, hasNext };
}

export function ModuleListFilters({
  idPrefix,
  filtres,
  statuts,
  placeholder = "Nom du jeu…",
}: {
  /** Préfixe des `id` de champs : un par page, pour des `<label>` sûrs. */
  idPrefix: string;
  filtres: FiltresModule;
  statuts: readonly StatutModule[];
  placeholder?: string;
}) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <label
          htmlFor={`${idPrefix}-recherche`}
          className="mb-1 block text-sm font-bold text-k-body"
        >
          Rechercher
        </label>
        <input
          id={`${idPrefix}-recherche`}
          name="q"
          defaultValue={filtres.q}
          placeholder={placeholder}
          className="w-56 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-statut`}
          className="mb-1 block text-sm font-bold text-k-body"
        >
          État
        </label>
        <select
          id={`${idPrefix}-statut`}
          name="statut"
          defaultValue={filtres.statut}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Tous les états</option>
          {statuts.map((statut) => (
            <option key={statut.value} value={statut.value}>
              {libelleEtat(statut.etat)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
      >
        Filtrer
      </button>
      {filtres.actif && (
        // `?` seul : le formulaire est sur la page qu'il filtre, la remise à
        // zéro n'a donc pas besoin de connaître son propre chemin.
        <Link
          href="?"
          className="self-center text-sm text-zinc-500 hover:text-zinc-900"
        >
          Réinitialiser
        </Link>
      )}
    </form>
  );
}

/**
 * L'état vide QUAND UN FILTRE EST POSÉ — et il ne dit pas la même chose que
 * l'état vide d'origine. « Créez le premier ! » devant une liste filtrée
 * laisserait croire que le module est vide alors qu'il ne l'est pas : le
 * commerçant créerait un doublon de ce que son propre filtre lui cache.
 */
export function ModuleListAucunResultat({ quoi }: { quoi: string }) {
  return (
    <p className="text-zinc-500">
      Aucun {quoi} ne correspond à ce filtre.{" "}
      <Link href="?" className="font-semibold text-zinc-900 underline">
        Voir tout
      </Link>
    </p>
  );
}
