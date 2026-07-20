"use client";

import { useState, type ReactNode } from "react";
import { Avatar } from "@/lib/avatars";

/**
 * Mini espace joueur du parcours /pronos — en-tête profil (avatar,
 * pseudo, points, rang) + onglets Matchs / Classement / Profil.
 *
 * Les contenus des onglets sont rendus côté serveur et passés en slots ;
 * les onglets inactifs sont masqués en CSS (attribut hidden) plutôt que
 * démontés, pour préserver une saisie de prono en cours.
 */

const TABS = [
  { key: "matchs", label: "⚽ Matchs" },
  { key: "classement", label: "🏆 Classement" },
  { key: "profil", label: "👤 Profil" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function PlayerHub({
  firstName,
  avatar,
  points,
  rank,
  totalPlayers,
  toPredict,
  matchesSlot,
  leaderboardSlot,
  profileSlot,
}: {
  firstName: string;
  avatar: string;
  points: number;
  /** Rang dans le classement du championnat (null tant qu'absent). */
  rank: number | null;
  totalPlayers: number;
  /** Matchs encore ouverts sans pronostic déposé. */
  toPredict: number;
  matchesSlot: ReactNode;
  leaderboardSlot: ReactNode;
  profileSlot: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("matchs");

  return (
    <div>
      {/* ── En-tête profil ── */}
      <div className="k-border mb-4 rounded-2xl bg-white p-4 shadow-[6px_6px_0_var(--color-k-ink)]">
        <div className="flex items-center gap-3">
          <Avatar id={avatar} className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black text-k-ink">
              {firstName}
            </p>
            <p className="text-sm font-bold text-k-body">
              {points} pt{points > 1 ? "s" : ""}
              {rank !== null && (
                <>
                  {" "}· {rank}
                  {rank === 1 ? "ᵉʳ" : "ᵉ"} sur {totalPlayers}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTab("profil")}
            className="shrink-0 text-sm font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
          >
            Modifier
          </button>
        </div>
        {toPredict > 0 && (
          <p className="mt-3 rounded-xl bg-k-yellow/40 px-3 py-1.5 text-xs font-bold text-k-ink">
            ⚽ {toPredict} match{toPredict > 1 ? "s" : ""} à pronostiquer
          </p>
        )}
      </div>

      {/* ── Onglets ── */}
      <div role="tablist" aria-label="Espace joueur" className="mb-5 grid grid-cols-3 gap-1.5">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`prono-panel-${t.key}`}
              onClick={() => setTab(t.key)}
              className={
                active
                  ? "rounded-xl border-2 border-k-ink bg-k-yellow px-2 py-2 text-sm font-black text-k-ink"
                  : "rounded-xl border-2 border-k-ink bg-white px-2 py-2 text-sm font-bold text-k-body hover:bg-zinc-50"
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div id="prono-panel-matchs" role="tabpanel" hidden={tab !== "matchs"}>
        {matchesSlot}
      </div>
      <div id="prono-panel-classement" role="tabpanel" hidden={tab !== "classement"}>
        {leaderboardSlot}
      </div>
      <div id="prono-panel-profil" role="tabpanel" hidden={tab !== "profil"}>
        {profileSlot}
      </div>
    </div>
  );
}
