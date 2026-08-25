/**
 * Squelette des Réglages — une pile de cartes de formulaire, pas cinq tuiles.
 *
 * Voir `dashboard/redeem/loading.tsx` pour le raisonnement complet : le
 * squelette partagé de `dashboard/loading.tsx` dessine la forme de la page
 * d'accueil (rangée de cinq statistiques). Elle est juste sur les familles
 * « liste / analytique » — accueil, participations, clients, progression —
 * et fausse sur les deux familles en forme de formulaire. Les Réglages sont
 * l'écran de configuration le plus visité du dashboard, et le plus lent :
 * établissement, notifications, automatisations, abonnement.
 *
 * Les autres familles (éditeurs de campagne, QR, quiz) n'ont volontairement
 * pas reçu de squelette dédié : leur contenu varie trop d'un écran à l'autre
 * pour qu'une forme fixe soit plus honnête que la générique, et quinze
 * fichiers de plus se seraient périmés sans que rien ne le signale.
 */
export default function SettingsLoading() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="mb-2 h-8 w-44 rounded-lg bg-orange-100/70" />
      <div className="mb-8 h-4 w-96 max-w-full rounded bg-zinc-100" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {Array.from({ length: 11 }, (_, i) => (
          <div
            key={i}
            className={`rounded-2xl border border-orange-900/[0.06] bg-white shadow-[0_10px_30px_-14px_rgba(120,40,20,0.15)] ${i >= 9 ? "lg:col-span-2" : ""} ${i === 10 ? "h-80" : "h-44"}`}
          />
        ))}
      </div>
    </div>
  );
}
