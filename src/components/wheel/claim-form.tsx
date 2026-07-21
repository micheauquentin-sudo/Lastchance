"use client";

import { useEffect, useRef, useState } from "react";
import { claimPrize } from "@/actions/play";
import { capturePlayEvent } from "@/components/analytics";
import { RedeemQr } from "./redeem-qr";

export interface ClaimConfig {
  /** Demander l'email avant d'afficher le code. */
  collectEmail: boolean;
  /** Demander le téléphone avant d'afficher le code. */
  collectPhone: boolean;
  /** Secondes avant masquage de l'écran du code (null = jamais). */
  codeTtlSeconds: number | null;
}

type Status = "form" | "submitting" | "done";

/**
 * Étape après un gain, pilotée par la config de la campagne :
 * - collecte email et/ou téléphone (+ prénom, CGU obligatoires) ; ou
 * - aucune collecte → le code est enregistré et affiché directement.
 * L'écran du code peut se masquer après un compte à rebours (le gagnant
 * le présente au staff dans le temps imparti).
 */
export function ClaimForm({
  claimToken,
  config,
  slug,
  kermesse = false,
}: {
  claimToken: string;
  config: ClaimConfig;
  /** Slug du jeu — sert à mémoriser le prénom pour le retour personnalisé. */
  slug: string;
  /** Thème de page « kermesse » (crème + encre) — classes claires sinon. */
  kermesse?: boolean;
}) {
  const collectsData = config.collectEmail || config.collectPhone;
  const [status, setStatus] = useState<Status>(
    collectsData ? "form" : "submitting",
  );
  const [error, setError] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [walletUrl, setWalletUrl] = useState<string | null>(null);
  const [appleWalletUrl, setAppleWalletUrl] = useState<string | null>(null);
  const [anonymousAttempt, setAnonymousAttempt] = useState(0);
  const autoClaimed = useRef(false);

  // Aucune donnée à collecter : enregistrement immédiat du gain.
  useEffect(() => {
    if (collectsData || autoClaimed.current) return;
    autoClaimed.current = true;
    claimPrize({ claimToken }).then((result) => {
      if (!result.ok) {
        // Reste sur l'écran de statut (pas de formulaire à afficher).
        setError(result.error);
        return;
      }
      setRedeemCode(result.data.redeemCode);
      setWalletUrl(result.data.walletUrl);
      setAppleWalletUrl(result.data.appleWalletUrl);
      setStatus("done");
      capturePlayEvent("prize_claimed");
    });
  }, [collectsData, claimToken, anonymousAttempt]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status !== "form") return;
    setStatus("submitting");
    setError("");

    const form = new FormData(e.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const result = await claimPrize({
      claimToken,
      firstName,
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      acceptedTerms: form.get("acceptedTerms") === "on",
      marketingOptIn: form.get("marketingOptIn") === "on",
    });

    if (!result.ok) {
      setStatus("form");
      setError(result.error);
      return;
    }
    setRedeemCode(result.data.redeemCode);
    setWalletUrl(result.data.walletUrl);
    setAppleWalletUrl(result.data.appleWalletUrl);
    setStatus("done");
    capturePlayEvent("prize_claimed");
    // Retour personnalisé : mémorisé côté client uniquement (aucune
    // donnée envoyée au serveur au-delà du claim lui-même).
    if (firstName) {
      try {
        sessionStorage.setItem(`lastchance:name:${slug}`, firstName);
      } catch {
        // Stockage indisponible (navigation privée…) — sans conséquence.
      }
    }
  }

  if (status === "done") {
    return (
      <RedeemCodeScreen
        redeemCode={redeemCode}
        ttlSeconds={config.codeTtlSeconds}
        emailSent={config.collectEmail}
        walletUrl={walletUrl}
        appleWalletUrl={appleWalletUrl}
        kermesse={kermesse}
      />
    );
  }

  if (status === "submitting" && !collectsData) {
    return (
      <div
        className={
          kermesse
            ? "play-in k-border rounded-2xl bg-white p-6 text-center shadow-[4px_4px_0_var(--color-k-ink)]"
            : "play-in rounded-2xl border border-white/10 bg-white/5 p-6 text-center"
        }
      >
        <p className={`text-sm ${kermesse ? "text-k-body" : "text-zinc-400"}`}>
          {error || "Enregistrement de votre gain…"}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => {
              autoClaimed.current = false;
              setError("");
              setAnonymousAttempt((value) => value + 1);
            }}
            className={
              kermesse
                ? "k-btn-sm mt-4 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
                : "mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            }
          >
            Réessayer
          </button>
        )}
      </div>
    );
  }

  const inputClass = kermesse
    ? "w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
    : "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <label htmlFor="claim-first-name" className="sr-only">
        Votre prénom
      </label>
      <input
        id="claim-first-name"
        name="firstName"
        required
        maxLength={80}
        placeholder="Votre prénom"
        autoComplete="given-name"
        className={inputClass}
      />
      {config.collectEmail && (
        <>
          <label htmlFor="claim-email" className="sr-only">
            Votre email
          </label>
          <input
            id="claim-email"
            name="email"
            type="email"
            required
            placeholder="Votre email"
            autoComplete="email"
            className={inputClass}
          />
        </>
      )}
      {config.collectPhone && (
        <>
          <label htmlFor="claim-phone" className="sr-only">
            Votre téléphone
          </label>
          <input
            id="claim-phone"
            name="phone"
            type="tel"
            required
            pattern="\+?[0-9 .()-]{6,20}"
            placeholder="Votre téléphone"
            autoComplete="tel"
            className={inputClass}
          />
        </>
      )}

      <label className={`flex items-start gap-3 text-sm ${kermesse ? "text-k-body" : "text-zinc-300"}`}>
        <input
          type="checkbox"
          name="acceptedTerms"
          required
          className={`mt-1 h-4 w-4 shrink-0 ${kermesse ? "accent-k-ink" : "accent-violet-500"}`}
        />
        <span>
          J&apos;accepte les conditions du jeu et le traitement de mes
          données pour la remise de mon gain.{" "}
          <span className={kermesse ? "text-k-orange" : "text-violet-300"}>*</span>
        </span>
      </label>

      <label className={`flex items-start gap-3 text-sm ${kermesse ? "text-k-body/80" : "text-zinc-400"}`}>
        <input
          type="checkbox"
          name="marketingOptIn"
          className={`mt-1 h-4 w-4 shrink-0 ${kermesse ? "accent-k-ink" : "accent-violet-500"}`}
        />
        <span>
          J&apos;accepte de recevoir les offres et actualités de
          l&apos;établissement (optionnel).
        </span>
      </label>

      {error && (
        <p role="alert" aria-live="assertive" className={`text-sm ${kermesse ? "text-red-600 font-semibold" : "text-red-400"}`}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className={
          kermesse
            ? "k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-70"
            : "w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(139,92,246,.45)] disabled:opacity-70"
        }
      >
        {status === "submitting" ? "Enregistrement…" : "Récupérer mon gain"}
      </button>
      <p className={`text-center text-[11px] ${kermesse ? "text-k-body/70" : "text-zinc-500"}`}>
        Vos données ne servent qu&apos;à la remise du gain — jamais liées à
        un avis en ligne. <a href="/privacy" target="_blank" className="underline">Confidentialité</a>
      </p>
    </form>
  );
}

/**
 * Écran du code de retrait. Si un compte à rebours est configuré, le
 * code se masque à la fin du décompte.
 */
function RedeemCodeScreen({
  redeemCode,
  ttlSeconds,
  emailSent,
  walletUrl,
  appleWalletUrl = null,
  kermesse = false,
}: {
  redeemCode: string;
  ttlSeconds: number | null;
  emailSent: boolean;
  walletUrl: string | null;
  appleWalletUrl?: string | null;
  kermesse?: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState(ttlSeconds);

  useEffect(() => {
    if (ttlSeconds == null) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => (s == null || s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [ttlSeconds]);

  const cardClass = kermesse
    ? "play-in k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
    : "play-in rounded-2xl border border-white/10 bg-white/5 p-6 text-center";

  if (secondsLeft === 0) {
    return (
      <div className={cardClass}>
        <div className="text-4xl mb-4">⏱️</div>
        <p className={`font-semibold mb-2 ${kermesse ? "text-k-ink font-black" : "text-white"}`}>Code masqué</p>
        <p className={`text-sm ${kermesse ? "text-k-body" : "text-zinc-400"}`}>
          Le temps d&apos;affichage est écoulé.
          {emailSent
            ? " Retrouvez votre code dans l'email qui vous a été envoyé."
            : " Rapprochez-vous du staff si vous n'avez pas pu le présenter."}
        </p>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cardClass}>
      <p className={`text-[11px] font-mono tracking-[0.25em] mb-2 ${kermesse ? "text-k-body" : "text-zinc-400"}`}>
        VOTRE CODE
      </p>
      <p className={`text-3xl font-mono font-bold tracking-[0.2em] ${kermesse ? "text-k-ink" : "text-white"}`}>
        {redeemCode}
      </p>
      <RedeemQr value={redeemCode} />
      <p className={`mt-4 text-sm ${kermesse ? "text-k-body" : "text-zinc-400"}`}>
        Présentez ce code (ou faites-le scanner) au staff pour récupérer
        votre gain.
        {emailSent && " Il vous a aussi été envoyé par email."}
      </p>
      {(walletUrl || appleWalletUrl) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {walletUrl && (
            <a
              href={walletUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white ${kermesse ? "border-2 border-k-ink" : ""}`}
            >
              Ajouter à Google Wallet
            </a>
          )}
          {appleWalletUrl && (
            <a
              href={appleWalletUrl}
              className={`inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white ${kermesse ? "border-2 border-k-ink" : ""}`}
            >
               Ajouter à Apple Wallet
            </a>
          )}
        </div>
      )}
      {secondsLeft != null && (
        <p className={`mt-3 text-xs font-mono ${kermesse ? "text-k-orange font-bold" : "text-amber-300"}`}>
          ⏱ Ce code disparaît dans {secondsLeft} s
        </p>
      )}
    </div>
  );
}
