"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  prepareAnonymousPlayer,
  recoverPendingWin,
  spinWheel,
  type SpinOutcome,
} from "@/actions/play";
import { capturePlayEvent } from "@/components/analytics";
import { LienPortefeuille } from "@/components/wallet/lien-portefeuille";
import { ClaimForm, type ClaimConfig } from "./claim-form";
import { Countdown } from "./countdown";
import { DiscoverFooter } from "./discover-footer";
import { GameIdleScreen } from "./game-idle-screen";
import { playText } from "./play-theme";
import { ShareInvite } from "./share-invite";
import { TurnstileGate } from "./turnstile-gate";
import { turnstileClientEnabled } from "./turnstile-widget";
import { gameIdle } from "@/lib/game-idle";
import { readShareSource } from "@/lib/share-source";
import type { GameType } from "@/types/database";
import { playOnLightSurface, type WheelStyle } from "@/lib/wheel-style";

type Phase = "idle" | "playing" | "won" | "lost" | "blocked";

/**
 * Échafaudage partagé des mini-jeux de RÉVÉLATION (carte retournée,
 * bonneteau, machine à sous…). Reprend TEL QUEL le cycle serveur-autoritatif
 * de la roue et du grattage (voir PlayExperience / ScratchExperience) :
 * `spinWheel` décide le résultat CÔTÉ SERVEUR ; l'UI ne fait que le RÉVÉLER.
 * Tout est boilerplate partagé (idle / won / lost / blocked, captcha, reprise
 * d'un gain en attente, analytics, thèmes) SAUF la phase de jeu, injectée via
 * `renderReveal`.
 *
 * INVARIANT ABSOLU — serveur-autoritatif : le lot vient de `SpinOutcome`.
 * L'interaction du joueur (retourner une carte, choisir un gobelet…) NE
 * DÉTERMINE JAMAIS le gain — elle ne fait que révéler `outcome`, puis appelle
 * `onRevealed()`. Aucun poids/probabilité ne part au client.
 */
export function GameShell({
  slug,
  organizationName,
  organizationId = null,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style,
  shareEnabled,
  gameType,
  renderReveal,
}: {
  slug: string;
  organizationName: string;
  /** Organisation du jeu — clé de la proposition de Passeport post-jeu. */
  organizationId?: string | null;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style: WheelStyle;
  /**
   * Le commerçant propose-t-il le partage du jeu après la partie ?
   * Requis (pas de défaut `true` ici) : le défaut vit en base, sur
   * `campaigns.share_enabled` — un défaut dans le composant masquerait un
   * oubli de câblage en faisant réapparaître le bloc décoché.
   */
  shareEnabled: boolean;
  /**
   * Mécanique jouée. L'emoji, le verbe du bouton et l'accroche par défaut en
   * découlent (`gameIdle`) : les treize wrappers ne portent plus leurs propres
   * libellés, et l'aperçu de l'éditeur lit la MÊME table.
   */
  gameType: GameType;
  /**
   * Phase de jeu spécifique : révèle `outcome` (jamais ne le décide) puis
   * appelle `onRevealed` une fois l'animation terminée. Le composant reçoit
   * son thème / ses couleurs marchandes via la closure du jeu (voir
   * FlipCardExperience) — la signature reste volontairement minimale.
   */
  renderReveal: (outcome: SpinOutcome, onRevealed: () => void) => ReactNode;
}) {  // Thème « kermesse » : même bascule de classes que PlayExperience.
  const kermesse = playOnLightSurface(style);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [error, setError] = useState("");
  const [nextEligibleAt, setNextEligibleAt] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [returningName, setReturningName] = useState<string | null>(null);
  /** La reprise d'un gain a échoué deux fois : on l'avoue sur l'écran bloqué. */
  const [repriseIndisponible, setRepriseIndisponible] = useState(false);
  const requestingRef = useRef(false);
  /**
   * Le joueur a lancé une partie. Posé AVANT l'aller-retour serveur, jamais
   * remis à false : une fois engagé, l'écran lui appartient.
   */
  const startedRef = useRef(false);
  /** Gain en attente récupéré, conservé même si on ne l'affiche pas tout de suite. */
  const pendingWinRef = useRef<SpinOutcome | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`lastchance:name:${slug}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique post-montage, évite tout écart d'hydratation SSR/CSR.
      if (stored) setReturningName(stored);
    } catch {
      // Stockage indisponible — pas de retour personnalisé, sans gravité.
    }
  }, [slug]);

  /**
   * Reprise d'un gain non réclamé. Cette chaîne est ASYNCHRONE (deux
   * allers-retours serveur) et peut aboutir APRÈS que le joueur a lancé sa
   * partie — un joueur rapide tape dès que la page est interactive.
   *
   * Sans la garde `startedRef`, son `setPhase("won")` écrasait la phase
   * « playing » que `handleStart` venait de poser : le joueur sautait
   * directement à l'écran gagné, SANS l'animation de révélation — c'est-à-dire
   * sans le jeu, qui est tout ce que ces treize mécaniques vendent. Mesuré le
   * 2026-07-29 par instrumentation du DOM (un seul clic reçu, phase « playing »
   * jamais atteinte, « GAGNÉ » affiché sans second tap). Voir docs/bugs.md.
   *
   * Le gain reste mémorisé dans `pendingWinRef` : si le tirage est refusé
   * parce que ce gain existe déjà, `handleStart` l'affiche au lieu d'un écran
   * bloqué — sans quoi la garde ci-dessous ferait perdre au joueur le lot
   * qu'il a justement à réclamer.
   */
  useEffect(() => {
    let active = true;
    // Une RETENTATIVE, puis un DRAPEAU. Le `.catch(() => undefined)` d'origine
    // avalait l'échec des deux allers-retours : le joueur qui a un lot en base
    // se voyait ensuite opposer un écran bloqué muet, sans que rien ni personne
    // ne sache que la reprise avait simplement échoué.
    const reprendre = () =>
      prepareAnonymousPlayer().then(() => recoverPendingWin(slug));
    reprendre()
      .catch(() => reprendre())
      .then((pending) => {
        if (!active || !pending) return;
        pendingWinRef.current = pending;
        if (startedRef.current) return;
        setOutcome(pending);
        setPhase("won");
      })
      .catch(() => {
        // Deux tentatives échouées : on ne sait PAS si un lot attend. Aucun
        // bruit visuel ici — l'écran d'accueil doit rester un écran de jeu ;
        // le drapeau ne parle que si le joueur finit bloqué.
        if (active) setRepriseIndisponible(true);
      });
    return () => { active = false; };
  }, [slug]);

  const handleCaptchaToken = useCallback(
    (token: string | null) => setCaptchaToken(token),
    [],
  );

  async function handleStart() {
    if (requestingRef.current) return;

    if (turnstileClientEnabled() && !captchaToken) {
      setError("Merci de valider la vérification anti-robot avant de jouer.");
      return;
    }

    requestingRef.current = true;
    // Posé AVANT l'aller-retour : la reprise d'un gain en attente ne doit plus
    // pouvoir écraser la partie à partir d'ici.
    startedRef.current = true;
    setError("");

    // ENVELOPPÉ : un rejet de la promesse (réseau coupé pendant l'aller-retour)
    // sautait tout ce qui suit, `requestingRef` restait à `true` POUR TOUJOURS et
    // le bouton devenait inerte — cliquable, mais renvoyé en silence par la garde
    // de rentrée à chaque appui. Aucun message, aucune sortie.
    let result;
    try {
      result = await spinWheel(slug, captchaToken ?? undefined, readShareSource());
    } catch {
      requestingRef.current = false;
      setError("Connexion perdue. Vérifiez votre réseau et réessayez.");
      return;
    }
    requestingRef.current = false;

    if (!result.ok) {
      // Un gain en attente récupéré entre-temps prime sur le refus : le tirage
      // est refusé PARCE QUE ce lot existe déjà. L'afficher, plutôt que
      // d'opposer un écran bloqué à un joueur qui a un lot à réclamer.
      const pending = pendingWinRef.current;
      if (pending) {
        setOutcome(pending);
        setPhase("won");
        return;
      }
      setError(result.error);
      setNextEligibleAt(result.nextEligibleAt ?? null);
      setPhase("blocked");
      return;
    }

    setOutcome(result.data);
    setPhase("playing");
    // Événement générique "tirage effectué" — même nom que pour la roue afin
    // de garder un entonnoir d'analytics unique entre toutes les mécaniques.
    capturePlayEvent("wheel_spun", { won: !result.data.isLosing });
  }

  function handleRevealed() {
    if (!outcome) return;
    setPhase(outcome.isLosing ? "lost" : "won");
  }

  const idle = gameIdle(gameType);

  return (
    <div className="w-full max-w-sm mx-auto px-6 py-8 flex flex-col items-center min-h-full justify-center">
      {phase === "idle" && (
        <GameIdleScreen
          style={style}
          organizationName={organizationName}
          logoUrl={logoUrl}
          emoji={idle.emoji}
          title={style.title || idle.accroche}
          regle={idle.regle}
          buttonLabel={idle.buttonLabel}
          kermesse={kermesse}
          returningName={returningName}
          onStart={handleStart}
        >
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
            Résultat calculé côté serveur · un jeu par personne
          </p>
          <DiscoverFooter kermesse={kermesse} />
        </GameIdleScreen>
      )}

      {phase === "playing" && outcome && (
        <div className="play-in w-full text-center">
          <h1 className={`text-2xl font-extrabold mb-8 ${playText.title(kermesse)}`}>
            Découvrez votre résultat
          </h1>
          {renderReveal(outcome, handleRevealed)}
        </div>
      )}

      {phase === "won" && outcome && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <p className={`text-xs font-mono tracking-[0.3em] mb-3 ${kermesse ? "text-k-green font-bold" : "text-emerald-400"}`}>✦ GAGNÉ ✦</p>
          <h2 className={`text-3xl font-extrabold mb-2 ${playText.title(kermesse)}`}>{outcome.label}</h2>
          {outcome.description && <p className={`mb-6 ${playText.body(kermesse)}`}>{outcome.description}</p>}
          {outcome.claimToken ? (
            <ClaimForm claimToken={outcome.claimToken} config={claimConfig} slug={slug} organizationName={organizationName} organizationId={organizationId} kermesse={kermesse} />
          ) : (
            <p className={`text-sm ${playText.body(kermesse)}`}>
              Présentez cet écran au comptoir pour récupérer votre gain.
            </p>
          )}
          {shareEnabled && (
            <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          )}
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "lost" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🙁</div>
          <h2 className={`text-3xl font-extrabold mb-3 ${playText.title(kermesse)}`}>Pas cette fois…</h2>
          <p className={playText.body(kermesse)}>
            Rien pour vous aujourd&apos;hui. La chance tourne, revenez bientôt !
          </p>
          {shareEnabled && (
            <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          )}
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "blocked" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🔒</div>
          <h2 className={`text-2xl font-extrabold mb-3 ${playText.title(kermesse)}`}>Impossible de jouer</h2>
          <p className={playText.body(kermesse)}>{error}</p>
          {nextEligibleAt && (
            <p className={`mt-4 text-sm font-mono ${kermesse ? "text-k-orange-text font-bold" : "text-amber-300"}`}>
              ⏱️ Revenez dans <Countdown target={nextEligibleAt} />
            </p>
          )}
          {repriseIndisponible && (
            <p className={`mt-4 text-sm ${playText.body(kermesse)}`}>
              Nous n&apos;avons pas pu vérifier si un lot vous attend déjà —
              retrouvez-le dans vos récompenses.
            </p>
          )}
          {/* LA SEULE SORTIE DE CET ÉCRAN. C'est ici qu'un joueur se retrouve
              coincé alors qu'un lot existe à son nom en base : le refus dit
              « impossible de jouer » et ne menait nulle part. */}
          <div className={`mt-6 ${kermesse ? "" : "inline-block rounded-full bg-white px-4 py-2"}`}>
            <LienPortefeuille />
          </div>
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}
    </div>
  );
}
