import { ACTIONS_PUBLIC_FR, type ActionVitrine } from "@/lib/vitrine";
import { hrefAction } from "@/lib/vitrine-action";

/**
 * VIT-10 — LA PORTE D'UNE FICHE OU D'UNE RUBRIQUE.
 *
 * Un lien, et un seul. Elle ne s'affiche que si le module a réellement quelque
 * chose d'ouvert — la décision est prise en amont par `actionOuverte`, qui
 * croise ce que la fiche demande avec ce que `portes` publie.
 *
 * `<a>` VERS UNE ANCRE, PAS UN BOUTON : la cible est un bloc de la même page.
 * Un bouton aurait exigé du JavaScript pour faire ce qu'un fragment fait seul,
 * et n'aurait pas pu être ouvert dans un nouvel onglet ni copié.
 *
 * `min-h-11` (44 px) : cette carte se lit sur un téléphone tenu d'une main
 * pendant un repas. Même mesure que les portes des modules.
 */
export function PorteVitrine({
  action,
  ouverte,
}: {
  action: ActionVitrine | null;
  ouverte: boolean;
}) {
  if (!action || !ouverte) return null;

  return (
    <a
      href={hrefAction(action)}
      // VIT-9 : le compteur lit CETTE valeur, pas l'ancre. Six portes mènent
      // à trois blocs — déduire l'action du fragment aurait compté un clic sur
      // « jouer au quiz » comme un clic sur « expériences », et le vocabulaire
      // fermé des compteurs l'aurait de toute façon refusé.
      data-porte={action}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--vitrine-primary)]/40 bg-[var(--vitrine-primary)]/5 px-4 py-2 text-sm font-bold text-[var(--vitrine-primary)] transition-colors hover:bg-[var(--vitrine-primary)]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]"
    >
      {ACTIONS_PUBLIC_FR[action]}
      <span aria-hidden>→</span>
    </a>
  );
}
