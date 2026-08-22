"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useActionForm } from "@/lib/use-action-form";
import { VITRINE_CARTE_NOM_MAX } from "@/lib/vitrine";
import { importVitrineCarte } from "@/actions/vitrine";
import { Button } from "@/components/ui/button";
import {
  EXTENSIONS_ACCEPTEES,
  extraireTexteDeFichier,
  type SourceImport,
} from "@/components/vitrine/import-fichier";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  analyserCarte,
  compterImport,
  construireImport,
  rubriquesHomonymes,
  RUBRIQUE_PAR_DEFAUT,
  VITRINE_IMPORT_FICHES_MAX,
  VITRINE_IMPORT_RUBRIQUES_MAX,
  type LigneImport,
  type TypeLigne,
} from "@/components/vitrine/import-parse";

/**
 * L'IMPORT ASSISTÉ — coller sa carte, la RELIRE, puis l'envoyer.
 *
 * ── LA REVUE EST L'ÉCRAN, PAS UNE ÉTAPE FACULTATIVE ──
 *
 * Il n'existe aucun chemin d'ici au serveur qui ne passe pas par l'aperçu :
 * « Analyser » ne fait qu'afficher, et seul le bouton « Importer », qui n'existe
 * QUE dans l'aperçu, envoie quoi que ce soit. C'est la contrepartie assumée du
 * parseur heuristique (`import-parse.ts`) : il se trompe, on le sait, et le
 * commerçant voit exactement ce qui partira — ligne par ligne, re-classable et
 * corrigeable — avant que sa carte publique n'existe.
 *
 * Le contraire — un import « intelligent » qui crée directement — aurait fait
 * découvrir les erreurs APRÈS, sur trente fiches déjà en base, à défaire une
 * par une.
 *
 * ── CE QUE L'IMPORT NE POSE PAS ──
 *
 * Ni badges, ni allergènes, ni disponibilité. Ils ne se devinent pas d'une
 * ligne de texte, et un allergène deviné est un risque, pas une commodité.
 * L'aperçu le DIT plutôt que de le taire : ils se posent ensuite, fiche par
 * fiche, dans l'éditeur juste en dessous.
 *
 * ── UN SEUL CHAMP PART : `import` ──
 *
 * Motif de `wheel-settings.tsx` : l'état de l'écran est sérialisé en JSON dans
 * un champ caché au moment de la soumission. Trente lignes éditables ne peuvent
 * pas être trente triplets de champs nommés — l'action aurait à réassembler un
 * ordre depuis des index de formulaire, ce qui est précisément ce que le JSON
 * évite.
 */
export function ImportCarte({ peutEditer }: { peutEditer: boolean }) {
  const [texte, setTexte] = useState("");
  /** Ce que la lecture d'un fichier a donné — succès compté ou refus expliqué. */
  const [messageFichier, setMessageFichier] = useState<string | null>(null);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [lignes, setLignes] = useState<LigneImport[] | null>(null);
  const [nomCarte, setNomCarte] = useState("");
  const [messageSucces, setMessageSucces] = useState<string | null>(null);

  /**
   * ── LES DÉRIVÉS SONT MÉMORISÉS, ET CE N'EST PAS DE LA MICRO-OPTIMISATION ──
   *
   * `compterImport`, `rubriquesHomonymes` et la charge JSON traversent CHACUN
   * la liste entière via `construireImport` : écrits dans le corps du rendu,
   * c'était trois parcours de trente lignes à chaque frappe dans n'importe quel
   * champ de l'aperçu. Le coût n'est pas le vrai problème — le problème est que
   * ces trois valeurs sont des IDENTITÉS neuves à chaque rendu, `charge` en
   * tête, qui repose le `value` du champ caché et fait battre l'arbre. Sous
   * charge (suite E2E complète, WebKit), un `<select>` de l'aperçu ne tenait
   * jamais deux frames de suite avec la même boîte, et Playwright l'a attendu
   * 90 s sans jamais le juger « stable ».
   *
   * Les dérivés ne changent donc que quand le nom de carte ou les lignes
   * changent — c'est-à-dire quand les comptes affichés changent vraiment, ce
   * qui vaut aussi pour la zone `aria-live` : elle ne réannonce plus à chaque
   * rendu, seulement quand le verdict bouge.
   */
  const comptes = useMemo(
    () => compterImport(nomCarte, lignes ?? []),
    [nomCarte, lignes],
  );
  const tropDeRubriques = comptes.rubriques > VITRINE_IMPORT_RUBRIQUES_MAX;
  const tropDeFiches = comptes.fiches > VITRINE_IMPORT_FICHES_MAX;
  const rienAImporter = comptes.fiches === 0 && comptes.rubriques === 0;
  const homonymes = useMemo(
    () => rubriquesHomonymes(nomCarte, lignes ?? []),
    [nomCarte, lignes],
  );

  const { state, pending, onSubmit } = useActionForm(importVitrineCarte, {
    networkError: "Import impossible, réessayez.",
    onSuccess: (data) => {
      // LE MESSAGE VIENT DU SERVEUR. Les comptes de l'aperçu sont ceux qui sont
      // PARTIS ; ceux-là sont ceux qui ont été CRÉÉS, et seule la RPC les
      // connaît. Les recomposer ici aurait fait afficher « 3 fiches » sur un
      // import que la base a dédoublonné à deux.
      setMessageSucces(data.message);
      // L'aperçu est CONSOMMÉ. Le laisser à l'écran après un import réussi
      // invite à recliquer « Importer », ce qui créerait la même carte deux
      // fois — et la seconde échouerait sur le nom déjà pris, en donnant
      // l'impression que le premier import a raté.
      setLignes(null);
      setTexte("");
      setNomCarte("");
    },
  });

  /**
   * STABLE D'UN RENDU À L'AUTRE — c'est la moitié du contrat de `LigneApercu`.
   *
   * Recréée à chaque rendu, cette fonction changeait la prop `onModifier` des
   * trente lignes, et le `memo` de `LigneApercu` n'aurait rien retenu : une
   * frappe dans un seul champ re-rendait toute la liste. La mise à jour ne lit
   * que l'état précédent, elle n'a donc aucune dépendance.
   */
  const modifierLigne = useCallback(
    (cle: string, champs: Partial<LigneImport>) => {
      setLignes((actuelles) =>
        (actuelles ?? []).map((l) => (l.cle === cle ? { ...l, ...champs } : l)),
      );
    },
    [],
  );

  /**
   * LE PARSE NE TOURNE QU'ICI, AU CLIC. Il pose un état ; le rendu ne le
   * rejoue jamais. Relancé dans le corps du rendu, il aurait rendu des lignes
   * NEUVES à chaque frappe — donc des `key` portant des objets neufs, donc des
   * champs remontés, et toute correction manuelle écrasée au caractère suivant.
   */
  /** Comment nommer la provenance du texte, une fois le fichier lu. */
  const LIBELLE_SOURCE: Record<SourceImport, string> = {
    texte: "fichier texte",
    csv: "fichier CSV",
    tableur: "feuille de calcul",
    pdf: "PDF",
  };

  /**
   * LE FICHIER NE PART NULLE PART. Il est lu dans ce navigateur, converti en
   * texte, et posé dans la zone ci-dessous — d'où il repart par le SEUL chemin
   * qui existait déjà : relecture ligne à ligne, puis import. Aucune écriture
   * n'est ajoutée, et rien n'atteint la base sans être passé sous les yeux du
   * commerçant.
   */
  const choisirFichier = async (
    evenement: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const fichier = evenement.target.files?.[0];
    // Vidé tout de suite : sans cela, rechoisir LE MÊME fichier après une
    // correction ne déclenche aucun `change`, et l'écran paraît figé.
    evenement.target.value = "";
    if (!fichier) return;

    setLectureEnCours(true);
    setMessageFichier(null);
    const resultat = await extraireTexteDeFichier(fichier);
    setLectureEnCours(false);

    if (!resultat.ok) {
      setMessageFichier(resultat.raison);
      return;
    }

    setTexte(resultat.texte);
    setMessageFichier(
      `${resultat.lignes} ligne${resultat.lignes > 1 ? "s" : ""} lue${
        resultat.lignes > 1 ? "s" : ""
      } depuis ce ${LIBELLE_SOURCE[resultat.source]}. Relisez-les ci-dessous, corrigez si besoin, puis analysez.`,
    );
  };

  const analyser = () => {
    const trouvees = analyserCarte(texte);
    setLignes(trouvees);
    setMessageSucces(null);
    if (!nomCarte.trim()) setNomCarte("Ma carte");
  };

  const charge = useMemo(
    () => JSON.stringify(construireImport(nomCarte, lignes ?? [])),
    [nomCarte, lignes],
  );

  return (
    <Card>
      <h2>Importer une carte existante</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Envoyez votre fichier — PDF, tableur, CSV — ou collez votre carte telle
        quelle. Rien n&apos;est créé tout de suite : vous relisez et corrigez le
        classement avant d&apos;importer.
      </p>

      {messageSucces ? (
        <p
          role="status"
          className="mb-4 rounded-xl border-2 border-green-700/30 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700"
        >
          {messageSucces}
        </p>
      ) : null}

      {!peutEditer ? (
        <p className="text-sm text-zinc-500">
          L&apos;import est réservé aux personnes qui peuvent modifier la
          vitrine.
        </p>
      ) : lignes === null ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="vitrine-import-fichier">
              Votre carte, en fichier
            </Label>
            <input
              id="vitrine-import-fichier"
              type="file"
              accept={EXTENSIONS_ACCEPTEES}
              onChange={choisirFichier}
              disabled={lectureEnCours}
              className="block w-full text-sm text-k-ink file:mr-3 file:rounded-xl file:border-2 file:border-k-ink file:bg-k-yellow file:px-3.5 file:py-2 file:text-sm file:font-bold file:text-k-ink hover:file:bg-k-yellow/80 disabled:opacity-60"
              aria-describedby="vitrine-import-fichier-aide"
            />
            <p
              id="vitrine-import-fichier-aide"
              className="mt-1.5 text-xs text-zinc-500"
            >
              .pdf, .csv, .tsv, .xlsx ou .txt — le fichier est lu sur votre
              appareil et ne quitte jamais votre navigateur. Une photo ou un PDF
              scanné n&apos;ont pas de texte à lire.
            </p>
            {lectureEnCours ? (
              <p className="mt-1.5 text-xs font-semibold text-zinc-500">
                Lecture du fichier…
              </p>
            ) : null}
            {messageFichier ? (
              <p
                role="status"
                className="mt-1.5 text-xs font-semibold text-k-ink"
              >
                {messageFichier}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="vitrine-import-texte">Votre carte, en texte</Label>
            <textarea
              id="vitrine-import-texte"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={10}
              className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 font-mono text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
              placeholder={
                "ENTRÉES\nTartare de bœuf — câpres et cornichons — 14 €\nVelouté de potiron 8,50\n\nPlats :\nRisotto aux champignons — 18 €"
              }
              aria-describedby="vitrine-import-aide"
            />
            <p id="vitrine-import-aide" className="mt-1.5 text-xs text-zinc-500">
              Une ligne par plat. Les titres de rubrique se reconnaissent à leur
              brièveté, aux majuscules ou au deux-points ; les prix, au montant
              en fin de ligne. Le classement se corrige juste après.
            </p>
          </div>
          <Button type="button" onClick={analyser} disabled={!texte.trim()}>
            Analyser ma carte
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {/* LE SEUL CHAMP ENVOYÉ. Les lignes de l'aperçu sont de l'état React,
              pas des champs nommés : c'est ce JSON qui fait foi. */}
          <input type="hidden" name="import" value={charge} />

          <div className="max-w-sm">
            <Label htmlFor="vitrine-import-nom">Nom de la carte</Label>
            <Input
              id="vitrine-import-nom"
              value={nomCarte}
              onChange={(e) => setNomCarte(e.target.value)}
              maxLength={VITRINE_CARTE_NOM_MAX}
              required
              placeholder="Carte du midi"
            />
          </div>

          <div
            id="vitrine-import-comptes"
            className="rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2 text-sm"
            aria-live="polite"
          >
            <span
              className={
                tropDeRubriques ? "font-black text-red-600" : "font-bold text-k-ink"
              }
            >
              {comptes.rubriques} rubrique{comptes.rubriques > 1 ? "s" : ""}
            </span>{" "}
            <span className="text-zinc-500">
              sur {VITRINE_IMPORT_RUBRIQUES_MAX}
            </span>{" "}
            ·{" "}
            <span
              className={
                tropDeFiches ? "font-black text-red-600" : "font-bold text-k-ink"
              }
            >
              {comptes.fiches} fiche{comptes.fiches > 1 ? "s" : ""}
            </span>{" "}
            <span className="text-zinc-500">sur {VITRINE_IMPORT_FICHES_MAX}</span>
          </div>

          <p className="text-sm text-zinc-500">
            Les badges, les allergènes et la disponibilité ne sont{" "}
            <strong className="font-bold text-k-ink">pas devinés</strong> : ils
            ne se lisent pas d&apos;une ligne de texte et se posent fiche par
            fiche, dans l&apos;éditeur ci-dessous, une fois la carte importée.
          </p>

          <ul className="space-y-2">
            {lignes.map((ligne, index) => (
              <LigneApercu
                key={ligne.cle}
                ligne={ligne}
                numero={index + 1}
                onModifier={modifierLigne}
              />
            ))}
          </ul>

          {tropDeRubriques || tropDeFiches ? (
            <p role="alert" className="text-sm font-semibold text-red-600">
              Cet import dépasse les limites d&apos;une carte (
              {VITRINE_IMPORT_RUBRIQUES_MAX} rubriques,{" "}
              {VITRINE_IMPORT_FICHES_MAX} fiches). Passez des lignes à
              « Ignorer », ou importez le reste dans une seconde carte.
            </p>
          ) : null}

          {/* LE REFUS DES HOMONYMES EST DIT AVANT LE CLIC. Le schéma serveur
              les rejette, et l'import est limité à quelques tentatives par
              heure : le découvrir après coup coûte un jeton du seau pour rien. */}
          {homonymes.length > 0 ? (
            <p role="alert" className="text-sm font-semibold text-red-600">
              Deux rubriques portent le même nom ({homonymes.join(", ")}).
              Renommez-en une, ou passez-la à « Ignorer ».
            </p>
          ) : null}

          {comptes.rubriques > 0 &&
          lignes.every((l) => l.type !== "rubrique") ? (
            <p className="text-sm text-zinc-500">
              Aucune rubrique repérée : les fiches seront rangées dans une
              rubrique « {RUBRIQUE_PAR_DEFAUT} », que vous pourrez renommer.
            </p>
          ) : null}

          {state && !state.ok ? <FieldError message={state.error} /> : null}
          {state?.ok ? (
            <p className="text-sm font-semibold text-green-700">
              Import terminé.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={
                pending ||
                rienAImporter ||
                tropDeRubriques ||
                tropDeFiches ||
                homonymes.length > 0 ||
                !nomCarte.trim()
              }
            >
              {pending ? "Import…" : "Importer"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLignes(null)}
              disabled={pending}
            >
              Revenir au texte
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/**
 * UNE LIGNE DE L'APERÇU — son classement, et ce qui partira.
 *
 * Le classement est un `<select>` et non deux boutons : trois valeurs
 * mutuellement exclusives, sur trente lignes, tenues au clavier par une seule
 * tabulation. « Ignorer » est une valeur à part entière — une ligne qu'on ne
 * veut pas garde sa place à l'écran, grisée, plutôt que de disparaître : un
 * commerçant qui s'est trompé doit pouvoir revenir en arrière.
 *
 * ── `memo`, PARCE QUE LA LISTE EST LONGUE ET L'ÉTAT EN HAUT ──
 *
 * Les lignes vivent dans un seul `useState` du parent, et `modifierLigne` rend
 * un tableau neuf dont TOUS les éléments sauf un sont les mêmes objets. Sans
 * `memo`, une frappe dans le prix de la ligne 3 re-rendait les trente lignes,
 * reposant trente `value` de `<select>` et d'`<input>` — c'est ce battement
 * continu que Playwright voyait comme une boîte jamais stable. Avec `memo` et
 * un `onModifier` stable, seule la ligne réellement modifiée se re-rend.
 */
const LigneApercu = memo(function LigneApercu({
  ligne,
  numero,
  onModifier,
}: {
  ligne: LigneImport;
  numero: number;
  onModifier: (cle: string, champs: Partial<LigneImport>) => void;
}) {
  const ignoree = ligne.type === "ignorer";
  const fiche = ligne.type === "fiche";

  return (
    <li
      className={`rounded-xl border-2 border-k-ink/15 p-3 ${
        ignoree ? "bg-zinc-100 opacity-70" : "bg-white"
      }`}
    >
      <p className="mb-2 truncate text-xs text-zinc-500" title={ligne.brut}>
        Ligne {numero} — « {ligne.brut} »
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor={`import-type-${ligne.cle}`}
            className="mb-1 block text-xs font-bold text-k-body"
          >
            Classement
          </label>
          <select
            id={`import-type-${ligne.cle}`}
            value={ligne.type}
            onChange={(e) =>
              onModifier(ligne.cle, { type: e.target.value as TypeLigne })
            }
            className="rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-semibold text-k-ink"
          >
            <option value="rubrique">Rubrique</option>
            <option value="fiche">Fiche</option>
            <option value="ignorer">Ignorer</option>
          </select>
        </div>

        <div className="min-w-0 flex-1">
          <label
            htmlFor={`import-nom-${ligne.cle}`}
            className="mb-1 block text-xs font-bold text-k-body"
          >
            Nom
          </label>
          <Input
            id={`import-nom-${ligne.cle}`}
            value={ligne.nom}
            onChange={(e) => onModifier(ligne.cle, { nom: e.target.value })}
            disabled={ignoree}
          />
        </div>

        {fiche ? (
          <div className="w-28">
            <label
              htmlFor={`import-prix-${ligne.cle}`}
              className="mb-1 block text-xs font-bold text-k-body"
            >
              Prix
            </label>
            <Input
              id={`import-prix-${ligne.cle}`}
              value={ligne.prix}
              onChange={(e) => onModifier(ligne.cle, { prix: e.target.value })}
              placeholder="12 €"
            />
          </div>
        ) : null}
      </div>

      {fiche ? (
        <div className="mt-2">
          <label
            htmlFor={`import-description-${ligne.cle}`}
            className="mb-1 block text-xs font-bold text-k-body"
          >
            Description
          </label>
          <Input
            id={`import-description-${ligne.cle}`}
            value={ligne.description}
            onChange={(e) =>
              onModifier(ligne.cle, { description: e.target.value })
            }
            disabled={ignoree}
            placeholder="Facultative"
          />
        </div>
      ) : null}
    </li>
  );
});
