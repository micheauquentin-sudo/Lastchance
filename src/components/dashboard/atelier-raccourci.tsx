import Link from "next/link";

/**
 * LE RACCOURCI VERS L'ATELIER, DEPUIS LA TUILE « STATUT ».
 *
 * La porte de l'atelier (`AtelierEntree`, bouton « Ouvrir l'atelier ») existe
 * déjà sur les huit modules — mais elle vit dans une tuile plus bas, repliée
 * par défaut depuis V1.51. Le commerçant qui arrive sur la page de son jeu voit
 * d'abord le bloc qui publie ; pour aller CORRIGER quelque chose il devait
 * deviner qu'il fallait déplier une tuile dont le titre ne dit pas « éditer ».
 * Ce lien met la première étape de l'atelier à portée immédiate.
 *
 * LIBELLÉ DISTINCT, VOLONTAIREMENT : ni « Ouvrir l'atelier » (nom accessible
 * déjà pris par la porte, asserté par `e2e/atelier-modules.spec.ts`) ni « Voir
 * ce qu'il manque » (jackpot et soirée, conservés). Deux liens de même nom sur
 * une page rendent tout locator par rôle+nom ambigu.
 *
 * L'emoji est dans un `<span aria-hidden>` séparé : le nom accessible reste
 * exactement « Modifier dans l'atelier ».
 */
export function RaccourciAtelier({
  href,
  className,
}: {
  /** Première étape de l'atelier du module — bâtie par son helper `hrefEtape…`. */
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink transition-colors duration-200 hover:bg-k-yellow/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink" +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-hidden>🛠️</span>
      Modifier dans l&apos;atelier
    </Link>
  );
}
