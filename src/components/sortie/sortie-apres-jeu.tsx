"use client";

import Link from "next/link";
import { useState } from "react";
import type { SortieApresJeu as Sortie } from "@/lib/sortie-apres-jeu";

/**
 * LA SORTIE D'APRÈS-JEU (VIT-11) — UNE PROPOSITION, JAMAIS UNE CONDITION.
 *
 * ── Le même contrat que l'invitation d'avant-jeu, à l'autre bout ──
 *
 * `invitation-avant-jeu.tsx` a établi la règle : aucun `required`, aucun état
 * « il faut d'abord… », aucun délai, aucun guet de `visibilitychange`. Cet
 * écran-ci arrive APRÈS la partie, donc il n'a même rien à débloquer — le gain
 * est déjà remis, le résultat déjà affiché. Il ne peut structurellement pas
 * devenir une porte : il n'existe aucun prop par lequel un appelant rendrait
 * la sortie bloquante, et rien en dessous de lui n'attend son passage.
 *
 * Aucun avis ne débloque gain, remise, jeu, accès, rang ou réservation. Aucune
 * question de satisfaction ne précède le lien Google : trier les clients avant
 * de les y envoyer est interdit par les règles de Google, et ce composant n'a
 * aucun moyen de le faire — il ne peint que des adresses, dans le même ordre
 * pour tout le monde.
 *
 * ── Refermable, et la fermeture ne survit pas à la page ──
 *
 * `useState` et non `sessionStorage`, contrairement à l'invitation : celle-ci
 * se rejouait à chaque partie et devait donc se souvenir. La sortie, elle,
 * n'apparaît qu'une fois la partie finie — l'écran terminal ne se remonte pas
 * de lui-même. Une mémoire persistante aurait fait disparaître le retour à la
 * carte pour un client qui rejoue le lendemain.
 *
 * ── `Link` pour la carte, `<a>` pour le reste ──
 *
 * `/v/{slug}` est une route interne : la navigation client garde l'application
 * chargée. Les trois autres quittent le site, ouvrent un onglet et portent
 * `nofollow` en plus de `noopener noreferrer` — ces adresses sont posées par
 * le commerçant, la page ne leur prête aucune autorité.
 */

/** Les trois liens externes, dans l'ordre où ils sont peints. */
const TUILES: ReadonlyArray<{
  cle: "google" | "instagram" | "tiktok";
  emoji: string;
  label: string;
  reseau: string;
}> = [
  { cle: "google", emoji: "⭐", label: "Donnez votre avis", reseau: "Sur Google" },
  {
    cle: "instagram",
    emoji: "📸",
    label: "Suivez-nous",
    reseau: "Sur Instagram",
  },
  { cle: "tiktok", emoji: "🎵", label: "Suivez-nous", reseau: "Sur TikTok" },
];

export function SortieApresJeu({ sortie }: { sortie: Sortie | null }) {
  const [ouvert, setOuvert] = useState(true);

  // `null` dit « rien à proposer » : le serveur a déjà écarté les liens
  // invalides et la Vitrine non publiée. L'écran n'a pas à compter des clés.
  if (!sortie || !ouvert) return null;

  return (
    <section
      aria-label="Garder le lien avec le lieu"
      className="rounded-2xl border border-k-ink/15 bg-white/70 px-5 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide text-k-body">
          Avant de partir…
        </p>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          aria-label="Masquer ces propositions"
          className="-mr-1 -mt-1 rounded-full px-2 py-1 text-sm text-k-body transition-colors hover:bg-k-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {sortie.vitrine && (
          <Link
            href={`/v/${sortie.vitrine}`}
            className="flex w-full items-center gap-3 rounded-xl border border-k-ink/15 bg-white px-4 py-3 transition-colors hover:bg-k-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink"
          >
            <span aria-hidden className="text-xl">
              📖
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-k-ink">
                Revenir à la carte
              </span>
              <span className="block text-xs text-k-body">
                Retrouvez ce que propose la maison
              </span>
            </span>
            <span aria-hidden className="text-k-body">
              →
            </span>
          </Link>
        )}

        {TUILES.map(({ cle, emoji, label, reseau }) => {
          const url = sortie[cle];
          if (!url) return null;
          return (
            <a
              key={cle}
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex w-full items-center gap-3 rounded-xl border border-k-ink/15 bg-white px-4 py-3 transition-colors hover:bg-k-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink"
            >
              <span aria-hidden className="text-xl">
                {emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-k-ink">
                  {label}
                </span>
                <span className="block text-xs text-k-body">{reseau}</span>
              </span>
              <span aria-hidden className="text-k-body">
                ↗
              </span>
            </a>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-k-body">
        C&apos;est facultatif : rien ici ne change votre partie ni votre gain.
      </p>
    </section>
  );
}
