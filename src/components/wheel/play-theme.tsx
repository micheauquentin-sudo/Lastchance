import type { ReactElement } from "react";

/**
 * Thème partagé des écrans /play — la SEULE source des classes qui
 * différencient les deux ambiances (« nuit » sombre / « kermesse »
 * crème + encre). L'aperçu de l'éditeur commerçant promet « exactement
 * ce que verront vos clients » : il lit ces jetons, il ne les recopie
 * jamais.
 */

/** Bandeau rayé jaune/encre — signature visuelle du site Lastchance. */
export function KermesseStripe({ className = "" }: { className?: string }): ReactElement {
  return (
    <div
      aria-hidden
      className={`w-full border-b-2 border-k-ink ${className}`}
      style={{
        background:
          "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
      }}
    />
  );
}

/** Contrastes texte communs aux écrans /play et à l'aperçu commerçant. */
export const playText = {
  /** Nom du commerce, au-dessus de l'accroche. */
  kicker: (kermesse: boolean): string => (kermesse ? "text-k-body" : "text-white/60"),
  /** Titres (accroche, gain, perte, écrans d'état). */
  title: (kermesse: boolean): string => (kermesse ? "text-k-ink" : "text-white"),
  /** Corps de texte secondaire (descriptions, messages de statut). */
  body: (kermesse: boolean): string => (kermesse ? "text-k-body" : "text-zinc-400"),
} as const;

/** Habillage kermesse du bouton « Lancer la roue » : bordure encre,
 *  ombre dure, enfoncement au clic — identique page et aperçu. */
export const SPIN_BUTTON_KERMESSE =
  "border-2 border-k-ink text-k-ink shadow-[6px_6px_0_var(--color-k-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--color-k-ink)]";
