/**
 * Squelette autorisé ici : cette route n'appelle JAMAIS `notFound()`.
 *
 * Une frontière `loading` fait partir l'en-tête HTTP — donc le statut — avant
 * la fin du corps. Elle est donc réservée aux routes dont le statut ne dépend
 * d'aucune lecture. Le raisonnement complet et l'historique des deux
 * tentatives ratées sont dans `src/app/(player)/play/[slug]/loading.tsx` ;
 * la règle est tenue mécaniquement par `src/lib/route-boundaries.test.ts`.
 */
export default function PlayerRouteLoading() {
  return (
    <main role="status" className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-k-ink/15 border-t-k-ink" /><p className="mt-4 text-sm text-k-muted">Chargement…</p></div>
    </main>
  );
}
