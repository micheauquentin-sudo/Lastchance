"use client";

import { useId, useState } from "react";

import { setDuoOptions, setDuoSuggestion } from "@/actions/duo";
import { DUO_OPTIONS_MAX, type DuoOptionsAdminView } from "@/lib/duo";
import { useActionForm } from "@/lib/use-action-form";
import { DUO_LIBELLE_MAX, DUO_OPTIONS_MIN_ECRAN } from "@/lib/validations/duo";
import type { VitrineCarteView } from "@/lib/vitrine";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Label } from "@/components/ui/input";

/**
 * DUO MIROIR (L17) — l'écran où le commerçant compose son plateau.
 *
 * ── IL NE VIT PLUS DANS LA VITRINE (DUO-3b) ──
 *
 * Il est monté par `/dashboard/salons/duo`, sous le droit `duo`. Il était servi
 * par `/dashboard/vitrine` derrière le droit `vitrine`, ce qui verrouillait
 * hors de ses propres réglages le commerçant qui achète le jeu seul depuis
 * DUO-2. Le composant lui-même n'a pas d'opinion là-dessus : il ne lit ni
 * session ni droit, et sa seule dépendance à la carte est la liste de fiches
 * qu'on lui passe — éventuellement vide.
 *
 * ── UNE PLACE EST SOIT UNE FICHE, SOIT UN TEXTE (DUO-1) ──
 *
 * C'est la contrainte `duo_options_origine_exclusive`, rendue telle quelle à
 * l'écran : chaque ligne du plateau porte UN choix d'origine, et le champ qui
 * suit dépend de lui. Un formulaire à deux colonnes (« cochez des fiches » d'un
 * côté, « écrivez des propositions » de l'autre) aurait laissé croire à deux
 * listes qui s'ajoutent, alors que la base n'a qu'un plateau de six places.
 *
 * ── SANS CARTE, L'ÉCRAN NE MONTRE PAS UNE LISTE VIDE ──
 *
 * Un commerçant qui n'a pas la Vitrine n'a aucune fiche : le sélecteur
 * d'origine disparaît, et chaque place est simplement un champ de texte. Il
 * lisait avant « Composez d'abord vos cartes », c'est-à-dire une consigne
 * impossible à suivre pour lui.
 *
 * ── LES BORNES SONT DÉRIVÉES, JAMAIS RECOPIÉES ──
 *
 * `DUO_OPTIONS_MIN_ECRAN` (3), `DUO_OPTIONS_MAX` (6) et `DUO_LIBELLE_MAX` (120)
 * viennent des mêmes constantes que le schéma qui refuse. Le bouton grisé
 * EXPLIQUE, il ne garde pas : la garde est le schéma, puis les `check` de la
 * base.
 */

/** Une fiche du catalogue, aplatie avec son chemin de lecture. */
interface FicheChoisissable {
  id: string;
  nom: string;
  /** « Carte du soir · Entrées » — pour distinguer deux fiches homonymes. */
  chemin: string;
}

/**
 * UNE PLACE EN COURS D'ÉDITION.
 *
 * `cle` n'est PAS l'identifiant de la place en base : c'est une clé de rendu,
 * qui doit survivre au fait qu'une place n'ait encore aucune identité (une
 * ligne neuve) et au fait que deux places vides se ressemblent. La prendre sur
 * l'index aurait fait remonter le texte d'une ligne dans celle du dessus à
 * chaque suppression.
 */
type PlaceEdition =
  | { cle: string; origine: "fiche"; itemId: string }
  | { cle: string; origine: "libelle"; texte: string };

/**
 * Le catalogue à plat, dans l'ordre où il est rendu.
 *
 * Les cartes DÉSACTIVÉES sont gardées : le contexte du dashboard rend « TOUTES
 * les cartes, inactives comprises », et une fiche épinglée sur une carte
 * momentanément coupée reste parfaitement jouable — `duo_options` ne s'intéresse
 * pas plus à l'état de la carte qu'à la disponibilité du jour, la question posée
 * au joueur étant « que t'offrirais-je », pas « qu'est-ce qu'il reste en
 * cuisine ». La masquer ici aurait fait disparaître une place composée sans
 * dire pourquoi.
 */
function aplatirFiches(cartes: VitrineCarteView[]): FicheChoisissable[] {
  const sortie: FicheChoisissable[] = [];
  for (const carte of cartes) {
    for (const rubrique of carte.categories) {
      for (const fiche of rubrique.fiches) {
        sortie.push({
          id: fiche.id,
          nom: fiche.nom,
          chemin: `${carte.nom} · ${rubrique.nom}`,
        });
      }
    }
  }
  return sortie;
}

let compteurCle = 0;
function nouvelleCle(): string {
  compteurCle += 1;
  return `place-${compteurCle}`;
}

/**
 * LE PLATEAU ENREGISTRÉ, RENDU ÉDITABLE.
 *
 * Une option venue de la base porte `item_id` (une fiche) OU seulement son
 * `nom` (un libellé saisi) — c'est ce que `duo_options_json` sert depuis DUO-1.
 * Un plateau vide part sur le PLANCHER de l'écran en places de texte : trois
 * champs vides disent quoi faire, là où un écran sans aucune ligne oblige à
 * deviner qu'il existe un bouton « ajouter ».
 */
function placesInitiales(plateau: DuoOptionsAdminView): PlaceEdition[] {
  if (plateau.options.length === 0) {
    return Array.from({ length: DUO_OPTIONS_MIN_ECRAN }, () => ({
      cle: nouvelleCle(),
      origine: "libelle" as const,
      texte: "",
    }));
  }
  return plateau.options.map((option) =>
    option.item_id
      ? {
          cle: nouvelleCle(),
          origine: "fiche" as const,
          itemId: option.item_id,
        }
      : { cle: nouvelleCle(), origine: "libelle" as const, texte: option.nom },
  );
}

export function DuoEditeur({
  cartes,
  plateau,
  peutEditer,
}: {
  cartes: VitrineCarteView[];
  plateau: DuoOptionsAdminView;
  /** Même garde d'affichage que le reste de l'écran : préparer sans exposer. */
  peutEditer: boolean;
}) {
  const fiches = aplatirFiches(cartes);

  return (
    <Card>
      <h2>Le plateau du Duo</h2>
      <p className="mb-5 mt-2 text-sm text-zinc-500">
        Deux clients choisissent chacun, sans se voir, ce qu&apos;ils
        offriraient à l&apos;autre — puis les deux choix se révèlent en même
        temps. Composez les {DUO_OPTIONS_MIN_ECRAN} à {DUO_OPTIONS_MAX}{" "}
        propositions du plateau
        {fiches.length > 0
          ? " — en les écrivant, ou en les prenant dans votre carte."
          : "."}
      </p>

      <div className="space-y-6">
        <FormulairePlateau
          fiches={fiches}
          initiales={placesInitiales(plateau)}
          peutEditer={peutEditer}
        />
        {/* LA PROPOSITION DE LA MAISON EST UNE FICHE, et rien d'autre :
            `set_duo_suggestion` prend un `item_id`. Sans carte, il n'y a donc
            rien à proposer — et un sélecteur vide inviterait à un geste
            impossible. */}
        {fiches.length > 0 ? (
          <FormulaireSuggestion
            fiches={fiches}
            suggestion={plateau.suggestion?.item_id ?? ""}
            peutEditer={peutEditer}
          />
        ) : null}
      </div>
    </Card>
  );
}

/**
 * LE PLATEAU — une ligne par place, dans l'ordre du jeu.
 *
 * Lignes CONTRÔLÉES, et c'est ce qui permet de dire le compte à voix haute
 * pendant la composition. Une liste non contrôlée aurait laissé le commerçant
 * écrire huit propositions et apprendre le refus après l'aller-retour.
 *
 * ── LE CHAMP POSTÉ EST CACHÉ, ET IL NE PEUT PAS DIVERGER DE L'AFFICHAGE ──
 *
 * Chaque ligne rend son `<input type="hidden" name="places">` DANS LE MÊME
 * `map` que ses contrôles visibles, à partir de la même valeur d'état. Il n'y a
 * pas deux sources à tenir d'accord : il y en a une, lue deux fois. Et un
 * navigateur poste les champs dans l'ordre du document, donc l'ordre des lignes
 * à l'écran EST l'ordre des places en base.
 */
function FormulairePlateau({
  fiches,
  initiales,
  peutEditer,
}: {
  fiches: FicheChoisissable[];
  initiales: PlaceEdition[];
  peutEditer: boolean;
}) {
  const [places, setPlaces] = useState<PlaceEdition[]>(initiales);
  const enregistrer = useActionForm(setDuoOptions, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const idBase = useId();

  const modifier = (cle: string, suite: PlaceEdition) =>
    setPlaces((precedentes) =>
      precedentes.map((place) => (place.cle === cle ? suite : place)),
    );
  const retirer = (cle: string) =>
    setPlaces((precedentes) => precedentes.filter((place) => place.cle !== cle));
  const ajouter = () =>
    setPlaces((precedentes) => [
      ...precedentes,
      { cle: nouvelleCle(), origine: "libelle", texte: "" },
    ]);

  const compte = places.length;
  const dansLesBornes =
    compte >= DUO_OPTIONS_MIN_ECRAN && compte <= DUO_OPTIONS_MAX;
  const etat = enregistrer.state;

  return (
    <form onSubmit={enregistrer.onSubmit}>
      <fieldset disabled={!peutEditer} className="border-0 p-0">
        {/* Une LÉGENDE et non un titre libre : les lignes forment un groupe, et
            un lecteur d'écran annonce la question avant chaque place. */}
        <legend className="mb-2 text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Les propositions du plateau
        </legend>

        <ul className="space-y-3">
          {places.map((place, index) => (
            <LignePlace
              key={place.cle}
              place={place}
              rang={index + 1}
              idBase={idBase}
              fiches={fiches}
              // On ne descend jamais sous le plancher par le bouton : le refus
              // se lirait alors dans le compte, après coup, sur une ligne que
              // le commerçant a déjà vu disparaître.
              retirable={compte > DUO_OPTIONS_MIN_ECRAN}
              onModifier={modifier}
              onRetirer={retirer}
            />
          ))}
        </ul>

        {compte < DUO_OPTIONS_MAX ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={ajouter}
          >
            Ajouter une proposition
          </Button>
        ) : null}

        <p className="mt-2 text-sm text-k-body" aria-live="polite">
          {compte} proposition{compte > 1 ? "s" : ""}
          {dansLesBornes
            ? "."
            : ` — il en faut entre ${DUO_OPTIONS_MIN_ECRAN} et ${DUO_OPTIONS_MAX}.`}
        </p>

        {/* DEUX CANAUX, ET ILS NE DISENT PAS LA MÊME CHOSE. `{ ok: false }` est
            une saisie à corriger (le compte, un doublon, un libellé refusé) et
            son message vient du schéma ; `selection-refusee` est un
            `{ ok: true }` — la base a répondu, et ce qu'elle refuse est une
            fiche qui n'existe plus depuis que cet écran a été peint. Le second
            appelle un rafraîchissement, pas une correction, et le lui dire en
            « une erreur est survenue » l'enverrait chercher une panne qui
            n'existe pas. */}
        {etat && !etat.ok ? <FieldError message={etat.error} /> : null}
        {etat && etat.ok && etat.data.etat === "selection-refusee" ? (
          <FieldError message="Une des fiches choisies n’est plus sur votre carte. Rafraîchissez la page, puis recomposez le plateau." />
        ) : null}
        {etat && etat.ok && etat.data.etat === "enregistre" ? (
          <p className="mt-2 text-sm font-semibold text-k-body" role="status">
            Plateau enregistré&nbsp;: {etat.data.options} proposition
            {etat.data.options > 1 ? "s" : ""}.
          </p>
        ) : null}

        {peutEditer ? (
          <Button
            type="submit"
            className="mt-3"
            disabled={enregistrer.pending || !dansLesBornes}
          >
            {enregistrer.pending ? "Enregistrement…" : "Enregistrer le plateau"}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}

/**
 * UNE PLACE — son origine, sa valeur, et le champ qui part réellement.
 *
 * Le sélecteur d'origine n'existe QUE s'il y a des fiches : sans carte, il
 * n'aurait qu'une option, et un choix à une possibilité est un obstacle qui
 * ressemble à un réglage.
 */
function LignePlace({
  place,
  rang,
  idBase,
  fiches,
  retirable,
  onModifier,
  onRetirer,
}: {
  place: PlaceEdition;
  rang: number;
  idBase: string;
  fiches: FicheChoisissable[];
  retirable: boolean;
  onModifier: (cle: string, suite: PlaceEdition) => void;
  onRetirer: (cle: string) => void;
}) {
  const idChamp = `${idBase}-${place.cle}`;
  // LA VALEUR POSTÉE, dérivée de l'état affiché juste à côté. Le préfixe dit
  // l'origine, que `lirePlaces` (src/actions/duo.ts) relit sur le PREMIER
  // deux-points — un libellé qui en contient traverse donc intact.
  const valeurPostee =
    place.origine === "fiche"
      ? `fiche:${place.itemId}`
      : `libelle:${place.texte}`;

  return (
    <li className="rounded-xl border-2 border-k-ink/15 p-3">
      <input type="hidden" name="places" value={valeurPostee} />

      <Label htmlFor={idChamp}>Proposition {rang}</Label>

      {fiches.length > 0 ? (
        <select
          id={place.origine === "fiche" ? idChamp : undefined}
          value={place.origine === "fiche" ? place.itemId : ""}
          onChange={(e) =>
            onModifier(
              place.cle,
              e.target.value === ""
                ? { cle: place.cle, origine: "libelle", texte: "" }
                : { cle: place.cle, origine: "fiche", itemId: e.target.value }
            )
          }
          aria-label={`Origine de la proposition ${rang}`}
          className="mb-2 w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:text-zinc-400"
        >
          <option value="">Une proposition que j&apos;écris</option>
          {fiches.map((fiche) => (
            <option key={fiche.id} value={fiche.id}>
              {fiche.nom} — {fiche.chemin}
            </option>
          ))}
        </select>
      ) : null}

      {place.origine === "libelle" ? (
        <input
          id={idChamp}
          type="text"
          value={place.texte}
          maxLength={DUO_LIBELLE_MAX}
          placeholder="Un café gourmand"
          onChange={(e) =>
            onModifier(place.cle, {
              cle: place.cle,
              origine: "libelle",
              texte: e.target.value,
            })
          }
          className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:text-zinc-400"
        />
      ) : null}

      {retirable ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          onClick={() => onRetirer(place.cle)}
        >
          Retirer la proposition {rang}
        </Button>
      ) : null}
    </li>
  );
}

/**
 * LA PROPOSITION DE LA MAISON — facultative, et retirable.
 *
 * L'option vide poste `item_id=""`, que l'action lit comme un RETRAIT : c'est la
 * forme qu'un `<select>` avec une option « aucune » produit naturellement, et
 * c'est exactement ce que `setDuoSuggestion` attend. Aucune seconde action
 * « effacer » n'est donc nécessaire — le journal porte un seul verbe pour un
 * seul geste.
 *
 * Elle n'est JAMAIS montrée pendant le choix : `duo_state` ne la calcule que
 * dans la branche `revelee`. La phrase ci-dessous le dit au commerçant, parce
 * qu'une proposition affichée trop tôt surlignerait une réponse sur le plateau
 * — et qu'il n'a aucun moyen de le vérifier depuis cet écran.
 */
function FormulaireSuggestion({
  fiches,
  suggestion,
  peutEditer,
}: {
  fiches: FicheChoisissable[];
  suggestion: string;
  peutEditer: boolean;
}) {
  const enregistrer = useActionForm(setDuoSuggestion, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const idSelect = "duo-suggestion";
  const etat = enregistrer.state;

  return (
    <form onSubmit={enregistrer.onSubmit}>
      <Label htmlFor={idSelect}>Suggestion de la maison (facultative)</Label>
      <select
        id={idSelect}
        name="item_id"
        key={`duo-suggestion-${suggestion}`}
        defaultValue={suggestion}
        disabled={!peutEditer}
        aria-describedby={`${idSelect}-aide`}
        className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:text-zinc-400"
      >
        <option value="">Aucune</option>
        {fiches.map((fiche) => (
          <option key={fiche.id} value={fiche.id}>
            {fiche.nom} — {fiche.chemin}
          </option>
        ))}
      </select>
      <p id={`${idSelect}-aide`} className="mt-1.5 text-xs text-zinc-500">
        Elle s&apos;affiche APRÈS la révélation, jamais pendant le choix. Elle
        n&apos;a pas besoin d&apos;être sur le plateau&nbsp;: c&apos;est même le
        cas le plus intéressant — ce à quoi aucun des deux n&apos;avait pensé.
      </p>

      {etat && !etat.ok ? <FieldError message={etat.error} /> : null}
      {etat && etat.ok && etat.data.etat === "fiche-inconnue" ? (
        <FieldError message="Cette fiche n’est plus sur votre carte. Rafraîchissez la page, puis choisissez-en une autre." />
      ) : null}
      {etat && etat.ok && etat.data.etat === "enregistre" ? (
        <p className="mt-2 text-sm font-semibold text-k-body" role="status">
          {etat.data.suggestion
            ? "Proposition enregistrée."
            : "Proposition retirée."}
        </p>
      ) : null}

      {peutEditer ? (
        <Button
          type="submit"
          variant="secondary"
          className="mt-3"
          disabled={enregistrer.pending}
        >
          {enregistrer.pending ? "Enregistrement…" : "Enregistrer la suggestion"}
        </Button>
      ) : null}
    </form>
  );
}
