/**
 * LA CONSIGNE D'ACCUEIL DU JOUEUR — une phrase, avant le premier geste.
 *
 * Le joueur arrive par un QR code, debout, sur son téléphone. Il n'a pas lu
 * de notice et n'en lira pas : ce qu'il ne comprend pas dans la seconde, il
 * ne le comprendra pas du tout. Les parcours longs (chasse, calendrier,
 * jackpot) l'accueillaient pourtant sur un écran d'ACTION nu — un bouton
 * « Valider mon passage », une jauge, un compteur — sans jamais dire combien
 * d'étapes, à quel rythme, ni ce qu'il y a au bout.
 *
 * Composant SERVEUR et purement présentationnel : aucun état, aucune server
 * action. Il existe pour que les trois parcours ne recopient pas trois fois
 * la même boîte — c'est la classe de divergence que `GAME_IDLE` a déjà eu à
 * réparer sur l'écran d'accueil des jeux.
 *
 * ── L'emoji est décoratif, et il le reste ──
 *
 * Il est rendu dans un `<span aria-hidden>` SÉPARÉ du texte. Un U+FE0F entré
 * dans un nom accessible a déjà cassé un test de ce dépôt
 * (`e2e/event-remote-cycle.spec.ts`) : le lecteur d'écran ne doit entendre
 * que la phrase.
 */
export function ConsigneJoueur({
  children,
  emoji = "👉",
  className = "",
}: {
  /** La consigne elle-même : une phrase, deux au maximum. */
  children: React.ReactNode;
  /** Pictogramme décoratif, jamais annoncé. */
  emoji?: string;
  /** Marges laissées à l'appelant — la boîte ne décide pas de sa place. */
  className?: string;
}) {
  return (
    <p
      className={`flex items-start gap-2 rounded-2xl border-2 border-k-ink bg-k-yellow/40 px-4 py-3 text-sm font-bold leading-snug text-k-ink ${className}`}
    >
      <span aria-hidden className="shrink-0 text-base leading-none">
        {emoji}
      </span>
      <span>{children}</span>
    </p>
  );
}
