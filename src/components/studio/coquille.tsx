"use client";

import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { BarreEtapes } from "@/components/studio/barre-etapes";
import type { DeclarationEtape } from "@/components/studio/etapes";

/**
 * LA COQUILLE D'UN STUDIO — extraite du studio vitrine pour les douze
 * animations du produit (VIT-38).
 *
 * ── CE QU'ELLE TIENT, ET CE QU'ELLE NE TIENT PAS ──
 *
 * Elle tient ce qui doit être IDENTIQUE partout : le bandeau collant, le fil
 * d'étapes, l'état d'enregistrement, le bouton, la rangée à deux colonnes qui
 * défilent chacune chez elle, et surtout le formulaire vide. Elle ne connaît
 * ni l'état d'un module, ni ses champs, ni son action : chaque animation lui
 * passe son contenu d'étape, son aperçu et ses champs cachés.
 *
 * C'est la condition de la demande — « le client ne doit voir aucune
 * différence quand il paramètre n'importe quelle application ». Douze copies
 * du même écran divergeraient à la première correction ; une coquille
 * partagée ne le peut pas.
 *
 * ── LE FORMULAIRE VIDE EST LA PIÈCE CENTRALE, PAS UN DÉTAIL ──
 *
 * Il est le VOISIN de la mise en page, jamais son parent. Deux raisons, et les
 * deux ont déjà coûté :
 *
 * 1. Plusieurs blocs d'un studio ont leur PROPRE `<form>` (un logo, une
 *    bannière, une ligne de catalogue). Un `<form>` dans un `<form>` est du
 *    HTML invalide : le navigateur déplie en silence et l'hydratation de toute
 *    la page meurt — défaut livré en VIT-16.
 * 2. Une étape qu'on quitte est DÉMONTÉE. Si ses champs portaient les `name`
 *    de la charge utile, ils disparaîtraient du formulaire et l'enregistrement
 *    suivant les effacerait en base. C'est la panne que toutes les actions de
 *    ce produit rendent possible, parce qu'elles écrasent par absence :
 *    `updateJackpotCampaign` réécrit quatorze colonnes en bloc, et un
 *    `public_slug` non rendu casse tous les QR déjà imprimés, sans un mot.
 *
 * D'où la règle, qui ne se négocie pas : **aucun contrôle visible ne porte de
 * `name`**, et le module rend sa charge utile EN ENTIER depuis son état, à
 * chaque rendu, dans `champsCaches`. Il n'existe alors aucun chemin par lequel
 * un champ manque.
 */
export function CoquilleStudio<C extends string>({
  titre,
  hrefRetour,
  idFormulaire,
  formulaire,
  onSubmit,
  champsCaches,
  etapes,
  etape,
  onEtape,
  peutEditer,
  enregistrement,
  outils,
  apercu,
  children,
}: {
  titre: string;
  hrefRetour: string;
  /** L'identifiant que le bouton cible par `form=`. Unique dans la page. */
  idFormulaire: string;
  formulaire: RefObject<HTMLFormElement | null>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** La charge utile COMPLÈTE, rendue depuis l'état du module. */
  champsCaches: ReactNode;
  etapes: readonly DeclarationEtape<C>[];
  etape: C;
  onEtape: (cle: C) => void;
  peutEditer: boolean;
  enregistrement: {
    /** Une soumission est en vol. */
    enCours: boolean;
    /** Le SERVEUR a répondu « enregistré » au moins une fois. */
    reussi: boolean;
    erreur?: string;
  };
  /** Réglages d'affichage qui ne partent jamais au serveur (un aperçu
   *  d'exemples, un sélecteur de figure). Optionnel. */
  outils?: ReactNode;
  /** La colonne de droite. Optionnelle : toutes les animations n'ont pas
   *  d'aperçu fidèle possible, et un faux aperçu est pire que pas d'aperçu. */
  apercu?: ReactNode;
  /** Le contenu de l'étape courante — la colonne de gauche. */
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-k-bg">
      {/* Vide de mise en page, plein de champs. Voir l'en-tête du fichier. */}
      <form
        id={idFormulaire}
        ref={formulaire}
        onSubmit={onSubmit}
        className="hidden"
      >
        {champsCaches}
      </form>

      <div className="sticky top-0 z-40 border-b-2 border-k-ink bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={hrefRetour}
              className="rounded-xl border-2 border-k-ink bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:bg-k-yellow"
            >
              ← Retour
            </Link>
            <span className="truncate text-sm font-black text-k-ink">
              {titre}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FieldError message={enregistrement.erreur} />
            {peutEditer ? (
              <>
                {/* L'ÉTAT SE LIT, IL NE S'INTERROMPT PAS. `aria-live="polite"`
                    et non `assertive` : un lecteur d'écran doit l'annoncer
                    entre deux phrases, jamais couper celle en cours. */}
                <span
                  aria-live="polite"
                  className="text-xs font-semibold text-zinc-500"
                >
                  {enregistrement.enCours
                    ? "Enregistrement…"
                    : enregistrement.reussi
                      ? "Modifications enregistrées"
                      : "Enregistrement automatique"}
                </span>
                {/* LE BOUTON RESTE, MÊME AVEC L'AUTOMATISME. Il sert à qui
                    veut partir tout de suite : cliquer envoie sans attendre le
                    délai, et donne la certitude que rien n'est en vol. */}
                <Button
                  type="submit"
                  form={idFormulaire}
                  disabled={enregistrement.enCours}
                >
                  {enregistrement.enCours ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {outils ? (
          <div className="flex flex-wrap items-center gap-3 px-4 pb-2 sm:px-6">
            {outils}
          </div>
        ) : null}

        <BarreEtapes etapes={etapes} courante={etape} onEtape={onEtape} />
      </div>

      {/* DEUX COLONNES — chacune défile CHEZ ELLE.

          Sans `overflow-hidden` au-dessus, régler un curseur en bas de la
          colonne de gauche fait défiler l'aperçu hors de l'écran : on règle
          alors ce qu'on ne voit plus.

          ET LA RANGÉE EST PLAFONNÉE (VIT-36). « Prendre tout ce qui reste »
          n'a pas de fin : sans plafond, la gauche prenait 1350 px pour 512 à
          l'aperçu sur un écran de 1920. Le plafond est posé ICI et non sur la
          colonne de gauche — borner l'aside laisserait un vide à droite de
          l'aperçu, borner la rangée recentre les deux.

          `min-w-0` sur la gauche n'est pas décoratif : sans lui, un enfant
          large — une rangée de champs — impose sa largeur minimale au `flex-1`
          et pousse l'aperçu hors de l'écran au lieu de défiler chez lui. */}
      <div className="mx-auto flex w-full flex-col gap-4 p-4 lg:h-[calc(100dvh-104px)] lg:max-w-[1360px] lg:flex-row lg:items-stretch lg:overflow-hidden">
        <aside className="w-full min-w-0 flex-1 space-y-4 overflow-y-auto rounded-2xl border-2 border-k-ink bg-white p-4 lg:h-full">
          {children}
        </aside>
        {apercu}
      </div>
    </div>
  );
}
