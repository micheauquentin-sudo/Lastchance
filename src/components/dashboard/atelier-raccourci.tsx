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
const CLASSES_LIEN =
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink transition-colors duration-200 hover:bg-k-yellow/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink";

export function RaccourciAtelier({
  href,
  className,
}: {
  /** Première étape de l'atelier du module — bâtie par son helper `hrefEtape…`. */
  href: string;
  className?: string;
}) {
  return (
    <Link href={href} className={CLASSES_LIEN + (className ? ` ${className}` : "")}>
      <span aria-hidden>🛠️</span>
      Modifier dans l&apos;atelier
    </Link>
  );
}

/**
 * LE RACCOURCI VERS LE JEU TEL QUE LE JOUEUR LE VOIT, À CÔTÉ DU PRÉCÉDENT.
 *
 * Une fois le jeu ouvert (ou le QR créé, pour la roue), le commerçant veut
 * voir CE QUE VOIT SON CLIENT sans chercher : le lien existait déjà, mais
 * seulement au fond de la Carte de l'Aventure (« Tester comme un client »,
 * `experience-lifecycle.ts`) ou dans le bloc QR, tuiles repliées par défaut.
 *
 * `href` VIENT DE LA PAGE, JAMAIS D'UN CALCUL LOCAL : chaque page détail
 * dérive déjà l'URL joueur pour l'aperçu de la Carte de l'Aventure, avec sa
 * condition propre (actif, non-brouillon, première session, premier QR…).
 * La redériver ici ferait une seconde règle, qui divergerait. Quand la page
 * passe `null` — jeu pas encore ouvert, aucun QR — rien n'est rendu : un
 * bouton qui mène à un écran fermé est pire que pas de bouton.
 *
 * LIBELLÉ DISTINCT : ni « Tester comme un client » (déjà porté par la Carte
 * de l'Aventure sur la même page) ni « Voir ce qu'il manque » (jackpot,
 * soirée). L'emoji reste hors du nom accessible, comme au-dessus.
 */
export function VoirLeJeu({
  href,
  className,
  libelle = "Voir le jeu",
}: {
  /** URL publique côté joueur, ou `null` si le jeu n'est pas accessible. */
  href: string | null;
  className?: string;
  /**
   * Nom du lien, quand « jeu » ne dit pas ce que le client va ouvrir. Le
   * passeport de fidélité n'est pas « un jeu » pour son commerçant : c'est un
   * passeport, et c'est ce mot-là qu'il cherche. La valeur PAR DÉFAUT reste
   * « Voir le jeu » — huit modules la portent, et deux liens de même nom sur
   * une page rendraient tout locator par rôle+nom ambigu ; on ne la change pas
   * pour tout le monde au motif qu'un module la trouve étroite.
   */
  libelle?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={CLASSES_LIEN + (className ? ` ${className}` : "")}
    >
      <span aria-hidden>👀</span>
      {libelle}
    </a>
  );
}
