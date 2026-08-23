"use client";

import { useState } from "react";
import { deleteVitrinePhoto, setVitrinePhoto } from "@/actions/vitrine";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  ImageClientError,
  preparerImageVitrine,
} from "@/components/vitrine/image-client";
import {
  sourcesPhotoVitrine,
  VITRINE_COUVERTURE_LARGEUR_MAX,
  VITRINE_PHOTO_ALT_MAX,
  VITRINE_PHOTO_LARGEUR_MAX,
} from "@/lib/vitrine-photo";

/**
 * VIT-7 — LE CHAMP PHOTO, CÔTÉ COMMERÇANT.
 *
 * ── DEUX FORMULAIRES, ET C'EST VOULU ──
 *
 * « Enregistrer » et « Retirer » sont deux actions distinctes, donc deux
 * `<form>`. Un seul formulaire avec un bouton « retirer » aurait envoyé la
 * data URL de l'image en cours pour demander sa suppression — plusieurs
 * centaines de kilo-octets pour dire « efface ».
 *
 * ── L'ALTERNATIVE SE SAISIT AVANT L'ENVOI, PAS APRÈS ──
 *
 * Le champ est là dès que l'image est prête, et son absence n'empêche rien :
 * une photo sans alternative est traitée comme DÉCORATIVE (`alt=""`), ce qui
 * est honnête, plutôt que d'inventer une description à partir du nom du plat
 * — un lecteur d'écran lirait alors deux fois la même chose.
 *
 * ── LA PRÉPARATION EST VISIBLE ──
 *
 * Réduire une photo de téléphone prend une seconde ou deux. Sans état
 * « préparation », l'écran ne bouge pas après le choix du fichier et le
 * commerçant reclique — ce qui relance le travail.
 */
export function PhotoChamp({
  cible,
  ficheId,
  chemin,
  alt,
  peutEditer,
  titre = "Photo",
}: {
  cible: "fiche" | "couverture";
  ficheId?: string;
  chemin: string | null;
  alt: string | null;
  peutEditer: boolean;
  titre?: string;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [preparation, setPreparation] = useState(false);

  const enregistrer = useActionForm(setVitrinePhoto, {
    networkError: "Envoi impossible, réessayez.",
    onSuccess: () => {
      setImage(null);
      setRefus(null);
    },
  });
  const retirer = useActionForm(deleteVitrinePhoto, {
    networkError: "Suppression impossible, réessayez.",
  });

  const sources = sourcesPhotoVitrine(chemin);
  const identifiant = `photo-${cible}-${ficheId ?? "couverture"}`;

  async function choisir(evenement: React.ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    // Vidé tout de suite : rechoisir le même fichier doit redéclencher.
    evenement.target.value = "";
    if (!fichier) return;

    setPreparation(true);
    setRefus(null);
    try {
      setImage(
        await preparerImageVitrine(
          fichier,
          cible === "couverture"
            ? VITRINE_COUVERTURE_LARGEUR_MAX
            : VITRINE_PHOTO_LARGEUR_MAX,
        ),
      );
    } catch (cause) {
      setImage(null);
      setRefus(
        cause instanceof ImageClientError
          ? cause.message
          : "Cette image n’a pas pu être préparée.",
      );
    } finally {
      setPreparation(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-k-ink/15 px-4 py-4">
      <p className="text-sm font-black uppercase tracking-wide text-k-body">
        {titre}
      </p>

      {sources && !image ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- Storage public,
              hors du domaine servi par l'optimiseur : `next/image` exigerait de
              déclarer le hôte distant, pour un gain nul sur une image déjà
              redimensionnée et convertie en webp par le serveur. */}
          <img
            src={sources.grande}
            alt={alt ?? ""}
            className="w-full max-w-xs rounded-xl border-2 border-k-ink/10 object-cover"
          />
          <p className="text-xs text-zinc-500">
            {alt ? `Description : ${alt}` : "Aucune description saisie."}
          </p>
        </div>
      ) : null}

      {image ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local
              (data URL), aucun réseau, aucun optimiseur à impliquer. */}
          <img
            src={image}
            alt="Aperçu de la photo choisie"
            className="w-full max-w-xs rounded-xl border-2 border-k-yellow object-cover"
          />
          <p className="text-xs font-semibold text-zinc-500">
            Cette photo n’est pas encore enregistrée.
          </p>
        </div>
      ) : null}

      {peutEditer ? (
        <>
          <div>
            <Label htmlFor={`${identifiant}-fichier`}>
              {sources ? "Remplacer l’image" : "Choisir une image"}
            </Label>
            <input
              id={`${identifiant}-fichier`}
              type="file"
              accept="image/*"
              onChange={choisir}
              disabled={preparation || enregistrer.pending}
              className="block w-full text-sm text-k-ink file:mr-3 file:rounded-xl file:border-2 file:border-k-ink file:bg-k-yellow file:px-3.5 file:py-2 file:text-sm file:font-bold file:text-k-ink hover:file:bg-k-yellow/80 disabled:opacity-60"
              aria-describedby={`${identifiant}-aide`}
            />
            <p id={`${identifiant}-aide`} className="mt-1.5 text-xs text-zinc-500">
              L’image est réduite sur votre appareil, puis reconvertie par nos
              serveurs. Les données de l’appareil photo — dont le lieu de prise
              de vue — sont retirées avant publication.
            </p>
          </div>

          {preparation ? (
            <p className="text-xs font-semibold text-zinc-500">
              Préparation de l’image…
            </p>
          ) : null}
          {refus ? <FieldError message={refus} /> : null}

          <form onSubmit={enregistrer.onSubmit} className="space-y-3">
            <input type="hidden" name="cible" value={cible} />
            {ficheId ? (
              <input type="hidden" name="fiche_id" value={ficheId} />
            ) : null}
            {image ? <input type="hidden" name="image" value={image} /> : null}

            <div>
              <Label htmlFor={`${identifiant}-alt`}>
                Description de l’image
              </Label>
              <Input
                id={`${identifiant}-alt`}
                name="alt"
                defaultValue={alt ?? ""}
                maxLength={VITRINE_PHOTO_ALT_MAX}
                placeholder="Ce que montre la photo, en une phrase"
              />
            </div>

            {enregistrer.state && !enregistrer.state.ok ? (
              <FieldError message={enregistrer.state.error} />
            ) : null}
            {enregistrer.state?.ok ? (
              <p className="text-sm font-semibold text-green-700">
                Photo enregistrée.
              </p>
            ) : null}

            <Button type="submit" disabled={!image || enregistrer.pending}>
              {enregistrer.pending ? "Envoi…" : "Enregistrer la photo"}
            </Button>
          </form>

          {sources ? (
            <form onSubmit={retirer.onSubmit}>
              <input type="hidden" name="cible" value={cible} />
              {ficheId ? (
                <input type="hidden" name="fiche_id" value={ficheId} />
              ) : null}
              {retirer.state && !retirer.state.ok ? (
                <FieldError message={retirer.state.error} />
              ) : null}
              <Button
                type="submit"
                variant="secondary"
                disabled={retirer.pending}
              >
                {retirer.pending ? "Suppression…" : "Retirer la photo"}
              </Button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
