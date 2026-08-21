"use client";

import { useSyncExternalStore } from "react";
import type { LangueVitrine } from "@/lib/vitrine";
import { TEXTES_VITRINE } from "@/components/vitrine/langue";

/**
 * LA FENÊTRE DE RETRAIT D'UNE OFFRE — « à retirer de 14 h à 18 h ».
 *
 * ── POURQUOI C'EST LE SEUL FRAGMENT CLIENT DE CES DEUX BLOCS ──
 *
 * Les portes (`vitrine_public_state` → `portes`) voyagent SANS fuseau : la RPC
 * rend deux horodatages absolus et rien d'autre. Les formater sur le serveur
 * demanderait donc un fuseau que le contrat ne porte pas — et le seul disponible
 * serait celui de la machine de rendu, c'est-à-dire UTC en production. « À
 * retirer de 12 h à 16 h » affiché à un client parisien pour une offre ouverte
 * de 14 h à 18 h est PIRE qu'une absence d'heure : il repart, et personne ne
 * saura dire pourquoi.
 *
 * D'où ce fragment : l'heure est formatée dans le fuseau du TÉLÉPHONE. C'est
 * l'approximation juste ici, et pas un pis-aller — cette page est ouverte par un
 * QR posé sur une table, à quelques mètres du comptoir dont on annonce l'heure.
 *
 * ── AUCUN ÉCART D'HYDRATATION, PAR CONSTRUCTION ──
 *
 * Rendu serveur ET premier rendu client valent `null` : le texte n'apparaît
 * qu'après le montage. La page reste donc servie par l'ISR sans que ce fragment
 * ne la fasse retomber en dynamique, et le lien de l'offre — le seul geste
 * utile — est complet dès le premier octet, sans JavaScript.
 *
 * Si `portes` gagne un jour le fuseau du commerce, ce composant redevient une
 * fonction serveur et ce fichier disparaît.
 */
/**
 * Le fuseau du navigateur n'existe qu'APRÈS l'hydratation. `useSyncExternalStore`
 * le dit sans effet ni `setState` — serveur et premier rendu client valent
 * `false`, la vérité arrive au montage. C'est le motif déjà employé pour
 * `prefers-reduced-motion` (`calendar-spin-experience.tsx`), et il est ici pour
 * la même raison : un `useEffect` qui pose l'état déclencherait un second rendu
 * en cascade sur la page dont le budget est le plus serré du dépôt.
 *
 * L'abonnement est vide : rien ne change ce fait après le montage.
 */
const AUCUN_ABONNEMENT = () => () => {};

export function FenetreOffre({
  debut,
  fin,
  lang,
}: {
  /** ISO 8601, `window_starts_at`. */
  debut: string;
  /** ISO 8601, `window_ends_at`. */
  fin: string;
  lang: LangueVitrine;
}) {
  const hydrate = useSyncExternalStore(
    AUCUN_ABONNEMENT,
    () => true,
    () => false,
  );
  if (!hydrate) return null;

  const d = new Date(debut);
  const f = new Date(fin);
  // Deux horodatages illisibles valent une porte SANS horaire, jamais une porte
  // absente : l'offre reste retirable, c'est la phrase qui manque.
  if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime())) return null;

  const t = TEXTES_VITRINE[lang];
  const format = new Intl.DateTimeFormat(t.localeFenetre, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span className="mt-0.5 block text-xs text-[var(--vitrine-sur-secondary)]/70">
      {t.fenetreOffre(format.format(d), format.format(f))}
    </span>
  );
}
