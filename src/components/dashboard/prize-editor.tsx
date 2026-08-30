"use client";

import { useState } from "react";
import { addPrize, deletePrize, updatePrize } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card, TITRE_SURLIGNE } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { emojisPour, motPourEmoji } from "@/lib/emoji-lexique";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { partSur10 } from "@/components/dashboard/part-sur-10";
import { useActionForm } from "@/lib/use-action-form";
import type { Prize } from "@/types/database";

// useActionForm et non useActionState : l'état de chargement doit retomber même
// quand le rendu ne rejoue pas la revalidation — docs/bugs.md.

/**
 * Plafond serveur, miroir d'`addPrize` (src/actions/prizes.ts) : « Maximum 12
 * lots par roue ». Il n'était annoncé NULLE PART avant la saisie — le
 * commerçant composait son treizième lot, cliquait, et se faisait refuser
 * après coup. On le dit d'abord.
 */
const MAX_LOTS = 12;

/** Les huit couleurs bonbon de la DA du site, suggérées à la saisie. */
const PALETTE_ID = "kermesse-palette";
const PALETTE_KERMESSE = [
  "#f5793b",
  "#fcca59",
  "#f296bd",
  "#99b7f5",
  "#267f53",
  "#fdf6e3",
  "#8b5cf6",
  "#ef4444",
];

/**
 * Rendue UNE seule fois pour toute la liste : un `<datalist>` est référencé
 * par `id`, et le dupliquer par ligne casserait l'unicité des identifiants
 * dans la page. Les lignes existantes et le formulaire d'ajout y puisent la
 * même palette — la couleur d'un lot se choisissait avec la palette à la
 * création, et sans elle à la modification.
 */
function PaletteKermesse() {
  return (
    <datalist id={PALETTE_ID}>
      {PALETTE_KERMESSE.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}

/**
 * RANGÉE D'ICÔNES SUGGÉRÉES — suggérées, jamais imposées.
 *
 * Le commerçant tape « Bouteille de vin », trois ou quatre icônes apparaissent
 * sous le champ, il clique celle qu'il veut ou n'en prend aucune. Rien n'est
 * écrit sans son geste : le champ caché part vide tant qu'il n'a pas choisi,
 * et « Aucune » revient toujours en arrière.
 *
 * ── ACCESSIBILITÉ : L'EMOJI NE VA PAS DANS LE NOM ──────────────────────
 *
 * Chaque bouton porte un nom TEXTUEL (« Choisir l'icône vin ») et l'emoji lui
 * est `aria-hidden`. Ce n'est pas de la coquetterie : un `U+FE0F` invisible
 * dans un nom accessible a déjà fait expirer un test Playwright de ce dépôt
 * sans même nommer le locator (voir `e2e/event-remote-cycle.spec.ts`). Le
 * lexique bannit ces sélecteurs, et le nom reste du texte de toute façon —
 * deux ceintures, parce que celle du milieu a déjà lâché une fois.
 */
function SuggestionsEmoji({
  idChamp,
  nom,
  choisi,
  onChoisir,
}: {
  idChamp: string;
  nom: string;
  choisi: string | null;
  onChoisir: (emoji: string | null) => void;
}) {
  const suggeres = emojisPour(nom);
  // L'icône déjà retenue reste en tête même si le libellé a changé depuis :
  // sinon, corriger une coquille dans le nom ferait disparaître de l'écran le
  // choix qu'on s'apprête à réenregistrer, sans que rien ne l'annonce.
  const proposes = choisi && !suggeres.includes(choisi)
    ? [choisi, ...suggeres]
    : suggeres;

  // Rien à proposer et rien de choisi : pas de rangée vide, pas de place
  // perdue. C'est le cas d'un libellé qu'aucun mot du lexique ne touche, et il
  // ne mérite ni message ni bouton.
  if (proposes.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span id={`${idChamp}-legende`} className="text-[11px] font-semibold text-zinc-500">
        Icône
      </span>
      <div
        role="group"
        aria-labelledby={`${idChamp}-legende`}
        className="flex flex-wrap items-center gap-1.5"
      >
        {proposes.map((emoji) => {
          const actif = choisi === emoji;
          const mot = motPourEmoji(emoji);
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={actif}
              aria-label={mot ? `Choisir l'icône ${mot}` : "Choisir cette icône"}
              // Un second clic sur l'icône active la retire : le geste qui pose
              // est celui qui enlève, sans chercher le bouton « Aucune ».
              onClick={() => onChoisir(actif ? null : emoji)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition ${
                actif
                  ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200"
                  : "border-zinc-300 bg-white hover:border-violet-400"
              }`}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={choisi === null}
          onClick={() => onChoisir(null)}
          className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
            choisi === null
              ? "border-zinc-400 bg-zinc-100 text-zinc-700"
              : "border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400"
          }`}
        >
          Aucune
        </button>
      </div>
    </div>
  );
}

export function PrizeEditor({
  wheelId,
  prizes,
  totalWeight,
}: {
  wheelId: string;
  prizes: Prize[];
  totalWeight: number;
}) {
  // Part GAGNANTE réelle : mêmes exclusions que le moteur de tirage
  // (`perform_atomic_spin`) — inactif, poids nul ou stock épuisé ne sortent pas.
  const poidsGagnant = prizes
    .filter(
      (p) =>
        p.is_active &&
        !p.is_losing &&
        p.weight > 0 &&
        (p.stock === null || p.stock > 0),
    )
    .reduce((somme, p) => somme + p.weight, 0);
  const pctGagnant = totalWeight > 0 ? (poidsGagnant / totalWeight) * 100 : 0;

  const complet = prizes.length >= MAX_LOTS;

  return (
    <div className="space-y-4">
      <PaletteKermesse />
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className={TITRE_SURLIGNE}>
              Lots ({prizes.length}/{MAX_LOTS})
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Le poids détermine la probabilité relative de chaque lot.{" "}
              {MAX_LOTS} lots maximum par roue.
            </p>
          </div>
          <span className="shrink-0 text-sm font-mono text-zinc-500">
            Poids total : {totalWeight}
          </span>
        </div>
        {/* Cinq boutons « Enregistrer » sur un même écran passent pour un
            seul : le commerçant modifie trois lignes, clique une fois, et
            croit avoir tout gardé. On le dit avant qu'il commence. */}
        <p className="rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-xs leading-5 text-k-body">
          Chaque lot s&apos;enregistre avec son propre bouton :
          modifiez une ligne, puis cliquez sur son « Enregistrer » avant de
          passer à la suivante.
        </p>
        <InfoBulle id="aide-poids" resume="Comment lire les poids ?">
          Un poids ne se lit jamais seul : il se compare au total. Un lot de
          poids 30 sur un total de {totalWeight || 100} sort environ{" "}
          {totalWeight > 0 ? Math.round((30 / totalWeight) * 100) : 30} fois sur
          100. Avec vos réglages actuels, {partSur10(pctGagnant)}. Un lot épuisé
          ou désactivé ne compte plus dans le tirage : les autres deviennent
          d&apos;autant plus fréquents.
        </InfoBulle>
        <InfoBulle
          id="aide-segment-perdant"
          resume="À quoi sert un « segment perdant » ?"
        >
          C&apos;est une case sans lot : « Dommage, retentez demain ! ». Elle est
          indispensable — sans elle, chaque client gagne à chaque partie, et
          votre stock part en une soirée. Un segment perdant n&apos;a ni stock ni
          coût : mettez-lui simplement le poids qui correspond à la part de
          parties que vous acceptez de laisser sans gain.
        </InfoBulle>
      </Card>

      {prizes.map((prize) => (
        <PrizeRow key={prize.id} prize={prize} totalWeight={totalWeight} />
      ))}

      <AddPrizeForm wheelId={wheelId} complet={complet} />
    </div>
  );
}

function PrizeRow({
  prize,
  totalWeight,
}: {
  prize: Prize;
  totalWeight: number;
}) {
  // PAS de `resetOnSuccess` ici : form.reset() rétablirait les `defaultValue`
  // du rendu COURANT — donc les valeurs d'AVANT l'édition — bien avant que
  // router.refresh() n'ait livré celles du serveur. Contrepartie assumée : les
  // valeurs normalisées (coût et valeur reformatés, stock vidé) ne se
  // réaffichent plus qu'au prochain rendu serveur.
  //
  // ── ET PAS D'ENREGISTREMENT AUTOMATIQUE NON PLUS, ICI SEULEMENT ──
  //
  // Cette ligne poste `stock_seen` : un COMPARE-AND-SWAP (`src/actions/
  // prizes.ts`, `updatePrize`). Le serveur n'écrit le stock que si celui qu'il
  // lit est encore celui que cet écran affichait — c'est ce qui empêche deux
  // employés d'écraser mutuellement leur décompte. Or `stock_seen` est un champ
  // caché rendu depuis la prop `prize` : deux enregistrements automatiques
  // rapprochés partiraient avec le MÊME témoin, et le second serait refusé
  // alors que rien de concurrent ne s'est produit — le commerçant verrait
  // « le stock a changé entre-temps » en tapant tout seul dans son champ.
  // Le bouton « Enregistrer » de la ligne reste donc le seul déclencheur, le
  // temps qu'une frappe laisse au rendu serveur de rafraîchir le témoin.
  const {
    state: updateState,
    pending: updatePending,
    onSubmit: updateSubmit,
  } = useActionForm(updatePrize, {
    networkError: "Mise à jour impossible, réessayez.",
  });
  // LE REFUS DE SUPPRESSION A ENFIN UN ENDROIT OÙ S'AFFICHER.
  //
  // L'état était ignoré : supprimer le dernier lot gagnant tirable d'une
  // campagne ouverte est désormais refusé côté serveur, et sans ce `state` le
  // commerçant aurait vu son clic ne rien produire, sans un mot. Le message
  // atterrit sous le formulaire frère, à l'aplomb du bouton « Supprimer ».
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deletePrize, {
    networkError: "Suppression impossible, réessayez.",
  });
  // Le bouton « Supprimer » reste à sa place dans la mise en page du
  // formulaire de mise à jour, mais appartient au formulaire frère ci-dessous
  // via son attribut `form` : `formAction` n'a pas d'équivalent avec `onSubmit`,
  // et le HTML interdit d'imbriquer deux formulaires.
  const deleteFormId = `delete-prize-${prize.id}`;
  // Le seuil d'alerte n'a de sens qu'avec un stock fini : le champ suit
  // la saisie du stock (masqué et non envoyé quand le stock est illimité).
  const [hasStock, setHasStock] = useState(prize.stock !== null);
  // Le champ « Nom du lot » reste NON CONTRÔLÉ (`defaultValue`) — c'est ce qui
  // fait tenir le reste de l'écran, réinitialisations comprises. On se contente
  // d'en refléter la valeur dans un état pour alimenter les suggestions, qui
  // doivent suivre la frappe.
  const [nom, setNom] = useState(prize.label);
  const [emoji, setEmoji] = useState<string | null>(prize.emoji);
  const lowStock =
    prize.stock !== null &&
    prize.low_stock_threshold !== null &&
    prize.stock <= prize.low_stock_threshold;

  // Tirable au sens du MOTEUR (`perform_atomic_spin`) : un lot gagnant à
  // stock zéro en est exclu, et afficher sa part d'antan est un mensonge sur
  // lequel le commerçant recalibre ses poids.
  const tirable = prize.is_losing || prize.stock === null || prize.stock > 0;
  const pct =
    totalWeight > 0 && prize.is_active && tirable
      ? Math.round((prize.weight / totalWeight) * 100)
      : 0;

  return (
    <Card>
      <form onSubmit={updateSubmit} className="space-y-3">
        <input type="hidden" name="id" value={prize.id} />
        {/* Ces deux champs n'avaient AUCUN <Label> visible — les seuls de
            l'écran dans ce cas, alors que le formulaire d'ajout étiquette les
            siens. Un champ pré-rempli sans étiquette se devine ; il ne se lit
            pas au lecteur d'écran, et il ne se devine plus du tout quand le
            libellé du lot est « Surprise ». */}
        <div className="flex items-end gap-3">
          <div className="shrink-0">
            <Label htmlFor={`color-${prize.id}`}>Couleur</Label>
            <input
              id={`color-${prize.id}`}
              type="color"
              name="color"
              defaultValue={prize.color}
              list={PALETTE_ID}
              title="Couleur du segment"
              className="h-9 w-9 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
            />
          </div>
          <div className="min-w-0 flex-1">
            <Label htmlFor={`label-${prize.id}`}>Nom du lot</Label>
            <Input
              id={`label-${prize.id}`}
              name="label"
              defaultValue={prize.label}
              onChange={(e) => setNom(e.target.value)}
              required
              maxLength={80}
              className="font-semibold"
            />
          </div>
          {lowStock && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 mb-2.5">
              Stock faible
            </span>
          )}
          <span className="shrink-0 text-xs font-mono text-zinc-600 w-12 text-right mb-2.5">
            {prize.is_active && !tirable ? "épuisé" : `~${pct}%`}
          </span>
        </div>

        {/* Le champ caché est la SEULE écriture : tant qu'aucun bouton n'a été
            cliqué, il porte la valeur déjà enregistrée — modifier le poids d'un
            lot ne doit pas lui retirer son icône au passage. */}
        <input type="hidden" name="emoji" value={emoji ?? ""} />
        <SuggestionsEmoji
          idChamp={`label-${prize.id}`}
          nom={nom}
          choisi={emoji}
          onChoisir={setEmoji}
        />

        <div>
          <Label htmlFor={`description-${prize.id}`}>
            Description (affichée au gagnant)
          </Label>
          <Input
            id={`description-${prize.id}`}
            name="description"
            defaultValue={prize.description}
            maxLength={300}
            placeholder="Description affichée au gagnant…"
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor={`weight-${prize.id}`}>Poids</Label>
            <Input
              id={`weight-${prize.id}`}
              name="weight"
              type="number"
              min={0}
              max={10000}
              defaultValue={prize.weight}
              required
              className="w-24"
            />
          </div>
          <div>
            <Label htmlFor={`stock-${prize.id}`}>Stock (vide = illimité)</Label>
            {/* TÉMOIN du stock affiché, dans le MÊME rendu que le
                `defaultValue` ci-dessous — c'est ce qui le rend fidèle. Le
                stock est le RESTANT, décrémenté par chaque tirage : sans ce
                témoin, le serveur ne peut pas distinguer « il a saisi 12 » de
                « 12 traînait dans le champ depuis une heure », et réécrivait
                donc le compteur en recréditant les lots gagnés entre-temps. */}
            <input
              type="hidden"
              name="stock_seen"
              value={prize.stock ?? ""}
            />
            <Input
              id={`stock-${prize.id}`}
              name="stock"
              type="number"
              min={0}
              defaultValue={prize.stock ?? ""}
              onChange={(e) => setHasStock(e.target.value.trim() !== "")}
              className="w-32"
            />
          </div>
          {hasStock && (
            <div className="max-w-40">
              <Label htmlFor={`low-stock-${prize.id}`}>
                Seuil d&apos;alerte stock
              </Label>
              <Input
                id={`low-stock-${prize.id}`}
                name="low_stock_threshold"
                type="number"
                min={0}
                defaultValue={prize.low_stock_threshold ?? ""}
                placeholder="Vide = pas d'alerte"
                aria-describedby={`low-stock-help-${prize.id}`}
                className="w-40"
              />
              <p
                id={`low-stock-help-${prize.id}`}
                className="mt-1 text-[11px] leading-snug text-zinc-500"
              >
                Vous recevrez un email quand le stock passe sous ce seuil.
              </p>
              <InfoBulle
                id={`aide-seuil-${prize.id}`}
                resume="Quel seuil mettre ?"
                className="mt-2"
              >
                Mettez-y ce qu&apos;il vous reste quand vous avez encore le temps
                de réapprovisionner — typiquement une journée de gains. Trop bas,
                l&apos;alerte arrive quand le lot est déjà épuisé ; trop haut,
                vous recevez un email dès le premier jour et vous cessez de le
                lire.
              </InfoBulle>
            </div>
          )}
          <div>
            <Label htmlFor={`cost-${prize.id}`}>Coût réel (€)</Label>
            <Input
              id={`cost-${prize.id}`}
              name="cost"
              inputMode="decimal"
              placeholder="Ex : 1,50"
              defaultValue={
                prize.cost_cents !== null ? (prize.cost_cents / 100).toString().replace(".", ",") : ""
              }
              className="w-28"
              title="Coût du lot pour vous — alimente le ROI"
            />
          </div>
          <div>
            <Label htmlFor={`value-${prize.id}`}>Valeur affichée (€)</Label>
            <Input
              id={`value-${prize.id}`}
              name="value"
              inputMode="decimal"
              placeholder="Ex : 3,00"
              defaultValue={
                prize.value_cents !== null ? (prize.value_cents / 100).toString().replace(".", ",") : ""
              }
              className="w-28"
              title="Valeur commerciale du lot"
            />
          </div>
          <div className="max-w-72">
            <InfoBulle
              id={`aide-cout-valeur-${prize.id}`}
              resume="Coût réel ou valeur affichée ?"
            >
              Le <strong>coût réel</strong> est ce que le lot vous coûte, à vous
              (0,40 € pour un café) : c&apos;est lui qui alimente le plafond de
              dépense et le calcul de rentabilité. La <strong>valeur
              affichée</strong> est ce que le client croit gagner (2,50 € pour ce
              même café) : elle ne sert qu&apos;à rendre le lot désirable à
              l&apos;écran, et n&apos;est jamais facturée.
            </InfoBulle>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 pb-2.5">
            <input
              type="checkbox"
              name="is_losing"
              defaultChecked={prize.is_losing}
              className="h-4 w-4 rounded accent-orange-600"
            />
            Segment perdant
          </label>
          <div className="ml-auto flex gap-2">
            <Button type="submit" variant="secondary" disabled={updatePending}>
              {updatePending ? "…" : "Enregistrer"}
            </Button>
            <Button
              type="submit"
              variant="danger"
              form={deleteFormId}
              disabled={deletePending}
            >
              {deletePending ? "…" : "Supprimer"}
            </Button>
          </div>
        </div>
        <FieldError
          message={updateState && !updateState.ok ? updateState.error : undefined}
        />
      </form>

      {/* Formulaire frère, sans rendu propre : il ne porte que l'identifiant du
          lot à supprimer, que le bouton ci-dessus lui adresse par `form=`. */}
      <form
        id={deleteFormId}
        onSubmit={(event) => {
          // Confirmer d'abord ; le hook n'est saisi que sur oui. La question
          // nomme la CONSÉQUENCE et pas seulement le lot : « Supprimer le lot
          // “Café” ? » ne dit pas qu'on retire une chance de gagner de la roue.
          if (
            !confirm(
              `Supprimer le lot « ${prize.label} » ? Il ne pourra plus sortir : si c'était le dernier lot gagnant tirable, vos clients repartiraient tous bredouilles.`,
            )
          ) {
            event.preventDefault();
            return;
          }
          deleteSubmit(event);
        }}
      >
        <input type="hidden" name="id" value={prize.id} />
      </form>
      <FieldError
        message={deleteState && !deleteState.ok ? deleteState.error : undefined}
      />
    </Card>
  );
}

function AddPrizeForm({
  wheelId,
  complet,
}: {
  wheelId: string;
  complet: boolean;
}) {
  // Les champs sont non contrôlés : `resetOnSuccess` reproduit le vidage
  // automatique que React appliquait après une soumission via `action=`. Sans
  // lui, le libellé du lot précédent resterait en place et inviterait au
  // doublon ; form.reset() restitue aussi le poids 10 et la couleur par défaut.
  // `reloadOnSuccess` : ici le rafraîchissement est le SEUL moyen de voir le
  // lot ajouté — ni la liste, ni « Lots (N) », ni le poids total, ni l'aperçu
  // de roue n'ont d'état local, et ce formulaire n'a pas de message de succès.
  // Le commerçant qui ne voit rien retape et re-clique : le segment est
  // DUPLIQUÉ, son poids compte deux fois dans le tirage, et `revalidatePlaySlugs`
  // purge l'ISR de /play dans la foulée — le doublon part aux joueurs pendant
  // qu'il reste caché au seul homme qui pourrait le supprimer.
  const { state, pending, onSubmit } = useActionForm(addPrize, {
    resetOnSuccess: true,
    reloadOnSuccess: true,
    networkError: "Ajout impossible, réessayez.",
  });
  // Miroir du libellé en cours de frappe, pour les suggestions d'icône. La
  // remise à zéro n'a pas besoin d'être traitée ici : `reloadOnSuccess`
  // recharge la page — c'est le seul moyen de VOIR le lot ajouté.
  const [nom, setNom] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);

  return (
    <Card className="border-dashed">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="wheel_id" value={wheelId} />
        <input type="hidden" name="description" value="" />
        <div>
          <Label htmlFor="new-label">Nouveau lot</Label>
          <Input
            id="new-label"
            name="label"
            required
            maxLength={80}
            placeholder="Ex : Boisson offerte"
            className="w-48"
            onChange={(e) => setNom(e.target.value)}
          />
          <input type="hidden" name="emoji" value={emoji ?? ""} />
          <SuggestionsEmoji
            idChamp="new-label"
            nom={nom}
            choisi={emoji}
            onChoisir={setEmoji}
          />
        </div>
        <div>
          <Label htmlFor="new-weight">Poids</Label>
          <Input
            id="new-weight"
            name="weight"
            type="number"
            min={0}
            max={10000}
            defaultValue={10}
            required
            className="w-24"
          />
        </div>
        <div>
          <Label htmlFor="new-color">Couleur</Label>
          <input
            id="new-color"
            type="color"
            name="color"
            defaultValue={PALETTE_KERMESSE[0]}
            list={PALETTE_ID}
            className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
          />
        </div>
        {/* Le coût se saisissait UNIQUEMENT au second temps, dans le
            formulaire de modification. Un lot naissait donc à null, et le
            plafond de dépense de la campagne — qui impute
            `coalesce(cost_cents, 0)` à chaque gain réclamé — n'avait rien à
            compter. Le champ reste facultatif : le laisser vide se lit
            « je ne suis pas ce lot au budget », pas « je ne sais pas ». */}
        <div>
          <Label htmlFor="new-cost">Coût réel (€)</Label>
          <Input
            id="new-cost"
            name="cost"
            inputMode="decimal"
            placeholder="Ex : 1,50"
            title="Coût du lot pour vous — alimente le plafond de dépense et le ROI"
            className="w-28"
          />
        </div>
        <Button type="submit" disabled={pending || complet}>
          {pending ? "Ajout…" : "+ Ajouter"}
        </Button>
        {/* Le refus « Maximum 12 lots par roue » arrivait APRÈS la saisie
            complète du treizième. Le plafond se lit maintenant avant. */}
        {complet && (
          <p className="w-full text-xs text-amber-800">
            Vous avez atteint le maximum de {MAX_LOTS} lots. Supprimez-en un
            pour en ajouter un autre.
          </p>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}
