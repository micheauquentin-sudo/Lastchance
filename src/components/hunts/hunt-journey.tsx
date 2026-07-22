"use client";

import {
  useActionState,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { claimHuntReward, stampHuntStep } from "@/actions/hunts";
import type { HuntScanResult } from "@/lib/hunts";
import type { ActionResult } from "@/lib/utils";
import type { HuntOrderMode } from "@/types/database";
import {
  huntStampCells,
  isHuntComplete,
  messageForScanState,
  type HuntMessageTone,
} from "./hunt-state";

/* Parcours joueur public d'une chasse au trésor — DA « Kermesse » (crème,
   encre, jaune, ombres dures). Mobile d'abord : le joueur arrive en scannant
   le QR d'une étape, chaque page = une étape. Le tampon se fait au POST du
   bouton (jamais au chargement : anti-prefetch). */

const inputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// Détection du partage natif sans écart d'hydratation : serveur → false,
// premier rendu client → valeur réelle (mêmes précautions que les ligues).
const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );

const TONE_BOX: Record<HuntMessageTone, string> = {
  success: "border-k-ink bg-k-green/15 text-k-ink",
  info: "border-k-ink bg-k-blue/25 text-k-ink",
  warning: "border-k-ink bg-k-yellow/50 text-k-ink",
  error: "border-red-400 bg-red-50 text-red-700",
};

export interface HuntJourneyProps {
  stepToken: string;
  organizationName: string;
  logoUrl: string | null;
  huntName: string;
  orderMode: HuntOrderMode;
  step: { position: number; label: string };
  reward: { label: string; details: string | null };
  /** Progression du joueur courant (cookie), lue au rendu serveur. */
  initial: {
    total: number;
    done: number;
    stamped: number[];
    completedCode: string | null;
  };
  /** Indice de CETTE étape, fourni seulement si déjà tamponnée (sinon null). */
  revealedHint: string | null;
}

export function HuntJourney({
  stepToken,
  organizationName,
  logoUrl,
  huntName,
  orderMode,
  step,
  reward,
  initial,
  revealedHint,
}: HuntJourneyProps) {
  // Le tampon est un POST de Server Action : useActionState garde le
  // dernier résultat typé (HuntScanResult) et l'état « en cours ».
  const [state, formAction, pending] = useActionState<
    ActionResult<HuntScanResult> | null,
    FormData
  >(async () => stampHuntStep({ stepToken }), null);

  const scan = state?.ok ? state.data : null;
  const stampError = state && !state.ok ? state.error : null;

  // Fusion « serveur (cookie) + dernier scan » : le scan, plus récent, prime.
  const total = scan?.progress.total ?? initial.total;
  const done = scan?.progress.done ?? initial.done;
  const stamped =
    scan && scan.stamped.length > 0 ? scan.stamped : initial.stamped;
  const completedCode = scan?.code ?? initial.completedCode;

  const stampedNow = scan
    ? scan.stamped.includes(step.position)
    : initial.stamped.includes(step.position);
  // L'indice n'apparaît qu'une fois l'étape tamponnée (serveur si déjà
  // acquise, réponse du scan sinon — jamais dans le HTML avant le tampon).
  const hint = scan?.step?.hint ?? (stampedNow ? revealedHint : null);

  const complete =
    completedCode !== null ||
    scan?.state === "completed" ||
    isHuntComplete(done, total);
  const huntFull = scan?.state === "hunt_full";
  const unavailable = scan?.state === "unavailable";

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* ── En-tête commerce + chasse ── */}
      <header className="mb-6 text-center">
        {logoUrl ? (
          // URL Supabase validée à l'upload ; <img> évite de figer le domaine.
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
            🗺️
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          {huntName}
        </h1>
      </header>

      {/* ── Carte de fidélité (tampons) ── */}
      {total > 0 && !unavailable && (
        <StampCard total={total} stamped={stamped} done={done} />
      )}

      {/* ── Zone d'action selon l'état ── */}
      {unavailable ? (
        <StateBox state="unavailable" />
      ) : complete ? (
        <CompletionCard
          stepToken={stepToken}
          code={completedCode}
          huntFull={huntFull && !completedCode}
          reward={reward}
        />
      ) : huntFull ? (
        <StateBox state="hunt_full" />
      ) : (
        <section className="mt-6">
          <div className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
            <p className="text-xs font-bold uppercase tracking-wide text-k-body">
              Étape {step.position}
              {total > 0 ? ` sur ${total}` : ""}
            </p>
            <p className="mt-1 text-lg font-black text-k-ink">{step.label}</p>

            {hint && (
              <div className="mt-3 rounded-xl border-2 border-k-ink bg-k-yellow/40 px-3 py-2">
                <p className="text-xs font-black uppercase tracking-wide text-k-body">
                  💡 Indice
                </p>
                <p className="mt-0.5 text-sm font-bold text-k-ink">{hint}</p>
              </div>
            )}

            {/* Message d'état après un scan (déjà tamponnée, trop tôt, ordre…). */}
            {scan && scan.state !== "scanned" && (
              <div className="mt-4">
                <StateBox
                  state={scan.state}
                  retryInSeconds={scan.retryInSeconds}
                  expectedPosition={scan.expectedPosition}
                />
              </div>
            )}
            {scan?.state === "scanned" && (
              <div className="mt-4">
                <StateBox state="scanned" />
              </div>
            )}

            {stampedNow ? (
              <p className="mt-4 text-center text-sm font-bold text-k-body">
                Direction l&apos;étape suivante — cherchez le prochain QR code.
              </p>
            ) : (
              <form action={formAction} className="mt-4">
                <button
                  type="submit"
                  disabled={pending}
                  className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
                >
                  {pending ? "Validation…" : "Valider mon passage"}
                </button>
                {orderMode === "ordered" && (
                  <p className="mt-2 text-center text-xs text-k-body/70">
                    Les étapes se valident dans l&apos;ordre.
                  </p>
                )}
              </form>
            )}

            {stampError && (
              <p
                role="alert"
                className="mt-3 text-center text-sm font-semibold text-red-600"
              >
                {stampError}
              </p>
            )}
          </div>

          {reward.label && (
            <p className="mt-4 text-center text-sm font-bold text-k-body">
              🎁 À la clé : <span className="text-k-ink">{reward.label}</span>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** Carte de fidélité : une case par étape, remplie si tamponnée. */
function StampCard({
  total,
  stamped,
  done,
}: {
  total: number;
  stamped: number[];
  done: number;
}) {
  const cells = huntStampCells(total, stamped);
  return (
    <section
      aria-label={`Progression : ${Math.min(done, total)} étape${done > 1 ? "s" : ""} sur ${total}`}
      className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-k-ink">Ma carte de tampons</p>
        <p className="text-sm font-black tabular-nums text-k-ink">
          {Math.min(done, total)}
          <span className="text-k-body">/{total}</span>
        </p>
      </div>
      <ul className="flex flex-wrap gap-2" role="list">
        {cells.map((cell) => (
          <li
            key={cell.position}
            aria-label={`Étape ${cell.position} ${cell.filled ? "tamponnée" : "à faire"}`}
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
    </section>
  );
}

/** Bloc de message d'état (tons cohérents avec la DA). */
function StateBox({
  state,
  retryInSeconds = null,
  expectedPosition = null,
}: {
  state: Parameters<typeof messageForScanState>[0];
  retryInSeconds?: number | null;
  expectedPosition?: number | null;
}) {
  const message = messageForScanState(state, { retryInSeconds, expectedPosition });
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

/**
 * Écran final : code de retrait en grand (copie + partage natif), lot, et
 * formulaire OPTIONNEL de rappel par email. Le code est déjà visible : le
 * mail n'est jamais requis.
 */
function CompletionCard({
  stepToken,
  code,
  huntFull,
  reward,
}: {
  stepToken: string;
  code: string | null;
  /** Stock épuisé au moment de terminer : pas de code, message dédié. */
  huntFull: boolean;
  reward: { label: string; details: string | null };
}) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible et recopiable.
    }
  };

  const share = async () => {
    if (!code) return;
    try {
      await navigator.share({
        text: `J'ai terminé la chasse au trésor ! Mon code de retrait : ${code}`,
      });
    } catch {
      // Partage annulé : rien à faire.
    }
  };

  return (
    <section className="mt-6 space-y-4">
      <div className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        <div className="text-4xl" aria-hidden>
          🏆
        </div>
        <h2 className="mt-2 text-xl font-black text-k-ink">
          Chasse terminée — bravo !
        </h2>

        {reward.label && (
          <p className="mt-2 text-sm font-bold text-k-body">
            Votre lot : <span className="text-k-ink">{reward.label}</span>
          </p>
        )}
        {reward.details && (
          <p className="mt-1 text-sm text-k-body">{reward.details}</p>
        )}

        {huntFull ? (
          <p className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/50 px-3 py-2 text-sm font-bold text-k-ink">
            Vous avez tout tamponné ! Les lots sont malheureusement épuisés —
            présentez-vous en boutique, ils sauront vous accueillir.
          </p>
        ) : code ? (
          <div className="mt-5">
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
            <p className="mt-4 text-sm font-bold text-k-body">
              Présentez ce code en caisse pour récupérer votre lot.
            </p>
          </div>
        ) : null}
      </div>

      {code && <HuntClaimForm stepToken={stepToken} />}
    </section>
  );
}

/**
 * Rappel du code par email — OPTIONNEL (le code est déjà affiché). Opt-in
 * marketing distinct du simple envoi (double consentement), miroir du
 * formulaire de gain de la roue.
 */
function HuntClaimForm({ stepToken }: { stepToken: string }) {
  const [email, setEmail] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await claimHuntReward({ stepToken, email, marketingOptIn });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(result.data.emailed);
    });
  };

  if (sent !== null) {
    return (
      <div
        role="status"
        className="k-border rounded-2xl bg-white p-4 text-center shadow-[4px_4px_0_var(--color-k-ink)]"
      >
        <p className="text-sm font-bold text-k-ink">
          {sent
            ? "📩 Code envoyé — vérifiez votre boîte mail (et vos spams)."
            : "C'est noté ! Gardez votre code affiché ci-dessus, il reste valable."}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="k-border rounded-2xl bg-white p-5 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <h3 className="text-base font-black text-k-ink">
        Recevoir mon code par email
      </h3>
      <p className="mt-0.5 mb-3 text-sm text-k-body">
        Optionnel — pour le garder sous la main. Votre code reste affiché
        ci-dessus dans tous les cas.
      </p>
      <label
        htmlFor="hunt-claim-email"
        className="mb-1.5 block text-sm font-bold text-k-ink"
      >
        Email
      </label>
      <input
        id="hunt-claim-email"
        name="email"
        type="email"
        required
        maxLength={254}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="vous@exemple.fr"
        className={inputClass}
      />
      <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-k-body">
        <input
          type="checkbox"
          checked={marketingOptIn}
          onChange={(e) => setMarketingOptIn(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
        />
        <span>
          J&apos;accepte de recevoir les offres et actualités de
          l&apos;établissement (optionnel).
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || email.trim() === ""}
        className="k-btn-sm mt-3 w-full rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Envoi…" : "M'envoyer le code"}
      </button>
      <p className="mt-2 text-center text-[11px] text-k-body/70">
        Vos données ne servent qu&apos;à l&apos;envoi de votre code.{" "}
        <a href="/privacy" target="_blank" className="underline">
          Confidentialité
        </a>
      </p>
    </form>
  );
}
