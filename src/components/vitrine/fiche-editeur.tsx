"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useActionForm } from "@/lib/use-action-form";
import {
  VITRINE_ALLERGENES,
  VITRINE_BADGES,
  VITRINE_FICHE_DESCRIPTION_MAX,
  VITRINE_FICHE_NOM_MAX,
  VITRINE_PRIX_AFFICHE_MAX,
  libelleAllergene,
  libelleBadge,
  type VitrineFicheView,
} from "@/lib/vitrine";
import {
  deleteVitrineFiche,
  toggleVitrineFicheDisponibilite,
  updateVitrineFiche,
} from "@/actions/vitrine";
import { Button } from "@/components/ui/button";
import { PhotoChamp } from "@/components/vitrine/photo-champ";
import {
  ACTIONS_FR,
  FACETTES_FR,
  VITRINE_ACTIONS,
  VITRINE_FACETTES,
} from "@/lib/vitrine";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FlechesOrdre } from "@/components/vitrine/fleches-ordre";

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/**
 * UNE FICHE DANS L'ÉDITEUR.
 *
 * ── LA LIGNE MONTRE, LE `<details>` MODIFIE ──
 *
 * Une carte de restaurant tient trente à quatre-vingts fiches. Trente
 * formulaires dépliés en même temps font un écran qu'on ne peut ni relire ni
 * parcourir sur un téléphone — et c'est sur un téléphone que ce travail se fait
 * en salle. La ligne repliée porte donc ce qu'on vient vérifier (nom, prix,
 * disponibilité) et le seul geste fréquent ; le reste est à un clic.
 *
 * ── « INDISPONIBLE » EST UN BOUTON, PAS UNE CASE DANS UN FORMULAIRE ──
 *
 * C'est LE geste du produit : « une action rapide permet de marquer un plat
 * indisponible », depuis le téléphone, au milieu du service, quand la cuisine
 * annonce qu'il n'y a plus de bar. L'enfouir sous « Modifier » puis
 * « Enregistrer » aurait transformé trois secondes en trois écrans.
 */
export function FicheEditeur({
  fiche,
  index,
  total,
  peutEditer,
  reorderPending,
  onDeplacer,
}: {
  fiche: VitrineFicheView;
  index: number;
  total: number;
  peutEditer: boolean;
  reorderPending: boolean;
  onDeplacer: (index: number, direction: -1 | 1) => void;
}) {
  const disponible = useDisponibiliteAffichee(fiche);

  /**
   * L'OUVERTURE DU PLI EST DE L'ÉTAT CLIENT, PAS DE L'ÉTAT DOM.
   *
   * L'attribut `open` d'un `<details>` non contrôlé ne vit que dans le nœud :
   * il disparaît dès que React recrée l'élément. Or chaque mutation de cet
   * écran est suivie d'un `router.refresh()` qui re-rend l'arbre serveur — et
   * le commerçant, lui, était en train de remplir le formulaire qui se trouve
   * DEDANS. Mesuré en E2E WebKit sous charge : la case « 🌱 Vegan » restait
   * résolue mais `hidden` vingt secondes, le pli s'étant refermé sous elle.
   *
   * Contrôlé, l'état survit au rafraîchissement — la `key` de ce composant est
   * l'id de la fiche (`catalogue-editeur.tsx`), stable à travers un refresh,
   * donc l'instance n'est pas remplacée et son état non plus.
   */
  const [ouvert, setOuvert] = useState(false);

  return (
    <li
      className={cn(
        "rounded-xl border-2 border-k-ink/15 bg-white p-3",
        !disponible.valeur && "bg-zinc-50",
      )}
    >
      <div className="flex items-start gap-3">
        {peutEditer ? (
          <FlechesOrdre
            index={index}
            total={total}
            nom={fiche.nom}
            disabled={reorderPending}
            onDeplacer={onDeplacer}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p
              className={cn(
                "min-w-0 font-bold text-k-ink",
                !disponible.valeur && "line-through decoration-zinc-400",
              )}
            >
              {fiche.nom}
            </p>
            {fiche.prix_affiche ? (
              <p className="shrink-0 text-sm font-bold tabular-nums text-k-body">
                {fiche.prix_affiche}
              </p>
            ) : null}
          </div>

          {!disponible.valeur ? (
            <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-k-orange-text">
              Indisponible
            </p>
          ) : null}

          {peutEditer ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <form onSubmit={disponible.onSubmit}>
                <input type="hidden" name="id" value={fiche.id} />
                <input
                  type="hidden"
                  name="disponible"
                  value={disponible.valeur ? "false" : "true"}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={disponible.pending}
                  className="px-3 py-1.5 text-xs"
                >
                  {disponible.pending
                    ? "…"
                    : disponible.valeur
                      ? "Marquer indisponible"
                      : "Remettre à la carte"}
                </Button>
              </form>
              {disponible.erreur ? (
                <span role="alert" className="text-xs font-semibold text-red-600">
                  {disponible.erreur}
                </span>
              ) : null}
            </div>
          ) : null}

          <details
            className="mt-2 group"
            open={ouvert}
            onToggle={(e) => setOuvert(e.currentTarget.open)}
          >
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-sm font-bold text-k-body underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink">
              {peutEditer ? "Modifier" : "Voir le détail"}
              <span aria-hidden className="transition-transform group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <FicheForm fiche={fiche} peutEditer={peutEditer} />
          </details>
        </div>
      </div>
    </li>
  );
}

/**
 * L'affichage de la disponibilité, avec écrasement local PÉRIMABLE.
 *
 * Même mécanique que `ordre-optimiste` et pour la même raison : la pastille
 * vient du rendu serveur, et `router.refresh()` ne s'applique pas toujours. Sans
 * cet écrasement, le commerçant clique « Marquer indisponible », la ligne ne
 * bouge pas, il reclique — et le second appel remet le plat à la carte.
 *
 * La péremption est la valeur serveur au moment du clic : dès qu'elle bouge,
 * l'écrasement cesse de s'appliquer de lui-même, sans effet ni nettoyage.
 */
function useDisponibiliteAffichee(fiche: VitrineFicheView) {
  const [local, setLocal] = useState<{ depuis: boolean; vers: boolean } | null>(
    null,
  );

  const { state, pending, onSubmit } = useActionForm(
    toggleVitrineFicheDisponibilite,
    { networkError: "Changement impossible, réessayez." },
  );

  // L'écrasement est posé à la SOUMISSION — pas au retour : c'est justement le
  // retour dont on se méfie.
  const soumettre = (event: React.FormEvent<HTMLFormElement>) => {
    setLocal({ depuis: fiche.disponible, vers: !fiche.disponible });
    onSubmit(event);
  };

  // Le refus serveur est DÉRIVÉ, sans second état : un `setState` en cours de
  // rendu pour recopier `state.error` dans une variable aurait ajouté un cycle
  // de rendu et un état à faire converger, pour une information déjà là.
  const refuse = Boolean(state && !state.ok);
  const valeur =
    !refuse && local && local.depuis === fiche.disponible
      ? local.vers
      : fiche.disponible;

  return {
    valeur,
    pending,
    onSubmit: soumettre,
    erreur: state && !state.ok ? state.error : null,
  };
}

function FicheForm({
  fiche,
  peutEditer,
}: {
  fiche: VitrineFicheView;
  peutEditer: boolean;
}) {
  const modifier = useActionForm(updateVitrineFiche, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const supprimer = useActionForm(deleteVitrineFiche, {
    networkError: "Suppression impossible, réessayez.",
  });

  /**
   * MÊME RAISON QUE LE PLI PARENT, et une de plus : `open` piloté par
   * `fiche.allergenes.length > 0` était une prop RECALCULÉE à chaque rendu.
   * Le pli qu'on venait d'ouvrir à la main pour cocher « Gluten » retombait
   * donc à la valeur serveur au premier rafraîchissement. L'état est semé une
   * fois — ce qui est déjà renseigné reste visible d'emblée — puis il suit le
   * geste de l'utilisateur, qui fait foi ensuite.
   */
  const [allergenesOuverts, setAllergenesOuverts] = useState(
    fiche.allergenes.length > 0,
  );

  return (
    <div className="mt-3 space-y-4 border-t-2 border-dashed border-zinc-200 pt-3">
      <form onSubmit={modifier.onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={fiche.id} />

        <div>
          <Label htmlFor={`fiche-nom-${fiche.id}`}>Nom</Label>
          <Input
            id={`fiche-nom-${fiche.id}`}
            name="nom"
            defaultValue={fiche.nom}
            required
            maxLength={VITRINE_FICHE_NOM_MAX}
            disabled={!peutEditer}
          />
        </div>

        <div>
          <Label htmlFor={`fiche-desc-${fiche.id}`}>Description</Label>
          <textarea
            id={`fiche-desc-${fiche.id}`}
            name="description"
            defaultValue={fiche.description ?? ""}
            maxLength={VITRINE_FICHE_DESCRIPTION_MAX}
            rows={3}
            disabled={!peutEditer}
            className={textareaClass}
            placeholder="Ce qu'il y a dedans, d'où ça vient."
          />
        </div>

        <div className="max-w-40">
          <Label htmlFor={`fiche-prix-${fiche.id}`}>Prix affiché</Label>
          <Input
            id={`fiche-prix-${fiche.id}`}
            name="prix_affiche"
            defaultValue={fiche.prix_affiche ?? ""}
            maxLength={VITRINE_PRIX_AFFICHE_MAX}
            disabled={!peutEditer}
            placeholder="12 €"
          />
          {/* LE PRIX EST DU TEXTE, ET C'EST UNE LIBERTÉ, PAS UN DÉFAUT : une
              carte réelle écrit « à partir de 8 € » ou « selon arrivage », que
              nul champ décimal n'accepterait. */}
          <p className="mt-1.5 text-xs text-zinc-500">
            Écrivez-le comme sur votre carte : « 12 € », « à partir de 8 € »,
            « selon arrivage ». Laissez vide pour ne pas afficher de prix.
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-k-ink">
            Badges
          </legend>
          <p className="mb-2 text-xs text-zinc-500">
            Ils s&apos;affichent en petites pastilles sous la fiche.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {VITRINE_BADGES.map((badge) => (
              <li key={badge}>
                <label className="flex items-center gap-2 text-sm font-semibold text-k-ink">
                  <input
                    type="checkbox"
                    name="badges"
                    value={badge}
                    defaultChecked={fiche.badges.includes(badge)}
                    disabled={!peutEditer}
                    className="size-4 accent-k-ink"
                  />
                  {libelleBadge(badge)}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {/* LES FACETTES DE LA BOUSSOLE (VIT-10) — repliées, comme les
            allergènes, et pour la même raison : onze cases dépliées sur chaque
            fiche noieraient le nom et le prix. Ouvert d'emblée quand la fiche
            en porte déjà, pour que le commerçant voie ce qu'il a coché sans
            avoir à chercher. */}
        <details
          open={fiche.facettes.length > 0}
          className="rounded-xl border-2 border-k-ink/15 px-3 py-2"
        >
          <summary className="cursor-pointer text-sm font-bold text-k-ink">
            Boussole — quand proposer cette fiche
          </summary>
          <p className="mb-2 mt-2 text-xs text-zinc-500">
            Cochez seulement ce qui DISTINGUE ce plat. Une dimension laissée
            vide veut dire « ça va avec tout ». Une fiche sans aucune case n
            &apos;est jamais proposée par la Boussole.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {VITRINE_FACETTES.map((facette) => (
              <li key={facette}>
                <label className="flex items-center gap-2 text-sm font-semibold text-k-ink">
                  <input
                    type="checkbox"
                    name="facettes"
                    value={facette}
                    defaultChecked={fiche.facettes.includes(facette)}
                    disabled={!peutEditer}
                    className="size-4 accent-k-ink"
                  />
                  {FACETTES_FR[facette]}
                </label>
              </li>
            ))}
          </ul>
        </details>

        {/* AU PLUS UNE PORTE, et c'est un `<select>` : la contrainte du cahier
            devient la forme du champ. Six cases à cocher auraient laissé le
            commerçant en choisir trois, et l'écran aurait dû lui expliquer
            pourquoi il n'en garde qu'une. */}
        <div>
          <Label htmlFor={`fiche-action-${fiche.id}`}>
            Proposer une action sous cette fiche
          </Label>
          <select
            id={`fiche-action-${fiche.id}`}
            name="action"
            defaultValue={fiche.action ?? ""}
            disabled={!peutEditer}
            className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          >
            <option value="">Aucune</option>
            {VITRINE_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {ACTIONS_FR[action]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-500">
            Le bouton n&apos;apparaît que si ce module a réellement quelque
            chose d&apos;ouvert. Rien à désactiver le jour où vous fermez : il
            disparaît tout seul.
          </p>
        </div>

        {/* LES ALLERGÈNES SONT REPLIÉS DANS L'ÉDITEUR AUSSI — quatorze cases
            dépliées sur chaque fiche noieraient les champs qu'on vient
            modifier. Le `<details>` est ouvert quand la fiche en porte déjà :
            ce qui est renseigné doit se voir sans qu'on ait à chercher. */}
        <details
          open={allergenesOuverts}
          onToggle={(e) => setAllergenesOuverts(e.currentTarget.open)}
        >
          <summary className="cursor-pointer list-none text-sm font-bold text-k-ink underline underline-offset-2">
            Allergènes {fiche.allergenes.length > 0 ? `(${fiche.allergenes.length})` : ""}
          </summary>
          <fieldset className="mt-2">
            <legend className="sr-only">Allergènes présents dans ce plat</legend>
            <p className="mb-2 text-xs text-zinc-500">
              Les quatorze allergènes à déclaration obligatoire (annexe II du
              règlement UE 1169/2011).
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {VITRINE_ALLERGENES.map((allergene) => (
                <li key={allergene}>
                  <label className="flex items-center gap-2 text-sm font-semibold text-k-ink">
                    <input
                      type="checkbox"
                      name="allergenes"
                      value={allergene}
                      defaultChecked={fiche.allergenes.includes(allergene)}
                      disabled={!peutEditer}
                      className="size-4 accent-k-ink"
                    />
                    {libelleAllergene(allergene)}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </details>

        {/* LA CASE EST OBLIGATOIRE ICI, et pas seulement utile.
            `updateVitrineFiche` lit `disponible` en case NATIVE : absente du
            POST vaut décochée. Un formulaire qui ne la rendrait pas remettrait
            donc chaque plat en « indisponible » à la première correction de
            libellé — la limite est écrite noir sur blanc dans le schéma, qui
            compte sur les deux écrans pour toujours la rendre. */}
        <label className="flex items-center gap-2 text-sm font-semibold text-k-ink">
          <input
            type="checkbox"
            name="disponible"
            value="true"
            defaultChecked={fiche.disponible}
            disabled={!peutEditer}
            className="size-4 accent-k-ink"
          />
          Disponible à la carte
        </label>

        {modifier.state && !modifier.state.ok ? (
          <FieldError message={modifier.state.error} />
        ) : null}
        {modifier.state?.ok ? (
          <p className="text-sm font-semibold text-green-700">Enregistré.</p>
        ) : null}

        {peutEditer ? (
          <Button type="submit" disabled={modifier.pending}>
            {modifier.pending ? "Enregistrement…" : "Enregistrer la fiche"}
          </Button>
        ) : null}
      </form>

      <PhotoChamp
        cible="fiche"
        ficheId={fiche.id}
        chemin={fiche.photo_path}
        alt={fiche.photo_alt}
        peutEditer={peutEditer}
        titre="Photo de la fiche"
      />

      {peutEditer ? (
        <form onSubmit={supprimer.onSubmit}>
          <input type="hidden" name="id" value={fiche.id} />
          {supprimer.state && !supprimer.state.ok ? (
            <FieldError message={supprimer.state.error} />
          ) : null}
          {/* Aucune case de confirmation destructive : une fiche est du contenu
              ÉDITORIAL. Rien ici n'est un fait client — pas un code gagné, pas
              une réservation — et le registre des gardes destructives ne couvre
              que ce qui détruirait quelque chose qu'un client tient déjà. */}
          <Button
            type="submit"
            variant="danger"
            disabled={supprimer.pending}
            className="px-3 py-1.5 text-xs"
          >
            {supprimer.pending ? "Suppression…" : "Supprimer la fiche"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
