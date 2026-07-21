/**
 * Progression de la grille du joueur — « X/Y pronostics complétés ».
 *
 * Composant serveur (aucune interaction) affiché en tête de l'onglet
 * Matchs du mini espace joueur. À 100 %, l'état est valorisé
 * (« Grille complète ! ») pour récompenser le joueur assidu.
 */
export function PredictionProgress({
  done,
  total,
}: {
  /** Matchs du championnat pour lesquels le joueur a déposé un prono. */
  done: number;
  /** Matchs du championnat (Y de « X/Y »). */
  total: number;
}) {
  if (total === 0) return null;

  const complete = done >= total;
  const pct = Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-black text-k-ink">
          {complete ? (
            <>Grille complète ! 🎉</>
          ) : (
            <>
              {done}/{total} pronostic{done > 1 ? "s" : ""} complété
              {done > 1 ? "s" : ""}
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
        aria-valuetext={`${done} pronostics sur ${total}`}
        aria-label="Progression de votre grille de pronostics"
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
          Tous vos pronostics sont posés — rendez-vous au classement !
        </p>
      )}
    </div>
  );
}
