/**
 * Progression du joueur — LA JOURNÉE D'ABORD, la saison en second.
 *
 * ── CE QUE ÇA RÉPARE (relevé le 2026-08-29) ──
 *
 * La barre suivait la SAISON ENTIÈRE. Un commerçant qui importe son année pose
 * deux cents matchs, et le joueur ouvrait sa page sur « 0/201 · 0 % » — un
 * chiffre exact, une barre vide, et aucun rapport avec ce qu'il venait faire.
 * Remplir la journée du week-end la faisait passer à 4 %.
 *
 * Une barre de progression ne mesure pas un inventaire : elle mesure un geste
 * qu'on peut terminer. C'est donc la PROCHAINE JOURNÉE qu'elle suit — la même
 * que le bloc de tête de la grille — et 100 % veut dire « ma journée est
 * posée », ce qui arrive vraiment.
 *
 * ── LA SAISON N'EST PAS PERDUE, ELLE PASSE DERRIÈRE ──
 *
 * Le joueur qui remplit toute son année a le droit de voir où il en est. Le
 * total de la saison reste affiché, en seconde ligne et sans barre : c'est une
 * information, plus un objectif.
 *
 * Elle n'apparaît que si elle DIFFÈRE de la journée — sur un championnat d'une
 * seule journée, répéter « 3/9 » deux fois n'apprendrait rien.
 *
 * Composant serveur (aucune interaction).
 */
export function PredictionProgress({
  done,
  total,
  libelle,
  saison,
}: {
  /** Pronostics déjà posés sur la journée suivie. */
  done: number;
  /** Matchs de cette journée (Y de « X/Y »). */
  total: number;
  /** Nom de la journée suivie — « 3e journée », « Autres matchs ». */
  libelle?: string;
  /** Où en est la grille entière, quand elle dépasse cette journée. */
  saison?: { done: number; total: number };
}) {
  if (total === 0) return null;

  const complete = done >= total;
  const pct = Math.min(100, Math.round((done / total) * 100));
  // « Plus large que la journée » et non « différente » : une saison au même
  // total que la journée est la même chose dite deux fois.
  const montrerSaison = saison !== undefined && saison.total > total;

  return (
    <div className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-black text-k-ink">
          {complete ? (
            <>
              {libelle ? `${libelle} complète ` : "Grille complète "}! 🎉
            </>
          ) : (
            <>
              {done}/{total} pronostic{done > 1 ? "s" : ""} posé
              {done > 1 ? "s" : ""}
              {libelle && (
                <span className="font-bold text-k-body"> · {libelle}</span>
              )}
            </>
          )}
        </span>
        <span className="text-xs font-bold tabular-nums text-k-body/70">
          {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(done, total)}
        aria-valuetext={`${done} pronostics sur ${total}${libelle ? ` — ${libelle}` : ""}`}
        aria-label="Progression de vos pronostics"
        className="h-3 overflow-hidden rounded-full border-2 border-k-ink bg-k-stripe"
      >
        <div
          className={
            complete
              ? "h-full rounded-full bg-k-green transition-[width] duration-500"
              : "h-full rounded-full bg-k-yellow transition-[width] duration-500"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      {complete && (
        <p className="mt-2 text-xs font-bold text-k-body">
          {montrerSaison
            ? "Vous êtes à jour — les journées suivantes vous attendent plus bas."
            : "Tous vos pronostics sont posés — rendez-vous au classement !"}
        </p>
      )}
      {montrerSaison && (
        <p className="mt-2 text-xs text-k-body">
          Sur toute la saison : {saison.done}/{saison.total} posé
          {saison.done > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
