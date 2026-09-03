"use client";

import { type DeclarationEtape, libelleEtape } from "@/components/studio/etapes";

/**
 * LE FIL DES ÉTAPES — des BOUTONS, pas des liens (VIT-35, généralisé VIT-38).
 *
 * Changer d'étape ne doit pas naviguer : l'état vit en mémoire, et une
 * navigation le perdrait avec tout ce que le commerçant est en train
 * d'essayer. C'est la différence qui compte entre ce fil et les ateliers
 * historiques, dont chaque étape était un aller-retour serveur.
 *
 * ── JAUNE, ET NUMÉROTÉ ──
 *
 * Le jaune est la couleur des boutons de personnalisation de ce produit ; les
 * étapes en sont. L'étape COURANTE se distingue par trois choses à la fois —
 * jaune plein contre jaune pâle, ombre dure, pastille inversée — parce qu'une
 * seule ne suffit pas : la teinte seule échoue en plein soleil sur un
 * téléphone de comptoir, et `aria-current` ne se voit pas.
 *
 * Le numéro dit combien il en reste et où l'on en est ; c'est ce qui fait la
 * différence entre un panneau et un parcours. Il est doublé dans le nom
 * accessible (`libelleEtape`), sans quoi un lecteur d'écran annoncerait
 * « 3 Ma carte » sans dire de quoi 3 est le numéro.
 *
 * ── CENTRÉ, MAIS PAS AU PRIX DU DÉFILEMENT ──
 *
 * `justify-center` posé sur le conteneur qui défile rend le DÉBUT de la liste
 * inatteignable dès qu'elle déborde : les premières étapes se font rogner à
 * gauche sans qu'aucun défilement puisse y revenir. Le centrage passe donc par
 * un enfant `w-max mx-auto` — au large il se centre, à l'étroit ses marges
 * valent zéro et le défilement repart de la première étape.
 */
export function BarreEtapes<C extends string>({
  etapes,
  courante,
  onEtape,
}: {
  etapes: readonly DeclarationEtape<C>[];
  courante: C;
  onEtape: (cle: C) => void;
}) {
  return (
    <nav
      aria-label="Étapes du studio"
      className="overflow-x-auto px-4 pb-2 sm:px-6"
    >
      <div className="mx-auto flex w-max gap-1.5">
        {etapes.map((e, i) => {
          const active = courante === e.cle;
          return (
            <button
              key={e.cle}
              type="button"
              onClick={() => onEtape(e.cle)}
              aria-current={active ? "step" : undefined}
              aria-label={libelleEtape(etapes, e.cle)}
              title={e.resume}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border-2 px-2.5 py-1.5 text-xs font-black text-k-ink ${
                active
                  ? "border-k-ink bg-k-yellow shadow-[2px_2px_0_var(--color-k-ink)]"
                  : "border-k-ink/25 bg-k-yellow/25 hover:border-k-ink hover:bg-k-yellow/60"
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none ${
                  active
                    ? "bg-k-ink text-k-yellow"
                    : "border border-k-ink/30 bg-white text-k-ink"
                }`}
              >
                {i + 1}
              </span>
              {e.titre}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
