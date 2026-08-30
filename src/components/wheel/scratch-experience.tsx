"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { ScratchCard } from "./scratch-card";
import { ShareInvite } from "./share-invite";
import { TurnstileGate } from "./turnstile-gate";
import { turnstileClientEnabled } from "./turnstile-widget";
import { gameIdle } from "@/lib/game-idle";
import { readShareSource } from "@/lib/share-source";
import {
  playOnLightSurface,  scratchCover,
  type WheelStyle,
} from "@/lib/wheel-style";

type Phase = "idle" | "scratching" | "won" | "lost" | "blocked";

/**
 * Parcours joueur pour la mécanique « carte à gratter » : même backend
 * que la roue (spinWheel détermine déjà le résultat côté serveur, voir
 * PlayExperience) — seule la présentation change. Le résultat est
 * révélé en grattant une carte au lieu de tourner une roue.
 */
export function ScratchExperience({
  slug,
  organizationName,
  organizationId = null,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style,
  shareEnabled,
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
   * `campaigns.share_enabled`.
   */
  shareEnabled: boolean;
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
   * Le joueur a lancé sa carte. Posé AVANT l'aller-retour, jamais remis à
   * false : une fois engagé, l'écran lui appartient. Sans cette garde, la
   * reprise d'un gain en attente — une chaîne à deux allers-retours qui peut
   * aboutir APRÈS le clic — écrasait la phase « scratching » et sautait le
   * grattage, c'est-à-dire tout ce que cette mécanique vend.
   */
  const startedRef = useRef(false);
  /** Gain repris, gardé même quand on ne l'affiche pas tout de suite. */
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
    // Posé AVANT l'aller-retour : à partir d'ici, la reprise d'un gain en
    // attente ne doit plus pouvoir escamoter le grattage.
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
      // Un gain repris entre-temps prime sur le refus : le tirage est refusé
      // PARCE QUE ce lot existe déjà. L'afficher, plutôt que d'opposer
      // « Impossible de jouer » à un joueur qui a justement un lot à montrer
      // en caisse.
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
    setPhase("scratching");
    // Événement générique "tirage effectué" — même nom que pour la roue
    // afin de garder un entonnoir d'analytics unique entre mécaniques.
    capturePlayEvent("wheel_spun", { won: !result.data.isLosing });
  }

  function handleRevealed() {
    if (!outcome) return;
    setPhase(outcome.isLosing ? "lost" : "won");
  }

  // Son écran d'accueil « propre » a disparu : il rendait exactement la même
  // chose que `GameIdleScreen`, à un emoji près (🎟️ contre le 🪙 annoncé au
  // commerçant) et à un saut de ligne près dans l'accroche. Une quinzième
  // copie de la même mise en page n'apportait que sa dérive.
  const idle = gameIdle("scratch");
  const cover = scratchCover(style);

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
            conseil="Si le message revient, désactivez votre bloqueur de publicités le temps de gratter, ou signalez-le au comptoir."
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

      {phase === "scratching" && outcome && (
        <div className="play-in w-full text-center">
          <h1 className={`text-2xl font-extrabold mb-8 ${playText.title(kermesse)}`}>Grattez pour découvrir votre gain</h1>
          <ScratchCard
            label={outcome.label}
            description={outcome.description}
            isLosing={outcome.isLosing}
            emoji={outcome.emoji}
            buttonFrom={style.buttonFrom}
            buttonTo={style.buttonTo}
            cover={cover}
            kermesse={kermesse}
            onRevealed={handleRevealed}
          />
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
            La carte ne vous a rien donné aujourd&apos;hui. La chance tourne,
            revenez bientôt !
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
