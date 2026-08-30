"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { prepareAnonymousPlayer, recoverPendingWin } from "@/actions/play";
import { startSkillChallenge, submitSkillChallenge } from "@/actions/skill";
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
import type { SkillAttempt, SkillChallengePublic } from "@/lib/skill";
import type { GameType } from "@/types/database";
import { playOnLightSurface, type WheelStyle } from "@/lib/wheel-style";

type Phase = "idle" | "challenge" | "won" | "lost" | "blocked";

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
  organizationId = null,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style,
  shareEnabled,
  gameType,
  renderChallenge,
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
  /**
   * Mécanique jouée : l'emoji, le verbe du bouton et l'accroche par défaut en
   * découlent (`gameIdle`), comme pour GameShell.
   */
  gameType: GameType;
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
}) {  // Thème « kermesse » : même bascule de classes que GameShell / PlayExperience.
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
  /** La reprise d'un gain a échoué deux fois : on l'avoue sur l'écran bloqué. */
  const [repriseIndisponible, setRepriseIndisponible] = useState(false);
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
    // Une RETENTATIVE, puis un DRAPEAU. Le `.catch(() => undefined)` d'origine
    // avalait l'échec des deux allers-retours : le joueur qui a un lot en base
    // se voyait ensuite opposer un écran bloqué muet, sans que rien ni personne
    // ne sache que la reprise avait simplement échoué.
    const reprendre = () =>
      prepareAnonymousPlayer().then(() => recoverPendingWin(slug));
    reprendre()
      .catch(() => reprendre())
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
      .catch(() => {
        // Deux tentatives échouées : on ne sait PAS si un lot attend. Aucun
        // bruit visuel ici — l'écran d'accueil doit rester un écran de jeu ;
        // le drapeau ne parle que si le joueur finit bloqué.
        if (active) setRepriseIndisponible(true);
      });
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
            Réussissez le défi pour tenter un lot · un jeu par personne
          </p>
          <DiscoverFooter kermesse={kermesse} />
        </GameIdleScreen>
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
            <ClaimForm claimToken={win.claimToken} config={claimConfig} slug={slug} organizationName={organizationName} organizationId={organizationId} kermesse={kermesse} />
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
            Le défi n&apos;est pas passé cette fois. La chance tourne, revenez bientôt !
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
