"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicEngagementAction } from "@/lib/engagement";
import type { EngagementAction } from "@/types/database";

export interface ChosenEngagement {
  action: EngagementAction;
  email?: string;
}

const ACTION_UI: Record<
  EngagementAction,
  { icon: string; label: string; hint: string }
> = {
  newsletter: {
    icon: "✉️",
    label: "S'inscrire à la newsletter",
    hint: "Votre email suffit",
  },
  instagram: {
    icon: "📸",
    label: "S'abonner à l'Instagram",
    hint: "Un tap, on vous ramène ici",
  },
  tiktok: {
    icon: "🎵",
    label: "S'abonner au TikTok",
    hint: "Un tap, on vous ramène ici",
  },
  google_review: {
    icon: "⭐",
    label: "Laisser un avis Google",
    hint: "30 secondes suffisent",
  },
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Écran avant la roue : le joueur choisit UNE action pour débloquer le
 * jeu. Les actions lien (Instagram, TikTok, avis Google) s'ouvrent en
 * un tap ; au retour sur la page, la roue se débloque automatiquement
 * (avec un bouton de secours si le navigateur ne signale pas le
 * retour). La newsletter demande l'email avec consentement explicite.
 */
export function EngagementGate({
  organizationName,
  actions,
  onUnlock,
}: {
  organizationName: string;
  actions: PublicEngagementAction[];
  onUnlock: (engagement: ChosenEngagement) => void;
}) {
  const [waitingAction, setWaitingAction] = useState<EngagementAction | null>(
    null,
  );
  const [completed, setCompleted] = useState(false);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  // Vrai dès que le joueur a réellement quitté la page (nouvel onglet /
  // app Instagram…) : on ne débloque au retour que dans ce cas.
  const leftPageRef = useRef(false);
  const unlockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!waitingAction) return;

    function complete() {
      if (!leftPageRef.current || unlockTimerRef.current !== null) return;
      setCompleted(true);
      // Petit temps de confirmation visuelle avant la roue.
      unlockTimerRef.current = window.setTimeout(
        () => onUnlock({ action: waitingAction! }),
        900,
      );
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") leftPageRef.current = true;
      else complete();
    }
    function onBlur() {
      leftPageRef.current = true;
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", complete);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", complete);
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };
  }, [waitingAction, onUnlock]);

  function submitNewsletter() {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setEmailError("Entrez un email valide.");
      return;
    }
    onUnlock({ action: "newsletter", email: clean });
  }

  const inputClass =
    "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400";

  // Confirmation visuelle : l'action est faite, la roue arrive.
  if (completed && waitingAction) {
    return (
      <div className="play-in w-full text-center">
        <div className="text-5xl mb-5">🎉</div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Merci !</h1>
        <p className="text-sm text-zinc-400">La roue se débloque…</p>
      </div>
    );
  }

  // Attente du retour après ouverture d'un lien externe.
  if (waitingAction) {
    const ui = ACTION_UI[waitingAction];
    const url = actions.find((a) => a.action === waitingAction)?.url;
    return (
      <div className="play-in w-full text-center">
        <div className="text-5xl mb-5">{ui.icon}</div>
        <h1 className="text-2xl font-extrabold text-white mb-3">
          {ui.label}
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Une fois que c&apos;est fait, revenez sur cette page :<br />
          la roue se débloquera toute seule.
        </p>
        <button
          type="button"
          onClick={() => onUnlock({ action: waitingAction })}
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(16,185,129,.4)]"
        >
          C&apos;est fait, je joue !
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm text-zinc-400 underline hover:text-zinc-200"
          >
            Rouvrir la page
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="play-in w-full text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300 mb-2">
        {organizationName}
      </p>
      <h1 className="text-3xl font-extrabold text-white mb-3 leading-tight">
        Débloquez la roue !
      </h1>
      <p className="text-sm text-zinc-400 mb-8">
        {actions.length > 1
          ? "Une seule action au choix pour tenter votre chance :"
          : "Une petite action pour tenter votre chance :"}
      </p>

      <div className="space-y-3 text-left">
        {actions.map(({ action, url }) => {
          const ui = ACTION_UI[action];
          const cardClass =
            "flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition-colors hover:border-violet-400/60 hover:bg-violet-500/10";
          const body = (
            <>
              <span className="text-2xl">{ui.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">
                  {ui.label}
                </span>
                <span className="block text-xs text-zinc-400">{ui.hint}</span>
              </span>
              <span aria-hidden className="text-zinc-500">
                →
              </span>
            </>
          );

          // Newsletter : déplie le champ email sur place.
          if (action === "newsletter") {
            return (
              <div key={action}>
                <button
                  type="button"
                  onClick={() => {
                    setNewsletterOpen((v) => !v);
                    setEmailError("");
                  }}
                  className={`${cardClass} ${
                    newsletterOpen
                      ? "border-violet-400 bg-violet-500/15"
                      : ""
                  }`}
                >
                  {body}
                </button>
                {newsletterOpen && (
                  <div className="play-in mt-3 space-y-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Votre email"
                      autoComplete="email"
                      className={inputClass}
                    />
                    {emailError && (
                      <p className="text-sm text-red-400">{emailError}</p>
                    )}
                    <button
                      type="button"
                      onClick={submitNewsletter}
                      className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(139,92,246,.45)]"
                    >
                      S&apos;inscrire et jouer
                    </button>
                    <p className="text-center text-[11px] text-zinc-500">
                      En vous inscrivant, vous acceptez de recevoir la
                      newsletter de {organizationName}. Désinscription
                      possible à tout moment.
                    </p>
                  </div>
                )}
              </div>
            );
          }

          // Actions lien : un tap ouvre la page, le retour débloque.
          return (
            <a
              key={action}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setWaitingAction(action)}
              className={cardClass}
            >
              {body}
            </a>
          );
        })}
      </div>
    </div>
  );
}
