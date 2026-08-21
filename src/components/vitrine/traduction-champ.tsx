"use client";

import { useActionForm } from "@/lib/use-action-form";
import {
  VITRINE_TRADUCTION_TEXTE_MAX,
  type TraductionEtatView,
} from "@/lib/vitrine";
import {
  deleteVitrineTraduction,
  setVitrineTraduction,
} from "@/actions/vitrine";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * UN CHAMP TRADUISIBLE — le français à gauche, l'anglais à écrire à droite.
 *
 * ── LES TYPES SONT DÉRIVÉS, PAS REDÉCLARÉS ──
 *
 * `TraductionEtatView` est le seul nom importé du contrat serveur ; la cible et
 * le champ en sortent par indexation. Redéclarer ici une interface « champ »
 * aurait créé une seconde description de la même sortie de RPC, qui aurait
 * cessé de correspondre au premier champ ajouté en base sans que rien ne
 * rougisse — le défaut exact que `vitrine-parity.test.ts` garde ailleurs.
 */
type TraductionCible = TraductionEtatView["cibles"][number];
type TraductionChampView = TraductionCible["champs"][number];

/**
 * LES LIBELLÉS FRANÇAIS DES CHAMPS, mot pour mot ceux de l'éditeur.
 *
 * « Votre histoire » et « Horaires » sont les étiquettes de `ReglagesVitrine`,
 * « Description » celle de `FicheEditeur` : un commerçant qui traduit son
 * histoire doit lire ici le même mot que là où il l'a écrite, sinon il cherche
 * lequel des deux champs il a sous les yeux.
 *
 * Le repli sur le nom technique est délibérément VISIBLE : le jour où la base
 * ouvre un sixième champ traduisible, l'écran l'affiche — mal nommé, mais
 * présent et traduisible — plutôt que de le faire disparaître silencieusement.
 */
const LIBELLE_CHAMP: Record<string, string> = {
  accroche: "Accroche",
  histoire: "Votre histoire",
  horaires_texte: "Horaires",
  nom: "Nom",
  description: "Description",
};

/**
 * LES CHAMPS LONGS PRENNENT UN `<textarea>`, et la liste suit l'éditeur
 * français : histoire (1200), horaires (600, une ligne par jour) et description
 * de fiche (400) y sont déjà saisis en plusieurs lignes. Traduire un texte
 * multiligne dans un `<input>` d'une ligne rend les retours invisibles — or
 * les horaires les CONSERVENT à l'affichage public.
 */
const CHAMPS_LONGS = new Set(["histoire", "horaires_texte", "description"]);

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

const BADGE: Record<string, { texte: string; classe: string }> = {
  frais: {
    texte: "À jour",
    classe: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  },
  perime: {
    texte: "Le français a changé depuis",
    classe: "border-amber-600/40 bg-amber-50 text-amber-900",
  },
  absent: {
    texte: "Pas encore traduit",
    classe: "border-zinc-300 bg-zinc-100 text-zinc-600",
  },
};

export function TraductionChamp({
  cibleType,
  cibleId,
  libelleCible,
  version,
  champ,
  peutEditer,
}: {
  cibleType: TraductionCible["cibleType"];
  cibleId: string;
  /** Le nom FRANÇAIS de la cible — il désambiguïse l'étiquette du champ. */
  libelleCible: string;
  /**
   * LA VERSION VUE, et c'est tout ce qu'elle est.
   *
   * Elle est postée telle qu'elle a été CHARGÉE, jamais recalculée, jamais
   * incrémentée, jamais « rafraîchie » côté client : elle dit « voici la version
   * du français que j'avais sous les yeux en traduisant ». C'est le serveur qui
   * la compare à la version courante pour décider si la traduction naît fraîche
   * ou déjà périmée.
   *
   * La bouger d'un cran ici ferait déclarer à jour une traduction écrite sur un
   * français qui a changé entre-temps — c'est-à-dire gonfler la couverture avec
   * un anglais faux, exactement ce que la mesure existe pour empêcher.
   *
   * `string` et non `number` : c'est l'`updated_at` de la cible, un horodatage
   * que le client traverse sans jamais le lire.
   */
  version: string;
  champ: TraductionChampView;
  peutEditer: boolean;
}) {
  const enregistrer = useActionForm(setVitrineTraduction, {
    networkError: "Enregistrement impossible, réessayez.",
    // Sans rechargement, l'état (« Pas encore traduit ») et le compteur en tête
    // resteraient sur leur valeur d'avant : le commerçant ne verrait rien
    // bouger et recliquerait. Motif `ContenusEditeur`.
    reloadOnSuccess: true,
  });
  const retirer = useActionForm(deleteVitrineTraduction, {
    networkError: "Retrait impossible, réessayez.",
    reloadOnSuccess: true,
  });

  const badge = BADGE[champ.etat] ?? BADGE.absent;
  const libelleChamp = LIBELLE_CHAMP[champ.champ] ?? champ.champ;
  const idSaisie = `trad-${cibleType}-${cibleId}-${champ.champ}`;
  const long = CHAMPS_LONGS.has(champ.champ);
  const aUneTraduction = champ.texteTraduit !== null;

  /**
   * LA CLÉ DE REMONTAGE PORTE L'ÉTAT ET LE TEXTE. Après un retrait, la page est
   * rechargée et le champ doit repartir VIDE : un `defaultValue` seul laisserait
   * React réutiliser la valeur saisie. Même raison que `ContenusEditeur`.
   */
  const cle = `${idSaisie}-${champ.etat}-${champ.texteTraduit ?? ""}`;

  return (
    <div className="rounded-xl border-2 border-k-ink/15 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-k-orange-text">
          {libelleChamp}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.classe}`}
        >
          {badge.texte}
        </span>
      </div>

      {/* LE FRANÇAIS EST LU, JAMAIS ÉDITÉ ICI. Il est rendu en texte et non dans
          un champ désactivé : un `<input disabled>` invite à cliquer dedans et
          fait croire à une panne. La source se change dans l'éditeur, et cet
          écran ne prétend pas le contraire.

          `whitespace-pre-line` parce que les horaires portent leurs retours à
          la ligne jusqu'à la page publique — les aplatir ici ferait traduire un
          texte que le visiteur ne verra pas sous cette forme. */}
      <div className="mb-3">
        <p className="mb-1 text-xs font-bold text-k-body">Français (source)</p>
        <p className="whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-sm text-k-ink">
          {/* `texteSource` vaut `""` — jamais `null` — quand la RPC n'a pas
              retrouvé la source : la ligne reste COMPTÉE et donc montrée
              (`mapTraductionChamp`). L'écran doit dire ce vide, pas le rendre
              comme un paragraphe blanc. */}
          {champ.texteSource !== "" ? (
            champ.texteSource
          ) : (
            <span className="text-zinc-400">
              (vide — rien à traduire pour l&apos;instant)
            </span>
          )}
        </p>
      </div>

      {/* DEUX `<form>` FRÈRES, jamais imbriqués (invalide en HTML) : le retrait
          ne doit pas emporter la saisie en cours vers l'action d'écriture. */}
      <form onSubmit={enregistrer.onSubmit} className="space-y-2">
        <input type="hidden" name="cible_type" value={cibleType} />
        <input type="hidden" name="cible_id" value={cibleId} />
        <input type="hidden" name="champ" value={champ.champ} />
        {/* LA VERSION VUE — postée telle que chargée. Voir la prop. */}
        <input type="hidden" name="version" value={version} />

        <Label htmlFor={idSaisie}>
          Anglais : {libelleChamp} — {libelleCible}
        </Label>
        {long ? (
          <textarea
            id={idSaisie}
            name="texte"
            key={cle}
            defaultValue={champ.texteTraduit ?? ""}
            maxLength={VITRINE_TRADUCTION_TEXTE_MAX}
            rows={4}
            required
            disabled={!peutEditer}
            className={textareaClass}
            placeholder="English…"
          />
        ) : (
          <Input
            id={idSaisie}
            name="texte"
            key={cle}
            defaultValue={champ.texteTraduit ?? ""}
            maxLength={VITRINE_TRADUCTION_TEXTE_MAX}
            required
            disabled={!peutEditer}
            placeholder="English…"
          />
        )}

        {enregistrer.state && !enregistrer.state.ok ? (
          <FieldError message={enregistrer.state.error} />
        ) : null}
        {retirer.state && !retirer.state.ok ? (
          <FieldError message={retirer.state.error} />
        ) : null}

        {peutEditer ? (
          <Button type="submit" disabled={enregistrer.pending}>
            {enregistrer.pending
              ? "Enregistrement…"
              : aUneTraduction
                ? "Enregistrer l'anglais"
                : "Traduire"}
          </Button>
        ) : null}
      </form>

      {/* LE RETRAIT N'EXISTE QUE SUR UNE TRADUCTION POSÉE. Sur un champ absent,
          il n'aurait rien à effacer — et sa présence laisserait croire qu'un
          anglais existe quelque part. Sa présence est donc, pour l'écran comme
          pour le test, la preuve qu'une ligne est en base. */}
      {peutEditer && aUneTraduction ? (
        <form onSubmit={retirer.onSubmit} className="mt-2">
          <input type="hidden" name="cible_type" value={cibleType} />
          <input type="hidden" name="cible_id" value={cibleId} />
          <input type="hidden" name="champ" value={champ.champ} />
          {/* NI `texte` NI `version` : le retrait ne dit rien du français, il
              efface une ligne. Poster une version l'aurait fait ressembler à
              une écriture conditionnelle qu'il n'est pas. */}
          <Button type="submit" variant="secondary" disabled={retirer.pending}>
            {retirer.pending
              ? "Retrait…"
              : `Retirer l'anglais : ${libelleChamp} — ${libelleCible}`}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
