"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getPlayerProgression,
  getPlayerProgressionArchive,
  openProgressionChest,
} from "@/actions/meta-progression";
import { PROGRESSION_BADGE_GLYPHS } from "@/components/progression/progression-labels";
import type {
  ArchivedProgressionSeason,
  PlayerProgressionSnapshot,
  ProgressionChestItem,
} from "@/lib/meta-progression";

/**
 * Méta-progression côté JOUEUR, greffée au parcours de jeu après une partie —
 * exactement comme ReferralPanel, et pour la même raison : la progression est
 * TRANSVERSE (scopée par organisation, nourrie par toutes les expériences), elle
 * n'a donc pas d'objet propre à adresser par une URL. Aucune surface publique
 * n'est ouverte ; le joueur la découvre là où il joue déjà.
 *
 * DEUX LECTURES, PAS UNE :
 *  · `getPlayerProgression` ne sert que la saison EN COURS ;
 *  · `getPlayerProgressionArchive` sert les saisons CLOSES.
 * Sans la seconde, clore une saison ferait disparaître de l'écran du joueur tout
 * ce qu'il a gagné — un badge décroché ne doit pas s'évaporer parce que la
 * saison est terminée. Le panneau s'affiche donc dès que l'UNE des deux a
 * quelque chose à montrer.
 *
 * IDENTITÉ ET SILENCE : rien n'est passé au serveur, les actions lisent le
 * cookie `lc-player` en LECTURE SEULE. L'archive distingue deux états qu'il ne
 * faut pas confondre — appareil INCONNU (`unavailable`) et joueur connu SANS
 * saison close (`ok` avec zéro saison). Dans les deux cas le panneau se tait,
 * mais jamais avec un « vous n'avez rien gagné » adressé à quelqu'un qu'on n'a
 * pas identifié.
 *
 * DOUBLE-CLIC : l'idempotence vit en base (`unique (player_season_id,
 * request_id)`). L'UI ne la contredit pas — un verrou de ref SYNCHRONE empêche
 * deux requêtes concurrentes, un `requestId` est tiré une fois par geste, et un
 * rejeu signalé par le serveur (`idempotent: true`) n'affiche JAMAIS un second
 * gain : le même objet est présenté comme déjà obtenu.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

interface Theme {
  card: string;
  heading: string;
  body: string;
  bodyDim: string;
  primaryBtn: string;
  gaugeTrack: string;
  gaugeFill: string;
  chip: string;
  chipDim: string;
  note: string;
  divider: string;
}

/** Jetons de style pour les deux ambiances /play (kermesse crème / nuit sombre). */
function theme(kermesse: boolean): Theme {
  return kermesse
    ? {
        card: "k-border bg-white shadow-[4px_4px_0_var(--color-k-ink)]",
        heading: "text-k-ink",
        body: "text-k-body",
        bodyDim: "text-k-body/70",
        primaryBtn: "k-btn-sm border-2 border-k-ink bg-k-yellow text-k-ink",
        gaugeTrack: "border-2 border-k-ink bg-white",
        gaugeFill: "bg-k-green",
        chip: "border-2 border-k-ink bg-k-yellow/60 text-k-ink",
        chipDim: "border-2 border-dashed border-k-ink/40 text-k-body/70",
        note: "border-amber-300 bg-amber-50 text-amber-800",
        divider: "border-k-ink/20",
      }
    : {
        card: "border border-white/10 bg-white/5",
        heading: "text-white",
        body: "text-zinc-400",
        bodyDim: "text-zinc-500",
        primaryBtn: "bg-white text-zinc-900",
        gaugeTrack: "border border-white/15 bg-black/30",
        gaugeFill: "bg-emerald-400",
        chip: "border border-white/20 bg-white/10 text-white",
        chipDim: "border border-dashed border-white/25 text-zinc-300",
        note: "border-amber-400/40 bg-amber-400/10 text-amber-200",
        divider: "border-white/10",
      };
}

/** Issue de la dernière ouverture, telle qu'annoncée au joueur. */
type OpenFeedback =
  | { kind: "won"; item: ProgressionChestItem }
  | { kind: "replay"; item: ProgressionChestItem }
  | { kind: "message"; text: string };

/** Clé d'idempotence d'un geste : un UUID par clic, dérivé côté serveur à défaut. */
function newRequestId(): string | undefined {
  try {
    return crypto.randomUUID();
  } catch {
    // Contexte non sécurisé / API absente : l'action dérive alors une clé
    // déterministe sur une fenêtre courte (deriveProgressionRequestId).
    return undefined;
  }
}

function seasonPeriod(season: ArchivedProgressionSeason): string | null {
  const raw = season.endsAt ?? season.startsAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function ProgressionPanel({
  organizationId,
  kermesse,
}: {
  organizationId: string;
  kermesse: boolean;
}) {
  const t = theme(kermesse);
  const reducedMotion = usePrefersReducedMotion();
  const [snapshot, setSnapshot] = useState<PlayerProgressionSnapshot | null>(
    null,
  );
  const [archived, setArchived] = useState<ArchivedProgressionSeason[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<OpenFeedback | null>(null);
  // Verrou SYNCHRONE : `openingId` ne devient visible qu'au rendu suivant, il
  // ne protège pas d'un double-clic rapproché. La ref, si.
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      return await getPlayerProgression({ organizationId });
    } catch {
      return null;
    }
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [current, archive] = await Promise.all([
        refresh(),
        getPlayerProgressionArchive({ organizationId }).catch(() => null),
      ]);
      if (!active) return;
      if (current) setSnapshot(current);
      // `unavailable` (appareil inconnu) et `ok` sans saison close donnent tous
      // deux une liste vide : le panneau se tait, sans rien affirmer.
      if (archive?.state === "ok") setArchived(archive.seasons);
    })();
    return () => {
      active = false;
    };
  }, [organizationId, refresh]);

  const open = (chestId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setOpeningId(chestId);
    setFeedback(null);
    const requestId = newRequestId();

    void (async () => {
      try {
        const result = await openProgressionChest({
          organizationId,
          chestId,
          requestId,
        });
        if (!result.ok) {
          setFeedback({ kind: "message", text: result.error });
          return;
        }
        const opening = result.data;
        if (opening.state === "opened" && opening.item) {
          setFeedback(
            opening.idempotent
              ? { kind: "replay", item: opening.item }
              : { kind: "won", item: opening.item },
          );
        } else if (opening.state === "insufficient_keys") {
          setFeedback({
            kind: "message",
            text: opening.requiredKeys
              ? `Il vous faut ${opening.requiredKeys} clé${opening.requiredKeys > 1 ? "s" : ""} pour ouvrir ce coffre.`
              : "Il vous manque des clés pour ouvrir ce coffre.",
          });
        } else if (opening.state === "collection_complete") {
          setFeedback({
            kind: "message",
            text: "Vous possédez déjà tous les objets de ce coffre.",
          });
        } else {
          setFeedback({
            kind: "message",
            text: "Ce coffre n'est pas disponible pour le moment.",
          });
        }
        const fresh = await refresh();
        if (fresh) setSnapshot(fresh);
      } catch {
        setFeedback({
          kind: "message",
          text: "Une erreur est survenue, réessayez.",
        });
      } finally {
        busyRef.current = false;
        setOpeningId(null);
      }
    })();
  };

  // Saison en cours, re-typée pour que `season` cesse d'être nullable.
  const active =
    snapshot && snapshot.state === "ok" && snapshot.season
      ? { ...snapshot, season: snapshot.season }
      : null;

  // Rien en cours ET rien d'archivé : le panneau n'existe pas. Appareil inconnu,
  // aucune saison, organisation qui ne sert plus — trois cas volontairement
  // indiscernables.
  if (!active && archived.length === 0) return null;

  return (
    <section
      aria-labelledby="progression-title"
      className={`mt-8 w-full rounded-2xl p-4 text-left sm:p-5 ${t.card} ${
        reducedMotion ? "" : "play-in"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="progression-title" className={`text-lg font-black ${t.heading}`}>
          Votre progression
        </h3>
        {active && (
          <p className={`text-sm font-bold ${t.body}`}>{active.season.name}</p>
        )}
      </div>

      {active ? (
        <ActiveSeason
          snapshot={active}
          t={t}
          reducedMotion={reducedMotion}
          openingId={openingId}
          onOpen={open}
        />
      ) : (
        <p className={`mt-2 text-sm font-bold ${t.body}`}>
          Aucune saison en cours en ce moment. Voici ce que vous avez déjà
          gagné.
        </p>
      )}

      {active && (
        <div role="status" aria-live="polite" className="mt-3">
          {feedback?.kind === "won" && (
            <p
              className={`rounded-xl px-3 py-2 text-sm font-bold ${t.chip} ${
                reducedMotion ? "" : "play-in"
              }`}
            >
              <span aria-hidden>🎉</span> Nouvel objet : {feedback.item.name}
              {feedback.item.description
                ? ` — ${feedback.item.description}`
                : ""}
            </p>
          )}
          {feedback?.kind === "replay" && (
            <p className={`rounded-xl px-3 py-2 text-sm font-bold ${t.chip}`}>
              Coffre déjà ouvert : {feedback.item.name} est dans votre
              collection.
            </p>
          )}
          {feedback?.kind === "message" && (
            <p
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${t.note}`}
            >
              {feedback.text}
            </p>
          )}
        </div>
      )}

      {archived.length > 0 && (
        <div className={`mt-5 border-t pt-4 ${t.divider}`}>
          <h4 className={`text-sm font-black ${t.heading}`}>Saisons passées</h4>
          <p className={`text-xs ${t.bodyDim}`}>
            Ces saisons sont terminées : ce que vous y avez gagné vous reste
            acquis.
          </p>
          <ul className="mt-2 space-y-3">
            {archived.map((season) => (
              <ArchivedSeason key={season.id} season={season} t={t} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Saison EN COURS : clés, missions, badges, collection, coffres. */
function ActiveSeason({
  snapshot,
  t,
  reducedMotion,
  openingId,
  onOpen,
}: {
  snapshot: PlayerProgressionSnapshot & {
    season: NonNullable<PlayerProgressionSnapshot["season"]>;
  };
  t: Theme;
  reducedMotion: boolean;
  openingId: string | null;
  onOpen: (chestId: string) => void;
}) {
  const collectedItems = snapshot.collections.flatMap((collection) =>
    collection.items.filter((item) => item.owned),
  );
  const totalItems = snapshot.collections.reduce(
    (total, collection) => total + collection.items.length,
    0,
  );
  const earnedBadges = snapshot.badges.filter((badge) => badge.earned);

  return (
    <>
      <p className={`mt-2 text-sm font-bold ${t.heading}`}>
        <span aria-hidden>🔑</span> {snapshot.keys} clé
        {snapshot.keys > 1 ? "s" : ""} disponible
        {snapshot.keys > 1 ? "s" : ""}
      </p>
      <p className={`text-xs ${t.bodyDim}`}>
        Vos missions avancent toutes seules à chaque partie.
      </p>

      {snapshot.missions.length > 0 && (
        <div className="mt-4">
          <h4 className={`text-sm font-black ${t.heading}`}>Missions</h4>
          <ul className="mt-2 space-y-3">
            {snapshot.missions.map((mission) => {
              const percent =
                mission.target > 0
                  ? Math.min(
                      100,
                      Math.round((mission.current / mission.target) * 100),
                    )
                  : 0;
              const done = mission.completedAt !== null;
              return (
                <li key={mission.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-sm font-bold ${t.heading}`}>
                      {done && <span aria-hidden>✅ </span>}
                      {mission.name}
                    </p>
                    <p className={`shrink-0 text-xs font-bold ${t.body}`}>
                      {mission.current}/{mission.target}
                    </p>
                  </div>
                  {mission.description && (
                    <p className={`text-xs ${t.bodyDim}`}>
                      {mission.description}
                    </p>
                  )}
                  <div
                    role="progressbar"
                    aria-valuenow={mission.current}
                    aria-valuemin={0}
                    aria-valuemax={mission.target}
                    aria-label={`${mission.name} : ${mission.current} sur ${mission.target}`}
                    className={`mt-1.5 h-2.5 w-full overflow-hidden rounded-full ${t.gaugeTrack}`}
                  >
                    <div
                      className={`h-full rounded-full ${t.gaugeFill}`}
                      style={{
                        width: `${percent}%`,
                        transition: reducedMotion ? "none" : "width 0.4s ease",
                      }}
                    />
                  </div>
                  {mission.keyReward > 0 && !done && (
                    <p className={`mt-1 text-xs ${t.bodyDim}`}>
                      Récompense : {mission.keyReward} clé
                      {mission.keyReward > 1 ? "s" : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {snapshot.badges.length > 0 && (
        <div className="mt-4">
          <h4 className={`text-sm font-black ${t.heading}`}>
            Badges ({earnedBadges.length}/{snapshot.badges.length})
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {snapshot.badges.map((badge) => (
              <li
                key={badge.id}
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  badge.earned ? t.chip : t.chipDim
                }`}
              >
                <span aria-hidden>
                  {PROGRESSION_BADGE_GLYPHS[badge.iconKey]}
                </span>{" "}
                {badge.name}
                <span className="sr-only">
                  {badge.earned ? " — obtenu" : " — pas encore obtenu"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalItems > 0 && (
        <div className="mt-4">
          <h4 className={`text-sm font-black ${t.heading}`}>
            Collection ({collectedItems.length}/{totalItems})
          </h4>
          {snapshot.collections.map((collection) => (
            <div key={collection.id} className="mt-2">
              <p className={`text-xs font-bold ${t.body}`}>{collection.name}</p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {collection.items.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      item.owned ? t.chip : t.chipDim
                    }`}
                  >
                    {item.owned ? item.name : "· · ·"}
                    <span className="sr-only">
                      {item.owned
                        ? ` ${item.name} — dans votre collection`
                        : " Objet non découvert"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {snapshot.chests.length > 0 && (
        <div className="mt-4">
          <h4 className={`text-sm font-black ${t.heading}`}>Coffres</h4>
          <ul className="mt-2 space-y-2">
            {snapshot.chests.map((chest) => {
              const affordable = snapshot.keys >= chest.keyCost;
              const empty = chest.availableItems === 0;
              const busy = openingId === chest.id;
              return (
                <li
                  key={chest.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${t.heading}`}>
                      <span aria-hidden>🎁</span> {chest.name}
                    </p>
                    <p className={`text-xs ${t.bodyDim}`}>
                      {chest.keyCost} clé{chest.keyCost > 1 ? "s" : ""} ·{" "}
                      {empty
                        ? "collection complète"
                        : `${chest.availableItems} objet${chest.availableItems > 1 ? "s" : ""} à découvrir`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpen(chest.id)}
                    disabled={busy || !affordable || empty || openingId !== null}
                    className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-50 ${t.primaryBtn}`}
                  >
                    {busy ? "Ouverture…" : "Ouvrir"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * Une saison CLOSE : uniquement ce que CE joueur a obtenu (l'archive ne porte
 * jamais le catalogue complet, aucun objet « verrouillé » n'y figure donc).
 */
function ArchivedSeason({
  season,
  t,
}: {
  season: ArchivedProgressionSeason;
  t: Theme;
}) {
  const when = seasonPeriod(season);
  const nothing = season.badges.length === 0 && season.items.length === 0;

  return (
    <li>
      <p className={`text-sm font-bold ${t.heading}`}>
        {season.name}
        {when && <span className={`font-semibold ${t.bodyDim}`}> · {when}</span>}
      </p>
      {nothing ? (
        <p className={`text-xs ${t.bodyDim}`}>
          {season.keysEarned > 0
            ? `${season.keysEarned} clé${season.keysEarned > 1 ? "s" : ""} gagnée${season.keysEarned > 1 ? "s" : ""} pendant cette saison.`
            : "Vous avez participé à cette saison."}
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {season.badges.map((badge) => (
            <li
              key={badge.id}
              className={`rounded-full px-3 py-1 text-xs font-bold ${t.chip}`}
            >
              <span aria-hidden>{PROGRESSION_BADGE_GLYPHS[badge.iconKey]}</span>{" "}
              {badge.name}
              <span className="sr-only"> — badge obtenu</span>
            </li>
          ))}
          {season.items.map((item) => (
            <li
              key={item.id}
              className={`rounded-full px-3 py-1 text-xs font-bold ${t.chip}`}
            >
              {item.name}
              <span className="sr-only"> — objet de collection obtenu</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
