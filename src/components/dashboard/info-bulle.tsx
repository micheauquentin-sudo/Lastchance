import type { ReactNode } from "react";

/**
 * L'INFO-BULLE DU DÉPÔT — ET POURQUOI ELLE NE SURVOLE RIEN.
 *
 * Une bulle au survol ne s'ouvre ni au doigt sur un écran tactile, ni au
 * clavier, et disparaît dès qu'on bouge la souris pour la lire. Or le premier
 * public de ces explications est un commerçant sur son téléphone, en boutique.
 *
 * Le dépôt a donc son pattern, déjà présent ailleurs et repris ici tel quel :
 * un `<details>` sobre (comme `campaign-template-gallery.tsx` et `nav.tsx`)
 * dont le résumé est décrit par le texte, via `aria-describedby` pointant sur
 * un `<p id=…>` (comme `code-ttl-days-field.tsx`). Aucun JavaScript client :
 * `<details>` est natif, donc le composant reste un Server Component et
 * fonctionne même si le bundle n'est pas encore chargé.
 *
 * L'`id` est FOURNI par l'appelant, jamais tiré de `useId` : le texte doit
 * pouvoir être désigné depuis l'extérieur — un champ de formulaire peut poser
 * `aria-describedby={infoBulleTexteId("creation-quiz")}` pour que le lecteur
 * d'écran entende l'explication en arrivant sur la case, sans la rouvrir.
 */
export function infoBulleTexteId(id: string): string {
  return `${id}-texte`;
}

export function InfoBulle({
  id,
  resume,
  children,
  defaultOpen = false,
  className,
}: {
  /** Identifiant stable et unique dans la page. */
  id: string;
  /** La question telle que le commerçant se la pose, sur une ligne. */
  resume: string;
  /** L'explication : trois phrases au plus, en langage métier. */
  children: ReactNode;
  /** Ouverte d'emblée là où l'explication vaut mieux que la surprise. */
  defaultOpen?: boolean;
  className?: string;
}) {
  const texteId = infoBulleTexteId(id);

  return (
    <details
      id={id}
      open={defaultOpen}
      className={`group rounded-xl border-2 border-k-ink/20 bg-white ${className ?? ""}`}
    >
      <summary
        aria-describedby={texteId}
        className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-bold text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
      >
        <span>
          <span aria-hidden="true">💡</span> {resume}
        </span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <p
        id={texteId}
        className="border-t-2 border-k-ink/15 px-3 py-2.5 text-xs leading-5 text-k-body"
      >
        {children}
      </p>
    </details>
  );
}
