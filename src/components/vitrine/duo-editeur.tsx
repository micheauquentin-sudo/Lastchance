"use client";

import { useState } from "react";

import { setDuoOptions, setDuoSuggestion } from "@/actions/duo";
import { DUO_OPTIONS_MAX, type DuoOptionsAdminView } from "@/lib/duo";
import { useActionForm } from "@/lib/use-action-form";
import { DUO_OPTIONS_MIN_ECRAN } from "@/lib/validations/duo";
import type { VitrineCarteView } from "@/lib/vitrine";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Label } from "@/components/ui/input";

/**
 * DUO MIROIR (L17) — l'écran où le commerçant compose son plateau.
 *
 * ── CE QU'IL RÈGLE, ET CE QU'IL NE VOIT PAS ──
 *
 * Trois à six fiches, plus une proposition facultative. Et RIEN D'AUTRE : ni
 * manche en cours, ni choix, ni accord. `duo_options_state` ne rend que le
 * plateau, et ce n'est pas une limite technique — le commerçant configure un
 * jeu, il ne regarde pas jouer ses clients par-dessus leur épaule.
 *
 * ── L'ORDRE DE LA LISTE EST L'ORDRE DU PLATEAU ──
 *
 * Les cases sont posées dans l'ordre du catalogue (carte, rubrique, fiche), et
 * un navigateur poste les champs cochés DANS L'ORDRE DU DOCUMENT :
 * `set_duo_options` écrit `ordre` = position dans le tableau reçu. Il n'y a donc
 * aucun champ caché à tenir d'accord avec l'affichage — c'est-à-dire aucune
 * possibilité qu'ils se contredisent. Réordonner la carte réordonne le plateau.
 *
 * ── DEUX FORMULAIRES, ET NON UN SEUL À DEUX BOUTONS ──
 *
 * Le plateau et la proposition sont deux écritures distinctes en base
 * (`set_duo_options`, `set_duo_suggestion`), deux lignes de journal distinctes,
 * et deux gestes que le commerçant ne fait pas au même moment. Les réunir aurait
 * fait repartir six identifiants de fiches à chaque changement de proposition.
 *
 * ── LES BORNES SONT DÉRIVÉES, JAMAIS RECOPIÉES ──
 *
 * `DUO_OPTIONS_MIN_ECRAN` (3) et `DUO_OPTIONS_MAX` (6) viennent des mêmes
 * constantes que le schéma qui refuse. Le bouton grisé EXPLIQUE, il ne garde
 * pas : la garde est le schéma, puis les `raise` de la base.
 */

/** Une fiche du catalogue, aplatie avec son chemin de lecture. */
interface FicheChoisissable {
  id: string;
  nom: string;
  /** « Carte du soir · Entrées » — pour distinguer deux fiches homonymes. */
  chemin: string;
}

/**
 * Le catalogue à plat, dans l'ordre où il est rendu.
 *
 * Les cartes DÉSACTIVÉES sont gardées : le contexte du dashboard rend « TOUTES
 * les cartes, inactives comprises », et une fiche épinglée sur une carte
 * momentanément coupée reste parfaitement jouable — `duo_options` ne s'intéresse
 * pas plus à l'état de la carte qu'à la disponibilité du jour, la question posée
 * au joueur étant « que t'offrirais-je », pas « qu'est-ce qu'il reste en
 * cuisine ». La masquer ici aurait fait disparaître une case cochée sans dire
 * pourquoi.
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
      <h2>Duo Miroir</h2>
      <p className="mb-5 mt-2 text-sm text-zinc-500">
        Deux clients choisissent chacun, sans se voir, ce qu&apos;ils offriraient
        à l&apos;autre — puis les deux choix se révèlent en même temps. Choisissez
        les {DUO_OPTIONS_MIN_ECRAN} à {DUO_OPTIONS_MAX} fiches du plateau, et
        éventuellement ce que la maison proposera après la révélation.
      </p>

      {fiches.length === 0 ? (
        <p className="text-sm font-semibold text-k-body">
          Composez d&apos;abord vos cartes&nbsp;: le plateau se choisit parmi vos
          fiches.
        </p>
      ) : (
        <div className="space-y-6">
          <FormulairePlateau
            fiches={fiches}
            epinglees={plateau.options.map((option) => option.item_id)}
            peutEditer={peutEditer}
          />
          <FormulaireSuggestion
            fiches={fiches}
            suggestion={plateau.suggestion?.item_id ?? ""}
            peutEditer={peutEditer}
          />
        </div>
      )}
    </Card>
  );
}

/**
 * LE PLATEAU — des cases à cocher sur les fiches existantes.
 *
 * Cases CONTRÔLÉES, et c'est ce qui permet de dire le compte à voix haute
 * pendant la sélection. Une liste non contrôlée aurait laissé le commerçant
 * cocher huit fiches et apprendre le refus après l'aller-retour — sur un écran
 * où la borne est la seule règle qu'il ait à connaître.
 */
function FormulairePlateau({
  fiches,
  epinglees,
  peutEditer,
}: {
  fiches: FicheChoisissable[];
  epinglees: string[];
  peutEditer: boolean;
}) {
  const [coches, setCoches] = useState<string[]>(epinglees);
  const enregistrer = useActionForm(setDuoOptions, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  const basculer = (id: string, actif: boolean) => {
    setCoches((precedents) =>
      actif
        ? precedents.includes(id)
          ? precedents
          : [...precedents, id]
        : precedents.filter((autre) => autre !== id),
    );
  };

  const compte = coches.length;
  const dansLesBornes =
    compte >= DUO_OPTIONS_MIN_ECRAN && compte <= DUO_OPTIONS_MAX;
  const etat = enregistrer.state;

  return (
    <form onSubmit={enregistrer.onSubmit}>
      <fieldset disabled={!peutEditer} className="border-0 p-0">
        {/* Une LÉGENDE et non un titre libre : les cases forment un groupe, et
            un lecteur d'écran annonce la question avant chaque fiche. */}
        <legend className="mb-2 text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Les fiches du plateau
        </legend>

        <ul className="max-h-80 space-y-1 overflow-y-auto rounded-xl border-2 border-k-ink/15 p-2">
          {fiches.map((fiche) => (
            <li key={fiche.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-k-yellow/20">
                <input
                  type="checkbox"
                  name="item_ids"
                  value={fiche.id}
                  checked={coches.includes(fiche.id)}
                  onChange={(e) => basculer(fiche.id, e.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-k-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-k-ink">
                    {fiche.nom}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {fiche.chemin}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-2 text-sm text-k-body" aria-live="polite">
          {compte} fiche{compte > 1 ? "s" : ""} choisie{compte > 1 ? "s" : ""}
          {dansLesBornes
            ? "."
            : ` — il en faut entre ${DUO_OPTIONS_MIN_ECRAN} et ${DUO_OPTIONS_MAX}.`}
        </p>

        {/* DEUX CANAUX, ET ILS NE DISENT PAS LA MÊME CHOSE. `{ ok: false }` est
            une saisie à corriger (le compte, un doublon) et son message vient du
            schéma ; `selection-refusee` est un `{ ok: true }` — la base a
            répondu, et ce qu'elle refuse est une fiche qui n'existe plus depuis
            que cet écran a été peint. Le second appelle un rafraîchissement, pas
            une correction, et le lui dire en « une erreur est survenue »
            l'enverrait chercher une panne qui n'existe pas. */}
        {etat && !etat.ok ? <FieldError message={etat.error} /> : null}
        {etat && etat.ok && etat.data.etat === "selection-refusee" ? (
          <FieldError message="Une des fiches choisies n’est plus sur votre carte. Rafraîchissez la page, puis recomposez le plateau." />
        ) : null}
        {etat && etat.ok && etat.data.etat === "enregistre" ? (
          <p className="mt-2 text-sm font-semibold text-k-body" role="status">
            Plateau enregistré&nbsp;: {etat.data.options} fiche
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
        Elle s&apos;affiche APRÈS la révélation, jamais pendant le choix. Elle n&apos;a
        pas besoin d&apos;être sur le plateau&nbsp;: c&apos;est même le cas le plus
        intéressant — ce à quoi aucun des deux n&apos;avait pensé.
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
