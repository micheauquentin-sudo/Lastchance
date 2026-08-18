import type { ReactNode } from "react";
import { SPIN_BUTTON_KERMESSE, playText } from "./play-theme";
import { fontFamily } from "@/lib/fonts";
import type { WheelStyle } from "@/lib/wheel-style";

/**
 * L'ÉCRAN D'ACCUEIL DU JOUEUR — composant PRÉSENTATIONNEL PUR.
 *
 * Aucun état, aucun timer, aucune server action : il ne fait que dessiner.
 * C'est ce qui lui permet d'être monté par les quatre appelants sans risque,
 * y compris le QUATRIÈME, qui n'est pas une page de jeu :
 *
 *   1. `GameShell`         — les huit mécaniques de révélation
 *   2. `SkillGameShell`    — les six mécaniques de défi
 *   3. `ScratchExperience` — la carte à gratter
 *   4. `WheelStyleEditor`  — l'APERÇU de l'étape « habillage » (variante
 *      « apercu », sans `onStart` : le bouton devient un simple pavé)
 *
 * ── Pourquoi le quatrième change quelque chose ──
 *
 * L'aperçu de l'éditeur promettait « exactement ce que verront vos clients »
 * et dessinait, pour les quatorze mécaniques qui ne sont pas la roue, un
 * cadre pointillé avec un 🎁 EN DUR et un bouton « Jouer » — le même carton
 * pour un dé, un memory et un bonneteau. En partageant CE composant plutôt
 * qu'en recopiant sa mise en page, l'aperçu devient littéralement l'écran
 * d'accueil du jeu choisi : la promesse redevient vraie par construction, et
 * elle ne peut plus se désynchroniser sans que les deux surfaces bougent
 * ensemble.
 *
 * ── `kermesse` est un PARAMÈTRE, pas une déduction ──
 *
 * Les appelants de /play le calculent avec `playOnLightSurface` (la clarté du
 * fond RÉELLEMENT peint), pas avec `pageTheme`. Le composant ne rejoue pas ce
 * calcul : il le reçoit, pour qu'aucune surface ne puisse en choisir un autre
 * par accident.
 */
export function GameIdleScreen({
  style,
  organizationName,
  logoUrl = null,
  emoji,
  title,
  buttonLabel,
  kermesse,
  variant = "play",
  visuel,
  returningName = null,
  onStart,
  children,
}: {
  style: WheelStyle;
  organizationName: string;
  /** Logo du commerce — absent sur l'aperçu miniature de l'éditeur. */
  logoUrl?: string | null;
  emoji: string;
  /** Accroche déjà résolue par l'appelant (`style.title` ou défaut du jeu). */
  title: ReactNode;
  buttonLabel: string;
  /** Palette de texte sombre ? Calculé par l'appelant — jamais ici. */
  kermesse: boolean;
  /** « play » = plein écran mobile ; « apercu » = miniature de l'éditeur. */
  variant?: "play" | "apercu";
  /**
   * Visuel à poser À LA PLACE du cadre pointillé + emoji. Un seul appelant
   * s'en sert : l'aperçu de la ROUE, qui dessine son SVG là où les quatorze
   * autres mécaniques montrent leur objet. Le reste de l'écran — kicker,
   * accroche, bouton, ambiance — est le même pour les quinze, et c'est
   * précisément ce qu'on ne veut plus voir recopié.
   */
  visuel?: ReactNode;
  returningName?: string | null;
  /**
   * Absent = le bouton est rendu en `<div>` inerte. C'est le cas de
   * l'aperçu : un vrai `<button>` y serait focusable et cliquable sans rien
   * faire, au milieu d'un formulaire de réglages.
   */
  onStart?: () => void;
  /** Sous le bouton : captcha, erreur, mention, pied de page. */
  children?: ReactNode;
}) {
  const apercu = variant === "apercu";

  const cadre = kermesse
    ? "border-k-ink/40 bg-white"
    : "border-white/20 bg-white/5";

  const bouton = (
    <>
      <span
        aria-hidden
        className="play-shine absolute top-0 left-0 h-full w-2/5 bg-gradient-to-r from-transparent via-white/35 to-transparent"
      />
      {buttonLabel}
    </>
  );

  // Même dégradé dans les deux variantes ; seule l'ombre portée (coûteuse et
  // hors-cadre) est réservée au plein écran nuit.
  const boutonStyle =
    kermesse || apercu
      ? {
          backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
        }
      : {
          backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
          boxShadow: `0 12px 34px color-mix(in srgb, ${style.buttonFrom} 45%, transparent)`,
        };

  const boutonClasses = apercu
    ? `relative overflow-hidden mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider ${
        kermesse ? SPIN_BUTTON_KERMESSE : "text-white"
      }`
    : `relative overflow-hidden w-full mt-9 rounded-2xl px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 ${
        kermesse ? SPIN_BUTTON_KERMESSE : "text-white"
      }`;

  return (
    <div
      className={apercu ? "relative px-6 pt-6 pb-5 text-center" : "play-in w-full text-center"}
      style={{ fontFamily: fontFamily(style.font) }}
    >
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={organizationName}
          // Dimensions intrinsèques : la place du logo est réservée AVANT son
          // arrivée. Sans elles le titre et le bouton sautaient vers le bas au
          // chargement — sur le premier écran du jeu, ouvert au QR code.
          width={160}
          height={64}
          className="mx-auto mb-3 h-16 max-w-40 object-contain"
        />
      )}
      {returningName && (
        <p
          className={`text-sm font-semibold mb-1 ${kermesse ? "text-k-green" : "text-emerald-400"}`}
        >
          Bon retour, {returningName} ! 👋
        </p>
      )}
      <p
        className={`font-semibold uppercase ${
          apercu
            ? "text-[10px] tracking-[0.25em] mb-1"
            : "text-xs tracking-[0.25em] mb-2"
        } ${playText.kicker(kermesse)}`}
      >
        {organizationName}
      </p>

      {apercu ? (
        <p
          className={`text-lg font-extrabold mb-4 leading-tight ${playText.title(kermesse)}`}
        >
          {title}
        </p>
      ) : (
        <h1
          className={`text-3xl font-extrabold mb-8 leading-tight ${playText.title(kermesse)}`}
        >
          {title}
        </h1>
      )}

      {visuel ?? (
        <div
          className={
            apercu
              ? `mx-auto flex aspect-[8/5] w-full max-w-56 items-center justify-center rounded-2xl border-2 border-dashed ${cadre}`
              : `mx-auto flex aspect-[8/5] w-full max-w-[320px] items-center justify-center rounded-3xl border-2 border-dashed ${cadre}`
          }
        >
          <span aria-hidden className={apercu ? "text-4xl" : "text-5xl"}>
            {emoji}
          </span>
        </div>
      )}

      {onStart ? (
        <button
          onClick={onStart}
          aria-label={buttonLabel}
          style={boutonStyle}
          className={boutonClasses}
        >
          {bouton}
        </button>
      ) : (
        // PAS d'`aria-hidden` : le verbe est une INFORMATION pour le
        // commerçant — c'est ce que son client lira. Un `<div>` n'annonce
        // aucune action, il n'y a donc rien de trompeur à le laisser lisible.
        <div style={boutonStyle} className={boutonClasses}>
          {bouton}
        </div>
      )}

      {children}
    </div>
  );
}
