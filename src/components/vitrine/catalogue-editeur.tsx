"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useActionForm } from "@/lib/use-action-form";
import {
  VITRINE_CARTE_NOM_MAX,
  VITRINE_FICHE_NOM_MAX,
  VITRINE_RUBRIQUE_NOM_MAX,
  type VitrineCarteView,
  type VitrineRubriqueView,
} from "@/lib/vitrine";
import {
  createVitrineCarte,
  createVitrineFiche,
  createVitrineRubrique,
  deleteVitrineCarte,
  deleteVitrineRubrique,
  reorderVitrineCartes,
  reorderVitrineFiches,
  reorderVitrineRubriques,
  updateVitrineCarte,
  updateVitrineRubrique,
  type VitrineCarteCreee,
  type VitrineFicheCreee,
  type VitrineRubriqueCreee,
} from "@/actions/vitrine";
import { Button } from "@/components/ui/button";
import { ACTIONS_FR, VITRINE_ACTIONS } from "@/lib/vitrine";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FicheEditeur } from "@/components/vitrine/fiche-editeur";
import { FlechesOrdre } from "@/components/vitrine/fleches-ordre";
import { useReordonner } from "@/components/vitrine/use-reordonner";

/**
 * L'ÉDITEUR DU CATALOGUE : cartes → rubriques → fiches.
 *
 * ── LES TROIS NIVEAUX SONT SUR LE MÊME ÉCRAN ──
 *
 * Un écran par niveau aurait fait trois allers-retours pour ajouter un plat, et
 * le geste réel — « on a mis le nouveau dessert, et il n'y a plus de bar » — se
 * fait en une fois, debout, entre deux services. Les rubriques et les fiches
 * sont donc dépliables sur place, et rien ne force à quitter la page.
 *
 * ── CE QUE LES CRÉATIONS FONT DE PARTICULIER ──
 *
 * Elles reçoivent la ligne canonique créée, puis l'ajoutent à l'état local du
 * niveau concerné. Le commerçant voit donc immédiatement sa carte, sa rubrique
 * ou son plat, sans navigation ni rafraîchissement RSC intermédiaire. La page
 * serveur reste réconciliée au prochain rafraîchissement normal.
 */
export function CatalogueEditeur({
  cartes,
  peutEditer,
}: {
  cartes: VitrineCarteView[];
  peutEditer: boolean;
}) {
  // Les mutations qui demandent un refresh (suppression, renommage, ordre)
  // changent cette empreinte et recréent l'état local depuis le serveur. Les
  // créations, elles, n'en ont pas besoin : leur retour canonique est ajouté
  // dans le composant local, sans navigation.
  const empreinte = cartes
    .map(
      (carte) =>
        `${carte.id}:${carte.nom}:${carte.active}:${carte.categories
          .map(
            (rubrique) =>
              `${rubrique.id}:${rubrique.nom}:${rubrique.action}:${rubrique.fiches
                .map((fiche) => `${fiche.id}:${fiche.nom}:${fiche.disponible}`)
                .join(",")}`,
          )
          .join("|")}`,
    )
    .join(";");

  return (
    <CatalogueEditeurLocal key={empreinte} cartes={cartes} peutEditer={peutEditer} />
  );
}

function CatalogueEditeurLocal({
  cartes,
  peutEditer,
}: {
  cartes: VitrineCarteView[];
  peutEditer: boolean;
}) {
  const [cartesAffichees, setCartesAffichees] = useState(cartes);

  const ordre = useReordonner(cartesAffichees, (ids) => {
    const fd = new FormData();
    fd.set("order", JSON.stringify(ids));
    return reorderVitrineCartes(null, fd);
  });

  return (
    <div className="space-y-6">
      <Card>
        <h2>Vos cartes</h2>
        <p className="mb-4 mt-2 text-sm text-zinc-500">
          Une carte par liste que vos clients consultent : « Midi », « Vins »,
          « Boissons », « Brunch du dimanche ». Une carte saisonnière se coupe
          en octobre et revient en juin sans rien ressaisir.
        </p>

        {ordre.erreur ? (
          <p role="alert" className="mb-3 text-sm font-semibold text-red-600">
            {ordre.erreur}
          </p>
        ) : null}

        {cartesAffichees.length === 0 ? (
          <p className="mb-4 text-sm text-zinc-500">
            Aucune carte pour l&apos;instant — créez la première ci-dessous.
          </p>
        ) : null}

        {peutEditer ? (
          <CreerCarteForm
            onCree={(carte) =>
              setCartesAffichees((precedentes) => [
                ...precedentes,
                { ...carte, categories: [] },
              ])
            }
          />
        ) : null}
      </Card>

      {ordre.affiches.map((carte, index) => (
        <CarteEditeur
          key={carte.id}
          carte={carte}
          index={index}
          total={ordre.affiches.length}
          peutEditer={peutEditer}
          reorderPending={ordre.pending}
          onDeplacer={ordre.deplacer}
        />
      ))}
    </div>
  );
}

function CreerCarteForm({
  onCree,
}: {
  onCree: (carte: VitrineCarteCreee) => void;
}) {
  const { state, pending, onSubmit } = useActionForm(createVitrineCarte, {
    networkError: "Création impossible, réessayez.",
    resetOnSuccess: true,
    refreshOnSuccess: false,
    onSuccess: onCree,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <Label htmlFor="carte-nouvelle-nom">Nom de la carte</Label>
        <Input
          id="carte-nouvelle-nom"
          name="nom"
          required
          maxLength={VITRINE_CARTE_NOM_MAX}
          placeholder="Carte du midi"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer la carte"}
      </Button>
      {state && !state.ok ? (
        <div className="w-full">
          <FieldError message={state.error} />
        </div>
      ) : null}
      {state?.ok ? (
        <p className="w-full text-sm font-semibold text-green-700">
          Carte ajoutée.
        </p>
      ) : null}
    </form>
  );
}

function CarteEditeur({
  carte,
  index,
  total,
  peutEditer,
  reorderPending,
  onDeplacer,
}: {
  carte: VitrineCarteView;
  index: number;
  total: number;
  peutEditer: boolean;
  reorderPending: boolean;
  onDeplacer: (index: number, direction: -1 | 1) => void;
}) {
  const [categoriesAffichees, setCategoriesAffichees] = useState(
    carte.categories,
  );

  const modifier = useActionForm(updateVitrineCarte, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const supprimer = useActionForm(deleteVitrineCarte, {
    networkError: "Suppression impossible, réessayez.",
  });

  // LE PARENT PART AVEC LA LISTE : l'action borne l'écriture aux frères d'une
  // même carte, en plus du filtre d'organisation.
  const ordre = useReordonner(categoriesAffichees, (ids) => {
    const fd = new FormData();
    fd.set("menu_id", carte.id);
    fd.set("order", JSON.stringify(ids));
    return reorderVitrineRubriques(null, fd);
  });

  const vide = categoriesAffichees.length === 0;

  return (
    <Card className={cn(!carte.active && "bg-zinc-50")}>
      <div className="mb-4 flex items-start gap-3">
        {peutEditer ? (
          <FlechesOrdre
            index={index}
            total={total}
            nom={carte.nom}
            disabled={reorderPending}
            onDeplacer={onDeplacer}
          />
        ) : null}
        <h2 className="min-w-0 flex-1">{carte.nom}</h2>
        {!carte.active ? (
          <span className="shrink-0 rounded-full border-2 border-k-ink bg-zinc-200 px-3 py-1 text-xs font-black text-k-ink">
            Masquée
          </span>
        ) : null}
      </div>

      {peutEditer ? (
        <form onSubmit={modifier.onSubmit} className="mb-5 space-y-3">
          <input type="hidden" name="id" value={carte.id} />
          <div className="max-w-sm">
            <Label htmlFor={`carte-nom-${carte.id}`}>Nom de la carte</Label>
            <Input
              id={`carte-nom-${carte.id}`}
              name="nom"
              defaultValue={carte.nom}
              required
              maxLength={VITRINE_CARTE_NOM_MAX}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-k-ink">
            <input
              type="checkbox"
              name="active"
              value="true"
              defaultChecked={carte.active}
              className="size-4 accent-k-ink"
            />
            Afficher cette carte à mes clients
          </label>
          {modifier.state && !modifier.state.ok ? (
            <FieldError message={modifier.state.error} />
          ) : null}
          {modifier.state?.ok ? (
            <p className="text-sm font-semibold text-green-700">Enregistré.</p>
          ) : null}
          <Button type="submit" disabled={modifier.pending}>
            {modifier.pending ? "Enregistrement…" : "Enregistrer la carte"}
          </Button>
        </form>
      ) : null}

      <div className="border-t-2 border-dashed border-zinc-200 pt-4">
        <h3 className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Rubriques
        </h3>
        <p className="mb-3 text-sm text-zinc-500">
          « Entrées », « Crus au verre », « Nos classiques ».
        </p>

        {ordre.erreur ? (
          <p role="alert" className="mb-3 text-sm font-semibold text-red-600">
            {ordre.erreur}
          </p>
        ) : null}

        {vide ? (
          <p className="mb-3 text-sm text-zinc-500">
            Aucune rubrique — cette carte n&apos;affichera rien tant qu&apos;elle
            est vide.
          </p>
        ) : (
          <ul className="mb-4 space-y-4">
            {ordre.affiches.map((rubrique, i) => (
              <RubriqueEditeur
                key={rubrique.id}
                rubrique={rubrique}

                index={i}
                total={ordre.affiches.length}
                peutEditer={peutEditer}
                reorderPending={ordre.pending}
                onDeplacer={ordre.deplacer}
              />
            ))}
          </ul>
        )}

        {peutEditer ? (
          <CreerRubriqueForm
            menuId={carte.id}
            onCree={(rubrique) =>
              setCategoriesAffichees((precedentes) => [
                ...precedentes,
                { ...rubrique, action: null, fiches: [] },
              ])
            }
          />
        ) : null}
      </div>

      {peutEditer ? (
        <div className="mt-5 border-t-2 border-dashed border-zinc-200 pt-4">
          {vide ? (
            <form onSubmit={supprimer.onSubmit}>
              <input type="hidden" name="id" value={carte.id} />
              {supprimer.state && !supprimer.state.ok ? (
                <FieldError message={supprimer.state.error} />
              ) : null}
              <Button
                type="submit"
                variant="danger"
                disabled={supprimer.pending}
                className="px-3 py-1.5 text-xs"
              >
                {supprimer.pending ? "Suppression…" : "Supprimer la carte"}
              </Button>
            </form>
          ) : (
            // LE REFUS EST DIT AVANT LE CLIC, pas après. La base refuse la
            // suppression d'une carte non vide et nomme le compte ; le bouton
            // proposé quand même n'aurait servi qu'à faire découvrir la règle
            // par un message d'erreur.
            <p className="text-sm text-zinc-500">
              Pour retirer cette carte, videz-la de ses{" "}
              {categoriesAffichees.length} rubrique
              {categoriesAffichees.length > 1 ? "s" : ""} — ou décochez
              simplement « Afficher cette carte », ce qui la retire de la vue de
              vos clients sans rien effacer.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function CreerRubriqueForm({
  menuId,
  onCree,
}: {
  menuId: string;
  onCree: (rubrique: VitrineRubriqueCreee) => void;
}) {
  const { state, pending, onSubmit } = useActionForm(createVitrineRubrique, {
    networkError: "Création impossible, réessayez.",
    resetOnSuccess: true,
    refreshOnSuccess: false,
    onSuccess: onCree,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="menu_id" value={menuId} />
      <div className="min-w-0 flex-1">
        <Label htmlFor={`rubrique-nouvelle-${menuId}`}>Nouvelle rubrique</Label>
        <Input
          id={`rubrique-nouvelle-${menuId}`}
          name="nom"
          required
          maxLength={VITRINE_RUBRIQUE_NOM_MAX}
          placeholder="Entrées"
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Ajout…" : "Ajouter"}
      </Button>
      {state && !state.ok ? (
        <div className="w-full">
          <FieldError message={state.error} />
        </div>
      ) : null}
      {state?.ok ? (
        <p className="w-full text-sm font-semibold text-green-700">
          Rubrique ajoutée.
        </p>
      ) : null}
    </form>
  );
}

function RubriqueEditeur({
  rubrique,
  index,
  total,
  peutEditer,
  reorderPending,
  onDeplacer,
}: {
  rubrique: VitrineRubriqueView;
  index: number;
  total: number;
  peutEditer: boolean;
  reorderPending: boolean;
  onDeplacer: (index: number, direction: -1 | 1) => void;
}) {
  const [fichesAffichees, setFichesAffichees] = useState(rubrique.fiches);

  const modifier = useActionForm(updateVitrineRubrique, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const supprimer = useActionForm(deleteVitrineRubrique, {
    networkError: "Suppression impossible, réessayez.",
  });

  const ordre = useReordonner(fichesAffichees, (ids) => {
    const fd = new FormData();
    fd.set("categorie_id", rubrique.id);
    fd.set("order", JSON.stringify(ids));
    return reorderVitrineFiches(null, fd);
  });

  return (
    <li className="rounded-xl border-2 border-k-ink/15 p-3">
      <div className="flex items-start gap-3">
        {peutEditer ? (
          <FlechesOrdre
            index={index}
            total={total}
            nom={rubrique.nom}
            disabled={reorderPending}
            onDeplacer={onDeplacer}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-k-ink">{rubrique.nom}</p>
          <p className="text-xs text-zinc-500">
            {fichesAffichees.length} fiche
            {fichesAffichees.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {ordre.erreur ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-600">
          {ordre.erreur}
        </p>
      ) : null}

      {fichesAffichees.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {ordre.affiches.map((fiche, i) => (
            <FicheEditeur
              key={fiche.id}
              fiche={fiche}

              index={i}
              total={ordre.affiches.length}
              peutEditer={peutEditer}
              reorderPending={ordre.pending}
              onDeplacer={ordre.deplacer}
            />
          ))}
        </ul>
      ) : null}

      {peutEditer ? (
        <div className="mt-3 space-y-3">
          <CreerFicheForm
            categorieId={rubrique.id}
            onCree={(fiche) =>
              setFichesAffichees((precedentes) => [...precedentes, fiche])
            }
          />

          <details>
            <summary className="cursor-pointer list-none text-sm font-bold text-k-body underline underline-offset-2">
              Renommer ou supprimer cette rubrique
            </summary>
            <div className="mt-3 space-y-3">
              <form
                onSubmit={modifier.onSubmit}
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="id" value={rubrique.id} />
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`rubrique-nom-${rubrique.id}`}>Nom</Label>
                  <Input
                    id={`rubrique-nom-${rubrique.id}`}
                    name="nom"
                    defaultValue={rubrique.nom}
                    required
                    maxLength={VITRINE_RUBRIQUE_NOM_MAX}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`rubrique-action-${rubrique.id}`}>
                    Action sous la rubrique
                  </Label>
                  <select
                    id={`rubrique-action-${rubrique.id}`}
                    name="action"
                    defaultValue={rubrique.action ?? ""}
                    className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
                  >
                    <option value="">Aucune</option>
                    {VITRINE_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {ACTIONS_FR[action]}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="secondary" disabled={modifier.pending}>
                  {modifier.pending ? "Enregistrement…" : "Enregistrer"}
                </Button>
                {modifier.state && !modifier.state.ok ? (
                  <div className="w-full">
                    <FieldError message={modifier.state.error} />
                  </div>
                ) : null}
                {modifier.state?.ok ? (
                  <p className="w-full text-sm font-semibold text-green-700">
                    Enregistré.
                  </p>
                ) : null}
              </form>

              <form onSubmit={supprimer.onSubmit}>
                <input type="hidden" name="id" value={rubrique.id} />
                {supprimer.state && !supprimer.state.ok ? (
                  <FieldError message={supprimer.state.error} />
                ) : null}
                {/* La suppression d'une rubrique emporte ses fiches. Elle tient
                    sur cet écran — le commerçant VOIT ce qu'il retire, juste
                    au-dessus — d'où l'absence de case de confirmation, réservée
                    aux gestes qui détruisent ce qu'un client tient en main. */}
                <Button
                  type="submit"
                  variant="danger"
                  disabled={supprimer.pending}
                  className="px-3 py-1.5 text-xs"
                >
                  {supprimer.pending
                    ? "Suppression…"
                    : rubrique.fiches.length > 0
                      ? `Supprimer la rubrique et ses ${rubrique.fiches.length} fiches`
                      : "Supprimer la rubrique"}
                </Button>
              </form>
            </div>
          </details>
        </div>
      ) : null}
    </li>
  );
}

function CreerFicheForm({
  categorieId,
  onCree,
}: {
  categorieId: string;
  onCree: (fiche: VitrineFicheCreee) => void;
}) {
  const { state, pending, onSubmit } = useActionForm(createVitrineFiche, {
    networkError: "Création impossible, réessayez.",
    resetOnSuccess: true,
    refreshOnSuccess: false,
    onSuccess: onCree,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="categorie_id" value={categorieId} />
      <div className="min-w-0 flex-1">
        <Label htmlFor={`fiche-nouvelle-${categorieId}`}>Nouveau plat</Label>
        <Input
          id={`fiche-nouvelle-${categorieId}`}
          name="nom"
          required
          maxLength={VITRINE_FICHE_NOM_MAX}
          placeholder="Tarte aux pommes"
        />
        {/* On ne demande QUE le nom ici : la description, le prix, les badges
            et les allergènes se règlent ensuite, sous « Modifier ». Un
            formulaire de création à huit champs fait renoncer à ajouter le plat
            qu'on vient de mettre à la carte. */}
        <p className="mt-1.5 text-xs text-zinc-500">
          Le prix, la description et les allergènes se renseignent juste après.
        </p>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Ajout…" : "Ajouter"}
      </Button>
      {state && !state.ok ? (
        <div className="w-full">
          <FieldError message={state.error} />
        </div>
      ) : null}
      {state?.ok ? (
        <p className="w-full text-sm font-semibold text-green-700">
          Plat ajouté.
        </p>
      ) : null}
    </form>
  );
}
