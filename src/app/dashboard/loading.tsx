/**
 * Squelette affiché instantanément pendant le rendu serveur des pages
 * du dashboard (Suspense de segment) : la navigation entre les onglets
 * donne un retour immédiat au lieu de figer jusqu'à la fin des requêtes.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-zinc-200 mb-2" />
      <div className="h-4 w-80 max-w-full rounded bg-zinc-100 mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-zinc-200 bg-white shadow-sm"
          />
        ))}
      </div>
      <div className="h-40 rounded-2xl border border-zinc-200 bg-white shadow-sm" />
    </div>
  );
}
