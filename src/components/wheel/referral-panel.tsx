"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ensureReferralSponsor,
  getReferralState,
  validateReferral,
} from "@/actions/referral";
import type {
  ReferralBeneficiary,
  ReferralProgramPublic,
  ReferralPublicState,
  ReferralRewardView,
  ReferralValidationResult,
} from "@/lib/referral";
import type { ClaimConfig } from "./claim-form";
import type { WheelSegment } from "./wheel-svg";
import { ReferralSpinExperience } from "./referral-spin-experience";

/**
 * Parrainage ludique côté joueur, greffé au parcours roue APRÈS une partie.
 * Deux briques cohabitent :
 *   · FILLEUL — si l'URL portait `?ref=<code>` et que le joueur a VRAIMENT joué
 *     (on tient `proofSpinId`), on valide le parrainage (validateReferral). Jamais
 *     avant un spin réel ; jamais d'oracle sur un refus (message neutre unique).
 *   · PARRAIN — un CTA « Parraine tes amis » crée le parrain (ensureReferralSponsor),
 *     donne le lien à partager, puis suit l'ÉQUIPE (jauge + coffre + récompenses)
 *     via un polling doux de getReferralState (miroir du calendrier).
 *
 * Un tour offert (versement `spin`) se consomme en plein écran via
 * ReferralSpinExperience, exactement comme le calendrier.
 */

/** Config publique servie à la page de jeu (labels/kinds + seuil). Jamais de stock. */
export interface PlayReferralConfig extends ReferralProgramPublic {
  chestThreshold: number;
}
export interface PlayReferral {
  enabled: boolean;
  config: PlayReferralConfig;
}

/** Jeton partageable du parrain (PR-…) — sert de garde anti-collision `?ref=share`. */
const REFERRAL_CODE_RE = /^PR-[A-HJ-NP-Z2-9]{8}$/;
/** Rafraîchissement doux de l'équipe (comme le calendrier). */
const POLL_MS = 45_000;

// Partage natif détecté sans écart d'hydratation (serveur → false).
const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );

interface Theme {
  card: string;
  heading: string;
  body: string;
  bodyDim: string;
  primaryBtn: string;
  secondaryBtn: string;
  code: string;
  gaugeTrack: string;
  gaugeFill: string;
  note: string;
}

/** Jetons de style pour les deux ambiances /play (kermesse crème / nuit sombre). */
function theme(kermesse: boolean): Theme {
  return kermesse
    ? {
        card: "k-border bg-white shadow-[4px_4px_0_var(--color-k-ink)]",
        heading: "text-k-ink",
        body: "text-k-body",
        bodyDim: "text-k-body/70",
        primaryBtn:
          "k-btn-sm border-2 border-k-ink bg-k-yellow text-k-ink",
        secondaryBtn:
          "border-2 border-k-ink bg-white text-k-ink hover:bg-k-yellow/30",
        code: "text-k-ink",
        gaugeTrack: "border-2 border-k-ink bg-white",
        gaugeFill: "bg-k-green",
        note: "border-amber-300 bg-amber-50 text-amber-800",
      }
    : {
        card: "border border-white/10 bg-white/5",
        heading: "text-white",
        body: "text-zinc-400",
        bodyDim: "text-zinc-500",
        primaryBtn: "bg-white text-zinc-900",
        secondaryBtn: "border border-white/15 text-white hover:bg-white/10",
        code: "text-white",
        gaugeTrack: "border border-white/15 bg-black/30",
        gaugeFill: "bg-emerald-400",
        note: "border-amber-400/40 bg-amber-400/10 text-amber-200",
      };
}

export function ReferralPanel({
  slug,
  referral,
  proofSpinId,
  segments,
  claimConfig,
  organizationName,
  kermesse,
}: {
  slug: string;
  referral: PlayReferral;
  /** Spin réel de CE joueur (preuve de participation) — null tant qu'absent. */
  proofSpinId: string | null;
  /** Segments de la roue de la campagne (pour un éventuel tour offert). */
  segments: WheelSegment[];
  claimConfig: ClaimConfig;
  organizationName: string;
  kermesse: boolean;
}) {
  const t = theme(kermesse);
  const config = referral.config;
  const canShare = useCanShare();

  // ── FILLEUL : captation du `ref` + validation post-spin ──
  const [refCode, setRefCode] = useState<string | null>(null);
  const [validation, setValidation] = useState<ReferralValidationResult | null>(null);
  const validatedRef = useRef(false);
  const [filleulSpinDone, setFilleulSpinDone] = useState(false);

  // Capte le code de parrainage (PR-… uniquement, jamais `?ref=share`) et le
  // persiste le temps de la session pour survivre à un rechargement.
  useEffect(() => {
    try {
      const key = `lastchance:ref:${slug}`;
      const fromUrl = new URLSearchParams(window.location.search).get("ref");
      const candidate =
        fromUrl && REFERRAL_CODE_RE.test(fromUrl.toUpperCase())
          ? fromUrl.toUpperCase()
          : null;
      const stored = sessionStorage.getItem(key);
      const resolved =
        candidate ?? (stored && REFERRAL_CODE_RE.test(stored) ? stored : null);
      if (resolved) {
        sessionStorage.setItem(key, resolved);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique post-montage (sous-arbre client only).
        setRefCode(resolved);
      }
    } catch {
      // sessionStorage indisponible — pas de parrainage filleul, sans gravité.
    }
  }, [slug]);

  // Validation UNE SEULE FOIS, et JAMAIS avant un spin réel (proofSpinId présent).
  useEffect(() => {
    if (!refCode || !proofSpinId || validatedRef.current) return;
    validatedRef.current = true;
    let active = true;
    validateReferral({ slug, ref: refCode, proofSpinId })
      .then((res) => {
        if (active && res.ok) setValidation(res.data);
      })
      .catch(() => {
        // Refus réseau : on n'affiche rien (pas d'oracle, pas de récompense).
      });
    return () => {
      active = false;
    };
  }, [refCode, proofSpinId, slug]);

  // ── PARRAIN : devenir parrain + suivre l'équipe ──
  const [sponsorCode, setSponsorCode] = useState<string | null>(null);
  const [sponsorInit, setSponsorInit] = useState<{
    validatedCount: number;
    chestThreshold: number;
    chestRewarded: boolean;
  } | null>(null);
  const [sponsorStatus, setSponsorStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [sponsorError, setSponsorError] = useState("");
  const [team, setTeam] = useState<ReferralPublicState | null>(null);

  const refreshTeam = useCallback(async () => {
    try {
      const fresh = await getReferralState({ slug });
      if (fresh.state === "ok") setTeam(fresh);
    } catch {
      // Coupure : on conserve la dernière photo saine.
    }
  }, [slug]);

  const becomeSponsor = () => {
    if (sponsorStatus === "loading") return;
    setSponsorStatus("loading");
    setSponsorError("");
    ensureReferralSponsor({ slug })
      .then((res) => {
        if (res.ok && res.data.state === "ready" && res.data.referralCode) {
          setSponsorCode(res.data.referralCode);
          setSponsorInit({
            validatedCount: res.data.validatedCount,
            chestThreshold: res.data.chestThreshold || config.chestThreshold,
            chestRewarded: res.data.chestRewarded,
          });
          setSponsorStatus("ready");
          void refreshTeam();
        } else if (res.ok) {
          setSponsorStatus("error");
          setSponsorError("Le parrainage n'est pas disponible pour le moment.");
        } else {
          setSponsorStatus("error");
          setSponsorError(res.error);
        }
      })
      .catch(() => {
        setSponsorStatus("error");
        setSponsorError("Connexion perdue. Réessaie.");
      });
  };

  // ── Tour offert plein écran (filleul ou parrain) ──
  const [activeSpin, setActiveSpin] = useState<{
    grantToken: string;
    label: string;
    source: "filleul" | "sponsor";
  } | null>(null);
  const activeSpinRef = useRef(false);
  useEffect(() => {
    activeSpinRef.current = activeSpin !== null;
  }, [activeSpin]);

  // Polling doux de l'équipe (une fois parrain) : pause onglet masqué / pendant
  // un tour, reprise au retour ; dernière photo saine conservée sur coupure.
  useEffect(() => {
    if (!sponsorCode) return;
    let active = true;
    const id = window.setInterval(() => {
      if (!active || document.hidden || activeSpinRef.current) return;
      void refreshTeam();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden && !activeSpinRef.current) void refreshTeam();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sponsorCode, refreshTeam]);

  if (activeSpin) {
    return (
      <ReferralSpinExperience
        slug={slug}
        grantToken={activeSpin.grantToken}
        segments={segments}
        claimConfig={claimConfig}
        organizationName={organizationName}
        rewardLabel={activeSpin.label}
        onExit={() => {
          if (activeSpin.source === "filleul") setFilleulSpinDone(true);
          setActiveSpin(null);
          void refreshTeam();
        }}
      />
    );
  }

  const validatedCount =
    team?.validatedCount ?? sponsorInit?.validatedCount ?? 0;
  const chestThreshold =
    team?.chestThreshold || sponsorInit?.chestThreshold || config.chestThreshold;
  const chestRewarded = team?.chestRewarded ?? sponsorInit?.chestRewarded ?? false;

  return (
    <div className="mt-8 w-full space-y-4 text-left">
      {validation && (
        <FilleulOutcome
          validation={validation}
          config={config}
          t={t}
          canShare={canShare}
          spinDone={filleulSpinDone}
          onLaunchSpin={(grantToken, label) =>
            setActiveSpin({ grantToken, label, source: "filleul" })
          }
        />
      )}

      {sponsorCode ? (
        <SponsorTeam
          slug={slug}
          sponsorCode={sponsorCode}
          organizationName={organizationName}
          config={config}
          validatedCount={validatedCount}
          chestThreshold={chestThreshold}
          chestRewarded={chestRewarded}
          rewards={team?.rewards ?? []}
          t={t}
          onLaunchSpin={(grantToken, label) =>
            setActiveSpin({ grantToken, label, source: "sponsor" })
          }
        />
      ) : (
        <SponsorCta
          status={sponsorStatus}
          error={sponsorError}
          t={t}
          onBecome={becomeSponsor}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Filleul — issue de la validation (bienveillant, sans oracle)
// ────────────────────────────────────────────────────────────

function FilleulOutcome({
  validation,
  config,
  t,
  canShare,
  spinDone,
  onLaunchSpin,
}: {
  validation: ReferralValidationResult;
  config: PlayReferralConfig;
  t: Theme;
  canShare: boolean;
  spinDone: boolean;
  onLaunchSpin: (grantToken: string, label: string) => void;
}) {
  // Refus (self / doublon / plafond / période / boucle / preuve absente /
  // invalide / indispo) : message NEUTRE unique, aucune récompense, aucun détail.
  if (validation.state !== "validated") {
    return (
      <div className={`rounded-2xl p-5 text-center ${t.card}`}>
        <p className={`text-sm font-black ${t.heading}`}>Merci d&apos;avoir joué ! 🎉</p>
        <p className={`mt-1 text-xs ${t.body}`}>
          Ta partie est bien prise en compte.
        </p>
      </div>
    );
  }

  const reward = validation.filleulReward;
  const rewardLabel = config.filleulRewardLabel || "Ton cadeau de bienvenue";

  return (
    <div className={`rounded-2xl p-5 text-center ${t.card}`}>
      <p className={`text-xs font-mono font-bold tracking-[0.25em] ${t.body}`}>
        ✦ BIENVENUE DANS L&apos;ÉQUIPE ✦
      </p>
      <h3 className={`mt-2 text-xl font-black ${t.heading}`}>
        Tu as rejoint l&apos;équipe ! 🎉
      </h3>

      {/* Versement de bienvenue selon sa nature (none / lot / spin). */}
      {!reward || reward.kind === "none" || !reward.rewarded ? (
        reward && reward.kind !== "none" ? (
          <p className={`mt-3 rounded-xl border-2 px-3 py-2 text-sm font-bold ${t.note}`}>
            Cadeau de bienvenue momentanément épuisé — merci d&apos;avoir rejoint la
            partie !
          </p>
        ) : (
          <p className={`mt-2 text-sm ${t.body}`}>
            Merci d&apos;avoir rejoint la partie — continue à faire tourner la roue !
          </p>
        )
      ) : reward.kind === "lot" && reward.code ? (
        <div className="mt-3">
          <p className={`text-sm font-bold ${t.body}`}>{rewardLabel}</p>
          <CodeReveal code={reward.code} t={t} canShare={canShare} />
        </div>
      ) : reward.kind === "spin" && reward.grant ? (
        <div className="mt-4">
          <p className={`mb-3 text-sm font-bold ${t.body}`}>{rewardLabel}</p>
          {spinDone ? (
            <p className={`text-sm font-bold ${t.body}`}>🎡 Tour lancé — merci !</p>
          ) : (
            <button
              type="button"
              onClick={() => onLaunchSpin(reward.grant as string, rewardLabel)}
              className={`w-full rounded-xl px-4 py-3 text-sm font-black ${t.primaryBtn}`}
            >
              🎡 Lance ton tour offert
            </button>
          )}
        </div>
      ) : (
        <p className={`mt-2 text-sm ${t.body}`}>
          Merci d&apos;avoir rejoint la partie !
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Parrain — CTA d'entrée
// ────────────────────────────────────────────────────────────

function SponsorCta({
  status,
  error,
  t,
  onBecome,
}: {
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  t: Theme;
  onBecome: () => void;
}) {
  return (
    <div className={`rounded-2xl p-5 text-center ${t.card}`}>
      <p className={`text-sm font-black ${t.heading}`}>
        🎁 Parraine tes amis et gagne plus
      </p>
      <p className={`mt-1 text-xs ${t.body}`}>
        Invite tes amis à jouer. Dès qu&apos;ils tentent leur chance, ton équipe
        progresse et tu débloques des récompenses.
      </p>
      <button
        type="button"
        onClick={onBecome}
        disabled={status === "loading"}
        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-black disabled:opacity-70 ${t.primaryBtn}`}
      >
        {status === "loading" ? "…" : "Obtenir mon lien de parrainage"}
      </button>
      {status === "error" && error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Parrain — équipe suivable (lien, jauge, coffre, récompenses)
// ────────────────────────────────────────────────────────────

function SponsorTeam({
  slug,
  sponsorCode,
  organizationName,
  config,
  validatedCount,
  chestThreshold,
  chestRewarded,
  rewards,
  t,
  onLaunchSpin,
}: {
  slug: string;
  sponsorCode: string;
  organizationName: string;
  config: PlayReferralConfig;
  validatedCount: number;
  chestThreshold: number;
  chestRewarded: boolean;
  rewards: ReferralRewardView[];
  t: Theme;
  onLaunchSpin: (grantToken: string, label: string) => void;
}) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const link = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/play/${slug}?ref=${sponsorCode}`;
  };
  const shareText = `🎁 Rejoins mon équipe et tente ta chance chez ${organizationName} !`;

  const share = async () => {
    const url = link();
    if (canShare) {
      try {
        await navigator.share({ title: organizationName, text: shareText, url });
      } catch {
        // Partage annulé — rien à faire.
      }
    } else {
      await copy();
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible — le lien reste lisible.
    }
  };

  const remaining = Math.max(0, chestThreshold - validatedCount);
  const ratio = chestThreshold > 0 ? Math.min(1, validatedCount / chestThreshold) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <div className={`rounded-2xl p-5 ${t.card}`}>
      <p className={`text-center text-sm font-black ${t.heading}`}>
        🎁 Ton équipe de parrainage
      </p>

      {/* ── Lien à partager ── */}
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={share}
          className={`w-full rounded-xl px-4 py-3 text-sm font-black ${t.primaryBtn}`}
        >
          {canShare ? "Partager mon lien" : "Copier mon lien"}
        </button>
        <button
          type="button"
          onClick={copy}
          className={`w-full rounded-xl px-4 py-3 text-sm font-bold ${t.secondaryBtn}`}
        >
          {copied ? "Lien copié ✓" : "Copier le lien"}
        </button>
      </div>

      {/* ── Jauge de l'équipe ── */}
      <div className="mt-5">
        <div className={`mb-1.5 flex items-center justify-between text-sm font-black ${t.heading}`}>
          <span className="tabular-nums">
            {validatedCount} / {chestThreshold}
          </span>
          <span className={t.body}>
            {validatedCount > 1 ? "amis ont joué" : "ami a joué"}
          </span>
        </div>
        <div
          className={`h-4 overflow-hidden rounded-full ${t.gaugeTrack}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Progression de l'équipe vers le coffre"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${t.gaugeFill}`}
            style={{ width: `${Math.max(3, ratio * 100)}%` }}
          />
        </div>
        <p className={`mt-3 text-center text-sm font-bold ${t.body}`}>
          {chestRewarded ? (
            <span className={`font-black ${t.heading}`}>
              🧰 Coffre débloqué ! Ta récompense est ci-dessous.
            </span>
          ) : remaining === 0 ? (
            <span className={`font-black ${t.heading}`}>
              🧰 Coffre à portée — encore un instant !
            </span>
          ) : (
            <>
              Encore{" "}
              <span className={`font-black tabular-nums ${t.heading}`}>{remaining}</span>{" "}
              {remaining > 1 ? "amis" : "ami"} pour débloquer le coffre 🧰
            </>
          )}
        </p>
      </div>

      {/* ── Récompenses gagnées ── */}
      <RewardsList
        rewards={rewards}
        config={config}
        t={t}
        canShare={canShare}
        onLaunchSpin={onLaunchSpin}
      />
    </div>
  );
}

/** Libellé humain d'un versement selon son bénéficiaire (config commerçant). */
function rewardTitle(beneficiary: ReferralBeneficiary, config: PlayReferralConfig): string {
  if (beneficiary === "chest") return config.chestRewardLabel || "Coffre de l'équipe";
  if (beneficiary === "filleul") return config.filleulRewardLabel || "Bonus de bienvenue";
  return config.sponsorRewardLabel || "Récompense de parrain";
}

function RewardsList({
  rewards,
  config,
  t,
  canShare,
  onLaunchSpin,
}: {
  rewards: ReferralRewardView[];
  config: PlayReferralConfig;
  t: Theme;
  canShare: boolean;
  onLaunchSpin: (grantToken: string, label: string) => void;
}) {
  if (rewards.length === 0) {
    return (
      <p className={`mt-5 rounded-xl border-2 border-dashed px-3 py-4 text-center text-xs font-bold ${t.body} ${t.gaugeTrack}`}>
        Tes récompenses apparaîtront ici dès que tes amis joueront.
      </p>
    );
  }
  return (
    <ul className="mt-5 space-y-3">
      {rewards.map((reward, i) => {
        const title = rewardTitle(reward.beneficiary, config);
        return (
          <li key={`${reward.beneficiary}-${reward.createdAt ?? i}`}>
            <p className={`text-sm font-bold ${t.heading}`}>{title}</p>
            {reward.kind === "lot" ? (
              reward.redeemedAt ? (
                <p className={`mt-1 text-sm font-bold ${t.body}`}>
                  ✓ Récompense déjà récupérée en caisse.
                </p>
              ) : reward.outOfStock || !reward.code ? (
                <p className={`mt-1 rounded-xl border-2 px-3 py-2 text-sm font-bold ${t.note}`}>
                  Lot momentanément épuisé — présente-toi au comptoir.
                </p>
              ) : (
                <CodeReveal code={reward.code} t={t} canShare={canShare} />
              )
            ) : reward.kind === "spin" ? (
              reward.grantConsumedAt || reward.resultingSpinId ? (
                <p className={`mt-1 text-sm font-bold ${t.body}`}>🎡 Tour déjà joué.</p>
              ) : reward.spinGrantToken ? (
                <button
                  type="button"
                  onClick={() => onLaunchSpin(reward.spinGrantToken as string, title)}
                  className={`mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm font-black ${t.primaryBtn}`}
                >
                  🎡 Utilise ton tour
                </button>
              ) : (
                <p className={`mt-1 text-sm font-bold ${t.body}`}>Tour indisponible.</p>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// Code de retrait PARRAIN-… (copie / partage)
// ────────────────────────────────────────────────────────────

function CodeReveal({
  code,
  t,
  canShare,
}: {
  code: string;
  t: Theme;
  canShare: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible.
    }
  };
  const share = async () => {
    try {
      await navigator.share({
        text: `Mon code à présenter en caisse : ${code}`,
      });
    } catch {
      // Partage annulé.
    }
  };
  return (
    <div className="mt-2">
      <p className={`text-[11px] font-mono uppercase tracking-[0.25em] ${t.body}`}>
        Ton code de retrait
      </p>
      <p className={`mt-1 break-all font-mono text-2xl font-black tracking-wider ${t.code}`}>
        {code}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className={`rounded-xl px-4 py-2 text-sm font-black ${t.primaryBtn}`}
        >
          {copied ? "Copié !" : "Copier le code"}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={share}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${t.secondaryBtn}`}
          >
            Partager
          </button>
        )}
      </div>
      <p className={`mt-2 text-xs font-bold ${t.body}`}>
        Présente ce code en caisse pour récupérer ton lot.
      </p>
    </div>
  );
}
