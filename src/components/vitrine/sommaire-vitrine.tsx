import { Card } from "@/components/ui/card";
import {
  ANCRE_BANDE,
  ANCRE_DUO,
  ANCRE_SALONS,
} from "@/components/vitrine/ancres";

/**
 * LE SOMMAIRE DE LA PAGE VITRINE — ce qui rend les salons et les deux jeux
 * atteignables autrement qu'en faisant défiler.
 *
 * ── POURQUOI UN SOMMAIRE, ET PAS UNE ENTRÉE DE MENU ──
 *
 * Les trois surfaces visées (superviser les salons, le Duo Miroir, le Portrait
 * de la Bande) ne sont PAS des routes : ce sont des sections de cet écran. Une
 * entrée de menu aurait donc demandé d'inventer une page pour la porter, et le
 * menu lui-même ne couvre volontairement qu'une douzaine des trente-trois routes
 * du tableau de bord (`src/components/dashboard/nav.tsx`). Ce qui manquait
 * n'était pas une route : c'était un chemin depuis le haut de la page vers son
 * bas, sur un écran qui porte déjà réglages, adresse, audience, traductions,
 * « À la une », import, catalogue et planche QR.
 *
 * ── LES ANCRES SONT STABLES ET SANS IDENTIFIANT D'ENTITÉ ──
 *
 * Même motif que `#bloc-reserver` côté public (`portes.tsx`) : un lien collé
 * dans une note ou un message d'aide ne doit pas dépendre d'une salle, d'une
 * fiche ou d'une carte que le commerçant peut supprimer le lendemain. Les trois
 * constantes de `ancres.ts` sont la SEULE définition de ces chaînes — chaque
 * section pose son `id` en les important, donc un renommage ne peut pas laisser
 * un lien pointer dans le vide.
 *
 * ── IL NE LISTE QUE CE QUI EST PEINT ──
 *
 * Un sommaire qui promet une section absente est pire que pas de sommaire : le
 * navigateur ne bouge pas, et le commerçant croit l'écran cassé. « Salons » ne
 * paraît donc qu'avec au moins une salle vivante — exactement la condition sous
 * laquelle `SalonsOuverts` se peint — et le Duo qu'avec au moins une fiche au
 * catalogue, seul cas où son plateau se compose. Le Portrait de la Bande, lui,
 * est toujours là : il n'a pas d'état « pas prêt » (pack par défaut, questions
 * dans le code).
 */

export function SommaireVitrine({
  salonsOuverts,
  duoComposable,
}: {
  /** Nombre de salles vivantes — la carte « Salons ouverts » n'existe qu'au-delà de zéro. */
  salonsOuverts: number;
  /** Au moins une fiche au catalogue : sans elle, le Duo n'affiche qu'une consigne. */
  duoComposable: boolean;
}) {
  const entrees: { ancre: string; libelle: string }[] = [];

  if (salonsOuverts > 0) {
    // LE LIBELLÉ DIT LE GESTE, pas seulement le nom de la carte : ce qu'on vient
    // y faire est superviser une partie en cours et, au besoin, la clore.
    entrees.push({
      ancre: ANCRE_SALONS,
      libelle: `Superviser et clore les salons (${salonsOuverts})`,
    });
  }
  if (duoComposable) {
    entrees.push({ ancre: ANCRE_DUO, libelle: "Régler le Duo Miroir" });
  }
  entrees.push({
    ancre: ANCRE_BANDE,
    libelle: "Régler le Portrait de la Bande",
  });

  return (
    <Card>
      <h2>Aller directement à</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {entrees.map((entree) => (
          <li key={entree.ancre}>
            {/* Une ANCRE DE PAGE, donc un `<a>` et non un `<Link>` : il n'y a
                aucune navigation à faire, seulement un défilement. `min-h-11`
                (44 px) pour la même raison que les portes publiques — c'est un
                écran de comptoir, touché au pouce. */}
            <a
              href={`#${entree.ancre}`}
              className="flex min-h-11 items-center rounded-xl border-2 border-k-ink/15 px-3.5 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            >
              {entree.libelle}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
