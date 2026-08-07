"use client";

import { useState } from "react";
import { addPrize, deletePrize, updatePrize } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { useActionForm } from "@/lib/use-action-form";
import type { Prize } from "@/types/database";

/**
 * « ≈ N clients sur 10 gagnent » — la seule phrase qui parle au commerçant.
 *
 * Le poids est un nombre relatif : 30 sur un total de 100 ne veut rien dire
 * tant qu'on ne l'a pas divisé. Le pourcentage était déjà affiché en petit à
 * droite de chaque ligne (`~30%`), mais un pourcentage de tirage n'est PAS ce
 * qu'un patron de bar compte : il compte des clients qui repartent avec
 * quelque chose. On le lui dit dans son unité.
 */
export function partSur10(pctGagnant: number): string {
  const sur10 = Math.round(pctGagnant / 10);
  if (sur10 <= 0) return "moins d'un client sur 10 gagne quelque chose";
  if (sur10 >= 10) return "quasiment tous vos clients gagnent quelque chose";
  return `≈ ${sur10} client${sur10 > 1 ? "s" : ""} sur 10 gagne${sur10 > 1 ? "nt" : ""} quelque chose`;
}

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
            <h2 className="font-semibold">
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
  const {
    state: updateState,
    pending: updatePending,
    onSubmit: updateSubmit,
  } = useActionForm(updatePrize, {
    networkError: "Mise à jour impossible, réessayez.",
  });
  // L'état de la suppression reste ignoré, comme avant la migration : une
  // erreur de suppression n'a jamais eu d'emplacement d'affichage sur la ligne.
  const { pending: deletePending, onSubmit: deleteSubmit } = useActionForm(
    deletePrize,
    { networkError: "Suppression impossible, réessayez." },
  );
  // Le bouton « Supprimer » reste à sa place dans la mise en page du
  // formulaire de mise à jour, mais appartient au formulaire frère ci-dessous
  // via son attribut `form` : `formAction` n'a pas d'équivalent avec `onSubmit`,
  // et le HTML interdit d'imbriquer deux formulaires.
  const deleteFormId = `delete-prize-${prize.id}`;
  // Le seuil d'alerte n'a de sens qu'avec un stock fini : le champ suit
  // la saisie du stock (masqué et non envoyé quand le stock est illimité).
  const [hasStock, setHasStock] = useState(prize.stock !== null);
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
          <span className="shrink-0 text-xs font-mono text-zinc-400 w-12 text-right mb-2.5">
            {prize.is_active && !tirable ? "épuisé" : `~${pct}%`}
          </span>
        </div>

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
          // Confirmer d'abord ; le hook n'est saisi que sur oui.
          if (!confirm(`Supprimer le lot « ${prize.label} » ?`)) {
            event.preventDefault();
            return;
          }
          deleteSubmit(event);
        }}
      >
        <input type="hidden" name="id" value={prize.id} />
      </form>
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
