import type { ReactNode } from "react";
import { fermerRappel } from "@/actions/rappels";

/**
 * ENVELOPPE UN BANDEAU INFORMATIF D'UNE CROIX QUI LE FAIT TAIRE.
 *
 * ── Ce composant ne décide PAS de l'affichage ──
 *
 * Il ne lit pas le cookie et ne se masque jamais lui-même : c'est l'appelant
 * (le layout, Server Component) qui interroge `estRappelFerme` et ne monte
 * rien du tout si le rappel est fermé. C'est la condition du zéro
 * clignotement — ce qui est tu n'est pas rendu puis caché, il n'existe pas
 * dans le HTML envoyé.
 *
 * ── Ce qu'on n'enveloppe pas ──
 *
 * Les trois bandeaux BLOQUANTS (incident de paiement, abonnement inactif,
 * essai terminé) restent inamovibles. Ils portent la seule explication de
 * pourquoi les roues publiques sont coupées : les rendre fermables offrirait
 * au commerçant de supprimer la réponse à la question qu'il posera ensuite.
 */
export function RappelFermable({
  cle,
  children,
  className = "",
}: {
  /** Clé versionnée du rappel — voir `src/lib/rappels.ts`. */
  cle: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {/* `pr-12` réserve la place de la croix : sans elle, une phrase longue
          passerait dessous et la cible deviendrait illisible. */}
      <div className="pr-12">{children}</div>
      <form
        action={fermerRappel}
        className="absolute right-2 top-1/2 -translate-y-1/2"
      >
        <input type="hidden" name="cle" value={cle} />
        <button
          type="submit"
          // NOM ACCESSIBLE OBLIGATOIRE : la croix est un caractère décoratif,
          // un bouton sans texte est muet pour un lecteur d'écran — et le scan
          // axe de `e2e/dashboard-home.spec.ts` le refuse.
          aria-label="Masquer ce rappel"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-k-ink/60 transition-colors hover:bg-k-ink/10 hover:text-k-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-1"
        >
          <svg
            aria-hidden
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </form>
    </div>
  );
}
