"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  applyCampaignTemplate,
  deleteCampaignTemplate,
} from "@/actions/campaign-templates";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * Boutons de la place de marché : appliquer un modèle, supprimer un modèle
 * privé. Les cartes elles-mêmes restent rendues côté serveur (les blueprints
 * ne traversent pas le réseau) — seuls ces deux boutons sont clients.
 *
 * Pas de `useTransition` ici : l'état de chargement doit retomber même quand
 * le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */

/**
 * « Utiliser ce modèle » → crée une campagne EN BROUILLON et ouvre son
 * éditeur. Rien n'est publié ni envoyé : la promesse est répétée sous le
 * bouton par la galerie, l'action ne fait qu'insérer campagne + jeu + lots.
 */
export function ApplyTemplateButton({
  templateKey,
  templateId,
  name,
}: {
  /** Clé d'un modèle du catalogue Lastchance. */
  templateKey?: string;
  /** Identifiant d'un modèle privé de l'organisation. */
  templateId?: string;
  /** Nom du modèle — pour un libellé de bouton explicite au lecteur d'écran. */
  name: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const apply = () => {
    if (pending) return;
    setError(undefined);
    setPending(true);
    void (async () => {
      try {
        const res = await applyCampaignTemplate({ templateKey, templateId });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Succès = navigation FRANCHE vers l'éditeur du brouillon créé.
        // `router.push` a été mesuré flaky ici (`docs/bugs.md` : « transition
        // figée après une action réussie », vercel/next.js #82289/#88767) —
        // le cache client du routeur n'applique pas toujours le RSC fraîchement
        // fetché après une action serveur. Même correctif que la création de
        // saison de progression (`progression-new-season.tsx`) : une
        // navigation complète, jamais périmée, contre un `push` qui marche
        // la plupart du temps.
        window.location.assign(`/dashboard/campaigns/${res.data.campaignId}`);
      } catch {
        setError("Création impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <div>
      <Button
        type="button"
        onClick={apply}
        disabled={pending}
        aria-label={`Utiliser le modèle ${name} — crée une campagne brouillon`}
        className="w-full sm:w-auto"
      >
        {pending ? "Création du brouillon…" : "Utiliser ce modèle"}
      </Button>
      <div aria-live="polite">
        <FieldError message={error} />
      </div>
    </div>
  );
}

/** Supprime un modèle privé, après confirmation explicite. */
export function DeleteTemplateButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const remove = () => {
    if (pending) return;
    if (
      !window.confirm(
        `Supprimer le modèle « ${name} » ? Les campagnes déjà créées à partir de ce modèle ne sont pas touchées.`,
      )
    ) {
      return;
    }
    setError(undefined);
    setPending(true);
    void (async () => {
      try {
        const res = await deleteCampaignTemplate({ id });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Suppression impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        onClick={remove}
        disabled={pending}
        aria-label={`Supprimer le modèle ${name}`}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        {pending ? "Suppression…" : "Supprimer"}
      </Button>
      <div aria-live="polite">
        <FieldError message={error} />
      </div>
    </div>
  );
}
