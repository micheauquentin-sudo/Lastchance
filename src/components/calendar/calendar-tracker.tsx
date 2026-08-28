"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import {
  getCalendarState,
  joinCalendar,
  openCalendarBox,
} from "@/actions/calendar";
import type { CalendarPublicDay, CalendarPublicState } from "@/lib/calendar";
import type { CalendarSpinBundle } from "@/lib/calendar-spin-bundle";
import type { CalendarTheme } from "@/types/database";
import { CalendarSpinExperience } from "./calendar-spin-experience";
import {
  calendarBoxState,
  calendarConsolation,
  calendarDaySansGain,
  calendarProgress,
  formatCalendarUnlock,
  prochaineOuverture,
  type CalendarBoxState,
  type CalendarProgress,
} from "./calendar-state";
import { LienPortefeuille } from "@/components/wallet/lien-portefeuille";
import { ProposerPasseport } from "@/components/loyalty/proposer-passeport";
import { ProposerJackpot } from "@/components/jackpot/proposer-jackpot";
import { SortieApresJeu } from "@/components/sortie/sortie-apres-jeu";
import type { SortieApresJeu as Sortie } from "@/lib/sortie-apres-jeu";
import { calendarThemeTokens } from "./calendar-theme";

/* Calendrier / campagnes quotidiennes côté joueur — DA « Kermesse » (crème,
   encre, jaune, ombres dures), déclinée par saison (5 thèmes). La grille de
   cases s'ouvre au fil des jours ; le contenu d'une case n'est révélé qu'une
   fois la case ouverte par CE joueur (le serveur ne le renvoie jamais avant).
   Mobile d'abord : le client arrive en scannant le QR du commerce, et peut
   ajouter la page à son écran d'accueil (PWA). */

/** Rafraîchissement doux de l'état (les cases changent au fil des JOURS). */
const POLL_MS = 60_000;

// Partage natif / hydratation détectés sans écart d'hydratation (serveur → false).
const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );
const useHydrated = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

export interface CalendarTrackerProps {
  calendarId: string;
  publicSlug: string;
  organizationName: string;
  /** Organisation du jeu — clé de la proposition de Passeport. */
  organizationId?: string | null;
  logoUrl: string | null;
  theme: CalendarTheme;
  merchantContent: string | null;
  /** État public initial (rendu serveur, déjà filtré : aucun contenu caché). */
  initialState: CalendarPublicState;
  /** dayIndex → id de la case (résolu côté serveur : l'état public masque l'id). */
  dayIds: Record<number, string>;
  /** wheelId → segments + config de collecte (cases `spin`). */
  spinBundles: Record<string, CalendarSpinBundle>;
  /**
   * Vitrine publiée + réseaux du commerce, résolus au serveur. `null` = rien
   * à proposer : le bas de page se tait plutôt que d'afficher un cadre vide.
   */
  sortie?: Sortie | null;
}

/** Convertit une case ouverte (résultat d'openCalendarBox) en case publique. */
function mergeOpenedDay(
  existing: CalendarPublicDay | undefined,
  day: {
    dayIndex: number;
    unlockAt: string | null;
    contentType: CalendarPublicDay["contentType"];
    contentText: string | null;
    rewardLabel: string | null;
    rewardDetails: string | null;
    code: string | null;
    spinGrantToken: string | null;
    targetWheelId: string | null;
    outOfStock: boolean;
  },
): CalendarPublicDay {
  return {
    dayIndex: day.dayIndex,
    unlockAt: day.unlockAt ?? existing?.unlockAt ?? null,
    status: "opened",
    isSpecial: existing?.isSpecial ?? false,
    contentType: day.contentType,
    contentText: day.contentText,
    rewardLabel: day.rewardLabel,
    rewardDetails: day.rewardDetails,
    code: day.code,
    spinGrantToken: day.spinGrantToken,
    targetWheelId: day.targetWheelId,
    resultingSpinId: existing?.resultingSpinId ?? null,
    outOfStock: day.outOfStock,
  };
}

export function CalendarTracker({
  calendarId,
  publicSlug,
  organizationName,
  organizationId = null,
  logoUrl,
  theme,
  merchantContent,
  initialState,
  dayIds,
  spinBundles,
  sortie = null,
}: CalendarTrackerProps) {
  const router = useRouter();
  const tokens = calendarThemeTokens(theme);

  // Photo serveur vivante : point de départ = rendu serveur, rafraîchie par le
  // poll (dernière photo SAINE conservée sur coupure) et par les ouvertures.
  const [snapshot, setSnapshot] = useState<CalendarPublicState>(initialState);

  // Case actuellement révélée en modale (ouverture réussie ou re-consultation).
  const [revealed, setRevealed] = useState<CalendarPublicDay | null>(null);
  // Case en cours d'ouverture (dayIndex) — désactive le clic et affiche l'état.
  const [opening, setOpening] = useState<number | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Tour de roue offert en plein écran (remplace le calendrier).
  const [activeSpin, setActiveSpin] = useState<{
    grantToken: string;
    bundle: CalendarSpinBundle;
    label: string;
  } | null>(null);

  // Bundles de roue obtenus À LA VOLÉE : le préchargé (`spinBundles`) ne couvre
  // que les cases déjà ouvertes à l'arrivée ; openCalendarBox renvoie le bundle
  // de la case ouverte ce session-ci (pas de spoiler préchargé des cases futures).
  const [extraBundles, setExtraBundles] = useState<
    Record<string, CalendarSpinBundle>
  >({});
  const allBundles = useMemo(
    () => ({ ...spinBundles, ...extraBundles }),
    [spinBundles, extraBundles],
  );

  const calendar = snapshot.calendar;
  const days = [...snapshot.days].sort((a, b) => a.dayIndex - b.dayIndex);
  const progress = calendarProgress(
    snapshot.progression.openedCount,
    snapshot.progression.dayCount || calendar?.dayCount || days.length,
  );
  // Prochaine case à venir, formatée pour le fuseau du NAVIGATEUR. Elle n'est
  // lue que par la modale de révélation, qui n'existe qu'après un clic : aucun
  // écart d'hydratation possible, contrairement aux libellés de la grille.
  const prochaine = formatCalendarUnlock(prochaineOuverture(days));

  // ── Rafraîchissement doux (getCalendarState) : les cases passent de
  // verrouillées à ouvrables au fil des jours. On garde la dernière photo saine
  // en cas de coupure (jamais d'écran vide), on suspend onglet masqué / pendant
  // une ouverture, on reprend au retour.
  const busy = opening !== null || activeSpin !== null;
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active || document.hidden || busyRef.current) return;
      try {
        const fresh = await getCalendarState({ calendarId });
        // Photo saine uniquement : un `unavailable` (réseau, calendrier fermé
        // le temps d'un poll) ne doit pas effacer la grille déjà affichée.
        if (active && fresh.state === "ok") setSnapshot(fresh);
      } catch {
        // Coupure réseau : on conserve la dernière photo saine.
      }
    };
    const id = window.setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [calendarId]);

  const handleOpen = useCallback(
    async (day: CalendarPublicDay) => {
      const dayId = dayIds[day.dayIndex];
      if (!dayId || opening !== null) return;
      setOpening(day.dayIndex);
      setOpenError(null);
      try {
        const result = await openCalendarBox({ calendarId, dayId });
        if (!result.ok) {
          setOpenError(result.error);
          return;
        }
        const data = result.data;
        if (data.state === "too_early") {
          const label = formatCalendarUnlock(data.unlockAt, true);
          setOpenError(
            label ? `Cette case s'ouvre le ${label}.` : "Cette case n'est pas encore ouvrable.",
          );
          return;
        }
        if (data.state === "unavailable" || !data.day) {
          setOpenError("Cette case n'est pas disponible pour le moment.");
          return;
        }
        // opened / already_opened : fusionne le contenu du joueur et révèle.
        const existing = snapshot.days.find((d) => d.dayIndex === data.day!.dayIndex);
        const merged = mergeOpenedDay(existing, data.day);
        // Bundle de la roue renvoyé par l'action (case `spin` ouverte) : mémorisé
        // pour que la modale se rende d'emblée avec le tour jouable (React batch).
        if (data.spinBundle && merged.targetWheelId) {
          setExtraBundles((prev) => ({
            ...prev,
            [merged.targetWheelId as string]: data.spinBundle!,
          }));
        }
        setSnapshot((prev) => {
          const next = prev.days.map((d) =>
            d.dayIndex === merged.dayIndex ? merged : d,
          );
          return {
            ...prev,
            days: next,
            progression: data.progression ?? prev.progression,
            completionReward:
              data.completion?.rewarded && data.completion.code
                ? { code: data.completion.code, redeemedAt: null }
                : prev.completionReward,
          };
        });
        setRevealed(merged);
      } catch {
        setOpenError("Connexion perdue. Vérifiez votre réseau puis réessayez.");
      } finally {
        setOpening(null);
      }
    },
    [calendarId, dayIds, opening, snapshot.days],
  );

  const startSpin = useCallback(
    (day: CalendarPublicDay) => {
      if (!day.spinGrantToken || !day.targetWheelId) return;
      const bundle = allBundles[day.targetWheelId];
      if (!bundle) return;
      setActiveSpin({
        grantToken: day.spinGrantToken,
        bundle,
        label: day.rewardLabel || "Votre tour de roue offert",
      });
      setRevealed(null);
    },
    [allBundles],
  );

  if (!calendar) return null;

  if (activeSpin) {
    return (
      <CalendarSpinExperience
        calendarId={calendarId}
        grantToken={activeSpin.grantToken}
        segments={activeSpin.bundle.segments}
        claimConfig={activeSpin.bundle.claimConfig}
        organizationName={organizationName}
        organizationId={organizationId}
        rewardLabel={activeSpin.label}
        onExit={() => {
          setActiveSpin(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* ── En-tête commerce ── */}
      <header className="mb-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={organizationName}
            width={56}
            height={56}
            className="mx-auto mb-3 h-14 w-14 rounded-full border-2 border-k-ink bg-white object-cover"
          />
        ) : (
          <div className="mx-auto mb-3 text-4xl" aria-hidden>
            {tokens.faceEmoji}
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          <span aria-hidden className="mr-1">
            {tokens.titleEmoji}
          </span>
          {calendar.name}
        </h1>
      </header>

      {/* ── Progression d'assiduité ── */}
      <ProgressPanel progress={progress} fillClass={tokens.progressFill} />

      {/* ── Contenu commerçant ── */}
      <MerchantContent content={merchantContent} />

      {/* ── Récompense d'assiduité (toutes les cases ouvertes) ── */}
      {progress.complete && (
        <CompletionCard
          label={calendar.completionRewardLabel}
          details={calendar.completionRewardDetails}
          reward={snapshot.completionReward}
        />
      )}

      {/* ── La grille de cases ── */}
      <BoxGrid
        days={days}
        tokens={tokens}
        opening={opening}
        onOpen={handleOpen}
        onReveal={setRevealed}
      />

      {openError && (
        <p role="alert" className="mt-4 text-center text-sm font-bold text-red-600">
          {openError}
        </p>
      )}

      {/* ── Rappel quotidien (opt-in RGPD) ── */}
      <ReminderPanel slug={publicSlug} />

      {/* ── Garder le lien avec le commerce ── */}
      <GarderLeLien sortie={sortie} organizationId={organizationId} />

      {/* ── Révélation d'une case ouverte ── */}
      {revealed && (
        <RevealDialog
          day={revealed}
          progress={progress}
          prochaine={prochaine}
          publicSlug={publicSlug}
          organizationName={organizationName}
          calendarName={calendar.name}
          spinBundle={
            revealed.targetWheelId ? allBundles[revealed.targetWheelId] ?? null : null
          }
          onSpin={() => startSpin(revealed)}
          onClose={() => setRevealed(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Progression d'assiduité
// ────────────────────────────────────────────────────────────

function ProgressPanel({
  progress,
  fillClass,
}: {
  progress: ReturnType<typeof calendarProgress>;
  fillClass: string;
}) {
  return (
    <section
      aria-label="Progression du calendrier"
      className="k-border mb-4 rounded-2xl bg-white p-5 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <div className="mb-1.5 flex items-center justify-between text-sm font-black text-k-ink">
        <span className="tabular-nums">
          {progress.openedCount} / {progress.dayCount}
        </span>
        <span className="text-k-body">
          case{progress.dayCount > 1 ? "s" : ""} ouverte
          {progress.openedCount > 1 ? "s" : ""}
        </span>
      </div>
      <div
        className="h-4 overflow-hidden rounded-full border-2 border-k-ink bg-white"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label="Cases ouvertes"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fillClass}`}
          style={{ width: `${Math.max(3, progress.ratio * 100)}%` }}
        />
      </div>
      <p className="mt-3 text-center text-sm font-bold text-k-body">
        {progress.complete ? (
          <span className="font-black text-k-ink">
            🎉 Toutes les cases sont ouvertes !
          </span>
        ) : (
          <>
            Encore{" "}
            <span className="font-black text-k-ink tabular-nums">
              {progress.remaining}
            </span>{" "}
            case{progress.remaining > 1 ? "s" : ""} à découvrir.
          </>
        )}
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Garder le lien avec le commerce (bas de page)
// ────────────────────────────────────────────────────────────

/**
 * LE BAS DU CALENDRIER — QUATRE PORTES, ET AUCUNE N'EST UNE CONDITION.
 *
 * ── Ce que ça répare ──
 *
 * Un client qui ouvrait sa case du jour arrivait au bout de la page et n'avait
 * plus rien : le commerce cessait d'exister à l'écran une fois la case ouverte.
 * Or c'est exactement l'instant où il est le mieux disposé — il vient de jouer,
 * il reviendra demain. Les quatre chemins qui existaient déjà dans le produit
 * (la Vitrine, les réseaux, le Passeport, le Jackpot collectif) n'étaient
 * atteignables que par leur propre QR : le calendrier ne menait à aucun.
 *
 * ── AUCUNE COLONNE NOUVELLE, ET C'EST LE POINT ──
 *
 * `sortie` vient de `sortieDeLOrganisation` — la Vitrine publiée et les trois
 * liens déjà saisis dans les réglages, servis à l'identique après un quiz, un
 * duo ou un portrait de bande. Le Passeport et le Jackpot se déclarent
 * eux-mêmes auprès de leur action respective, et restent MUETS si le module
 * n'est pas ouvert. Demander au commerçant de ressaisir quoi que ce soit ici
 * aurait créé deux vérités pour la même adresse Instagram.
 *
 * ── LE SILENCE EST L'ÉTAT PAR DÉFAUT ──
 *
 * Chacune des trois briques rend `null` quand elle n'a rien à proposer, et la
 * majorité des commerçants n'en aura qu'une, voire aucune. Le titre lui-même
 * ne s'affiche donc que si `sortie` existe : un « Avant de partir… » suivi de
 * rien serait pire que pas de titre du tout. Le cas « aucune sortie mais un
 * passeport » reste couvert — la carte du passeport porte son propre titre.
 */
function GarderLeLien({
  sortie,
  organizationId,
}: {
  sortie: Sortie | null;
  organizationId: string | null;
}) {
  // Pas de `space-y` sur le conteneur : les deux cartes portent DÉJÀ leur
  // `mt-6`, comme sur les sept autres surfaces qui les montent. Un
  // espacement de conteneur s'y serait AJOUTÉ au lieu de le remplacer — deux
  // règles de marge qui se cumulent, et un rythme qui saute d'une carte à
  // l'autre selon celles qui sont rendues.
  return (
    <div className="mt-6">
      <SortieApresJeu sortie={sortie} />
      {/* Le Passeport vivait dans la carte de fin (`CompletionCard`), donc
          visible d'un joueur sur cent — celui qui avait ouvert TOUTES les
          cases. Il descend ici, où il est lu dès la première case : un
          programme de fidélité se propose au début d'une habitude, pas à sa
          fin. Un seul exemplaire par page (le composant se garde lui-même du
          doublon), c'est pourquoi il a été RETIRÉ de la carte de fin plutôt
          que dupliqué — deux exemplaires, et le second se serait tu. */}
      {organizationId && (
        <>
          <ProposerPasseport
            organizationId={organizationId}
            note="Sans inscription : votre passeport prend effet au premier scan de commande, et pas avant."
          />
          <ProposerJackpot organizationId={organizationId} />
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Contenu commerçant
// ────────────────────────────────────────────────────────────

function MerchantContent({ content }: { content: string | null }) {
  if (!content || !content.trim()) return null;
  return (
    <section
      aria-label="Actualités du commerce"
      className="k-border mb-6 rounded-2xl bg-k-stripe p-5 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-k-body">
        📣 À ne pas manquer
      </h2>
      <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
        {content}
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Récompense d'assiduité (completion)
// ────────────────────────────────────────────────────────────

function CompletionCard({
  label,
  details,
  reward,
}: {
  label: string;
  details: string | null;
  reward: CalendarPublicState["completionReward"];
}) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!reward) return;
    try {
      await navigator.clipboard.writeText(reward.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible.
    }
  };
  const share = async () => {
    if (!reward) return;
    try {
      await navigator.share({
        text: `J'ai terminé le calendrier ! Mon code cadeau à présenter en caisse : ${reward.code}`,
      });
    } catch {
      // Partage annulé : rien à faire.
    }
  };

  return (
    <section className="mb-6">
      <div className="k-border rounded-2xl bg-k-green/15 p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        <p className="inline-flex rounded-full border-2 border-k-ink bg-white px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
          🏆 Récompense d&apos;assiduité
        </p>
        <h2 className="mt-3 text-xl font-black leading-tight text-k-ink">
          {label || "Bravo, calendrier terminé !"}
        </h2>
        {details && <p className="mt-1 text-sm font-bold text-k-body">{details}</p>}

        {reward ? (
          reward.redeemedAt ? (
            <>
              <p className="mt-3 break-all font-mono text-2xl font-black tracking-wider text-k-ink/40 line-through">
                {reward.code}
              </p>
              <p className="mt-2 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2 text-sm font-bold text-k-body">
                ✓ Cadeau déjà récupéré en caisse.
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-[11px] font-mono uppercase tracking-[0.25em] text-k-body">
                Votre code cadeau
              </p>
              <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-k-ink">
                {reward.code}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
                >
                  {copied ? "Copié !" : "Copier le code"}
                </button>
                {canShare && (
                  <button
                    type="button"
                    onClick={share}
                    className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
                  >
                    Partager
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm font-bold text-k-body">
                Présentez ce code en caisse pour récupérer votre cadeau.
              </p>
              <p className="mt-2">
                <LienPortefeuille />
              </p>
            </>
          )
        ) : label ? (
          // Un cadeau EST annoncé mais aucun code n'a pu être émis : stock
          // épuisé. Là, l'invitation au comptoir a un sens.
          <p className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            Cadeau momentanément épuisé — présentez-vous au comptoir, le
            commerçant saura vous accueillir.
          </p>
        ) : (
          // AUCUN cadeau final n'a été configuré — et c'est le réglage par
          // DÉFAUT (`completion_reward_label` vaut '' à la création). Le joueur
          // lisait pourtant « Cadeau momentanément épuisé, présentez-vous au
          // comptoir » : il se déplaçait pour réclamer quelque chose qui
          // n'avait jamais existé, et le commerçant devait le détromper.
          // Le calendrier reste une réussite : on la salue, sans rien promettre.
          <p className="mt-3 text-sm font-bold text-k-body">
            Vous avez ouvert toutes les cases — merci de votre fidélité !
          </p>
        )}
        {/* La proposition de Passeport vivait ICI, sous les trois issues de
            fin. Elle n'était donc lue que par les joueurs ayant ouvert
            TOUTES les cases — c'est-à-dire au moment où le calendrier est
            fini, et où proposer de commencer une habitude arrive trop tard.
            Elle est descendue en bas de page (`GarderLeLien`), où elle est
            visible dès la première case. Pas dupliquée : le composant ne
            tolère qu'un exemplaire par page, le second serait resté muet. */}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// La grille de cases
// ────────────────────────────────────────────────────────────

function BoxGrid({
  days,
  tokens,
  opening,
  onOpen,
  onReveal,
}: {
  days: CalendarPublicDay[];
  tokens: ReturnType<typeof calendarThemeTokens>;
  opening: number | null;
  onOpen: (day: CalendarPublicDay) => void;
  onReveal: (day: CalendarPublicDay) => void;
}) {
  if (days.length === 0) {
    return (
      <p className="mb-6 rounded-2xl border-2 border-dashed border-k-ink/30 bg-white px-4 py-8 text-center text-sm font-bold text-k-body">
        Les cases arrivent bientôt — revenez vite !
      </p>
    );
  }
  return (
    <section aria-label="Cases du calendrier" className="mb-6">
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4" role="list">
        {days.map((day) => (
          <li key={day.dayIndex}>
            <BoxCell
              day={day}
              tokens={tokens}
              opening={opening === day.dayIndex}
              onOpen={onOpen}
              onReveal={onReveal}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BoxCell({
  day,
  tokens,
  opening,
  onOpen,
  onReveal,
}: {
  day: CalendarPublicDay;
  tokens: ReturnType<typeof calendarThemeTokens>;
  opening: boolean;
  onOpen: (day: CalendarPublicDay) => void;
  onReveal: (day: CalendarPublicDay) => void;
}) {
  const hydrated = useHydrated();
  // État visuel : le serveur fait foi, le client peut passer locked→available
  // dès l'heure atteinte (jamais de révélation de contenu).
  const state: CalendarBoxState = hydrated
    ? calendarBoxState(day)
    : day.status;
  const unlockLabel = formatCalendarUnlock(day.unlockAt);

  const base =
    "relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl p-1 text-center transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2";

  if (state === "opened") {
    return (
      <button
        type="button"
        onClick={() => onReveal(day)}
        aria-label={`Revoir la case ${day.dayIndex}`}
        className={`${base} ${tokens.openedCell} k-btn-sm`}
      >
        {day.isSpecial && (
          <span aria-hidden className="absolute right-1 top-1 text-xs">
            ⭐
          </span>
        )}
        <span aria-hidden className="text-2xl">
          {contentEmoji(day)}
        </span>
        <span className="mt-0.5 text-[11px] font-black text-k-body">
          Case {day.dayIndex}
        </span>
        <span className="text-[10px] font-bold uppercase text-k-green">
          Ouverte
        </span>
      </button>
    );
  }

  if (state === "available") {
    return (
      <button
        type="button"
        onClick={() => onOpen(day)}
        disabled={opening}
        aria-label={`Ouvrir la case ${day.dayIndex}`}
        className={`${base} ${tokens.availableCell} hover:-translate-y-0.5 disabled:opacity-70`}
      >
        {day.isSpecial && (
          <span aria-hidden className="absolute right-1 top-1 text-xs">
            ⭐
          </span>
        )}
        <span aria-hidden className="text-2xl">
          {opening ? "⌛" : tokens.faceEmoji}
        </span>
        <span className="mt-0.5 text-lg font-black leading-none tabular-nums">
          {day.dayIndex}
        </span>
        <span className="mt-0.5 text-[9px] font-black uppercase tracking-wide motion-safe:animate-pulse">
          {opening ? "…" : "Ouvre-moi"}
        </span>
      </button>
    );
  }

  // locked
  return (
    <div
      aria-label={
        unlockLabel
          ? `Case ${day.dayIndex}, verrouillée jusqu'au ${unlockLabel}`
          : `Case ${day.dayIndex}, verrouillée`
      }
      className={`${base} ${tokens.lockedCell} cursor-not-allowed`}
    >
      <span aria-hidden className="text-xl">
        🔒
      </span>
      <span className="mt-0.5 text-lg font-black leading-none tabular-nums">
        {day.dayIndex}
      </span>
      {unlockLabel && (
        <span className="mt-0.5 line-clamp-1 px-0.5 text-[9px] font-bold leading-tight">
          {unlockLabel}
        </span>
      )}
    </div>
  );
}

/** Emoji d'une case ouverte selon son usage (jamais avant l'ouverture). */
function contentEmoji(day: CalendarPublicDay): string {
  if (day.contentType === "lot") return "🎁";
  if (day.contentType === "spin") return "🎡";
  // Une case `content` SANS texte ne donne rien : c'est un « pas de chance »
  // assumé, et il porte son propre signe — pas la bulle du mot du jour.
  //
  // LE TRÈFLE ET NON LA FEUILLE MORTE. 🍂 disait la fin de quelque chose ;
  // sur une grille qu'on rouvre demain, c'était le mauvais mot. Le trèfle à
  // quatre feuilles dit la chance — celle qui n'est pas venue aujourd'hui,
  // donc celle qui reste à venir. Même signe dans la grille et dans la
  // modale : le joueur qui reparcourt ses cases doit reconnaître d'un coup
  // d'œil celles qui ne donnaient rien.
  return calendarDaySansGain(day) ? "🍀" : "💬";
}

// ────────────────────────────────────────────────────────────
// Révélation d'une case ouverte (modale)
// ────────────────────────────────────────────────────────────

function RevealDialog({
  day,
  progress,
  prochaine,
  publicSlug,
  organizationName,
  calendarName,
  spinBundle,
  onSpin,
  onClose,
}: {
  day: CalendarPublicDay;
  /** Progression d'assiduité — la seule consolation d'une case perdante. */
  progress: CalendarProgress;
  /** Prochaine ouverture, déjà formatée pour le fuseau du navigateur. */
  prochaine: string | null;
  publicSlug: string;
  organizationName: string;
  calendarName: string;
  spinBundle: CalendarSpinBundle | null;
  onSpin: () => void;
  onClose: () => void;
}) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Focalisait bien son bouton de fermeture, mais ne piégeait pas Tab : on
  // ressortait dans la page trois tabulations plus loin, modale ouverte.
  const dialogue = useModalFocus<HTMLDivElement>(closeRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    if (!day.code) return;
    try {
      await navigator.clipboard.writeText(day.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible.
    }
  };
  const shareCode = async () => {
    if (!day.code) return;
    try {
      await navigator.share({
        text: `Mon code cadeau à présenter en caisse : ${day.code}`,
      });
    } catch {
      // Partage annulé.
    }
  };
  const shareCalendar = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/calendar/${publicSlug}`
        : "";
    try {
      if (canShare) {
        await navigator.share({
          title: calendarName,
          text: `Ouvre le calendrier de ${organizationName} !`,
          url,
        });
      } else if (url) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Partage annulé.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-k-ink/50 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogue}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-reveal-title"
        className="k-border w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-[8px_8px_0_var(--color-k-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex rounded-full border-2 border-k-ink bg-k-yellow/50 px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
            Case {day.dayIndex} ouverte
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-full border-2 border-k-ink bg-white px-2.5 py-0.5 text-sm font-black text-k-ink hover:bg-k-yellow/30"
          >
            ✕
          </button>
        </div>

        <div aria-hidden className="mt-2 text-5xl">
          {contentEmoji(day)}
        </div>

        {/* Case `content` SANS texte : une vraie issue perdante. Elle affichait
            « 💬 Le mot du jour » suivi d'un « Bonne journée ! » que personne
            n'avait écrit — le joueur lisait un message de remplissage là où le
            commerçant avait simplement laissé la case vide. On nomme la
            défaite, et on rend à l'assiduité ce qu'elle vaut ici : le seul
            gain restant. */}
        {day.contentType === "content" && calendarDaySansGain(day) && (
          <div className="mt-3">
            <h2 id="calendar-reveal-title" className="text-xl font-black text-k-ink">
              Pas de chance aujourd&apos;hui !
            </h2>
            <p className="mt-2 text-sm font-bold text-k-body">
              Cette case ne cachait rien à gagner — c&apos;est le jeu, et le
              trèfle tourne vite.
            </p>
            <p className="mt-3 rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-sm font-bold text-k-ink">
              {calendarConsolation(progress)}
            </p>
            {/* LE RENDEZ-VOUS, ET NON « revenez demain ».

                Une case perdante est le seul écran de ce module où le joueur
                n'a rien à emporter : c'est donc le seul où le motif de
                revenir doit être ÉCRIT. « Demain » supposait que les cases
                s'ouvrent à un jour d'intervalle — c'est le cas courant, pas
                la règle : la grille se règle en date de départ et en nombre
                de cases, et rien n'interdit un calendrier hebdomadaire.
                Nommer le jour ne suppose rien et ne demande rien.

                Absent quand il n'y a plus de case à venir : promettre un
                rendez-vous qui n'existe pas serait pire que se taire. */}
            {prochaine && (
              <p className="mt-2 text-sm font-bold text-k-body">
                <span aria-hidden>🍀</span> Prochaine case&nbsp;: {prochaine}
              </p>
            )}
          </div>
        )}

        {day.contentType === "content" && !calendarDaySansGain(day) && (
          <div className="mt-3">
            <h2 id="calendar-reveal-title" className="text-xl font-black text-k-ink">
              Le mot du jour
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
              {day.contentText}
            </p>
          </div>
        )}

        {day.contentType === "lot" && (
          <div className="mt-3">
            <h2 id="calendar-reveal-title" className="text-xl font-black text-k-ink">
              {day.rewardLabel || "Un cadeau pour vous"}
            </h2>
            {day.rewardDetails && (
              <p className="mt-1 text-sm font-bold text-k-body">{day.rewardDetails}</p>
            )}
            {day.outOfStock || !day.code ? (
              <p className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                Lot momentanément épuisé — présentez-vous au comptoir, le
                commerçant saura vous accueillir.
              </p>
            ) : (
              <>
                <p className="mt-4 text-[11px] font-mono uppercase tracking-[0.25em] text-k-body">
                  Votre code de retrait
                </p>
                <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-k-ink">
                  {day.code}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
                  >
                    {copied ? "Copié !" : "Copier le code"}
                  </button>
                  {canShare && (
                    <button
                      type="button"
                      onClick={shareCode}
                      className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
                    >
                      Partager
                    </button>
                  )}
                </div>
                <p className="mt-3 text-sm font-bold text-k-body">
                  Présentez ce code en caisse pour récupérer votre lot.
                </p>
              </>
            )}
          </div>
        )}

        {day.contentType === "spin" && (
          <div className="mt-3">
            <h2 id="calendar-reveal-title" className="text-xl font-black text-k-ink">
              {day.rewardLabel || "Un tour de roue offert !"}
            </h2>
            {day.resultingSpinId ? (
              <p className="mt-4 rounded-xl border-2 border-k-ink/20 bg-zinc-50 px-3 py-2 text-sm font-bold text-k-body">
                🎡 Vous avez déjà lancé la roue pour cette case.
              </p>
            ) : !day.spinGrantToken ? (
              <p className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                Ce tour n&apos;est plus disponible.
              </p>
            ) : !spinBundle ? (
              <p className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                La roue de ce tour n&apos;est plus disponible — signalez-le au
                comptoir.
              </p>
            ) : (
              <button
                type="button"
                onClick={onSpin}
                className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-3.5 text-base font-black uppercase tracking-wider text-k-ink"
              >
                🎡 Tentez la roue !
              </button>
            )}
          </div>
        )}

        {/* Partage d'une case spéciale (teaser social), comme les autres modules. */}
        {day.isSpecial && (
          <button
            type="button"
            onClick={shareCalendar}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            ⭐ Partager cette surprise
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Rappel quotidien (opt-in RGPD, jamais pré-coché)
// ────────────────────────────────────────────────────────────

function ReminderPanel({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [reminderOptIn, setReminderOptIn] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await joinCalendar({
        slug,
        email: email || undefined,
        reminderOptIn,
        marketingOptIn,
      });
      if (result.ok && result.data.state === "joined") {
        setDone(true);
      } else if (!result.ok) {
        setError(result.error);
      } else {
        setError("Inscription impossible pour le moment.");
      }
    } catch {
      setError("Connexion perdue. Vérifiez votre réseau puis réessayez.");
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <section className="mb-2">
        <p
          role="status"
          className="rounded-2xl border-2 border-k-ink bg-k-green/15 px-4 py-3 text-center text-sm font-black text-k-ink"
        >
          ✓ C&apos;est noté ! Vous serez prévenu·e pour vos prochaines cases.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-2">
      <div className="k-border rounded-2xl bg-white p-5 shadow-[4px_4px_0_var(--color-k-ink)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-k-ink">
              🔔 Reçois un rappel chaque jour
            </h2>
            <p className="mt-0.5 text-sm text-k-body">
              Pour ne manquer aucune case (facultatif).
            </p>
          </div>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="k-btn-sm shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
            >
              M&apos;inscrire
            </button>
          )}
        </div>

        {open && (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="calendar-email" className="sr-only">
                Votre email
              </label>
              <input
                id="calendar-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="vous@exemple.fr"
                className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
              />
            </div>

            {/* Opt-in EXPLICITES, JAMAIS pré-cochés (RGPD). */}
            <label className="flex items-start gap-2.5 text-sm text-k-ink">
              <input
                type="checkbox"
                checked={reminderOptIn}
                onChange={(e) => setReminderOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
              />
              <span>
                Je veux recevoir un <strong>rappel chaque jour</strong> pour ouvrir
                ma case.
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-k-ink">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
              />
              <span>
                J&apos;accepte aussi de recevoir les{" "}
                <strong>offres et actualités</strong> du commerce.
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-5 py-2.5 text-sm font-black text-k-ink disabled:opacity-60"
              >
                {pending ? "Inscription…" : "Valider"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
              >
                Annuler
              </button>
            </div>
            {error && (
              <p role="alert" className="text-sm font-bold text-red-600">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
