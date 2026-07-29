"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { saveCampaignAsTemplate } from "@/actions/campaign-templates";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * « Enregistrer comme modèle » — depuis l'éditeur d'une campagne.
 *
 * Sérialise la campagne (visuel, jeu, textes, lots, durée, règles) dans la
 * bibliothèque PRIVÉE de l'organisation. Aucun réglage d'automatisation
 * n'est capturé côté action : un modèle ne propage jamais un scénario
 * d'emailing d'une campagne à une autre.
 *
 * Pending manuel et non `useTransition` : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function SaveCampaignAsTemplate({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(campaignName);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError(undefined);
    setPending(true);
    void (async () => {
      try {
        const res = await saveCampaignAsTemplate({
          campaignId,
          name,
          description: description || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSaved(true);
        setOpen(false);
        router.refresh();
      } catch {
        // Coupure réseau : le dire, plutôt que de laisser le bouton tourner.
        setError("Enregistrement impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <Card>
      <h2 className="font-semibold mb-1">Enregistrer comme modèle</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Range cette campagne dans vos modèles pour la rejouer en un clic plus
        tard. Le modèle reste privé&nbsp;: seule votre équipe le voit.
      </p>

      {saved && (
        <p
          className="mb-4 rounded-xl border-2 border-k-ink bg-k-yellow/30 px-4 py-3 text-sm font-semibold text-k-ink"
          role="status"
        >
          Modèle enregistré. Retrouvez-le dans «&nbsp;Mes modèles&nbsp;» sur la{" "}
          <Link href="/dashboard/campaigns" className="underline">
            page des campagnes
          </Link>
          .
        </p>
      )}

      {!open ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setSaved(false);
            setOpen(true);
          }}
        >
          Enregistrer comme modèle
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="max-w-sm">
            <Label htmlFor="template-name">Nom du modèle</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              autoFocus
              aria-describedby="template-name-help"
            />
            <p id="template-name-help" className="mt-1.5 text-xs text-zinc-500">
              Deux modèles ne peuvent pas porter le même nom.
            </p>
          </div>

          <div className="max-w-sm">
            <Label htmlFor="template-description">
              Description <span className="font-normal">(facultative)</span>
            </Label>
            <Input
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              placeholder="Ex : notre jeu de fin de semaine"
            />
          </div>

          <div aria-live="polite">
            <FieldError message={error} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer le modèle"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setError(undefined);
              }}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
