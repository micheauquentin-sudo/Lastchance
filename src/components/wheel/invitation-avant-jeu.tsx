"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { InvitationAvantJeu as LiensInvitation } from "@/lib/play-context";
import { fontFamily } from "@/lib/fonts";
import type { WheelStyle } from "@/lib/wheel-style";
import { SPIN_BUTTON_KERMESSE, playText } from "./play-theme";

/**
 * L'INVITATION AVANT LE JEU — UNE PROPOSITION, JAMAIS UNE PORTE.
 *
 * ── Ce qu'elle remplace, et la différence qui compte ──
 *
 * L'ancien `engagement-gate.tsx` (retiré) faisait de la même page un SAS :
 * le joueur devait choisir une action, l'écran guettait son retour d'onglet,
 * et la roue « se débloquait ». C'était un déblocage conditionnel, c'est-à-dire
 * exactement ce que Google interdit sur les avis et ce que Meta/TikTok
 * interdisent sur l'abonnement.
 *
 * Cet écran-ci reprend ses TUILES et rien d'autre. Il n'y a ici :
 *   - aucun `required`, aucun état « il faut d'abord… » ;
 *   - aucun délai, aucun compte à rebours, aucun guet de `visibilitychange` ;
 *   - aucun chemin de code où « Continuer vers le jeu » serait absent ou
 *     `disabled` — le bouton est rendu inconditionnellement, en dehors de
 *     toute branche.
 *
 * Cette impossibilité est STRUCTURELLE, pas un réglage : il n'existe aucun prop
 * par lequel un appelant pourrait rendre l'invitation bloquante. Un futur
 * contributeur devrait ajouter le prop lui-même — et lire ce paragraphe.
 *
 * ── Le montage, et pourquoi il ENVELOPPE le jeu ──
 *
 * La page /play monte cet écran AUTOUR de l'expérience choisie (`children`) :
 * un seul point de montage couvre les quinze mécaniques, aucune n'a à savoir
 * que l'invitation existe. Tant que le joueur n'a pas continué, `children`
 * n'est pas monté du tout — pas caché : absent. Un jeu monté derrière un voile
 * garderait ses timers et ses écouteurs actifs.
 *
 * ── « Déjà vu » : sessionStorage, comme le prénom du joueur ──
 *
 * Même patron et même durée de vie que `lastchance:name:${slug}` : le retour
 * d'un onglet externe (l'avis Google ouvert d'un tap) et un simple rechargement
 * ne doivent pas rejouer l'invitation — sinon la proposition devient un
 * harcèlement, et un joueur qui a tapé « avis » se retrouverait puni de l'avoir
 * fait. La session se ferme avec l'onglet : le scan suivant, un autre jour,
 * reverra l'écran.
 *
 * L'état part de `null` (« je ne sais pas encore ») et NE REND RIEN pendant
 * cette frame : rendre l'invitation par défaut la ferait clignoter chez tout
 * joueur qui revient d'un onglet, ce qui est précisément le défaut qu'on
 * ferme ; et le rendu serveur ne peut pas lire un sessionStorage sans créer
 * une divergence d'hydratation. Les quinze expériences sont de toute façon des
 * composants client.
 */

/** Une tuile par réseau : l'ordre de ce tableau est l'ordre à l'écran. */
const TUILES: ReadonlyArray<{
  cle: keyof LiensInvitation;
  emoji: string;
  label: string;
  reseau: string;
}> = [
  {
    cle: "google",
    emoji: "⭐",
    label: "Donnez votre avis",
    reseau: "Sur Google",
  },
  { cle: "instagram", emoji: "📸", label: "Suivez-nous", reseau: "Sur Instagram" },
  { cle: "tiktok", emoji: "🎵", label: "Suivez-nous", reseau: "Sur TikTok" },
];

export function InvitationAvantJeu({
  slug,
  organizationName,
  invitation,
  kermesse,
  style,
  children,
}: {
  slug: string;
  organizationName: string;
  /** Liens déjà triés et refermés par `loadPlayContext` — jamais revalidés ici. */
  invitation: LiensInvitation;
  /** Palette de texte sombre ? Calculé par l'appelant (`playOnLightSurface`). */
  kermesse: boolean;
  style: WheelStyle;
  /** Le jeu — monté seulement une fois l'invitation passée. */
  children: ReactNode;
}) {
  const [invite, setInvite] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const vu = sessionStorage.getItem(`lastchance:invitation:${slug}`) === "vu";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique post-montage, évite tout écart d'hydratation SSR/CSR.
      setInvite(!vu);
    } catch {
      // sessionStorage indisponible (navigation privée verrouillée) : on
      // propose l'invitation, sans jamais bloquer.
      setInvite(true);
    }
  }, [slug]);

  function continuer() {
    try {
      sessionStorage.setItem(`lastchance:invitation:${slug}`, "vu");
    } catch {
      // Sans mémoire de session, l'invitation se rejouera au rechargement.
      // Sans gravité : elle n'a jamais rien bloqué.
    }
    setInvite(false);
  }

  if (invite === null) return null;
  if (!invite) return <>{children}</>;

  const carte = kermesse
    ? "border-2 border-k-ink bg-white shadow-[6px_6px_0_var(--color-k-ink)]"
    : "border border-white/15 bg-zinc-900 shadow-[0_18px_44px_rgba(0,0,0,.5)]";
  const tuile = kermesse
    ? "border-2 border-k-ink bg-k-bg hover:bg-k-yellow focus-visible:ring-k-ink"
    : "border border-white/20 bg-white/10 hover:bg-white/20 focus-visible:ring-white";

  return (
    <div
      className="play-in w-full max-w-md px-4 py-8"
      style={{ fontFamily: fontFamily(style.font) }}
    >
      <div className={`rounded-3xl px-6 py-7 text-center ${carte}`}>
        <p
          className={`mb-2 text-xs font-semibold uppercase tracking-[0.25em] ${playText.kicker(kermesse)}`}
        >
          {organizationName}
        </p>
        <h1
          className={`mb-2 text-2xl font-extrabold leading-tight ${playText.title(kermesse)}`}
        >
          Avant de jouer… si le cœur vous en dit{" "}
          <span aria-hidden>💛</span>
        </h1>
        <p className={`mb-6 text-sm ${playText.body(kermesse)}`}>
          C&apos;est totalement facultatif : votre partie et votre gain n&apos;en
          dépendent pas.
        </p>

        <div className="space-y-3 text-left">
          {TUILES.map(({ cle, emoji, label, reseau }) => {
            const url = invitation[cle];
            if (!url) return null;
            return (
              <a
                key={cle}
                href={url}
                target="_blank"
                // `nofollow` en plus de `noopener noreferrer` : ces liens sont
                // posés par le commerçant, la page ne leur prête aucune autorité.
                rel="noopener noreferrer nofollow"
                className={`flex w-full items-center gap-4 rounded-2xl px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${tuile}`}
              >
                <span aria-hidden className="text-2xl">
                  {emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-bold ${playText.title(kermesse)}`}
                  >
                    {label}
                  </span>
                  <span className={`block text-xs ${playText.body(kermesse)}`}>
                    {reseau}
                  </span>
                </span>
                <span aria-hidden className={playText.body(kermesse)}>
                  ↗
                </span>
              </a>
            );
          })}
        </div>

        {/* HORS DE TOUTE BRANCHE, ET SANS `disabled` — voir l'en-tête. */}
        <button
          type="button"
          onClick={continuer}
          style={{
            backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
          }}
          className={`mt-7 w-full rounded-2xl px-6 py-4 text-base font-extrabold uppercase tracking-wider transition-all duration-100 ${
            kermesse ? SPIN_BUTTON_KERMESSE : "text-white"
          }`}
        >
          Continuer vers le jeu
        </button>
      </div>
    </div>
  );
}
