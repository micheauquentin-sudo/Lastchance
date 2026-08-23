import { Card } from "@/components/ui/card";
import { ACTIONS_PUBLIC_FR, type VitrineCarteView } from "@/lib/vitrine";
import {
  estActionConnue,
  type MesuresVitrineView,
} from "@/lib/vitrine-mesures";

/**
 * VIT-9 — CE QUI ATTIRE, VU DU COMPTOIR.
 *
 * ── DES VUES, JAMAIS DES VISITEURS — ET LE MOT EST DANS L'ÉCRAN ──
 *
 * Les compteurs n'ont aucun identifiant : « 120 vues » est tout ce que la
 * donnée permet de dire, et l'écran l'écrit ainsi. Afficher « 120 clients »
 * aurait été un mensonge d'un mot, celui que personne ne relit ensuite.
 *
 * De même, la colonne des portes compte des CLICS, pas des réservations ni des
 * ventes : ce qui se passe après le clic n'est mesuré nulle part ici, et la
 * phrase sous le tableau le dit au commerçant plutôt qu'à un commentaire.
 *
 * ── LES NOMS SE RÉSOLVENT ICI, PAS EN SQL ──
 *
 * La base stocke des identifiants. Les joindre en SQL aurait fait disparaître
 * les lignes d'une fiche supprimée — or son compteur reste vrai pour le mois où
 * elle existait. L'écran résout ce qu'il peut et nomme le reste « contenu
 * retiré », ce qui est exact et ne perd aucun total.
 */
export function MesuresTableau({
  mesures,
  cartes,
}: {
  mesures: MesuresVitrineView;
  cartes: VitrineCarteView[];
}) {
  // Un seul parcours du catalogue pour les trois rangs : carte, rubrique, fiche.
  const noms = new Map<string, string>();
  for (const carte of cartes) {
    noms.set(carte.id, carte.nom);
    for (const rubrique of carte.categories) {
      noms.set(rubrique.id, rubrique.nom);
      for (const fiche of rubrique.fiches) noms.set(fiche.id, fiche.nom);
    }
  }

  const totalLangues = mesures.langues.fr + mesures.langues.en;
  const partAnglais =
    totalLangues > 0 ? Math.round((mesures.langues.en / totalLangues) * 100) : 0;

  const RANGS: Record<string, string> = {
    carte: "Carte",
    rubrique: "Rubrique",
    fiche: "Fiche",
  };

  return (
    <Card>
      <h2>Ce qui attire</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Sur les {mesures.jours} derniers jours. Ces chiffres comptent des{" "}
        <strong>vues</strong> et des <strong>clics</strong> — jamais des
        visiteurs, jamais des ventes. Aucun identifiant n&apos;est enregistré :
        il n&apos;existe nulle part de quoi reconstituer un parcours.
      </p>

      {mesures.contenus.length === 0 && mesures.actions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Rien de mesuré sur cette période. Les compteurs se remplissent dès que
          votre Vitrine est consultée.
        </p>
      ) : (
        <div className="space-y-6">
          {totalLangues > 0 ? (
            <p className="text-sm text-k-body">
              <span className="font-black tabular-nums text-k-ink">
                {totalLangues}
              </span>{" "}
              vue{totalLangues > 1 ? "s" : ""} de contenu, dont{" "}
              <span className="font-black tabular-nums text-k-ink">
                {partAnglais}
              </span>{" "}
              % en anglais.
            </p>
          ) : null}

          {mesures.contenus.length > 0 ? (
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-k-body">
                Les plus regardés
              </h3>
              <ul className="mt-2 divide-y divide-k-ink/10">
                {mesures.contenus.map((contenu) => (
                  <li
                    key={`${contenu.type}-${contenu.ref}`}
                    className="flex items-baseline gap-3 py-2"
                  >
                    <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {RANGS[contenu.type]}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-bold text-k-ink">
                      {noms.get(contenu.ref) ?? "Contenu retiré"}
                    </span>
                    <span className="shrink-0 text-sm font-black tabular-nums text-k-ink">
                      {contenu.vues}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {mesures.actions.length > 0 ? (
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-k-body">
                Ce sur quoi on clique
              </h3>
              <ul className="mt-2 divide-y divide-k-ink/10">
                {mesures.actions.map((action) => (
                  <li
                    key={action.ref}
                    className="flex items-baseline gap-3 py-2"
                  >
                    <span className="min-w-0 flex-1 text-sm font-bold text-k-ink">
                      {estActionConnue(action.ref)
                        ? ACTIONS_PUBLIC_FR[action.ref]
                        : action.ref}
                    </span>
                    <span className="shrink-0 text-sm font-black tabular-nums text-k-ink">
                      {action.clics}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-zinc-500">
                Un clic est une intention, pas une réservation : ce qui se passe
                ensuite n&apos;est pas mesuré ici.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
