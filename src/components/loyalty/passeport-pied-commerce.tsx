"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { LoyaltyCommerceView } from "@/lib/loyalty-context";

/**
 * LE PIED DE CARTE DU PASSEPORT (FID-4a) — le commerce, sous la fidélité.
 *
 * ── POURQUOI EN BAS, ET PAS EN HAUT ──
 *
 * Le passeport reste une CARTE DE FIDÉLITÉ : ce que le client vient chercher,
 * c'est son solde et ses paliers, et ils gardent le haut de l'écran. Le
 * commerce est à portée de pouce sans voler la vedette — trois blocs sobres
 * après la boutique, jamais avant le solde.
 *
 * ── CE N'EST PAS UNE VITRINE BIS ──
 *
 * Ni adresse, ni carte, ni horaires d'ouverture : tout cela est le travail de
 * la Vitrine, et deux écrans qui se ressemblent finissent par se contredire.
 * Ce pied de carte ne fait que TROIS choses — dire l'heure sur place, ouvrir
 * les portes du commerce (carte, réseaux, avis), et lister ce qui tourne
 * ailleurs chez lui aujourd'hui.
 *
 * ── UN LIEN VIDE NE S'AFFICHE PAS ──
 *
 * `loadCommerceView` rend `null` pour une adresse non renseignée ou refusée par
 * la revalidation de forme, et une liste vide quand rien n'est ouvert. Chaque
 * bloc se tait alors : une icône morte ou un « Aussi chez… » suivi de rien font
 * paraître le commerce fermé.
 */

/* ────────────────────────────────────────────────────────────
 * L'HORLOGE
 * ────────────────────────────────────────────────────────── */

/**
 * UNE HORLOGE PARTAGÉE PAR SECONDE, ET UNE SEULE.
 *
 * `setInterval` vit dans ce module, pas dans un composant : plusieurs horloges
 * montées en même temps s'abonnent au même battement, et le battement s'arrête
 * dès que le dernier abonné se démonte. Une page de passeport laissée ouverte
 * sur un comptoir ne laisse donc AUCUN minuteur derrière elle.
 */
const abonnes = new Set<() => void>();
let battement: ReturnType<typeof setInterval> | null = null;
let instant = 0;

function sabonnerALHorloge(reveil: () => void): () => void {
  abonnes.add(reveil);
  if (battement === null) {
    instant = Date.now();
    battement = setInterval(() => {
      instant = Date.now();
      for (const abonne of abonnes) abonne();
    }, 1000);
  }
  return () => {
    abonnes.delete(reveil);
    if (abonnes.size === 0 && battement !== null) {
      clearInterval(battement);
      battement = null;
    }
  };
}

/**
 * L'INSTANT, OU `null` TANT QU'ON EST AU SERVEUR.
 *
 * `useSyncExternalStore` est le motif du dépôt pour une valeur qui n'existe
 * qu'au navigateur (`useOrigine` dans `partage-lien-jeu.tsx`, `useCanShare`
 * ici même) : le rendu serveur ET l'hydratation lisent l'instantané serveur —
 * ici `null` —, puis React repasse avec la vraie valeur APRÈS montage. Aucun
 * écart de rendu n'est possible, là où une horloge peinte au serveur puis
 * animée au client en produit un à coup sûr : la seconde a changé entre les
 * deux. C'est aussi ce qui évite un `setState` dans un `useEffect`, que
 * `react-hooks/set-state-in-effect` refuse.
 *
 * L'instantané client est `instant`, une valeur STABLE entre deux battements :
 * rendre `Date.now()` directement ferait boucler React, qui compare deux
 * lectures successives.
 */
function useInstant(): number | null {
  return useSyncExternalStore(
    sabonnerALHorloge,
    // `instant` vaut 0 tant que personne n'est abonné — sur un montage
    // purement client, React lit l'instantané AVANT de poser l'abonnement.
    // Le replier sur `null` évite d'y peindre une fraction de seconde de 1970.
    () => (instant === 0 ? null : instant),
    () => null,
  );
}

/**
 * L'HEURE EST CELLE DU COMMERCE, JAMAIS CELLE DU TÉLÉPHONE.
 *
 * `organizations.timezone` fait foi — c'est le même fuseau qui décide des
 * créneaux de Réserver et des rappels. Un client en déplacement, ou dont le
 * téléphone est resté à l'heure du départ, lirait sinon l'heure de son lieu de
 * villégiature sur la carte de fidélité d'un bar de son quartier.
 *
 * `Intl.DateTimeFormat` refuse un fuseau inconnu en LEVANT : une valeur
 * abîmée en base ferait tomber tout le passeport. Le repli sur Paris est celui
 * du reste du produit (`src/lib/automations.ts`).
 */
function useFormateurHeure(timeZone: string): Intl.DateTimeFormat {
  return useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    try {
      return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone });
    } catch {
      return new Intl.DateTimeFormat("fr-FR", {
        ...options,
        timeZone: "Europe/Paris",
      });
    }
  }, [timeZone]);
}

/**
 * L'heure du commerce, à la seconde — ISOLÉE DANS SON PROPRE COMPOSANT.
 *
 * C'est la raison d'être du découpage : ce composant se rend une fois par
 * seconde, et rien d'autre du passeport ne le fait avec lui. Placer le hook
 * dans `LoyaltyPassport` aurait fait re-rendre la boutique, les paliers et la
 * roue à chaque battement.
 *
 * ── AUCUNE ANNONCE VOCALE, ET C'EST DÉLIBÉRÉ ──
 *
 * Pas de `role="timer"`, pas d'`aria-live` : une région vivante ferait relire
 * l'heure à un lecteur d'écran CHAQUE SECONDE, ce qui rendrait la page
 * inutilisable. L'heure reste du texte ordinaire, lu à la demande comme le
 * reste de la page ; seule l'icône est masquée (`aria-hidden`).
 */
function HorlogeCommerce({
  timeZone,
  organizationName,
}: {
  timeZone: string;
  organizationName: string;
}) {
  const maintenant = useInstant();
  const formateur = useFormateurHeure(timeZone);

  // Avant montage : la place de l'heure, sans heure. Un gabarit de même
  // largeur (`tabular-nums`) évite que le bloc saute quand elle arrive.
  const heure =
    maintenant === null ? "--:--:--" : formateur.format(new Date(maintenant));

  return (
    <p className="text-center text-xs text-k-body">
      <span aria-hidden>🕒</span>{" "}
      <span>Il est </span>
      <span className="font-bold tabular-nums text-k-ink">{heure}</span>
      <span> chez {organizationName}</span>
    </p>
  );
}

/* ────────────────────────────────────────────────────────────
 * LES LIENS DU COMMERCE
 * ────────────────────────────────────────────────────────── */

/**
 * Les trois adresses externes, dans l'ordre où elles sont peintes.
 *
 * `libelle` EST le nom accessible du lien : du texte, visible, sans le moindre
 * caractère invisible. Les emoji restent dans un `<span aria-hidden>` séparé —
 * un sélecteur de variante (U+FE0F) entré dans un nom accessible a déjà cassé
 * un test de ce dépôt, et ce sont des noms qu'un lecteur d'écran épelle.
 */
const RESEAUX: ReadonlyArray<{
  cle: "googleReviewUrl" | "instagramUrl" | "tiktokUrl";
  emoji: string;
  libelle: string;
}> = [
  { cle: "googleReviewUrl", emoji: "⭐", libelle: "Laisser un avis Google" },
  { cle: "instagramUrl", emoji: "📸", libelle: "Suivre sur Instagram" },
  { cle: "tiktokUrl", emoji: "🎵", libelle: "Suivre sur TikTok" },
];

/**
 * Une pastille de lien — 44 px de haut au minimum, pouce d'abord.
 *
 * `Link` pour la Vitrine (route interne : la navigation client garde
 * l'application chargée), `<a>` pour les trois autres, qui quittent le site et
 * portent `nofollow` en plus de `noopener noreferrer` : ces adresses sont
 * posées par le commerçant, la page ne leur prête aucune autorité. Même
 * contrat que `src/components/sortie/sortie-apres-jeu.tsx`.
 */
const CLASSE_PASTILLE =
  "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink transition-colors hover:bg-k-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2";

function LiensDuCommerce({ commerce }: { commerce: LoyaltyCommerceView }) {
  const reseaux = RESEAUX.filter(({ cle }) => commerce[cle] !== null);
  if (!commerce.vitrinePath && reseaux.length === 0) return null;

  return (
    <nav aria-label="Retrouver ce commerce" className="mb-4">
      <ul className="flex flex-wrap gap-2">
        {commerce.vitrinePath && (
          <li className="flex min-w-[9rem] flex-1">
            <Link href={commerce.vitrinePath} className={CLASSE_PASTILLE}>
              <span aria-hidden>📖</span>
              <span>Voir la carte</span>
            </Link>
          </li>
        )}
        {reseaux.map(({ cle, emoji, libelle }) => (
          <li key={cle} className="flex min-w-[9rem] flex-1">
            <a
              href={commerce[cle] as string}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={CLASSE_PASTILLE}
            >
              <span aria-hidden>{emoji}</span>
              <span>{libelle}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────
 * LES ANIMATIONS EN COURS
 * ────────────────────────────────────────────────────────── */

/**
 * « AUSSI CHEZ … » — l'annuaire des autres pages publiques du commerce.
 *
 * Les portes viennent de `PortesVitrineView` (la liste de la Vitrine), mises à
 * plat par `liensDesPortes` : une SEULE lecture pour les deux écrans, donc
 * aucune divergence possible. La MISE EN PAGE, elle, est propre au passeport —
 * `portes.tsx` peint avec les variables CSS `--vitrine-*`, qui n'existent pas
 * sur cette page.
 *
 * NI FIDÉLITÉ (on y est déjà) NI JACKPOT (le pot relié a sa propre carte,
 * `LinkedJackpotCard`) : l'annuaire ne les porte pas, rien n'est doublé.
 *
 * Aucune porte → aucun bloc. Un titre suivi du vide est pire qu'un titre absent.
 */
function AnimationsEnCours({
  portes,
  organizationName,
}: {
  portes: LoyaltyCommerceView["portes"];
  organizationName: string;
}) {
  if (portes.length === 0) return null;

  return (
    <section aria-labelledby="passeport-animations" className="mb-4">
      <h2
        id="passeport-animations"
        className="mb-2 text-xs font-black uppercase tracking-wide text-k-body"
      >
        Aussi chez {organizationName}
      </h2>
      <ul className="space-y-2">
        {portes.map((porte) => (
          <li key={porte.cle}>
            {/* Routes INTERNES : `Link` évite un rechargement complet depuis un
                téléphone en salle. */}
            <Link
              href={porte.href}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-k-ink bg-white px-4 py-2 transition-colors hover:bg-k-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2"
            >
              <span className="min-w-0 text-sm font-bold leading-tight text-k-ink">
                {porte.nom}
              </span>
              {/* Décoratif : le nom EST l'intitulé accessible du lien. */}
              <span aria-hidden className="shrink-0 text-k-body">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
 * LE PIED DE CARTE
 * ────────────────────────────────────────────────────────── */

export function PasseportPiedCommerce({
  commerce,
  organizationName,
  timeZone,
}: {
  commerce: LoyaltyCommerceView;
  organizationName: string;
  /** `organizations.timezone` — le fuseau du COMMERCE, jamais celui du client. */
  timeZone: string;
}) {
  const aDesLiens =
    commerce.vitrinePath !== null ||
    RESEAUX.some(({ cle }) => commerce[cle] !== null);

  // Ni lien ni animation : l'heure seule ne justifie pas un séparateur et un
  // bloc. Le passeport se termine alors exactement comme avant ce lot.
  if (!aDesLiens && commerce.portes.length === 0) return null;

  return (
    <div className="mt-8 border-t-2 border-dashed border-k-ink/25 pt-6">
      <AnimationsEnCours
        portes={commerce.portes}
        organizationName={organizationName}
      />
      <LiensDuCommerce commerce={commerce} />
      <HorlogeCommerce
        timeZone={timeZone}
        organizationName={organizationName}
      />
    </div>
  );
}
