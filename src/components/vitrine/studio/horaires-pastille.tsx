"use client";

import { useSyncExternalStore } from "react";
import {
  PastilleOuverture,
  texteEtatHoraires,
} from "@/components/vitrine/studio/horaires-badge";
import { etatHoraires } from "@/lib/vitrine-horaires";
import {
  VITRINE_JOURS,
  type HorairesVitrine,
  type JourVitrine,
  type LangueVitrine,
} from "@/lib/vitrine";

/**
 * « OUVERT · FERME À 23H » — CALCULÉ DANS LE NAVIGATEUR (VIT-31c).
 *
 * ── LE PIÈGE D'HYDRATATION, ET COMMENT IL EST TRAITÉ ──
 *
 * Le texte de cette pastille dépend de l'HEURE COURANTE. Rendu au serveur puis
 * au client à deux instants différents, il produit deux chaînes différentes :
 * React refuse alors d'hydrater le sous-arbre, et sur cette page-là ce n'est
 * pas un avertissement de console — c'est la perte de TOUTE l'interactivité
 * (sélecteur de langue, favoris, onglets du catalogue).
 *
 * La parade est celle que le dépôt applique déjà à `localStorage` dans
 * `src/components/vitrine/favoris.ts` : `useSyncExternalStore`. L'horloge est
 * un système EXTERNE à React, exactement comme le stockage.
 *
 *   * `getServerSnapshot` rend `null` — une constante. Le HTML servi et le
 *     PREMIER rendu client sont donc identiques par construction, et non
 *     « identiques la plupart du temps ».
 *   * `getSnapshot` rend l'instant réel, lu seulement APRÈS le montage.
 *
 * `null` ne se traduit pas par un trou : la pastille ÉCRITE À LA MAIN
 * (`repli`) tient la place jusqu'au montage. Rien ne saute, et un visiteur
 * dont le JavaScript ne s'exécute jamais lit la phrase du commerçant plutôt
 * que rien du tout.
 *
 * ── ÉCARTÉ : LE CALCUL AU SERVEUR ──
 *
 * Il aurait fonctionné en rendu dynamique et menti partout ailleurs : cette
 * page publique est mise en cache, et un « Ouvert » figé au moment de la
 * génération est précisément le mensonge qui fait déplacer un client pour
 * rien. Le calcul dans le navigateur est donc juste par construction, quelle
 * que soit la fraîcheur du HTML.
 *
 * ── ÉCARTÉ : `useState` + `useEffect` ──
 *
 * `setState` dans un effet de montage déclenche le rendu en cascade que
 * `react-hooks/set-state-in-effect` interdit dans ce dépôt, et il faudrait de
 * toute façon un `setInterval` à côté. `useSyncExternalStore` fait les deux.
 */

// ── L'HORLOGE PARTAGÉE ────────────────────────────────────────
//
// UNE SEULE minuterie pour toutes les pastilles montées, et un instant MIS EN
// CACHE. `useSyncExternalStore` compare les instantanés PAR IDENTITÉ : rendre
// `new Date()` à chaque appel de `getSnapshot` ferait boucler React à l'infini
// avec « getSnapshot should be cached » — le même piège que l'ensemble vide des
// favoris.

const PERIODE_MS = 30_000;

let instantCourant: Date | null = null;
const ecouteurs = new Set<() => void>();
let minuterie: ReturnType<typeof setInterval> | null = null;

function lireInstant(): Date {
  if (!instantCourant) instantCourant = new Date();
  return instantCourant;
}

/**
 * Trente secondes, et non une minute.
 *
 * L'écart maximal entre l'heure vraie et la pastille est la PÉRIODE : à une
 * minute, un commerce peut s'afficher « Ouvert » trente-neuf secondes après sa
 * fermeture. Trente secondes divisent cet écart par deux pour un réveil de
 * quelques microsecondes — et la minuterie s'arrête dès la dernière pastille
 * démontée, donc elle ne tourne jamais sur une page qui ne l'affiche pas.
 */
function sAbonner(onChange: () => void): () => void {
  ecouteurs.add(onChange);
  if (!minuterie) {
    // Le premier abonné rafraîchit l'instant : le module peut avoir été chargé
    // longtemps avant que la pastille ne se monte (navigation entre pages du
    // studio), et un instant périmé rendrait une phrase fausse au montage.
    instantCourant = new Date();
    minuterie = setInterval(() => {
      instantCourant = new Date();
      for (const ecoute of ecouteurs) ecoute();
    }, PERIODE_MS);
  }
  return () => {
    ecouteurs.delete(onChange);
    if (ecouteurs.size === 0 && minuterie) {
      clearInterval(minuterie);
      minuterie = null;
    }
  };
}

/** L'instantané SERVEUR : une constante, et c'est tout l'intérêt. */
const AVANT_MONTAGE = null;

/**
 * Le jour courant dans le fuseau du COMMERCE — pour dire « demain ».
 *
 * `etatHoraires` rend le jour de la prochaine ouverture mais pas le jour
 * courant, et ce module ne peut pas le lui ajouter (`src/lib` appartient à un
 * autre lot). Les six lignes ci-dessous refont donc, et seulement, la
 * déduction du jour de la semaine : on demande à `Intl` la DATE CIVILE locale
 * puis on lit son jour arithmétiquement. `weekday` aurait rendu du texte
 * dépendant de la locale et de la version d'ICU, pour une information que
 * `Date.UTC` donne sans ambiguïté — même arbitrage que `instantLocal`.
 *
 * Un fuseau refusé rend `null` : la phrase nommera alors le jour (« ouvre
 * mardi ») au lieu de dire « demain ». Jamais une erreur, jamais un faux.
 */
function jourLocal(timezone: string, instant: Date): JourVitrine | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const lire = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value);
    const annee = lire("year");
    const mois = lire("month");
    const jour = lire("day");
    if (!Number.isFinite(annee + mois + jour)) return null;
    const dow = new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay();
    // `getUTCDay` compte à partir de DIMANCHE ; `VITRINE_JOURS` commence lundi.
    return VITRINE_JOURS[(dow + 6) % 7];
  } catch {
    return null;
  }
}

export function PastilleHoraires({
  horaires,
  timezone,
  repli,
  lang = "fr",
}: {
  /** La semaine structurée. `null` fait retomber sur `repli`, sans bruit. */
  horaires: HorairesVitrine | null;
  /** Le fuseau du COMMERCE, jamais celui du visiteur. */
  timezone: string;
  /** La pastille écrite à la main — affichée avant le montage, et en repli. */
  repli: string | null;
  lang?: LangueVitrine;
}) {
  const instant = useSyncExternalStore(sAbonner, lireInstant, () => AVANT_MONTAGE);

  const texte =
    instant === null
      ? null
      : texteEtatHoraires(
          etatHoraires(horaires, timezone, instant),
          lang,
          jourLocal(timezone, instant),
        );

  // `texte` vaut `null` avant le montage ET quand le verdict est `inconnu`
  // (horaires absents, fuseau refusé). Les deux cas veulent la même chose : la
  // phrase du commerçant, exactement comme avant VIT-31.
  const affiche = texte ?? repli;
  if (!affiche) return null;
  return <PastilleOuverture texte={affiche} />;
}
