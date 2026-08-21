import { Card } from "@/components/ui/card";
import {
  SEUIL_COUVERTURE_SELECTEUR,
  type TraductionEtatView,
  type VitrineCarteView,
} from "@/lib/vitrine";
import { TraductionChamp } from "@/components/vitrine/traduction-champ";

type TraductionCible = TraductionEtatView["cibles"][number];

/** La clé d'indexation d'une cible : le couple que la RPC rend, et lui seul. */
function cle(cibleType: string, cibleId: string): string {
  return `${cibleType}:${cibleId}`;
}

/**
 * LA JAUGE — ce qui est traduit, et à partir de quand l'anglais se propose.
 *
 * ── ELLE DIT « FRAIS SUR TOTAL », PAS « LIGNES ÉCRITES » ──
 *
 * Une traduction PÉRIMÉE ne compte pas comme traduite : c'est la définition que
 * la base applique (`vitrine_translation_state`) et celle que le sélecteur de
 * langue utilise. Afficher ici le nombre de lignes écrites aurait montré 100 %
 * à un commerçant dont la page publique reste en français — le seul chiffre
 * malhonnête qu'un écran de traduction puisse afficher.
 *
 * ── LE SEUIL EST LU, JAMAIS RECOPIÉ ──
 *
 * `SEUIL_COUVERTURE_SELECTEUR` est la même constante que celle dont dépend
 * `selecteurLanguesOuvert`. Écrire « 95 % » en dur aurait donné une phrase qui
 * cesse d'être vraie le jour où le seuil bouge, sur le seul écran qui la promet.
 */
export function JaugeTraductions({
  resume,
}: {
  resume: TraductionEtatView["resume"];
}) {
  const { total, frais, perimes, manquants } = resume;
  const pourcentage = total > 0 ? Math.round((frais / total) * 100) : 0;
  const seuilPourcent = Math.round(SEUIL_COUVERTURE_SELECTEUR * 100);
  const ouvert = total > 0 && frais / total >= SEUIL_COUVERTURE_SELECTEUR;

  return (
    <Card>
      <h2>Où en est votre anglais</h2>

      <p className="mt-2 text-sm text-k-body">
        <span className="font-black tabular-nums text-k-ink">{frais}</span> champ
        {frais > 1 ? "s" : ""} sur{" "}
        <span className="font-black tabular-nums text-k-ink">{total}</span>{" "}
        traduit{frais > 1 ? "s" : ""} et à jour
        {total > 0 ? (
          <>
            {" "}
            —{" "}
            <span className="font-black tabular-nums text-k-ink">
              {pourcentage}
            </span>{" "}
            %
          </>
        ) : null}
        .
      </p>

      {/* LA BARRE EST DÉCORATIVE, LE CHIFFRE EST AU-DESSUS. `aria-hidden` :
          répéter la même mesure en `progressbar` la ferait annoncer deux fois
          au lecteur d'écran, une fois en mots et une fois en pourcentage nu. */}
      <div
        aria-hidden="true"
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200"
      >
        <div
          className={`h-full rounded-full ${ouvert ? "bg-emerald-500" : "bg-k-yellow"}`}
          style={{ width: `${pourcentage}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-k-body">
        L&apos;anglais se propose aux visiteurs à partir de {seuilPourcent} %
        des champs traduits et à jour.{" "}
        {ouvert ? (
          <span className="font-bold text-emerald-800">
            C&apos;est le cas : le sélecteur de langue est visible sur votre
            vitrine.
          </span>
        ) : (
          <span className="font-bold text-k-ink">
            Ce n&apos;est pas encore le cas : votre vitrine reste en français.
          </span>
        )}
      </p>

      {/* PÉRIMÉS ET MANQUANTS SONT DITS SÉPARÉMENT, parce que le geste n'est pas
          le même : un périmé se RELIT (le français a bougé), un manquant
          s'écrit. Les additionner en « 12 à faire » aurait effacé cette
          différence. */}
      <ul className="mt-4 space-y-1.5 text-sm text-k-body">
        <li>
          <span className="font-black tabular-nums text-amber-900">
            {perimes}
          </span>{" "}
          à relire — le français a changé depuis la traduction.
        </li>
        <li>
          <span className="font-black tabular-nums text-k-ink">
            {manquants}
          </span>{" "}
          jamais traduit{manquants > 1 ? "s" : ""}.
        </li>
      </ul>
    </Card>
  );
}

/**
 * L'ÉCRAN DE TRADUCTION — les mêmes champs que l'éditeur, dans le même ordre.
 *
 * ── LA BASE REND UN ORDRE PLAT, L'ÉCRAN RACONTE L'ARBRE ──
 *
 * `vitrine_translation_state` trie par `(cible_type, cible_id)` — un ordre
 * STABLE et volontairement muet, dit en toutes lettres dans la migration : « le
 * regroupement visuel est une décision de rendu, pas de base ». Rendu tel quel,
 * il donnerait toutes les cartes, puis toutes les rubriques, puis toutes les
 * fiches dans un ordre d'identifiants — c'est-à-dire une liste où le commerçant
 * ne retrouve pas son menu.
 *
 * L'arbre est donc reconstruit ICI, en croisant les cibles avec le catalogue
 * déjà chargé par le contexte de l'éditeur (`cartes`, qui porte les mêmes
 * identifiants). Réglages d'abord — ce sont les mots de la page d'accueil —,
 * puis chaque carte avec ses rubriques et leurs fiches.
 *
 * ── RIEN NE DISPARAÎT, MÊME CE QU'ON N'A PAS SU PLACER ──
 *
 * Une cible que le catalogue ne connaît pas (carte désactivée absente de l'état,
 * décalage entre deux lectures) tombe dans « Autres éléments » plutôt que d'être
 * silencieusement omise : la jauge la COMPTE, et un écran qui compte un champ
 * sans permettre de le traduire est un écran qui bloque sans le dire.
 */
export function TraductionsEditeur({
  etat,
  cartes,
  peutEditer,
}: {
  etat: TraductionEtatView;
  cartes: VitrineCarteView[];
  peutEditer: boolean;
}) {
  const parCle = new Map<string, TraductionCible>();
  for (const cible of etat.cibles) {
    parCle.set(cle(cible.cibleType, cible.cibleId), cible);
  }
  const places = new Set<string>();

  const prendre = (cibleType: string, cibleId: string) => {
    const k = cle(cibleType, cibleId);
    const cible = parCle.get(k);
    if (cible) places.add(k);
    return cible ?? null;
  };

  const reglages = etat.cibles
    .filter((c) => c.cibleType === "settings")
    .map((c) => {
      places.add(cle(c.cibleType, c.cibleId));
      return c;
    });

  const arbre = cartes.map((carte) => ({
    carte,
    cible: prendre("menu", carte.id),
    rubriques: carte.categories.map((rubrique) => ({
      rubrique,
      cible: prendre("categorie", rubrique.id),
      fiches: rubrique.fiches.map((fiche) => ({
        fiche,
        cible: prendre("item", fiche.id),
      })),
    })),
  }));

  const orphelines = etat.cibles.filter(
    (c) => !places.has(cle(c.cibleType, c.cibleId)),
  );

  if (etat.cibles.length === 0) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm font-semibold text-k-body">
          Rien à traduire pour l&apos;instant : écrivez d&apos;abord votre
          accroche et votre carte en français.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {reglages.length > 0 ? (
        <Card>
          <h2>Réglages</h2>
          <p className="mb-5 mt-2 text-sm text-zinc-500">
            Les mots qui accueillent le visiteur : votre accroche, votre
            histoire, vos horaires.
          </p>
          <div className="space-y-4">
            {reglages.map((cible) => (
              <ChampsDeLaCible
                key={cle(cible.cibleType, cible.cibleId)}
                cible={cible}
                peutEditer={peutEditer}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {arbre.map(({ carte, cible, rubriques }) => (
        <Card key={carte.id}>
          <h2>{carte.nom}</h2>
          {!carte.active ? (
            <p className="mt-2 text-xs font-bold text-zinc-500">
              Carte masquée — ses champs comptent quand même dans la mesure
              ci-dessus.
            </p>
          ) : null}

          {cible ? (
            <div className="mt-4">
              <ChampsDeLaCible cible={cible} peutEditer={peutEditer} />
            </div>
          ) : null}

          {rubriques.map(({ rubrique, cible: cibleRubrique, fiches }) => (
            <section key={rubrique.id} className="mt-6">
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-k-ink">
                {rubrique.nom}
              </h3>
              <div className="space-y-4">
                {cibleRubrique ? (
                  <ChampsDeLaCible
                    cible={cibleRubrique}
                    peutEditer={peutEditer}
                  />
                ) : null}
                {fiches.map(({ fiche, cible: cibleFiche }) =>
                  cibleFiche ? (
                    <ChampsDeLaCible
                      key={fiche.id}
                      cible={cibleFiche}
                      peutEditer={peutEditer}
                    />
                  ) : null,
                )}
              </div>
            </section>
          ))}
        </Card>
      ))}

      {orphelines.length > 0 ? (
        <Card>
          <h2>Autres éléments</h2>
          <p className="mb-5 mt-2 text-sm text-zinc-500">
            Des champs traduisibles que nous n&apos;avons pas su rattacher à une
            carte. Ils comptent dans la mesure ci-dessus et se traduisent ici.
          </p>
          <div className="space-y-4">
            {orphelines.map((cible) => (
              <ChampsDeLaCible
                key={cle(cible.cibleType, cible.cibleId)}
                cible={cible}
                peutEditer={peutEditer}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Une cible et ses champs. Le titre n'est rendu QUE lorsqu'il apporte quelque
 * chose : « Réglages » répété au-dessus de la carte « Réglages » serait du
 * bruit, alors que le nom d'une fiche est l'ancre qui permet de la retrouver.
 */
function ChampsDeLaCible({
  cible,
  peutEditer,
}: {
  cible: TraductionCible;
  peutEditer: boolean;
}) {
  return (
    <div>
      {cible.cibleType !== "settings" ? (
        <p className="mb-2 text-sm font-black text-k-ink">{cible.libelle}</p>
      ) : null}
      <div className="space-y-3">
        {cible.champs.map((champ) => (
          <TraductionChamp
            key={champ.champ}
            cibleType={cible.cibleType}
            cibleId={cible.cibleId}
            libelleCible={cible.libelle}
            version={cible.version}
            champ={champ}
            peutEditer={peutEditer}
          />
        ))}
      </div>
    </div>
  );
}
