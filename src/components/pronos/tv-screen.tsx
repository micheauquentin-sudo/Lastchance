"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/lib/avatars";
import { clampTvPage, tvPages, TV_ROWS_PER_PAGE } from "./tv-paging";

/**
 * Mode TV du championnat — écran de salle (bar, brasserie) : fond
 * sombre, très grande typographie, classement rafraîchi par polling.
 * Aucune interaction requise ; le curseur se masque après inactivité.
 *
 * Tailles en vh/vw + clamp : l'écran est pensé pour un téléviseur
 * 16:9 à distance, mais reste lisible sur un simple portable.
 */

export interface TvEntry {
  rank: number;
  firstName: string;
  avatar: string;
  points: number;
}

export interface TvData {
  contest: { name: string; status: string; finalizedAt: string | null };
  organization: { name: string; logoUrl: string | null };
  totalPlayers: number;
  entries: TvEntry[];
  generatedAt: string;
}

/** Cadence de rafraîchissement du classement (l'API cache ~30 s). */
const REFRESH_MS = 45_000;
/** Rotation des pages quand le classement dépasse un écran. */
const PAGE_ROTATE_MS = 12_000;
/** Masquage du curseur après inactivité. */
const CURSOR_HIDE_MS = 4_000;

/** Habillage or / argent / bronze du podium. */
const PODIUM_CLASSES: Record<number, string> = {
  1: "bg-k-yellow text-k-ink",
  2: "bg-[#ccd3dc] text-k-ink",
  3: "bg-[#d99e6b] text-k-ink",
};

// Hydratation détectée sans re-rendu en cascade : rendu serveur → false,
// premier rendu client → true (l'heure locale du téléviseur est alors sûre).
const emptySubscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

export function TvScreen({
  slug,
  initial,
  joinLabel,
}: {
  slug: string;
  initial: TvData;
  /** Adresse publique lisible (sans protocole) — mention « pour jouer ». */
  joinLabel: string | null;
}) {
  const [data, setData] = useState<TvData>(initial);

  // ── Polling : on remplace la photo uniquement si la réponse est saine.
  // 429 (cache partagé saturé) ou coupure réseau → on garde l'affichage
  // courant, jamais d'écran d'erreur en salle.
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/pronos/${slug}/tv`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Partial<TvData> | null;
        if (
          json &&
          typeof json === "object" &&
          json.contest &&
          json.organization &&
          Array.isArray(json.entries) &&
          typeof json.generatedAt === "string"
        ) {
          setData(json as TvData);
        }
      } catch {
        // Réseau indisponible : la dernière photo reste à l'écran.
      }
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [slug]);

  // ── Pagination : rotation douce par pages complètes.
  const pages = useMemo(() => tvPages(data.entries, TV_ROWS_PER_PAGE), [data.entries]);
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    if (pages.length <= 1) return;
    const id = window.setInterval(
      () => setRotation((r) => r + 1),
      PAGE_ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [pages.length]);
  const pageIndex = clampTvPage(rotation, pages.length);
  const currentPage = pages[pageIndex] ?? [];

  // ── Curseur masqué après inactivité (écran d'affichage pur).
  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setCursorHidden(true), CURSOR_HIDE_MS);
    const wake = () => {
      setCursorHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), CURSOR_HIDE_MS);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // Heure de mise à jour : formatée côté client uniquement (le fuseau
  // du serveur diffère de celui du téléviseur — pas de mismatch d'hydratation).
  const hydrated = useHydrated();
  const updatedLabel = hydrated
    ? new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(data.generatedAt))
    : null;

  const finished =
    data.contest.status === "finished" || data.contest.finalizedAt !== null;

  return (
    <div
      className={`flex min-h-dvh flex-col overflow-hidden bg-k-ink text-k-bg ${
        cursorHidden ? "cursor-none" : ""
      }`}
    >
      {/* ── En-tête : établissement + championnat ── */}
      <header className="flex items-center gap-[2vw] border-b-4 border-k-yellow px-[4vw] py-[2.2vh]">
        {data.organization.logoUrl ? (
          // URL Supabase validée à l'upload ; image HTML volontaire (le
          // domaine du projet n'est pas figé dans next.config).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.organization.logoUrl}
            alt=""
            className="h-[8vh] w-[8vh] shrink-0 rounded-full border-4 border-k-yellow bg-white object-cover"
          />
        ) : (
          <span aria-hidden className="text-[6vh] leading-none">
            🏆
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[clamp(0.9rem,2.4vh,1.6rem)] font-bold uppercase tracking-[0.2em] text-k-bg/70">
            {data.organization.name}
          </p>
          <h1 className="truncate text-[clamp(1.6rem,5.2vh,3.8rem)] font-black leading-tight">
            {data.contest.name}
          </h1>
        </div>
        <div className="shrink-0 text-right">
          {finished ? (
            <span className="inline-block rounded-full border-4 border-k-yellow px-[1.4vw] py-[0.7vh] text-[clamp(1rem,2.8vh,1.8rem)] font-black text-k-yellow">
              🏅 Classement final
            </span>
          ) : (
            data.totalPlayers > 0 && (
              <span className="text-[clamp(1rem,2.8vh,1.8rem)] font-black text-k-bg/80">
                {data.totalPlayers} joueur{data.totalPlayers > 1 ? "s" : ""}
              </span>
            )
          )}
        </div>
      </header>

      {/* ── Classement ── */}
      <main className="flex flex-1 flex-col px-[4vw] py-[2vh]">
        {data.totalPlayers === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-[2.5vh] text-center">
            <span aria-hidden className="text-[10vh] leading-none">
              ⚽
            </span>
            <p className="text-[clamp(1.6rem,5.5vh,4rem)] font-black">
              En attente des premiers joueurs…
            </p>
            {joinLabel && (
              <p className="text-[clamp(1rem,2.8vh,1.8rem)] font-bold text-k-bg/70">
                Scannez le QR code pour jouer · {joinLabel}
              </p>
            )}
          </div>
        ) : (
          <ol
            key={pageIndex}
            className="flex flex-1 flex-col justify-start gap-[1.2vh] motion-safe:animate-[tv-page_600ms_ease-out]"
          >
            {currentPage.map((entry) => {
              const podium = PODIUM_CLASSES[entry.rank];
              return (
                <li
                  key={`${entry.rank}-${entry.firstName}`}
                  className={`flex items-center gap-[1.6vw] rounded-2xl px-[1.6vw] py-[0.9vh] ${
                    podium ?? "bg-white/5 text-k-bg"
                  }`}
                >
                  <span className="w-[4.5vw] shrink-0 text-center text-[clamp(1.3rem,4vh,2.8rem)] font-black tabular-nums">
                    {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
                  </span>
                  <Avatar
                    id={entry.avatar}
                    className="h-[5.2vh] w-[5.2vh] shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-[clamp(1.2rem,3.8vh,2.6rem)] font-black">
                    {entry.firstName}
                  </span>
                  <span className="shrink-0 text-[clamp(1.2rem,3.8vh,2.6rem)] font-black tabular-nums">
                    {entry.points}{" "}
                    <span className="text-[clamp(0.8rem,2.2vh,1.4rem)] font-bold opacity-70">
                      pt{entry.points > 1 ? "s" : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </main>

      {/* ── Pied : adresse pour jouer, pages, fraîcheur ── */}
      <footer className="flex items-center justify-between gap-[2vw] px-[4vw] py-[1.6vh] text-[clamp(0.8rem,2vh,1.2rem)] font-bold text-k-bg/50">
        <span className="min-w-0 truncate">
          {joinLabel ? <>Pour jouer : {joinLabel}</> : null}
        </span>
        {pages.length > 1 && (
          <span
            className="flex shrink-0 items-center gap-[0.6vw]"
            role="status"
            aria-label={`Page ${pageIndex + 1} sur ${pages.length}`}
          >
            {pages.map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={
                  i === pageIndex
                    ? "h-[1.2vh] w-[1.2vh] rounded-full bg-k-yellow"
                    : "h-[1.2vh] w-[1.2vh] rounded-full bg-k-bg/25"
                }
              />
            ))}
          </span>
        )}
        <span className="shrink-0 tabular-nums">
          {updatedLabel ? `Mis à jour à ${updatedLabel}` : " "}
        </span>
      </footer>
    </div>
  );
}
