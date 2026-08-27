import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";

/**
 * LA CARTE DE STATUT — UNE SEULE FOIS, POUR LES HUIT MODULES.
 *
 * ── CE QU'ELLE REMPLACE ──
 *
 * Huit cartes « Statut de … » écrites huit fois, chacune avec sa mise en page.
 * Le vocabulaire des ÉTATS était déjà unifié (`ui/status-badge.tsx`) ; leur
 * PRÉSENTATION ne l'était pas, et la dérive était visible à l'œil nu :
 *
 *   · le quiz dessinait sa propre pastille à la main — un `<span>` vert avec
 *     ses classes — au lieu du badge commun, et ne l'affichait QUE sur
 *     « ouverte » ;
 *   · plusieurs modules n'annonçaient RIEN sur les autres états : le
 *     commerçant lisait une rangée de boutons sans savoir d'où il partait ;
 *   · les conséquences des transitions vivaient tantôt sous leur bouton dans
 *     un cadre étroit, tantôt nulle part.
 *
 * ── L'ORDRE EST LE PROPOS ──
 *
 * On regarde OÙ L'ON EST avant de décider où aller. La ligne d'état ouvre donc
 * la carte : la pastille porte le mot, la phrase porte la conséquence pour le
 * CLIENT — « un client qui scanne le QR code peut jouer », pas « statut =
 * active ». Les gestes viennent ensuite, sur une seule rangée : changer
 * l'état, puis aller voir. Les conséquences se posent dessous, en pleine
 * largeur, parce qu'une phrase brisée en colonnes de vingt caractères ne se
 * lit pas.
 *
 * ── CE QU'ELLE NE FAIT PAS ──
 *
 * Elle ne connaît NI les statuts d'un module, NI ses transitions, NI ses
 * actions serveur : tout arrive en nœuds. Un composant qui aurait su parler
 * quiz et cagnotte aurait fini par porter huit branches — c'est-à-dire le
 * problème qu'il devait résoudre.
 */
export function CarteStatutAnimation({
  titre,
  badge,
  phrase,
  actions,
  raccourcis = null,
  notes = null,
  erreur,
  children = null,
}: {
  /** « Statut du quiz », « Statut de la cagnotte »… — le module se nomme. */
  titre: string;
  /** La pastille du module (`*StatusBadge`), déjà traduite vers le vocabulaire commun. */
  badge: React.ReactNode;
  /** Ce qui est vrai MAINTENANT, du point de vue du client. */
  phrase: string;
  /** Les boutons de transition, dans leurs formulaires. */
  actions: React.ReactNode;
  /** « Modifier dans l'atelier », « Voir le jeu » — séparés des transitions par un filet. */
  raccourcis?: React.ReactNode;
  /** Conséquences à annoncer, en pleine largeur sous la rangée. */
  notes?: React.ReactNode;
  /** Message de refus du serveur, affiché tel quel. */
  erreur?: string;
  /** Sections propres au module, sous la partie commune. */
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="font-semibold mb-4">{titre}</h2>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-k-ink/15 bg-k-bg px-4 py-3">
        {badge}
        <p className="min-w-0 flex-1 text-sm font-bold text-k-body">{phrase}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {actions}
        {raccourcis && (
          <>
            {/* Le filet dit « ces deux-là ne changent rien » : à gauche on agit
                sur l'état, à droite on va regarder. Masqué sur téléphone, où
                les boutons passent à la ligne et où un trait vertical au
                milieu d'une colonne ne sépare plus rien. */}
            <span
              aria-hidden
              className="mx-1 hidden h-7 w-px shrink-0 bg-zinc-200 sm:block"
            />
            {raccourcis}
          </>
        )}
      </div>

      {notes}
      <FieldError message={erreur} />

      {children}
    </Card>
  );
}
