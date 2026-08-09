import type { CSSProperties, ReactElement, ReactNode } from "react";
import { SkipLink } from "@/components/ui/skip-link";
import { KermesseStripe } from "@/components/wheel/play-theme";
import { FondEcran } from "@/components/ui/fond-ecran";
import type { FondKey } from "@/lib/fonds-ecran";

/**
 * Shell commun des pages joueur suivies (quiz, calendrier, pronostics).
 *
 * ── Ce qu'il remplace ──
 *
 * Quatre copies VERBATIM du bandeau rayé kermesse — dans `quiz/[slug]`,
 * `calendar/[slug]`, `pronos/[slug]` et `pronos/[slug]/recover` — alors que
 * `KermesseStripe` existe depuis longtemps et se présente comme « la SEULE
 * source des classes qui différencient les deux ambiances ». Le dégradé était
 * recopié à l'identique quatre fois : quatre endroits à corriger pour changer
 * une rayure, donc trois oublis en puissance.
 *
 * ── L'ORDRE DES ENFANTS EST LE CORRECTIF D'ACCESSIBILITÉ ──
 *
 * Le fond d'écran est `position: absolute`, donc il peint APRÈS tout
 * descendant non positionné, quel que soit l'ordre du DOM. Sans précaution il
 * passerait devant le contenu. La parade retenue est `position: relative` sur
 * le bandeau et sur `<main>` : deux boîtes positionnées à `z-index: auto` se
 * départagent à l'ordre du DOM, et le contenu vient après.
 *
 * On aurait pu écrire `z-10` sur `<main>` ou `z-[-1]` sur le fond. Les deux
 * créent un contexte d'empilement, et `play-backdrop.tsx` documente ce que ce
 * dépôt a payé pour ça : la mesure de contraste retombe alors sur le crème du
 * `<body>` (1,07:1 relevé par axe-core là où le joueur voit 21:1). Aucun
 * `z-index` ici, donc — l'ordre du DOM suffit et ne ment pas.
 */
export function PlayerPageShell({
  pageStyle,
  fond = null,
  children,
}: {
  /** Motif de fond du thème (jeton pur des tables `*-theme.ts`). */
  pageStyle: CSSProperties;
  /**
   * Image de fond plein cadre du thème, ou `null` pour n'en poser aucune. Le
   * motif CSS de `pageStyle` sert de repli le temps du chargement de la photo,
   * puis se retrouve recouvert par elle.
   */
  fond?: FondKey | null;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="relative min-h-dvh" style={pageStyle}>
      <SkipLink />
      {fond && <FondEcran fond={fond} voile="creme" />}
      {/* Bandeau rayé kermesse en tête de page (identité du parcours joueur). */}
      <KermesseStripe className="relative h-3" />
      <main id="contenu" tabIndex={-1} className="relative outline-none">
        {children}
      </main>
    </div>
  );
}
