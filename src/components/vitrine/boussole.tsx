"use client";

import { useState } from "react";
import { ANCRE_BOUSSOLE } from "@/lib/vitrine-action";
import {
  boussoleCommencee,
  fichesDeLaBoussole,
  libelleFacette,
  QUESTIONS_BOUSSOLE,
  type DimensionBoussole,
  type ReponsesBoussole,
} from "@/lib/vitrine-boussole";
import type { FacetteVitrine, VitrineFicheView } from "@/lib/vitrine";

/**
 * LA BOUSSOLE DE CHOIX (VIT-10) — quatre questions, aucune mémoire.
 *
 * ── CE QU'ELLE FAIT À L'ÉCRAN ──
 *
 * Elle pose des questions fermées et réduit la carte à ce qui correspond. Les
 * quatre sont FACULTATIVES et indépendantes : répondre à une seule filtre déjà,
 * n'en répondre aucune ne propose rien. Aucun enchaînement obligatoire, aucune
 * étape « suivant » — le visiteur touche ce qui l'intéresse et voit le résultat
 * changer sous son doigt.
 *
 * ── RIEN NE SORT D'ICI ──
 *
 * Les réponses sont un `useState`. Pas de cookie, pas d'appel serveur, pas de
 * paramètre d'URL : elles meurent avec l'onglet. Il n'y a donc rien à
 * consentir, rien à conserver, rien à effacer — et aucun profil ne peut se
 * constituer, même par accident.
 *
 * ── CE QU'ELLE NE PRÉTEND PAS ──
 *
 * Aucun classement, aucune note, aucune « pertinence ». Les fiches sortent dans
 * l'ORDRE DU COMMERÇANT, et l'écran dit combien il en reste — pas laquelle est
 * la meilleure. Elle n'infère aucun allergène et ne donne aucun conseil : elle
 * n'a accès qu'à des étiquettes posées à la main sur la carte.
 */
export function Boussole({ fiches }: { fiches: VitrineFicheView[] }) {
  const [reponses, setReponses] = useState<ReponsesBoussole>({});

  const commencee = boussoleCommencee(reponses);
  const retenues = commencee ? fichesDeLaBoussole(fiches, reponses) : [];

  /** Un second appui sur le même choix le REPREND — c'est un filtre, pas un vote. */
  function choisir(dimension: DimensionBoussole, facette: FacetteVitrine) {
    setReponses((actuelles) => ({
      ...actuelles,
      [dimension]: actuelles[dimension] === facette ? undefined : facette,
    }));
  }

  return (
    <section
      id={ANCRE_BOUSSOLE}
      aria-labelledby="boussole-titre"
      className="scroll-mt-4 rounded-2xl border border-black/10 bg-white/70 p-4"
    >
      <h2
        id="boussole-titre"
        className="font-[family-name:var(--vitrine-titre)] text-xl font-bold text-[var(--vitrine-primary)]"
      >
        Aidez-moi à choisir
      </h2>
      <p className="mt-1 text-sm text-black/60">
        Quelques questions, et rien de plus : vos réponses ne quittent pas cet
        écran.
      </p>

      <div className="mt-4 space-y-4">
        {QUESTIONS_BOUSSOLE.map((question) => (
          <fieldset key={question.dimension}>
            <legend className="text-sm font-bold text-[var(--vitrine-primary)]">
              {question.intitule}
            </legend>
            <ul className="mt-2 flex flex-wrap gap-2">
              {question.choix.map((facette) => {
                const actif = reponses[question.dimension] === facette;
                return (
                  <li key={facette}>
                    {/* `aria-pressed` et non une case : c'est une BASCULE, et
                        un second appui reprend le choix. Un groupe de radios
                        n'aurait pas laissé revenir à « sans avis ». */}
                    <button
                      type="button"
                      aria-pressed={actif}
                      onClick={() => choisir(question.dimension, facette)}
                      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                        actif
                          ? "border-[var(--vitrine-primary)] bg-[var(--vitrine-primary)] text-white"
                          : "border-black/15 bg-white text-black/70 hover:border-[var(--vitrine-primary)]"
                      }`}
                    >
                      {libelleFacette(facette)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>

      {/* `aria-live` : le résultat change sans que la page navigue, donc rien
          ne l'annoncerait autrement à un lecteur d'écran. */}
      <div aria-live="polite" className="mt-5">
        {!commencee ? (
          <p className="text-sm text-black/60">
            Touchez une réponse pour voir ce que la maison propose.
          </p>
        ) : retenues.length === 0 ? (
          <p className="text-sm font-semibold text-black/70">
            Rien ne correspond exactement. Retirez une réponse, ou parcourez la
            carte — tout y est.
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--vitrine-primary)]">
              {retenues.length} proposition{retenues.length > 1 ? "s" : ""}
            </p>
            <ul className="mt-2 space-y-2">
              {retenues.map((fiche) => (
                <li key={fiche.id}>
                  {/* Une ANCRE vers la fiche déjà rendue plus bas : la Boussole
                      ne recopie pas la carte, elle y renvoie. Deux rendus du
                      même plat auraient divergé au premier changement. */}
                  <a
                    href={`#fiche-${fiche.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm hover:border-[var(--vitrine-primary)]"
                  >
                    <span className="min-w-0 flex-1 font-bold text-[var(--vitrine-primary)]">
                      {fiche.nom}
                    </span>
                    {fiche.prix_affiche ? (
                      <span className="shrink-0 tabular-nums text-black/70">
                        {fiche.prix_affiche}
                      </span>
                    ) : null}
                    <span aria-hidden className="shrink-0 text-black/40">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
