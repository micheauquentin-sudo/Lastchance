"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { applyCampaignTemplate } from "@/actions/campaign-templates";
import {
  suggererIdeesCampagne,
  type IdeeCampagne,
} from "@/actions/ia-assistant";
import { summarizeBlueprint } from "@/components/dashboard/campaign-template-preview";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { ExperienceObjective } from "@/platform/experiences/catalog";

/**
 * Assistant de création — le FORMULAIRE (composant client).
 *
 * Rendu UNIQUEMENT quand la clé du fournisseur est posée : le parent
 * (`ia-suggestion-panel.tsx`, serveur) lit `isIaConfigured()` et ne monte ce
 * composant que si elle rend `true`. Sans clé, aucun bouton n'existe — la
 * dormance est décidée en amont, pas masquée ici (même motif que les add-ons
 * non configurés dans `/dashboard/settings/modules`).
 *
 * DEUX INVARIANTS, comme la place de marché de campagnes :
 *  1. L'assistant PROPOSE, le commerçant VALIDE. Une idée n'est appliquée
 *     qu'au clic explicite « Appliquer » — jamais au rendu, jamais à la
 *     génération. Le test le garde.
 *  2. « Appliquer » ne fait qu'un BROUILLON. Le blueprint (éventuellement
 *     retouché) est soumis à `applyCampaignTemplate`, qui le REVALIDE côté
 *     serveur (`campaignBlueprintSchema`) puis crée une campagne `draft` :
 *     rien n'est publié, aucun email n'est envoyé. L'appel LLM ne façonne que
 *     du texte ; la garde métier reste server-side.
 */

/** Les quatre objectifs du catalogue — un typo casse le typecheck. */
const OBJECTIFS: readonly ExperienceObjective[] = [
  "Acquérir",
  "Fidéliser",
  "Animer en direct",
  "Créer du trafic",
];

type SuggestionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; idees: IdeeCampagne[] };

const INITIAL: SuggestionState = { status: "idle" };

/**
 * Action de `useActionState` : lit le formulaire, appelle la server action et
 * range le résultat en état affichable. Le « type de commerce » est
 * FACULTATIF — le schéma serveur le tolère vide (l'assistant sait proposer sans
 * précision) : on ne bloque donc pas côté client sur une entrée vide, seul
 * l'objectif est une direction obligatoire.
 */
async function demanderIdees(
  _previous: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  const typeCommerce = String(formData.get("typeCommerce") ?? "").trim();
  const objectif = String(formData.get("objectif") ?? "") as ExperienceObjective;

  const res = await suggererIdeesCampagne({ typeCommerce, objectif });
  if (!res.ok) {
    return { status: "error", message: res.error };
  }
  return { status: "ready", idees: res.data.idees };
}

const selectClasses =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink transition-shadow focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

export function IaSuggestionForm() {
  const [state, formAction, isPending] = useActionState(demanderIdees, INITIAL);
  const commerceId = useId();
  const objectifId = useId();

  return (
    <div className="mt-5">
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={commerceId}>Votre commerce (facultatif)</Label>
          <Input
            id={commerceId}
            name="typeCommerce"
            maxLength={80}
            placeholder="Boulangerie de quartier, salon de coiffure, caviste…"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor={objectifId}>Votre objectif</Label>
          <select id={objectifId} name="objectif" className={selectClasses} defaultValue={OBJECTIFS[0]}>
            {OBJECTIFS.map((objectif) => (
              <option key={objectif} value={objectif}>
                {objectif}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? "L'assistant réfléchit…" : "Proposer 3 idées"}
          </Button>
        </div>
      </form>

      {/* État de chargement HONNÊTE : l'appel LLM prend quelques secondes, et
          c'est annoncé au lecteur d'écran (role=status) plutôt que de figer la
          page sans explication. */}
      {isPending && (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-zinc-500">
          L&apos;assistant prépare trois idées, cela prend quelques secondes…
        </p>
      )}

      {state.status === "error" && (
        <div aria-live="polite">
          <FieldError message={state.message} />
        </div>
      )}

      {state.status === "ready" && !isPending && (
        <IdeesResultat idees={state.idees} />
      )}
    </div>
  );
}

export function IdeesResultat({ idees }: { idees: IdeeCampagne[] }) {
  if (idees.length === 0) {
    return (
      <p className="mt-6 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
        L&apos;assistant n&apos;a rien proposé cette fois. Reformulez votre
        commerce ou changez d&apos;objectif, puis relancez.
      </p>
    );
  }

  return (
    <section className="mt-6" aria-labelledby="ia-idees-titre">
      <h3 id="ia-idees-titre" className="font-bold text-k-ink">
        {idees.length === 1
          ? "Une idée à relire"
          : `${idees.length} idées à relire`}
      </h3>
      <p className="mt-1 text-sm text-zinc-500">
        Retouchez le titre, l&apos;accroche ou les lots avant d&apos;appliquer.
        Rien n&apos;est créé tant que vous n&apos;avez pas cliqué «&nbsp;Appliquer&nbsp;».
      </p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {idees.map((idee, index) => (
          <IdeeVignette key={index} idee={idee} />
        ))}
      </ul>
    </section>
  );
}

function IdeeVignette({ idee }: { idee: IdeeCampagne }) {
  const router = useRouter();
  const [blueprint, setBlueprint] = useState(idee.blueprint);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const fieldId = useId();

  const promises = summarizeBlueprint(blueprint);

  const appliquer = () => {
    if (pending) return;
    setError(undefined);
    setPending(true);
    void (async () => {
      try {
        // Le blueprint (retouché ou non) part au serveur, qui le REVALIDE
        // avant de créer le brouillon — même chemin que les modèles.
        const res = await applyCampaignTemplate({ blueprint });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(`/dashboard/campaigns/${res.data.campaignId}`);
      } catch {
        setError("Création impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <li>
      <div className="flex h-full flex-col rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[3px_3px_0_rgba(33,29,22,0.9)]">
        {editing ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor={`${fieldId}-nom`}>Titre de la campagne</Label>
              <Input
                id={`${fieldId}-nom`}
                value={blueprint.texts.campaignName}
                maxLength={120}
                onChange={(e) =>
                  setBlueprint({
                    ...blueprint,
                    texts: { ...blueprint.texts, campaignName: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-accroche`}>Accroche joueur</Label>
              <Input
                id={`${fieldId}-accroche`}
                value={blueprint.texts.wheelTitle}
                maxLength={80}
                onChange={(e) =>
                  setBlueprint({
                    ...blueprint,
                    texts: { ...blueprint.texts, wheelTitle: e.target.value },
                  })
                }
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1 block text-sm font-bold text-k-ink">
                Lots
              </legend>
              {blueprint.prizes.map((prize, index) => (
                <div key={index}>
                  <Label htmlFor={`${fieldId}-lot-${index}`} className="sr-only">
                    Lot {index + 1}
                  </Label>
                  <Input
                    id={`${fieldId}-lot-${index}`}
                    value={prize.label}
                    maxLength={80}
                    onChange={(e) =>
                      setBlueprint({
                        ...blueprint,
                        prizes: blueprint.prizes.map((p, i) =>
                          i === index ? { ...p, label: e.target.value } : p,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </fieldset>
          </div>
        ) : (
          <>
            <h4 className="font-bold text-k-ink">{blueprint.texts.campaignName}</h4>
            {promises ? (
              <dl className="mt-3 space-y-1 text-xs text-zinc-600">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-zinc-500">Accroche</dt>
                  <dd className="min-w-0 flex-1 italic">« {promises.texts} »</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-zinc-500">Jeu</dt>
                  <dd className="min-w-0 flex-1">{promises.game}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-zinc-500">Lots</dt>
                  <dd className="min-w-0 flex-1">
                    {promises.prizes}
                    {promises.prizeLabels.length > 0 && (
                      <span className="block text-zinc-500">
                        {promises.prizeLabels.join(" · ")}
                        {promises.prizeOverflow > 0 && ` · +${promises.prizeOverflow}`}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-zinc-500">Durée</dt>
                  <dd className="min-w-0 flex-1">{promises.duration}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-xs font-semibold text-red-600">
                Cette idée est incomplète. Relancez l&apos;assistant.
              </p>
            )}
          </>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <Button
            type="button"
            onClick={appliquer}
            disabled={pending}
            aria-label={`Appliquer l'idée ${blueprint.texts.campaignName} — crée une campagne brouillon`}
          >
            {pending ? "Création du brouillon…" : "Appliquer"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            aria-label={
              editing
                ? `Terminer la modification de ${blueprint.texts.campaignName}`
                : `Modifier ${blueprint.texts.campaignName}`
            }
          >
            {editing ? "Terminer" : "Modifier"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Crée un brouillon — rien n&apos;est publié ni envoyé.
        </p>
        <div aria-live="polite">
          <FieldError message={error} />
        </div>
      </div>
    </li>
  );
}
