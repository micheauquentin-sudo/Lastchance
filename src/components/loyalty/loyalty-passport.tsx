"use client";

import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { stampLoyaltyVisit, startLoyaltyPassport } from "@/actions/loyalty";
import type { ClaimConfig } from "@/components/wheel/claim-form";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import type {
  LoyaltyMilestoneView,
  LoyaltyPassportReward,
  LoyaltyPassportState,
} from "@/lib/loyalty-context";
import type { LoyaltyMilestoneReached, LoyaltyStampResult } from "@/lib/loyalty";
import type { ActionResult } from "@/lib/utils";
import type {
  LoyaltyRewardType,
  LoyaltyTier,
  LoyaltyValidationMode,
} from "@/types/database";
import { LoyaltySpinExperience } from "./loyalty-spin-experience";
import {
  LOYALTY_TIERS,
  loyaltyStampWindow,
  loyaltyTierMeta,
  loyaltyTierProgress,
  messageForStampState,
  type LoyaltyMessageTone,
} from "./loyalty-passport-state";

/* Passeport de fidélité côté joueur — DA « Kermesse » (crème, encre, jaune,
   ombres dures), même famille visuelle que la chasse au trésor et les
   pronostics. Mobile d'abord : le client arrive en scannant le QR du
   commerce. Le tampon se fait au POST du bouton (jamais au chargement). */

/** Roue cible d'un palier « spin », préchargée côté serveur. */
export interface LoyaltySpinBundle {
  wheelId: string;
  segments: WheelSegment[];
  claimConfig: ClaimConfig;
}

const TONE_BOX: Record<LoyaltyMessageTone, string> = {
  success: "border-k-ink bg-k-green/15 text-k-ink",
  info: "border-k-ink bg-k-blue/25 text-k-ink",
  warning: "border-k-ink bg-k-yellow/50 text-k-ink",
  error: "border-red-400 bg-red-50 text-red-700",
};

const codeInputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.4em] text-k-ink tabular-nums placeholder:tracking-normal placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// Partage natif détecté sans écart d'hydratation (serveur → false).
const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );

export interface LoyaltyPassportProps {
  programId: string;
  organizationName: string;
  logoUrl: string | null;
  programName: string;
  validationMode: LoyaltyValidationMode;
  silverThreshold: number;
  goldThreshold: number;
  milestones: LoyaltyMilestoneView[];
  passport: LoyaltyPassportState;
  /** Roues offertes indexées par milestoneId (paliers « spin »). */
  spinWheels: Record<string, LoyaltySpinBundle>;
}

export function LoyaltyPassport({
  programId,
  organizationName,
  logoUrl,
  programName,
  validationMode,
  silverThreshold,
  goldThreshold,
  milestones,
  passport,
  spinWheels,
}: LoyaltyPassportProps) {
  const router = useRouter();

  // Tampon (mode rotating_code) — POST de Server Action, dernier résultat typé.
  const [state, formAction, pending] = useActionState<
    ActionResult<LoyaltyStampResult> | null,
    FormData
  >(
    async (_prev, formData) =>
      stampLoyaltyVisit({ programId, code: String(formData.get("code") ?? "") }),
    null,
  );
  const scan = state?.ok ? state.data : null;
  const stampError = state && !state.ok ? state.error : null;

  // Paliers atteints pendant la session, cumulés et dédupliqués : un tampon
  // suivant ne doit pas masquer un lot gagné au tampon précédent.
  const [reached, setReached] = useState<LoyaltyMilestoneReached[]>([]);
  useEffect(() => {
    if (!scan || scan.state !== "stamped" || scan.milestonesReached.length === 0) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- accumulation idempotente des paliers atteints (dédup par milestoneId), déclenchée à chaque nouveau résultat de tampon.
    setReached((prev) => {
      const ids = new Set(prev.map((r) => r.milestoneId));
      const add = scan.milestonesReached.filter((r) => !ids.has(r.milestoneId));
      return add.length ? [...add, ...prev] : prev;
    });
  }, [scan]);

  // Tour de roue offert affiché en plein écran (remplace le passeport).
  const [activeSpin, setActiveSpin] = useState<{
    grantToken: string;
    bundle: LoyaltySpinBundle;
    label: string;
  } | null>(null);

  // Fusion « page (cookie) + dernier tampon » : le tampon, plus récent, prime.
  const visitCount = scan?.visitCount ?? passport.visitCount;
  const tier: LoyaltyTier = scan?.tier ?? passport.tier;
  const progress = loyaltyTierProgress(visitCount, silverThreshold, goldThreshold, tier);
  const stampWindow = loyaltyStampWindow(
    visitCount,
    milestones.map((m) => m.visitCount),
  );

  if (activeSpin) {
    return (
      <LoyaltySpinExperience
        programId={programId}
        grantToken={activeSpin.grantToken}
        segments={activeSpin.bundle.segments}
        claimConfig={activeSpin.bundle.claimConfig}
        organizationName={organizationName}
        rewardLabel={activeSpin.label}
        onExit={() => {
          setActiveSpin(null);
          router.refresh();
        }}
      />
    );
  }

  const openSpin = (milestoneId: string, grantToken: string, label: string) => {
    const bundle = spinWheels[milestoneId];
    if (!bundle) return;
    setActiveSpin({ grantToken, bundle, label });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* ── En-tête commerce + programme ── */}
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
            🎟️
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          {programName}
        </h1>
      </header>

      {/* ── Niveau + progression ── */}
      <TierPanel
        tier={tier}
        visitCount={visitCount}
        progress={progress}
      />

      {/* ── Carte de tampons ── */}
      <StampCard stampWindow={stampWindow} visitCount={visitCount} />

      {/* ── Zone d'action selon le mode de validation ── */}
      {validationMode === "rotating_code" ? (
        <RotatingStampForm
          formAction={formAction}
          pending={pending}
          scan={scan}
          error={stampError}
        />
      ) : (
        <StaffPassportCard
          programId={programId}
          initialToken={passport.memberToken}
        />
      )}

      {/* ── Récompenses gagnées ── */}
      <RewardsSection
        reached={reached}
        rewards={passport.rewards}
        milestones={milestones}
        spinWheels={spinWheels}
        onPlaySpin={openSpin}
      />

      {/* ── Aperçu des paliers ── */}
      <MilestonesOverview milestones={milestones} visitCount={visitCount} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Niveau bronze / argent / or + jauge vers le niveau suivant
// ────────────────────────────────────────────────────────────

function TierPanel({
  tier,
  visitCount,
  progress,
}: {
  tier: LoyaltyTier;
  visitCount: number;
  progress: ReturnType<typeof loyaltyTierProgress>;
}) {
  const meta = loyaltyTierMeta(tier);
  const nextMeta = progress.nextTier ? loyaltyTierMeta(progress.nextTier) : null;

  return (
    <section
      aria-label={`Niveau ${meta.label}`}
      className="k-border mb-4 rounded-2xl bg-white p-5 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-k-body">
            Votre niveau
          </p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-black text-k-ink">
            <span
              aria-hidden
              className={`inline-flex h-9 items-center rounded-full border-2 border-k-ink px-3 text-base ${meta.badgeClass}`}
            >
              {meta.emoji} {meta.label}
            </span>
          </p>
        </div>
        <p className="text-right">
          <span className="block text-3xl font-black tabular-nums text-k-ink">
            {visitCount}
          </span>
          <span className="text-xs font-bold text-k-body">
            visite{visitCount > 1 ? "s" : ""}
          </span>
        </p>
      </div>

      {/* Frise des trois niveaux. */}
      <ol className="mt-4 flex items-center gap-1.5" aria-hidden>
        {LOYALTY_TIERS.map((t) => {
          const active = LOYALTY_TIERS.indexOf(t) <= LOYALTY_TIERS.indexOf(tier);
          const m = loyaltyTierMeta(t);
          return (
            <li
              key={t}
              className={`flex-1 rounded-full border-2 py-1 text-center text-[11px] font-black ${
                active
                  ? `${m.badgeClass} border-k-ink`
                  : "border-dashed border-k-ink/30 text-k-ink/30"
              }`}
            >
              {m.emoji} {m.label}
            </li>
          );
        })}
      </ol>

      {nextMeta ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-k-body">
            <span>Vers {nextMeta.label}</span>
            <span className="tabular-nums">
              Encore {progress.remaining} visite{progress.remaining > 1 ? "s" : ""}
            </span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full border-2 border-k-ink bg-white"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.ratio * 100)}
            aria-label={`Progression vers le niveau ${nextMeta.label}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(4, progress.ratio * 100)}%`,
                backgroundColor: nextMeta.accent,
              }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/40 px-3 py-2 text-center text-sm font-black text-k-ink">
          🏅 Niveau maximum atteint — merci de votre fidélité !
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Carte de tampons (cases ou jauge si la fenêtre est trop large)
// ────────────────────────────────────────────────────────────

function StampCard({
  stampWindow,
  visitCount,
}: {
  stampWindow: ReturnType<typeof loyaltyStampWindow>;
  visitCount: number;
}) {
  if (stampWindow.windowEnd === null) {
    return (
      <section className="k-border mb-6 rounded-2xl bg-white p-4 text-center shadow-[4px_4px_0_var(--color-k-ink)]">
        <p className="text-sm font-black text-k-ink">
          🎉 Tous les paliers sont débloqués — vous êtes un pilier de la maison !
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={`Carte de tampons : ${Math.min(visitCount, stampWindow.windowEnd)} sur ${stampWindow.windowEnd}`}
      className="k-border mb-6 rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-k-ink">Ma carte de fidélité</p>
        <p className="text-sm font-black tabular-nums text-k-ink">
          {Math.min(visitCount, stampWindow.windowEnd)}
          <span className="text-k-body">/{stampWindow.windowEnd}</span>
        </p>
      </div>

      {stampWindow.compact ? (
        <div
          className="h-4 overflow-hidden rounded-full border-2 border-k-ink bg-white"
          role="progressbar"
          aria-valuemin={stampWindow.windowStart}
          aria-valuemax={stampWindow.windowEnd}
          aria-valuenow={visitCount}
        >
          <div
            className="h-full bg-k-yellow transition-[width] duration-500"
            style={{
              width: `${Math.max(
                4,
                ((visitCount - stampWindow.windowStart) /
                  (stampWindow.windowEnd - stampWindow.windowStart)) *
                  100,
              )}%`,
            }}
          />
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2" role="list">
          {stampWindow.cells.map((cell) => (
            <li
              key={cell.position}
              aria-label={`Visite ${cell.position} ${cell.filled ? "validée" : "à venir"}`}
              className={
                cell.filled
                  ? "flex h-11 w-11 items-center justify-center rounded-full border-2 border-k-ink bg-k-yellow text-lg font-black text-k-ink"
                  : "flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-k-ink/40 text-sm font-black text-k-ink/30"
              }
            >
              {cell.filled ? "✓" : cell.position}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-center text-sm font-bold text-k-body">
        Encore{" "}
        <span className="text-k-ink">
          {stampWindow.remaining} visite{stampWindow.remaining > 1 ? "s" : ""}
        </span>{" "}
        jusqu&apos;au prochain palier.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Mode rotating_code : saisie du code affiché au comptoir
// ────────────────────────────────────────────────────────────

function RotatingStampForm({
  formAction,
  pending,
  scan,
  error,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  scan: LoyaltyStampResult | null;
  error: string | null;
}) {
  return (
    <section className="mb-6">
      <div className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
        <h2 className="text-base font-black text-k-ink">Valider ma visite</h2>
        <p className="mt-0.5 mb-3 text-sm text-k-body">
          Saisissez le code à 6 chiffres affiché à l&apos;écran du comptoir.
        </p>

        <form action={formAction}>
          <label htmlFor="loyalty-code" className="sr-only">
            Code affiché au comptoir (6 chiffres)
          </label>
          <input
            id="loyalty-code"
            name="code"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={6}
            required
            placeholder="000000"
            aria-describedby="loyalty-code-help"
            className={codeInputClass}
          />
          <p id="loyalty-code-help" className="mt-1.5 text-center text-xs text-k-body/70">
            Le code change régulièrement — demandez-le au comptoir.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
          >
            {pending ? "Validation…" : "Tamponner ma carte"}
          </button>
        </form>

        {scan && (
          <div className="mt-4">
            <StateBox state={scan.state} retryInSeconds={scan.retryInSeconds} />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-center text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function StateBox({
  state,
  retryInSeconds = null,
}: {
  state: Parameters<typeof messageForStampState>[0];
  retryInSeconds?: number | null;
}) {
  const message = messageForStampState(state, { retryInSeconds });
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border-2 px-4 py-3 ${TONE_BOX[message.tone]}`}
    >
      <p className="text-sm font-black">{message.title}</p>
      {message.body && <p className="mt-0.5 text-sm font-bold">{message.body}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Mode staff : QR du passeport présenté au comptoir
// ────────────────────────────────────────────────────────────

function StaffPassportCard({
  programId,
  initialToken,
}: {
  programId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [failed, setFailed] = useState(false);

  // Établit l'identité du passeport (cookie + jeton) au premier affichage si
  // le client n'en a pas encore — pour pouvoir présenter le QR au staff.
  useEffect(() => {
    if (token) return;
    let active = true;
    startLoyaltyPassport({ programId })
      .then((result) => {
        if (!active) return;
        if (result.ok) setToken(result.data.token);
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [programId, token]);

  return (
    <section className="mb-6">
      <div className="k-border rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        <h2 className="text-base font-black text-k-ink">Ma carte à présenter</h2>
        <p className="mt-0.5 mb-4 text-sm text-k-body">
          Montrez ce code au comptoir : le commerçant le scanne pour valider
          votre visite.
        </p>

        {token ? (
          <PassportQr value={token} />
        ) : failed ? (
          <p className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-4 text-sm font-bold text-red-700">
            Impossible d&apos;afficher votre carte pour le moment. Rechargez la
            page ou réessayez plus tard.
          </p>
        ) : (
          <div
            className="mx-auto flex h-44 w-44 items-center justify-center rounded-xl border-2 border-dashed border-k-ink/30 text-sm font-bold text-k-body"
            aria-live="polite"
          >
            Préparation…
          </div>
        )}
      </div>
    </section>
  );
}

/** QR du jeton de passeport, généré côté client (même lib que les gains). */
function PassportQr({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(value, { width: 320, margin: 1 })
        .then((url) => {
          if (!cancelled) setDataUrl(url);
        })
        .catch(() => {
          // QR non généré : le staff peut aussi saisir le jeton à la main.
        });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-xl border-2 border-dashed border-k-ink/30 text-sm font-bold text-k-body">
        Préparation…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="QR de votre passeport de fidélité, à faire scanner au comptoir"
      width={176}
      height={176}
      className="mx-auto h-44 w-44 rounded-xl border-2 border-k-ink bg-white p-2"
    />
  );
}

// ────────────────────────────────────────────────────────────
// Récompenses gagnées (lots FIDELITE-… + tours de roue offerts)
// ────────────────────────────────────────────────────────────

/** Récompense normalisée pour l'affichage (fraîche ou déjà en base). */
interface EarnedReward {
  key: string;
  milestoneId: string;
  rewardType: LoyaltyRewardType;
  rewardLabel: string;
  rewardDetails: string | null;
  /** lot : code FIDELITE-… (null si rupture au moment du palier). */
  code: string | null;
  /** spin : jeton de tour offert non consommé (null si déjà joué). */
  grantToken: string | null;
  redeemedAt: string | null;
  fresh: boolean;
  outOfStock: boolean;
}

function RewardsSection({
  reached,
  rewards,
  milestones,
  spinWheels,
  onPlaySpin,
}: {
  reached: LoyaltyMilestoneReached[];
  rewards: LoyaltyPassportReward[];
  milestones: LoyaltyMilestoneView[];
  spinWheels: Record<string, LoyaltySpinBundle>;
  onPlaySpin: (milestoneId: string, grantToken: string, label: string) => void;
}) {
  const labelFor = (milestoneId: string, fallback: string) =>
    milestones.find((m) => m.id === milestoneId)?.rewardLabel || fallback;

  // Paliers atteints ce jour (résultats de tampon) en tête, puis l'historique.
  const freshIds = new Set(reached.map((r) => r.milestoneId));
  const items: EarnedReward[] = [
    ...reached.map((r) => ({
      key: `fresh-${r.milestoneId}`,
      milestoneId: r.milestoneId,
      rewardType: r.rewardType,
      rewardLabel: r.rewardLabel,
      rewardDetails: r.rewardDetails,
      code: r.code,
      grantToken: r.grantToken,
      redeemedAt: null,
      fresh: true,
      outOfStock: r.outOfStock,
    })),
    ...rewards
      // Évite le doublon avec un palier fraîchement atteint (même milestone).
      .filter((r) => !freshIds.has(r.milestoneId))
      .map((r) => ({
        key: `reward-${r.id}`,
        milestoneId: r.milestoneId,
        rewardType: r.rewardType,
        rewardLabel: r.rewardLabel || labelFor(r.milestoneId, ""),
        rewardDetails: r.rewardDetails,
        code: r.code,
        grantToken: r.grantToken,
        redeemedAt: r.redeemedAt,
        fresh: false,
        outOfStock: false,
      })),
  ];

  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-k-body">
        Mes récompenses
      </h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.key}>
            <RewardCard
              reward={item}
              hasWheel={Boolean(spinWheels[item.milestoneId])}
              onPlaySpin={onPlaySpin}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RewardCard({
  reward,
  hasWheel,
  onPlaySpin,
}: {
  reward: EarnedReward;
  hasWheel: boolean;
  onPlaySpin: (milestoneId: string, grantToken: string, label: string) => void;
}) {
  return (
    <div className="k-border rounded-2xl bg-white p-5 shadow-[4px_4px_0_var(--color-k-ink)]">
      <div className="mb-2 flex items-center gap-2">
        {reward.fresh && (
          <span className="rounded-full border-2 border-k-ink bg-k-green/20 px-2 py-0.5 text-[11px] font-black uppercase text-k-ink">
            Nouveau
          </span>
        )}
        <span className="text-[11px] font-black uppercase tracking-wide text-k-body">
          {reward.rewardType === "spin" ? "🎡 Tour de roue offert" : "🎁 Lot fidélité"}
        </span>
      </div>

      <p className="text-lg font-black text-k-ink">
        {reward.rewardLabel || (reward.rewardType === "spin" ? "Tour de roue offert" : "Lot fidélité")}
      </p>
      {reward.rewardDetails && (
        <p className="mt-0.5 text-sm text-k-body">{reward.rewardDetails}</p>
      )}

      {reward.rewardType === "spin" ? (
        <SpinReward reward={reward} hasWheel={hasWheel} onPlaySpin={onPlaySpin} />
      ) : (
        <LotReward reward={reward} />
      )}
    </div>
  );
}

function SpinReward({
  reward,
  hasWheel,
  onPlaySpin,
}: {
  reward: EarnedReward;
  hasWheel: boolean;
  onPlaySpin: (milestoneId: string, grantToken: string, label: string) => void;
}) {
  if (!reward.grantToken) {
    return (
      <p className="mt-3 rounded-xl border-2 border-k-ink/20 bg-zinc-50 px-3 py-2 text-sm font-bold text-k-body">
        Tour de roue déjà utilisé.
      </p>
    );
  }
  if (!hasWheel) {
    return (
      <p className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
        Ce tour de roue n&apos;est pas disponible pour le moment. Présentez-vous
        au comptoir.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() =>
        onPlaySpin(reward.milestoneId, reward.grantToken!, reward.rewardLabel)
      }
      className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-3.5 text-base font-black uppercase tracking-wider text-k-ink"
    >
      🎡 Utiliser mon tour offert
    </button>
  );
}

function LotReward({ reward }: { reward: EarnedReward }) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  if (reward.outOfStock || !reward.code) {
    return (
      <p className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
        Lot momentanément épuisé — présentez-vous au comptoir, le commerçant
        saura vous accueillir.
      </p>
    );
  }

  const code = reward.code;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible et recopiable.
    }
  };
  const share = async () => {
    try {
      await navigator.share({
        text: `Mon code fidélité à présenter en caisse : ${code}`,
      });
    } catch {
      // Partage annulé : rien à faire.
    }
  };

  if (reward.redeemedAt) {
    return (
      <div className="mt-4">
        <p className="break-all text-center font-mono text-xl font-black tracking-wider text-k-ink/40 line-through">
          {code}
        </p>
        <p className="mt-2 rounded-xl border-2 border-k-ink/20 bg-zinc-50 px-3 py-2 text-center text-sm font-bold text-k-body">
          ✓ Lot déjà récupéré en caisse.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 text-center">
      <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-k-body">
        Votre code de retrait
      </p>
      <p className="mt-1 break-all font-mono text-2xl font-black tracking-wider text-k-ink">
        {code}
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
        Présentez ce code en caisse pour récupérer votre lot.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Aperçu des paliers du programme
// ────────────────────────────────────────────────────────────

function MilestonesOverview({
  milestones,
  visitCount,
}: {
  milestones: LoyaltyMilestoneView[];
  visitCount: number;
}) {
  if (milestones.length === 0) return null;
  const ordered = [...milestones].sort((a, b) => a.visitCount - b.visitCount);

  return (
    <section>
      <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-k-body">
        Les paliers à débloquer
      </h2>
      <ol className="space-y-2">
        {ordered.map((m) => {
          const reached = visitCount >= m.visitCount;
          const remaining = Math.max(0, m.visitCount - visitCount);
          return (
            <li
              key={m.id}
              className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 ${
                reached
                  ? "border-k-ink bg-k-green/10"
                  : "border-k-ink/15 bg-white"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black tabular-nums ${
                  reached
                    ? "border-k-ink bg-k-yellow text-k-ink"
                    : "border-k-ink/30 text-k-ink/50"
                }`}
              >
                {reached ? "✓" : m.visitCount}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-k-ink">
                  {m.rewardType === "spin"
                    ? m.rewardLabel || "Tour de roue offert"
                    : m.rewardLabel || "Lot fidélité"}
                </p>
                <p className="text-xs font-bold text-k-body">
                  {m.rewardType === "spin" ? "🎡 Tour de roue" : "🎁 Lot"} · à{" "}
                  {m.visitCount} visite{m.visitCount > 1 ? "s" : ""}
                  {m.soldOut ? " · épuisé" : ""}
                </p>
              </div>
              {!reached && (
                <span className="shrink-0 text-xs font-bold text-k-body tabular-nums">
                  dans {remaining}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
