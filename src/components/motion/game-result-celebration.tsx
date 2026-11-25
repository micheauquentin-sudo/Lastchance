"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GameType } from "@/types/database";
import { triggerHaptic, usePrefersReducedMotion } from "./haptics";
import { ResultStage3D } from "./result-stage-3d";
import type { Scene3DKind, Scene3DRarity } from "./scenes-3d";

/**
 * Associe chaque mécanique de jeu à son objet 3D signature (DA Pixar × Kermesse).
 */
export function gameTypeToWinScene3D(gameType: GameType | string): Scene3DKind {
  switch (gameType) {
    case "slot":
    case "scratch":
      return "diamond";
    case "chest":
      return "chest";
    case "gift-box":
      return "gift-box";
    case "golden-ticket":
      return "golden-ticket";
    case "passport":
      return "passport-seal";
    default:
      return "trophy";
  }
}

const HERO_CELEBRATION_MS = 1300;

export interface WinCelebrationShellProps {
  /** Objet 3D signature de la célébration (par défaut : médaillon-trophée). */
  scene?: Scene3DKind;
  /** Surligne conservée pour la cohérence & les tests (« ✦ GAGNÉ ✦ »). */
  eyebrow?: string;
  /** Nom du lot remporté. */
  title: string;
  /** Description optionnelle du lot. */
  description?: string | null;
  /** Couleur d'accent du commerçant (hex #RRGGBB). */
  accentColor?: string;
  /** Rareté visuelle pour les coffres / objets de collection. */
  rarity?: Scene3DRarity;
  /** Texte court incrusté dans l'objet 3D (ex: numéro de case). */
  badgeText?: string;
  /** Ambiance Kermesse (crème/encre) ou Nuit (sombre). */
  kermesse?: boolean;
  /**
   * Active la chorégraphie en 2 temps : 1,3 s de célébration plein cadre
   * (tap immédiat possible), puis repli fluide en médaillon au-dessus du
   * contenu d'action (ex: ClaimForm).
   */
  choregraphieFormulaire?: boolean;
  /** Classes additionnelles du conteneur. */
  className?: string;
  /** Contenu d'action (ClaimForm, code de retrait, liens post-jeu…). */
  children?: ReactNode;
}

/**
 * Orchestrateur de victoire (Acte 2a → Acte 3) :
 * - À t = 0 : impact 3D plein cadre + confettis 3D + vibration haptique joyeuse.
 * - Si `choregraphieFormulaire` est vrai : 1,3 s d'émotion pure (tap instantané
 *   possible pour passer), puis la scène 3D se replie en médaillon compact
 *   au-dessus du formulaire qui glisse proprement (sans opacité < 1 sur le
 *   texte afin de préserver WCAG AA).
 */
export function WinCelebrationShell({
  scene = "trophy",
  eyebrow = "✦ GAGNÉ ✦",
  title,
  description,
  accentColor,
  rarity = "common",
  badgeText,
  kermesse = false,
  choregraphieFormulaire = false,
  className = "",
  children,
}: WinCelebrationShellProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [actionReady, setActionReady] = useState(
    () => !choregraphieFormulaire || reducedMotion,
  );
  const hapticFiredRef = useRef(false);

  useEffect(() => {
    if (!hapticFiredRef.current) {
      hapticFiredRef.current = true;
      triggerHaptic("win");
    }
  }, []);

  useEffect(() => {
    if (!choregraphieFormulaire || reducedMotion || actionReady) return;
    const timer = window.setTimeout(() => {
      setActionReady(true);
    }, HERO_CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [choregraphieFormulaire, reducedMotion, actionReady]);

  const showCompactStage = choregraphieFormulaire && actionReady;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative w-full text-center ${className}`}
    >
      <div
        onClick={!actionReady ? () => setActionReady(true) : undefined}
        className={!actionReady ? "cursor-pointer select-none" : undefined}
      >
        <ResultStage3D
          scene={scene}
          phase="win"
          accentColor={accentColor}
          rarity={rarity}
          badgeText={badgeText}
          compact={showCompactStage}
          kermesse={kermesse}
          className={showCompactStage ? "mb-2" : "mb-3"}
        />

        <p
          className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-mono tracking-[0.26em] uppercase lc-badge-pop ${
            kermesse
              ? "border-2 border-k-ink bg-k-yellow font-bold text-k-ink shadow-[2px_2px_0_var(--color-k-ink)]"
              : "border border-emerald-400/40 bg-emerald-400/15 font-bold text-emerald-300"
          }`}
        >
          {eyebrow}
        </p>

        <h2
          className={`text-3xl font-extrabold leading-tight tracking-tight mb-2 lc-title-pop ${
            kermesse ? "text-k-ink" : "text-white"
          }`}
        >
          {title}
        </h2>

        {description && (
          <p
            className={`mx-auto max-w-sm text-sm ${
              showCompactStage ? "mb-4" : "mb-5"
            } ${kermesse ? "text-k-body" : "text-zinc-200"}`}
          >
            {description}
          </p>
        )}

        {!actionReady && (
          <div className="mx-auto mt-3 flex flex-col items-center gap-2">
            <div
              aria-hidden="true"
              className={`h-1.5 w-36 overflow-hidden rounded-full ${
                kermesse ? "border border-k-ink/25 bg-k-ink/10" : "bg-white/15"
              }`}
            >
              <div
                className={`h-full rounded-full lc-celebration-progress ${
                  kermesse ? "bg-k-green" : "bg-amber-300"
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => setActionReady(true)}
              className={`text-xs font-semibold underline-offset-4 hover:underline ${
                kermesse ? "text-k-muted" : "text-zinc-300"
              }`}
            >
              Récupérer mon lot tout de suite →
            </button>
          </div>
        )}
      </div>

      {actionReady && children && (
        <div className="mt-4 lc-form-unfold">{children}</div>
      )}
    </div>
  );
}

export interface LossReboundShellProps {
  /** Objet 3D espiègle (par défaut : trèfle porte-bonheur). */
  scene?: Scene3DKind;
  /** Surligne dynamique d'encouragement. */
  kicker?: string;
  /** Titre conservé pour la clarté & les tests (« Pas cette fois… »). */
  title?: string;
  /** Message principal chaleureux. */
  message: ReactNode;
  /** Encart « Prochaine chance » (compte à rebours, demain, mission…). */
  nextChanceHint?: ReactNode;
  accentColor?: string;
  badgeText?: string;
  kermesse?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Orchestrateur de consolation / rebond (Acte 2b → Acte 3) :
 * Remplace l'impasse punitive `🙁` par un moment espiègle en 3D + accroche
 * qui donne envie de retenter sa chance un autre jour.
 */
export function LossReboundShell({
  scene = "clover-miss",
  kicker = "C'ÉTAIT TOUT PRÈS !",
  title = "Pas cette fois…",
  message,
  nextChanceHint,
  accentColor,
  badgeText,
  kermesse = false,
  className = "",
  children,
}: LossReboundShellProps) {
  const hapticFiredRef = useRef(false);

  useEffect(() => {
    if (!hapticFiredRef.current) {
      hapticFiredRef.current = true;
      triggerHaptic("loss");
    }
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative w-full text-center ${className}`}
    >
      <ResultStage3D
        scene={scene}
        phase="loss"
        accentColor={accentColor}
        badgeText={badgeText}
        compact={false}
        kermesse={kermesse}
        className="mb-2"
      />

      <p
        className={`mb-2 inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-mono font-bold tracking-[0.22em] uppercase ${
          kermesse
            ? "border-2 border-k-ink bg-white text-k-orange-text shadow-[2px_2px_0_var(--color-k-ink)]"
            : "border border-amber-300/35 bg-amber-400/15 text-amber-200"
        }`}
      >
        {kicker}
      </p>

      <h2
        className={`text-3xl font-extrabold tracking-tight mb-2 lc-title-pop ${
          kermesse ? "text-k-ink" : "text-white"
        }`}
      >
        {title}
      </h2>

      <div
        className={`mx-auto max-w-sm text-sm leading-relaxed ${
          kermesse ? "text-k-body" : "text-zinc-200"
        }`}
      >
        {message}
      </div>

      {nextChanceHint && (
        <div
          className={`mx-auto mt-4 max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold lc-form-unfold ${
            kermesse
              ? "border-2 border-k-ink bg-k-yellow/40 text-k-ink shadow-[3px_3px_0_var(--color-k-ink)]"
              : "border border-white/15 bg-white/10 text-white"
          }`}
        >
          {nextChanceHint}
        </div>
      )}

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/**
 * Battement de tension (Acte 1) pendant la vérification serveur ou l'ouverture
 * d'une boîte / d'un coffre / d'un ticket.
 */
export function TensionStage({
  scene = "spinner-seal",
  label = "Suspense en cours…",
  sublabel,
  accentColor,
  badgeText,
  kermesse = false,
  compact = false,
}: {
  scene?: Scene3DKind;
  label?: string;
  sublabel?: string;
  accentColor?: string;
  badgeText?: string;
  kermesse?: boolean;
  compact?: boolean;
}) {
  useEffect(() => {
    triggerHaptic("tension");
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-2 text-center"
    >
      <ResultStage3D
        scene={scene}
        phase="tension"
        accentColor={accentColor}
        badgeText={badgeText}
        compact={compact}
        kermesse={kermesse}
        className="mb-2"
      />
      <p
        className={`text-base font-extrabold tracking-tight lc-tension-pulse ${
          kermesse ? "text-k-ink" : "text-white"
        }`}
      >
        {label}
      </p>
      {sublabel && (
        <p
          className={`mt-1 text-xs ${
            kermesse ? "text-k-muted" : "text-zinc-300"
          }`}
        >
          {sublabel}
        </p>
      )}
    </div>
  );
}
