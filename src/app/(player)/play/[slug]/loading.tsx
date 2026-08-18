/**
 * Le squelette du jeu — reposé ICI, sur la seule route qu'il peut couvrir sans
 * mentir sur le statut HTTP.
 *
 * ── POURQUOI IL N'EST PLUS SUR LE GROUPE ────────────────────────────
 *
 * Ce fichier vivait sur `(player)/`, où il couvrait les dix parcours joueur.
 * Un `loading.tsx` crée une frontière de Suspense : Next émet la coquille — et
 * donc l'EN-TÊTE HTTP, et donc le STATUT — dès qu'elle est prête, avant que le
 * corps ait fini ses lectures. Toute page dont le `notFound()` dépend d'une
 * lecture répondait alors 200 avec un 404 enfoui dans le flux. À l'œil rien ne
 * change ; tout ce qui lit un statut est trompé.
 *
 * Deux tentatives pour garder les deux (le `notFound()` déplacé dans
 * `generateMetadata`, puis `htmlLimitedBots` pour rendre les métadonnées
 * bloquantes) ont échoué en conditions réelles. L'arbitrage : le vrai 404
 * prime, et le squelette ne se pose que sur les routes qui n'appellent JAMAIS
 * `notFound()`.
 *
 * `/play` en est une : un slug inconnu y rend un écran d'explication en 200
 * (`page.tsx`, branche `!ctx.ok`), ce que `player-lose.spec.ts` vérifie. Elle
 * avait déjà ce squelette avant le chantier — c'est le chemin le plus chaud du
 * produit, celui qu'on ouvre au QR code en boutique, et il le retrouve
 * inchangé. `route-boundaries.test.ts` interdit désormais de le reposer
 * ailleurs.
 */
export default function PlayLoading() {
  return (
    <main role="status" className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-white">
      <div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" /><p className="mt-4 text-sm text-zinc-300">Préparation du jeu…</p></div>
    </main>
  );
}
