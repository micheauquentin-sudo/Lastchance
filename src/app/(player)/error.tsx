"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { LienPortefeuille } from "@/components/wallet/lien-portefeuille";

/**
 * La garde d'erreur de TOUT le parcours joueur.
 *
 * Elle vivait sous `play/[slug]/` et n'y couvrait qu'une famille sur dix :
 * calendar, commande, event, hunt, jackpot, passeport, portefeuille, pronos et
 * quiz remontaient jusqu'à `global-error.tsx`, qui REMPLACE le layout racine —
 * le joueur y perdait la police, la DA et le logo du commerçant pour lire un
 * « Une erreur est survenue » gris. Le groupe `(player)` ne consomme aucun
 * segment d'URL : la garde se pose une fois et couvre les dix.
 *
 * La phrase qui compte est celle de l'ancien écran, mot pour mot — c'est la
 * seule information utile au joueur à cet instant. Le lien portefeuille lui
 * donne en plus le chemin pour aller le vérifier lui-même.
 *
 * ── L'ERREUR EST CAPTURÉE, JAMAIS AFFICHÉE ─────────────────────────
 *
 * Une frontière de segment intercepte l'erreur avant `global-error.tsx`, qui
 * était jusqu'ici le seul endroit à la remonter à Sentry. Poser ces frontières
 * sans ce `useEffect` aurait donc ÉTEINT le signal — et précisément sur les
 * parcours publics, ceux qu'un inconnu peut sonder. Le texte affiché ne change
 * pas d'un mot : on remonte à Sentry, on n'expose rien au visiteur.
 */
export default function PlayerError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main role="alert" className="fixed inset-0 flex items-center justify-center bg-zinc-950 px-6 text-center text-white">
      <div>
        <h1 className="text-xl font-bold">Le jeu est momentanément indisponible</h1>
        <p className="mt-2 text-sm text-zinc-300">Si un gain venait d&apos;être tiré, il sera retrouvé automatiquement.</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-900">Réessayer</button>
        <div className="mt-6 inline-flex rounded-xl bg-white px-4 py-3"><LienPortefeuille /></div>
      </div>
    </main>
  );
}
