/**
 * Le squelette de la CAISSE — la seule page du dashboard qui s'ouvre devant
 * quelqu'un qui attend.
 *
 * `dashboard/loading.tsx` dessine cinq tuiles de statistiques et un grand bloc
 * de tableau : la forme de la page d'accueil, servie telle quelle aux trente-
 * trois routes du dashboard. Sur la caisse, ce squelette est un mensonge —
 * rien de ce qu'il annonce n'apparaîtra, et le caissier voit la mise en page
 * sauter au moment précis où il a un client en face de lui. Un squelette qui
 * ment coûte plus qu'une page vide : il fait attendre la mauvaise chose.
 *
 * Celui-ci reprend la forme réelle : colonne étroite, titre, scanner, champ de
 * code. Aucune donnée n'y est représentée — la caisse n'affiche rien tant
 * qu'un code n'a pas été saisi, il n'y a donc rien à faire miroiter.
 */
export default function RedeemLoading() {
  return (
    <div aria-busy="true" className="max-w-md animate-pulse">
      <div className="mb-2 h-8 w-32 rounded-lg bg-orange-100/70" />
      <div className="mb-8 h-4 w-80 max-w-full rounded bg-zinc-100" />
      {/* Le scanner : le bloc le plus haut de la page. */}
      <div className="mb-6 h-14 rounded-xl border border-zinc-200 bg-white" />
      {/* Champ de code + bouton « Vérifier ». */}
      <div className="mb-6 flex gap-2">
        <div className="h-14 flex-1 rounded-xl border border-zinc-200 bg-white" />
        <div className="h-14 w-24 rounded-xl bg-zinc-200" />
      </div>
    </div>
  );
}
