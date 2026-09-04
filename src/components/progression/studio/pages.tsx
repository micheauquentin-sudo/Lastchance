"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import {
  BadgeForm,
  BadgeRow,
  ChestEnabledAction,
  ChestForm,
  ChestRow,
  CollectionBlock,
  CollectionForm,
  MissionEnabledAction,
  MissionForm,
  MissionRow,
  optionsDeSaison,
} from "@/components/dashboard/progression-season-card";
import {
  PROGRESSION_BADGE_GLYPHS,
  PROGRESSION_EVENT_LABELS,
} from "@/components/progression/progression-labels";
import {
  saisonLancable,
  verifierSaison,
} from "@/components/progression/studio/verification";
import type { OrgProgressionSeason } from "@/lib/meta-progression";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DE LA MÉTA-PROGRESSION (VIT-50).
 *
 * ── CE STUDIO N'A PAS DE FORMULAIRE DE RÉGLAGES, ET C'EST STRUCTUREL ──
 *
 * C'est le second de la famille dans ce cas, après le Ticket d'Or (ADR-160), et
 * pour une raison plus nette encore : il n'existe PAS de
 * `updateProgressionSeason`. Le nom et les dates d'une saison se fixent à la
 * création et ne se corrigent jamais. Toute la configuration est une liste
 * d'entités — badges, collections, objets, missions, coffres — dont chacune a
 * ses actions atomiques (`create…`, `update…`, `delete…`).
 *
 * Il n'y a donc rien à mettre dans `champsCaches`, et le studio ne promet pas
 * l'enregistrement automatique : chaque formulaire garde son bouton, exactement
 * comme au tableau de bord. Le détail est en tête de `progression-studio.tsx`.
 *
 * ── LE PIÈGE DE L'ÉCRASEMENT EXISTE, UN CRAN PLUS BAS, ET IL EST DÉJÀ FERMÉ ──
 *
 * `updateProgressionMission` réécrit ONZE colonnes en bloc (et pousse une
 * nouvelle version de règle) ; `updateProgressionChest` REMPLACE intégralement
 * le contenu du coffre par `itemIds`. Une étape qui ne montrerait qu'une partie
 * d'une entité détruirait le reste — le même défaut que partout ailleurs, à
 * l'échelle de la LIGNE.
 *
 * La parade n'est pas un miroir caché : c'est le découpage lui-même. Aucune
 * étape ne coupe une entité en deux. Chaque formulaire porte TOUS les champs de
 * son action, et `studio-charge.test.tsx` le mesure sur le rendu réel de chaque
 * étape — parce que « c'est structurel » reste une intention tant qu'aucune
 * garde ne la tient.
 *
 * ── LA CONFIGURATION N'EST OUVERTE QU'EN BROUILLON ──
 *
 * Les treize mutations de configuration sont bornées à `draft` côté RPC. Sur une
 * saison lancée, ces étapes montrent donc l'état FIGÉ et, tant qu'elle court,
 * les seuls gestes que la base accepte encore : les interrupteurs d'arrêt.
 * Afficher les formulaires y aurait proposé des boutons qui échouent tous.
 */

export interface ProprietesEtapeProgression {
  season: OrgProgressionSeason;
  /**
   * Le droit de CONFIGURER, tel que la RPC le rend (`snapshot.canConfigure`) —
   * jamais le rôle local. Voir l'en-tête de `progression-studio.tsx`.
   */
  peutRegler: boolean;
  /** Une autre saison tourne déjà : l'étape de vérification en a besoin. */
  autreSaisonActive: boolean;
}

function TitreEtape({ titre, aide }: { titre: string; aide: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

/** Vrai quand les formulaires de configuration ont une chance d'aboutir. */
function ouvertALEdition(props: ProprietesEtapeProgression): boolean {
  return props.peutRegler && props.season.status === "draft";
}

/**
 * Ce qu'on dit à la place d'un formulaire qui échouerait. Deux causes, et il
 * faut les distinguer : un droit manquant n'est pas une saison figée, et
 * confondre les deux enverrait le commerçant clôturer sa saison pour un
 * problème de rôle.
 */
function PourquoiFige({ season, peutRegler }: ProprietesEtapeProgression) {
  return (
    <p
      role="note"
      className="rounded-xl border-2 border-dashed border-k-ink/25 px-3 py-2 text-sm font-semibold text-k-body"
    >
      {!peutRegler
        ? "La configuration des saisons est réservée aux comptes propriétaire et éditeur."
        : season.status === "draft"
          ? "La configuration n'est pas modifiable pour le moment."
          : "La configuration a été figée au lancement de la saison. Elle ne se rouvre pas — même une saison close reste telle qu'elle a tourné."}
    </p>
  );
}

// ── 1. Vos badges ───────────────────────────────────────────

export function EtapeBadges(props: ProprietesEtapeProgression) {
  const { season } = props;
  const editable = ouvertALEdition(props);

  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Vos badges"
        aide="Les distinctions qu'une mission pourra décerner. Ce sont des marqueurs de fierté : un badge n'ouvre aucun droit et ne vaut aucun lot en caisse."
      />
      <Card>
        <h2 className="font-semibold mb-1">Les badges de cette saison</h2>
        {season.badges.length > 0 ? (
          <ul className="mb-3 space-y-2">
            {season.badges.map((badge) =>
              editable ? (
                <BadgeRow key={badge.id} badge={badge} />
              ) : (
                <li
                  key={badge.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2 text-sm font-bold text-k-ink"
                >
                  <span aria-hidden>
                    {PROGRESSION_BADGE_GLYPHS[badge.iconKey]}
                  </span>
                  {badge.name}
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-zinc-500">
            Aucun badge. Une mission peut très bien n&apos;en décerner aucun et
            ne verser que des clés.
          </p>
        )}
        {editable ? (
          <BadgeForm mode="create" seasonId={season.id} />
        ) : (
          <PourquoiFige {...props} />
        )}
      </Card>
    </div>
  );
}

// ── 2. Vos collections ──────────────────────────────────────

/**
 * LES OBJETS NE SONT PAS UNE ÉTAPE À PART, ET C'EST MÉCANIQUE.
 *
 * Un objet n'existe QUE dans sa collection — `createProgressionCollectionItem`
 * prend un `collectionId`, et `CollectionBlock` le rend déjà à l'intérieur
 * d'elle. Une étape « Les pièces » aurait dû re-rendre toutes les collections
 * pour y accrocher leurs objets : une redite du même écran sous un autre titre,
 * pas une découpe (ADR-160).
 */
export function EtapeCollections(props: ProprietesEtapeProgression) {
  const { season } = props;
  const editable = ouvertALEdition(props);

  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Vos collections"
        aide="L'album que vos clients remplissent, et les pièces qui le composent. C'est là que puisent les coffres : sans pièce, aucun coffre ne peut se créer."
      />
      <Card>
        <h2 className="font-semibold mb-1">Vos albums et leurs pièces</h2>
        {season.collections.length > 0 ? (
          <div className="mb-3 space-y-3">
            {season.collections.map((collection) =>
              editable ? (
                <CollectionBlock key={collection.id} collection={collection} />
              ) : (
                <div
                  key={collection.id}
                  className="rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2"
                >
                  <p className="text-sm font-bold text-k-ink">
                    {collection.name}
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-zinc-500">
                    {collection.items.map((item) => (
                      <li key={item.id}>{item.name}</li>
                    ))}
                    {!collection.items.length && <li>Aucune pièce.</li>}
                  </ul>
                </div>
              ),
            )}
          </div>
        ) : (
          <p className="mb-3 text-sm text-zinc-500">
            Aucune collection pour l&apos;instant.
          </p>
        )}
        {editable ? (
          <CollectionForm mode="create" seasonId={season.id} />
        ) : (
          <PourquoiFige {...props} />
        )}
      </Card>
    </div>
  );
}

// ── 3. Vos missions ─────────────────────────────────────────

/**
 * « CE QUI FAIT AVANCER » ET « LES CLÉS » NE SONT PAS DEUX ÉTAPES.
 *
 * L'esquisse en proposait trois — la mission, son déclencheur, sa dotation.
 * `updateProgressionMission` réécrit ONZE colonnes en bloc : les séparer aurait
 * exigé trois formulaires miroirs sur une même ligne (ADR-157). Et pour rien :
 * un palier sans sa dotation ne veut rien dire, on ne décide pas « quinze
 * parties » sans décider dans le même souffle ce que ça rapporte.
 */
export function EtapeMissions(props: ProprietesEtapeProgression) {
  const { season } = props;
  const editable = ouvertALEdition(props);
  const { badges, items } = optionsDeSaison(season);
  const arretPossible = props.peutRegler && season.status === "active";

  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Vos missions"
        aide="Elles avancent TOUTES SEULES au fil des parties déjà jouées chez vous : le joueur n'a rien à presser, rien à déclarer."
      />
      <Card>
        <h2 className="font-semibold mb-1">Les missions de cette saison</h2>
        {arretPossible && (
          <p className="mb-3 text-sm text-zinc-500">
            La configuration est figée, mais une mission trop généreuse peut être
            désactivée ici — sans clore la saison, et sans rien effacer.
          </p>
        )}
        {season.missions.length > 0 ? (
          <ul className="mb-3 space-y-2">
            {season.missions.map((mission) =>
              editable ? (
                <MissionRow
                  key={mission.id}
                  mission={mission}
                  badges={badges}
                  items={items}
                />
              ) : (
                <li
                  key={mission.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-k-ink">
                      {mission.name}
                    </p>
                    <p className="text-xs font-semibold text-k-body">
                      {PROGRESSION_EVENT_LABELS[mission.rule.eventName]} ×
                      {mission.rule.target}
                      {mission.keyReward > 0
                        ? ` · ${mission.keyReward} 🔑`
                        : ""}{" "}
                      · règle v{mission.rule.version}
                    </p>
                  </div>
                  {arretPossible && <MissionEnabledAction mission={mission} />}
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-zinc-500">
            Aucune mission. Sans elle, personne ne gagne de clé et la saison ne
            peut pas être lancée.
          </p>
        )}
        {editable ? (
          <MissionForm
            mode="create"
            seasonId={season.id}
            badges={badges}
            items={items}
          />
        ) : (
          !arretPossible && <PourquoiFige {...props} />
        )}
      </Card>
    </div>
  );
}

// ── 4. Vos coffres ──────────────────────────────────────────

export function EtapeCoffres(props: ProprietesEtapeProgression) {
  const { season } = props;
  const editable = ouvertALEdition(props);
  const { items } = optionsDeSaison(season);
  const arretPossible = props.peutRegler && season.status === "active";

  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Vos coffres"
        aide="Ils consomment les clés gagnées par les missions et rendent une pièce que le joueur n'a pas encore. Ouvrir un coffre n'émet aucun code de caisse."
      />
      <Card>
        <h2 className="font-semibold mb-1">Les coffres de cette saison</h2>
        {arretPossible && (
          <p className="mb-3 text-sm text-zinc-500">
            Un coffre désactivé quitte l&apos;écran de vos joueurs et n&apos;est
            plus ouvrable ; leurs clés leur restent acquises.
          </p>
        )}
        {season.chests.length > 0 ? (
          <ul className="mb-3 space-y-2">
            {season.chests.map((chest) =>
              editable ? (
                <ChestRow key={chest.id} chest={chest} items={items} />
              ) : (
                <li
                  key={chest.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-k-ink">{chest.name}</p>
                    <p className="text-xs font-semibold text-k-body">
                      {chest.keyCost} 🔑 · {chest.itemIds.length} pièce
                      {chest.itemIds.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  {arretPossible && <ChestEnabledAction chest={chest} />}
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-zinc-500">Aucun coffre.</p>
        )}
        {editable ? (
          items.length === 0 ? (
            <p className="text-sm font-semibold text-k-body">
              Créez d&apos;abord au moins une pièce de collection : un coffre ne
              peut pas être vide.
            </p>
          ) : (
            <ChestForm mode="create" seasonId={season.id} items={items} />
          )
        ) : (
          !arretPossible && <PourquoiFige {...props} />
        )}
      </Card>
    </div>
  );
}

// ── 5. Je vérifie et je lance ───────────────────────────────

/**
 * CETTE ÉTAPE NE LANCE PAS, ET C'EST LE MÊME ARBITRAGE QUE LE PASSEPORT.
 *
 * `AtelierVerificationFidelite` vérifie et RENVOIE vers l'écran de suivi, seul
 * endroit qui publie. Ici la raison est plus dure encore : `activateProgressionSeason`
 * vit au coude à coude avec `endProgressionSeason` et `deleteProgressionSeason`
 * dans un groupe qui se lit ensemble. Doubler le lancement embarquerait son
 * voisin destructif — ou séparerait le groupe, et l'on cliquerait « Lancer »
 * sans avoir sous les yeux le « Supprimer » qui dit ce qu'on abandonne.
 *
 * Et le lancement est DÉFINITIF. Un geste irréversible ne gagne rien à exister
 * à deux endroits ; il perd la seule chose qui compte — un seul endroit où l'on
 * sait ce qu'on fait.
 */
export function EtapeVerification(props: ProprietesEtapeProgression) {
  const { season, autreSaisonActive } = props;
  const points = verifierSaison(season, autreSaisonActive);
  const prete = saisonLancable(points);

  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Je vérifie et je lance"
        aide="Calculé sur l'état réel de votre saison, avec les conditions exactes que le serveur applique au lancement. L'ouverture elle-même se fait depuis le tableau de bord."
      />

      <Card>
        <h2 className="font-semibold mb-1">Ce que le serveur vérifiera</h2>
        <p className="mb-4 mt-2 text-sm text-zinc-500">
          Ce sont les quatre conditions de{" "}
          <code>activate_progression_season</code>, pas une approximation de cet
          écran.
        </p>

        {prete ? (
          <p
            role="status"
            className="rounded-xl border-2 border-green-700/30 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800"
          >
            Tout est réuni : cette saison peut être lancée.
          </p>
        ) : (
          <p
            role="status"
            className="rounded-xl border-2 border-amber-600/30 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
          >
            Le lancement serait refusé en l&apos;état. La liste ci-dessous dit ce
            qui manque.
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {points.map((point) => (
            <li
              key={point.libelle}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border-2 border-k-ink/15 px-3 py-2 text-sm"
            >
              <span aria-hidden>{point.ok ? "✅" : "⛔"}</span>
              <span className="font-bold text-k-ink">{point.libelle}</span>
              {!point.ok && (
                <span className="text-zinc-500">{point.manque}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-1">Lancer, clôturer, supprimer</h2>
        <p className="mb-3 mt-2 text-sm text-zinc-500">
          Ces trois gestes vivent ensemble au tableau de bord, et ils y restent :
          le lancement fige la configuration <strong>pour de bon</strong>, la
          clôture est tout aussi définitive, et une saison lancée ne se supprime
          plus. On ne les propose pas depuis un écran de réglages, où l&apos;on
          vient corriger.
        </p>
        <Link
          href="/dashboard/progression"
          className="inline-block rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
        >
          Aller lancer la saison
        </Link>
      </Card>
    </div>
  );
}
