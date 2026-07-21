import { Avatar } from "@/lib/avatars";
import { rewardForRank, type ContestReward } from "@/lib/pronostics";
import type { LeaderboardEntry } from "@/lib/pronostics-context";

/**
 * Carte de classement du parcours public /pronos — utilisée pour le
 * classement général ET pour les ligues privées (composant serveur,
 * rendu dans la page et passé en slot aux onglets client).
 *
 * Le joueur courant est surligné ; s'il est au-delà du top affiché, sa
 * ligne est ajoutée sous une ellipse (il voit toujours sa position sans
 * charger tout le monde). Les récompenses (🎁) ne s'affichent que sur le
 * classement général : les rangs d'une ligue sont re-numérotés et ne
 * donnent pas droit aux lots.
 */
export function ContestLeaderboardCard({
  title,
  entries,
  totalPlayers,
  myPlayerId,
  myEntry = null,
  rewards = [],
  finished,
  emptyText = "Le classement apparaîtra dès les premiers pronostics.",
}: {
  title: string;
  entries: LeaderboardEntry[];
  totalPlayers: number;
  /** Joueur courant (surlignage « vous ») — null pour un visiteur. */
  myPlayerId: string | null;
  /** Ligne du joueur courant si elle est au-delà du top affiché. */
  myEntry?: LeaderboardEntry | null;
  /** Lots par rang — uniquement pour le classement général. */
  rewards?: ContestReward[];
  /** Championnat terminé : podium médaillé. */
  finished: boolean;
  emptyText?: string;
}) {
  if (entries.length === 0) {
    return (
      <section className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
        <h2 className="text-lg font-black text-k-ink mb-3">{title}</h2>
        <p className="text-center text-sm text-k-body">{emptyText}</p>
      </section>
    );
  }

  const renderRow = (entry: LeaderboardEntry) => {
    const reward = rewardForRank(rewards, entry.rank);
    const isMe = myPlayerId === entry.playerId;
    return (
      <li
        key={entry.playerId}
        className={
          isMe
            ? "flex items-center gap-3 rounded-xl border-2 border-k-ink bg-k-yellow/50 px-3 py-2"
            : "flex items-center gap-3 rounded-xl bg-k-stripe px-3 py-2"
        }
      >
        <span className="w-7 text-center font-black tabular-nums text-k-ink">
          {entry.rank <= 3 && finished ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
        </span>
        <Avatar id={entry.avatar} className="h-8 w-8 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
          {entry.firstName}
          {isMe && <span className="ml-1.5 text-xs">(vous)</span>}
        </span>
        {reward && (
          <span className="shrink-0 text-xs" title={reward} aria-label={reward}>
            🎁
          </span>
        )}
        <span className="w-12 text-right text-sm font-black tabular-nums text-k-ink">
          {entry.points} pt{entry.points > 1 ? "s" : ""}
        </span>
      </li>
    );
  };

  // Joueur courant au-delà du top affiché : ligne ajoutée sous une ellipse.
  const myRowBeyondTop =
    myEntry && !entries.some((e) => e.playerId === myEntry.playerId)
      ? myEntry
      : null;

  return (
    <section className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
      <h2 className="text-lg font-black text-k-ink mb-3">{title}</h2>
      <ol className="space-y-1.5">
        {entries.map(renderRow)}
        {myRowBeyondTop && (
          <>
            <li aria-hidden className="select-none text-center leading-none text-k-body/60">
              ⋯
            </li>
            {renderRow(myRowBeyondTop)}
          </>
        )}
      </ol>
      {totalPlayers > entries.length && (
        <p className="mt-3 text-center text-xs text-k-body/70">
          Top {entries.length} affiché · {totalPlayers} joueurs classés
        </p>
      )}
    </section>
  );
}
