import { Card } from "@/components/ui/card";
import {
  analyticsRate,
  type ExperienceAnalyticsSnapshot,
} from "@/lib/experience-analytics-dashboard";

/**
 * LE DÉTAIL, EN FRANÇAIS DE COMMERCE ET REPLIÉ.
 *
 * Ce bloc apportait à lui seul onze cartes de premier niveau, écrites dans le
 * vocabulaire d'un analyste — « Vues qualifiées », « Identité touchée côté
 * serveur », « Rédemption », « Marge attribuable » — et souvent remplies de
 * « — » tant que le commerçant n'a saisi ni panier ni coût. Un boulanger les
 * survolait sans rien en tirer, entre lui et la seule chose qu'il avait à
 * faire.
 *
 * Deux corrections, pas une refonte du calcul : les mêmes nombres, sous les
 * mots que le commerçant emploie, et derrière un `<details>` qu'il ouvre quand
 * il veut regarder. Les chiffres qu'il consulte tous les jours (scans, tours,
 * lots, participations) sont remontés dans « Vos résultats », toujours
 * affichés.
 */

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });

const percent = (numerator: number, denominator: number) => {
  const value = analyticsRate(numerator, denominator);
  return value === null ? "—" : `${value} %`;
};

const kindLabel: Record<string, string> = {
  campaign: "Roue / jeu rapide",
  hunt: "Chasse",
  loyalty: "Fidélité",
  jackpot: "Jackpot",
  event: "Événement live",
  calendar: "Calendrier",
  referral: "Parrainage",
  contest: "Pronostics",
  quiz: "Quiz",
};

const sourceLabel: Record<string, string> = {
  direct: "Lien direct",
  qr: "QR code",
  share: "Partage",
  referral: "Parrainage",
  unknown: "Non attribué",
};

export function ExperienceAnalytics({
  analytics,
}: {
  analytics: ExperienceAnalyticsSnapshot;
}) {
  const { summary } = analytics;
  /**
   * DES PERSONNES, PAS DES ÉVÉNEMENTS.
   *
   * Les quatre premières tuiles divisaient des `count(*)` d'événements par
   * d'autres `count(*)` d'événements, sous des libellés qui promettaient des
   * gens (« Personnes ayant vu un jeu »). Une même personne qui ouvrait la page
   * trois fois comptait pour trois, et le taux de départ tombait sans que rien
   * n'ait changé dans la boutique. Les compteurs distincts existent désormais
   * en base : ce sont eux qui répondent aux libellés. `views` reste affiché,
   * mais comme ce qu'il est — un cumul d'ouvertures, en indice.
   */
  const abandonment = Math.max(
    0,
    summary.uniqueStarters - summary.uniqueFinishers,
  );

  return (
    <details className="mb-8 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <summary className="cursor-pointer text-base font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink">
        Le détail par animation
      </summary>
      <p className="mt-1 text-sm text-k-body">
        Ce qui s&apos;est passé sur vos {analytics.periodDays} derniers jours.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          [
            "Personnes ayant vu un jeu",
            summary.uniqueViewers,
            `Sur ${analytics.periodDays} jours · ${summary.views} ouvertures cumulées`,
          ],
          [
            "Joueurs ayant joué",
            summary.uniqueStarters,
            `${percent(summary.uniqueStarters, summary.uniqueViewers)} des personnes`,
          ],
          [
            "Joueurs ayant terminé",
            summary.uniqueFinishers,
            `${percent(summary.uniqueFinishers, summary.uniqueStarters)} des joueurs ayant joué`,
          ],
          [
            "Joueurs partis en cours de route",
            abandonment,
            `${percent(abandonment, summary.uniqueStarters)} des joueurs ayant joué`,
          ],
          [
            "Lots retirés en boutique",
            summary.rewardsRedeemed,
            `${percent(summary.rewardsRedeemed, summary.rewardsIssued)} des lots gagnés`,
          ],
          [
            "Joueurs revenus",
            summary.returningPlayers,
            `${summary.uniquePlayers} joueurs différents`,
          ],
        ].map(([label, value, hint]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-bold text-k-body">{label}</p>
            <p className="mt-1 text-2xl font-black text-k-ink">{value}</p>
            <p className="mt-1 text-xs text-zinc-500">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Ventes liées aux jeux
          </p>
          <p className="mt-2 text-2xl font-black text-k-ink">
            {summary.basketObservations > 0
              ? euros(summary.basketRevenueCents)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {summary.basketObservations > 0
              ? `${summary.basketObservations} retraits renseignés`
              : "Aucun montant d'achat renseigné"}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Coût des lots remis
          </p>
          <p className="mt-2 text-2xl font-black text-k-ink">
            {summary.rewardCostObservations > 0
              ? euros(summary.rewardCostCents)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {summary.rewardCostObservations > 0
              ? `${summary.rewardCostObservations} coûts configurés`
              : "Aucun coût de lot configuré"}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Différence (ventes − coût)
          </p>
          <p
            className={`mt-2 text-2xl font-black ${
              summary.attributableMarginCents >= 0
                ? "text-emerald-700"
                : "text-red-700"
            }`}
          >
            {summary.marginObservations > 0
              ? euros(summary.attributableMarginCents)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {summary.marginObservations > 0
              ? `${summary.marginObservations} retraits avec achat et coût`
              : "Demande un montant d'achat ET un coût sur un même retrait"}
          </p>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="font-black text-k-ink">Comparaison par animation</h3>
          <p className="text-xs text-zinc-500">
            Un pourcentage sans assez de données reste affiché « — ».
          </p>
        </div>
        {analytics.experiences.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Animation</th>
                  <th className="px-3 py-3">Personnes</th>
                  <th className="px-3 py-3">Joueurs ayant joué</th>
                  <th className="px-3 py-3">Joueurs ayant terminé</th>
                  <th className="px-3 py-3">Joueurs revenus</th>
                  <th className="px-3 py-3">Lots retirés</th>
                  <th className="px-3 py-3">Ventes</th>
                  <th className="px-3 py-3">Coût des lots</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {analytics.experiences.map((row) => (
                  <tr key={`${row.experienceKind}:${row.experienceId}`}>
                    <td className="px-5 py-3">
                      <p className="font-bold text-k-ink">{row.experienceName}</p>
                      <p className="text-xs text-zinc-500">
                        {kindLabel[row.experienceKind] ?? row.experienceKind}
                      </p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.uniqueViewers}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.uniqueStarters} ·{" "}
                      {percent(row.uniqueStarters, row.uniqueViewers)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.uniqueFinishers} ·{" "}
                      {percent(row.uniqueFinishers, row.uniqueStarters)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.returningPlayers}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.rewardsRedeemed} ·{" "}
                      {percent(row.rewardsRedeemed, row.rewardsIssued)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.basketObservations > 0
                        ? euros(row.basketRevenueCents)
                        : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.rewardCostObservations > 0
                        ? euros(row.rewardCostCents)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">
            Aucune animation mesurée sur cette période.
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <h3 className="font-black text-k-ink">D&apos;où viennent vos joueurs</h3>
        <p className="mb-4 text-xs text-zinc-500">
          QR code, partage, parrainage ou lien direct — les visites dont
          l&apos;origine est inconnue restent comptées.
        </p>
        {analytics.sources.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {analytics.sources.map((source) => (
              <div
                key={source.source}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <p className="text-xs font-bold text-zinc-500">
                  {sourceLabel[source.source] ?? source.source}
                </p>
                <p className="mt-1 text-xl font-black text-k-ink">{source.views}</p>
                <p className="text-xs text-zinc-500">
                  {source.completions} terminées ·{" "}
                  {source.basketObservations > 0
                    ? euros(source.basketRevenueCents)
                    : "ventes —"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Aucune origine mesurée.</p>
        )}
      </Card>
    </details>
  );
}
