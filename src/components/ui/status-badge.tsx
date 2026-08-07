import { cn } from "@/lib/utils";

/**
 * LA PASTILLE D'ÉTAT — UN SEUL VOCABULAIRE POUR LES HUIT MODULES.
 *
 * Avant ce composant, le même fait s'écrivait de huit façons : « Active » sur
 * une campagne, « Actif » sur un quiz, « En cours » sur un championnat,
 * « Archivé » ici et « Archivée » là. Un commerçant qui passe d'une animation à
 * l'autre devait réapprendre le mot à chaque écran, et « Actif » ne lui disait
 * pas la seule chose qui compte : est-ce que mes clients peuvent jouer ?
 *
 * Les cinq libellés ci-dessous sont donc écrits DU POINT DE VUE DU JOUEUR, pas
 * de la colonne SQL. Les huit `*-status.tsx` ne font plus que traduire leur
 * statut interne vers l'un d'eux : c'est ici, et seulement ici, que le mot
 * s'écrit.
 */
export type EtatAnimation =
  | "brouillon"
  | "programmee"
  | "pause"
  | "ouverte"
  | "cloturee";

const LIBELLES: Record<EtatAnimation, { label: string; className: string }> = {
  brouillon: { label: "Brouillon", className: "bg-white text-k-ink" },
  programmee: { label: "Programmée", className: "bg-sky-100 text-k-ink" },
  pause: { label: "En pause", className: "bg-amber-100 text-k-ink" },
  ouverte: { label: "Ouverte aux joueurs", className: "bg-k-green/40 text-k-ink" },
  cloturee: { label: "Clôturée", className: "bg-zinc-200 text-k-ink" },
};

/** Le libellé affiché pour un état — exposé pour les tests et les gardes. */
export function libelleEtat(etat: EtatAnimation): string {
  return LIBELLES[etat].label;
}

export function StatusBadge({
  etat,
  className,
}: {
  etat: EtatAnimation;
  className?: string;
}) {
  const { label, className: ton } = LIBELLES[etat];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border-2 border-k-ink px-3 py-1 text-xs font-black",
        ton,
        className,
      )}
    >
      {label}
    </span>
  );
}
