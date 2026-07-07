"use client";

import { useState } from "react";
import type { PublicEngagementAction } from "@/lib/engagement";
import type { EngagementAction } from "@/types/database";

export interface ChosenEngagement {
  action: EngagementAction;
  email?: string;
}

const ACTION_UI: Record<
  EngagementAction,
  { icon: string; label: string; cta: string }
> = {
  newsletter: {
    icon: "✉️",
    label: "Je m'inscris à la newsletter",
    cta: "S'inscrire et jouer",
  },
  instagram: {
    icon: "📸",
    label: "Je m'abonne à l'Instagram",
    cta: "Ouvrir Instagram",
  },
  tiktok: {
    icon: "🎵",
    label: "Je m'abonne au TikTok",
    cta: "Ouvrir TikTok",
  },
  google_review: {
    icon: "⭐",
    label: "Je laisse un avis Google",
    cta: "Ouvrir la page d'avis",
  },
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Écran avant la roue : le joueur choisit UNE action parmi celles
 * activées par le commerçant pour débloquer le jeu. Les actions lien
 * (Instagram, TikTok, avis) sont déclaratives ; la newsletter demande
 * l'email avec consentement explicite.
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
  const [selected, setSelected] = useState<EngagementAction | null>(null);
  const [linkOpened, setLinkOpened] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  const selectedAction = actions.find((a) => a.action === selected);

  function choose(action: EngagementAction) {
    setSelected(action);
    setLinkOpened(false);
    setEmailError("");
  }

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

  return (
    <div className="play-in w-full text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300 mb-2">
        {organizationName}
      </p>
      <h1 className="text-3xl font-extrabold text-white mb-3 leading-tight">
        Débloquez la roue !
      </h1>
      <p className="text-sm text-zinc-400 mb-8">
        Choisissez une action au choix pour tenter votre chance :
      </p>

      <div className="space-y-3 text-left">
        {actions.map(({ action }) => {
          const ui = ACTION_UI[action];
          const isSelected = selected === action;
          return (
            <button
              key={action}
              type="button"
              onClick={() => choose(action)}
              className={`w-full rounded-2xl border px-5 py-4 text-left text-sm font-semibold transition-colors ${
                isSelected
                  ? "border-violet-400 bg-violet-500/15 text-white"
                  : "border-white/10 bg-white/5 text-zinc-200 hover:border-white/25"
              }`}
            >
              <span className="mr-3">{ui.icon}</span>
              {ui.label}
            </button>
          );
        })}
      </div>

      {selectedAction && selected === "newsletter" && (
        <div className="play-in mt-6 space-y-3 text-left">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Votre email"
            autoComplete="email"
            className={inputClass}
          />
          {emailError && <p className="text-sm text-red-400">{emailError}</p>}
          <button
            type="button"
            onClick={submitNewsletter}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(139,92,246,.45)]"
          >
            {ACTION_UI.newsletter.cta}
          </button>
          <p className="text-center text-[11px] text-zinc-500">
            En vous inscrivant, vous acceptez de recevoir la newsletter de{" "}
            {organizationName}. Désinscription possible à tout moment.
          </p>
        </div>
      )}

      {selectedAction && selected !== "newsletter" && (
        <div className="play-in mt-6 space-y-3">
          {!linkOpened ? (
            <a
              href={selectedAction.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setLinkOpened(true)}
              className="block w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(139,92,246,.45)]"
            >
              {ACTION_UI[selected!].cta}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onUnlock({ action: selected! })}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-6 py-4 text-base font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(16,185,129,.4)]"
            >
              C&apos;est fait, je joue !
            </button>
          )}
        </div>
      )}
    </div>
  );
}
