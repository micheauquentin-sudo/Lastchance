"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  abonnerToast,
  lireToasts,
  lireToastsServeur,
  retirerToast,
  type Toast,
} from "@/lib/toast-bus";

/**
 * L'ACCUSÉ DE RÉCEPTION D'UN ENREGISTREMENT QUE PERSONNE N'A DEMANDÉ.
 *
 * L'enregistrement automatique supprime le bouton « Enregistrer » : le
 * commerçant tape, et plus rien ne lui dit que c'est parti. Un « Enregistré. »
 * posé sous le champ ne suffit pas — il est souvent hors de vue, sous le pli,
 * dans une carte qu'on a déjà quittée du regard. D'où un seul point d'annonce,
 * fixe, en haut à droite.
 *
 * ── Les rôles ne sont pas décoratifs ──
 *
 * `role="status"` (poli) pour un succès : l'annonce se met en file derrière ce
 * que le lecteur d'écran est en train de dire, ce qui est exactement ce qu'on
 * veut d'un « Enregistré. » qui arrive pendant que l'utilisateur tape.
 * `role="alert"` (assertif) pour un échec, conformément à la convention du
 * dépôt (`admin/worker-cadence-panel.tsx`) : un échec interrompt, parce qu'il
 * demande un geste et que la saisie qui continue par-dessus est perdue.
 *
 * ── Le conteneur est TOUJOURS rendu ──
 *
 * Une région live insérée dans le DOM en même temps que son texte n'est pas
 * annoncée de façon fiable. Le conteneur existe donc dès le montage du layout,
 * vide, et seules les lignes y apparaissent.
 *
 * `pointer-events-none` : le conteneur flotte au-dessus du contenu, il ne doit
 * jamais avaler un clic destiné à ce qui est dessous.
 */

/** Durée d'affichage. Assez pour être lu, assez court pour ne pas gêner. */
export const DUREE_TOAST_MS = 2500;

export function ToastEnregistrement() {
  const toasts = useSyncExternalStore(
    abonnerToast,
    lireToasts,
    lireToastsServeur,
  );

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
      data-testid="toasts"
    >
      {toasts.map((toast) => (
        <LigneToast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function LigneToast({ toast }: { toast: Toast }) {
  useEffect(() => {
    const minuteur = setTimeout(() => retirerToast(toast.id), DUREE_TOAST_MS);
    return () => clearTimeout(minuteur);
  }, [toast.id]);

  const succes = toast.ton === "succes";
  return (
    <p
      role={succes ? "status" : "alert"}
      // `aria-live` est implicite pour les deux rôles ; il est écrit pour le
      // succès parce que c'est la promesse qui compte ici — ne pas couper la
      // parole à quelqu'un qui est en train de saisir.
      {...(succes ? { "aria-live": "polite" as const } : {})}
      className={`rounded-xl border-2 border-k-ink px-4 py-2 text-sm font-bold text-k-ink shadow-[3px_3px_0_rgba(33,29,22,0.9)] ${
        succes ? "bg-white" : "bg-red-100"
      }`}
    >
      {toast.message}
    </p>
  );
}
