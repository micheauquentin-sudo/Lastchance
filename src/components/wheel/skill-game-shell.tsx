"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { prepareAnonymousPlayer, recoverPendingWin } from "@/actions/play";
import { startSkillChallenge, submitSkillChallenge } from "@/actions/skill";
import { capturePlayEvent } from "@/components/analytics";
import { ClaimForm, type ClaimConfig } from "./claim-form";
import { Countdown } from "./countdown";
import { DiscoverFooter } from "./discover-footer";
import { SPIN_BUTTON_KERMESSE, playText } from "./play-theme";
import { ShareInvite } from "./share-invite";
import { TurnstileGate } from "./turnstile-gate";
import { turnstileClientEnabled } from "./turnstile-widget";
import { fontFamily } from "@/lib/fonts";
import type { SkillAttempt, SkillChallengePublic } from "@/lib/skill";
import { playOnLightSurface, resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";

type Phase = "idle" | "challenge" | "won" | "lost" | "blocked";

/** Habillage de l'écran d'accueil, propre à chaque mini-jeu de DÉFI. */
export interface SkillGameShellIdle {
  /** Accroche du jeu — n'est retenue qu'à défaut de titre commerçant (style.title). */
  title?: string;
  /** Emoji du visuel d'accueil (✊, ⏱, 🎯…). */
  emoji: string;
  /** Libellé du bouton de lancement (aussi son aria-label). */
  buttonLabel: string;
  /** Note sous le bouton — défaut « Réussissez le défi pour tenter un lot ». */
  hint?: string;
}

/** Ce que le shell doit afficher sur l'écran GAGNÉ (label/description/claim). */
interface SkillWin {
  label: string | null;
  description: string | null;
  claimToken: string | null;
}

/**
 * Échafaudage partagé des mini-jeux de DÉFI *skill-gated* (pierre-feuille-
 * ciseaux, réflexe, jauge, puzzle, mot mystère, estimation). Miroir de
 * GameShell MAIS à DEUX temps : le joueur AGIT d'abord (phase « challenge »),
 * puis le SERVEUR tranche.
 *
 *   idle → [buttonLabel] → startSkillChallenge → phase « challenge »
 *        → renderChallenge(challenge, submit, pending)
 *        → submit(attempt) → submitSkillChallenge → won / lost / blocked
 *
 * INVARIANT ABSOLU — serveur-autoritatif : l'issue vient de
 * `submitSkillChallenge`. Pour les jeux VÉRIFIABLES (rps / mystery_word /
 * estimate / puzzle) le client n'envoie que la TENTATIVE BRUTE (coup, mot,
 * nombre, ordre) et NE décide PAS. Pour les jeux NON vérifiables (reflex /
 * gauge) la tentative porte `succeeded` rapporté par le client, borné par
 * l'économie du tirage côté serveur. Aucun secret (mot/nombre) n'atteint jamais
 * le client (`challenge` = SkillChallengePublic), et aucun écran d'échec ne
 * révèle la « bonne réponse » (pas d'oracle).
 *
 * Tous les écrans idle / won / lost / blocked, le captcha, la reprise d'un gain
 * en attente et les analytics sont repris TEL QUEL de GameShell.
 */
export function SkillGameShell({
  slug,
  organizationName,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
  idle,
  renderChallenge,
}: {
  slug: string;
  organizationName: string;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style?: Partial<WheelStyle>;
  /** Habillage de l'écran d'accueil, propre au jeu. */
  idle: SkillGameShellIdle;
  /**
   * Phase de jeu spécifique : reçoit la vue PUBLIQUE du défi, une fonction
   * `submit` (à appeler avec la tentative construite) et l'état `pending` de la
   * soumission. Le composant construit lui-même sa `SkillAttempt` (coup, mot,
   * nombre, ordre, ou `succeeded` client-reporté) et appelle `submit(attempt)`.
   * Il ne gère PAS l'issue : le shell affiche won / lost / blocked.
   */
  renderChallenge: (
    challenge: SkillChallengePublic,
    submit: (attempt: SkillAttempt) => void,
    pending: boolean,
  ) => ReactNode;
}) {
  const style = resolveWheelStyle(rawStyle);
  // Thème « kermesse » : même bascule de classes que GameShell / PlayExperience.
  const kermesse = playOnLightSurface(style);
  const [phase, setPhase] = useState<Phase>("idle");
  const [challenge, setChallenge] = useState<SkillChallengePublic | null>(null);
  // Jeton du défi en cours (émis par startSkillChallenge, exigé par submit).
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [win, setWin] = useState<SkillWin | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [nextEligibleAt, setNextEligibleAt] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [returningName, setReturningName] = useState<string | null>(null);
  const startingRef = useRef(false);
  /**
   * Le joueur a engagé son défi. Posé AVANT l'aller-retour, jamais remis à
   * false : à partir de là, l'écran lui appartient. Sans cette garde, la
   * reprise d'un gain en attente — deux allers-retours, qui peuvent aboutir
   * APRÈS le clic — faisait disparaître le défi sous les doigts du joueur.
   */
  const startedRef = useRef(false);
  /** Gain repris, gardé même quand on ne l'affiche pas tout de suite. */
  const pendingWinRef = useRef<SkillWin | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`lastchance:name:${slug}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique post-montage, évite tout écart d'hydratation SSR/CSR.
      if (stored) setReturningName(stored);
    } catch {
      // Stockage indisponible — pas de retour personnalisé, sans gravité.
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    prepareAnonymousPlayer()
      .then(() => recoverPendingWin(slug))
      .then((pendingWin) => {
        if (!active || !pendingWin) return;
        const repris = {
          label: pendingWin.label,
          description: pendingWin.description,
          claimToken: pendingWin.claimToken,
        };
        pendingWinRef.current = repris;
        if (startedRef.current) return;
        setWin(repris);
        setPhase("won");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [slug]);

  const handleCaptchaToken = useCallback(
    (token: string | null) => setCaptchaToken(token),
    [],
  );

  async function handleStart() {
    if (startingRef.current) return;

    if (turnstileClientEnabled() && !captchaToken) {
      setError("Merci de valider la vérification anti-robot avant de jouer.");
      return;
    }

    startingRef.current = true;
    // Posé AVANT l'aller-retour : la reprise d'un gain ne doit plus escamoter
    // le défi à partir d'ici.
    startedRef.current = true;
    setError("");

    // Le `finally` est le point clé : sans lui, un rejet de la promesse
    // laissait `startingRef` à `true` et le bouton de lancement DÉFINITIVEMENT
    // inerte — la garde de rentrée le renvoyait en silence à chaque appui.
    let result;
    try {
      result = await startSkillChallenge({
        slug,
        turnstileToken: captchaToken ?? undefined,
      });
    } catch {
      setError("Connexion perdue. Vérifiez votre réseau et réessayez.");
      return;
    } finally {
      startingRef.current = false;
    }

    if (!result.ok) {
      // Un gain repris entre-temps prime sur le refus : le défi est refusé
      // PARCE QUE ce lot existe déjà. L'afficher, plutôt que d'opposer un écran
      // bloqué à un joueur qui a justement un lot à réclamer.
      const repris = pendingWinRef.current;
      if (repris) {
        setWin(repris);
        setPhase("won");
        return;
      }
      // Le start ne consomme rien : on reste sur l'accueil, l'erreur est
      // affichée sous le bouton et le joueur peut réessayer.
      setError(result.error);
      return;
    }

    setChallengeToken(result.data.challengeToken);
    setChallenge(result.data.challenge);
    setError("");
    setPhase("challenge");
  }

  // Soumission de la tentative — construite par le composant de défi. Garde
  // anti double-envoi : `pending` (dans les deps) bloque tout second appel une
  // fois la requête partie, et le composant de défi se verrouille aussi de son
  // côté dès le premier choix.
  const submit = useCallback(
    async (attempt: SkillAttempt) => {
      if (!challengeToken || pending) return;

      setPending(true);
      setError("");

      // Sans ce `try`, une coupure réseau au moment de valider laissait
      // `pending` à `true` : tous les boutons du défi restaient désactivés
      // alors que le message invitait à réessayer. L'écran mourait au moment
      // exact où le joueur jouait sa chance.
      let result;
      try {
        result = await submitSkillChallenge({
          slug,
          challengeToken,
          attempt,
        });
      } catch {
        setError("Connexion perdue. Réessayez — votre défi reste valable.");
        return;
      } finally {
        setPending(false);
      }

      if (!result.ok) {
        // Erreur transitoire (réseau) ou jeton expiré : on reste sur le défi
        // pour permettre une nouvelle tentative (le jeton reste valide 10 min).
        // Une réponse d'échec ne révèle JAMAIS la solution (pas d'oracle).
        setError(result.error);
        return;
      }

      const data = result.data;
      // Événement générique « tirage effectué » — même nom que la roue afin de
      // garder un entonnoir d'analytics unique entre toutes les mécaniques.
      if (data.state === "won" || data.state === "lost") {
        capturePlayEvent("wheel_spun", { won: data.state === "won" });
      }

      if (data.state === "blocked") {
        setNextEligibleAt(data.nextEligibleAt ?? null);
        setError("Vous avez déjà participé.");
        setPhase("blocked");
        return;
      }
      if (data.state === "lost") {
        setPhase("lost");
        return;
      }
      setWin({
        label: data.label,
        description: data.description,
        claimToken: data.claimToken,
      });
      setPhase("won");
    },
    [slug, challengeToken, pending],
  );

  const hint = idle.hint ?? "Réussissez le défi pour tenter un lot · un jeu par personne";

  return (
    <div className="w-full max-w-sm mx-auto px-6 py-8 flex flex-col items-center min-h-full justify-center">
      {phase === "idle" && (
        <div className="play-in w-full text-center" style={{ fontFamily: fontFamily(style.font) }}>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={organizationName}
              className="mx-auto mb-3 h-16 max-w-40 object-contain"
            />
          )}
          {returningName && (
            <p className={`text-sm font-semibold mb-1 ${kermesse ? "text-k-green" : "text-emerald-400"}`}>
              Bon retour, {returningName} ! 👋
            </p>
          )}
          <p className={`text-xs font-semibold uppercase tracking-[0.25em] mb-2 ${playText.kicker(kermesse)}`}>
            {organizationName}
          </p>
          <h1 className={`text-3xl font-extrabold mb-8 leading-tight ${playText.title(kermesse)}`}>
            {idle.title || style.title || "Relevez le défi !"}
          </h1>

          <div
            className={
              kermesse
                ? "mx-auto flex aspect-[8/5] w-full max-w-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-k-ink/40 bg-white"
                : "mx-auto flex aspect-[8/5] w-full max-w-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-white/20 bg-white/5"
            }
          >
            <span aria-hidden className="text-5xl">{idle.emoji}</span>
          </div>

          <button
            onClick={handleStart}
            aria-label={idle.buttonLabel}
            style={
              kermesse
                ? { backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})` }
                : {
                    backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
                    boxShadow: `0 12px 34px color-mix(in srgb, ${style.buttonFrom} 45%, transparent)`,
                  }
            }
            className={`relative overflow-hidden w-full mt-9 rounded-2xl px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 ${
              kermesse ? SPIN_BUTTON_KERMESSE : "text-white"
            }`}
          >
            <span
              aria-hidden
              className="play-shine absolute top-0 left-0 h-full w-2/5 bg-gradient-to-r from-transparent via-white/35 to-transparent"
            />
            {idle.buttonLabel}
          </button>
          <TurnstileGate
            onToken={handleCaptchaToken}
            conseil="Si le message revient, désactivez votre bloqueur de publicités le temps de jouer, ou signalez-le au comptoir."
          />

          {error && (
            <p role="alert" aria-live="assertive" className={`mt-4 text-sm ${kermesse ? "text-red-600 font-semibold" : "text-red-400"}`}>
              {error}
            </p>
          )}

          <p className={`mt-4 text-[11px] font-mono ${playText.muted(kermesse)}`}>
            {hint}
          </p>
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "challenge" && challenge && (
        <div className="play-in w-full text-center">
          {renderChallenge(challenge, submit, pending)}
          {error && (
            <p role="alert" aria-live="assertive" className={`mt-4 text-sm ${kermesse ? "text-red-600 font-semibold" : "text-red-400"}`}>
              {error}
            </p>
          )}
        </div>
      )}

      {phase === "won" && win && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <p className={`text-xs font-mono tracking-[0.3em] mb-3 ${kermesse ? "text-k-green font-bold" : "text-emerald-400"}`}>✦ GAGNÉ ✦</p>
          <h2 className={`text-3xl font-extrabold mb-2 ${playText.title(kermesse)}`}>{win.label}</h2>
          {win.description && <p className={`mb-6 ${playText.body(kermesse)}`}>{win.description}</p>}
          {win.claimToken ? (
            <ClaimForm claimToken={win.claimToken} config={claimConfig} slug={slug} organizationName={organizationName} kermesse={kermesse} />
          ) : (
            <p className={`text-sm ${playText.body(kermesse)}`}>
              Présentez cet écran au comptoir pour récupérer votre gain.
            </p>
          )}
          <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "lost" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🎲</div>
          <h2 className={`text-3xl font-extrabold mb-3 ${playText.title(kermesse)}`}>Pas cette fois…</h2>
          <p className={playText.body(kermesse)}>
            Le défi n&apos;est pas passé cette fois. La chance tourne, revenez bientôt !
          </p>
          <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "blocked" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🔒</div>
          <h2 className={`text-2xl font-extrabold mb-3 ${playText.title(kermesse)}`}>Impossible de jouer</h2>
          <p className={playText.body(kermesse)}>{error}</p>
          {nextEligibleAt && (
            <p className={`mt-4 text-sm font-mono ${kermesse ? "text-k-orange font-bold" : "text-amber-300"}`}>
              ⏱ Revenez dans <Countdown target={nextEligibleAt} />
            </p>
          )}
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}
    </div>
  );
}
