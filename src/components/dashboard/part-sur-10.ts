/**
 * « ≈ N clients sur 10 gagnent » — la seule phrase qui parle au commerçant.
 *
 * Le poids est un nombre relatif : 30 sur un total de 100 ne veut rien dire
 * tant qu'on ne l'a pas divisé. Le pourcentage était déjà affiché en petit à
 * droite de chaque ligne (`~30%`), mais un pourcentage de tirage n'est PAS ce
 * qu'un patron de bar compte : il compte des clients qui repartent avec
 * quelque chose. On le lui dit dans son unité.
 *
 * Module PUR, sans "use client" : partagé entre `prize-editor.tsx` (client)
 * et `atelier-verification-state.ts` (server component). Il vivait recopié
 * deux fois — l'original ici, une copie commentée « à fusionner » côté
 * vérification — jusqu'à cette extraction.
 */
export function partSur10(pctGagnant: number): string {
  const sur10 = Math.round(pctGagnant / 10);
  if (sur10 <= 0) return "moins d'un client sur 10 gagne quelque chose";
  if (sur10 >= 10) return "quasiment tous vos clients gagnent quelque chose";
  return `≈ ${sur10} client${sur10 > 1 ? "s" : ""} sur 10 gagne${sur10 > 1 ? "nt" : ""} quelque chose`;
}
