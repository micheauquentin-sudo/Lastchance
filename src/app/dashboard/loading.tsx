/**
 * Squelette affiché instantanément pendant le rendu serveur des pages
 * du dashboard (Suspense de segment) : la navigation entre les onglets
 * donne un retour immédiat au lieu de figer jusqu'à la fin des requêtes.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="mb-2 h-8 w-56 rounded-lg bg-orange-100/70" />
      <div className="mb-8 h-4 w-80 max-w-full rounded bg-zinc-100" />
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-orange-900/[0.06] bg-white shadow-[0_10px_30px_-14px_rgba(120,40,20,0.15)]"
          />
        ))}
      </div>
      <div className="h-40 rounded-2xl border border-orange-900/[0.06] bg-white shadow-[0_10px_30px_-14px_rgba(120,40,20,0.15)]" />
    </div>
  );
}
