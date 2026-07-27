import { Card } from "@/components/ui/card";
import {
  analyticsRate,
  type ExperienceAnalyticsSnapshot,
} from "@/lib/experience-analytics-dashboard";

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
  const abandonment = Math.max(0, summary.starts - summary.completions);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-k-ink">Performance des expériences</h2>
          <p className="text-sm text-k-body">
            Parcours et revenus attribués sur les {analytics.periodDays} derniers jours.
          </p>
        </div>
        <p className="text-xs font-bold text-zinc-500">
          Données serveur · sans dépendance au consentement marketing
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Vues qualifiées", summary.views, "Identité touchée côté serveur"],
          [
            "Démarrages",
            summary.starts,
            `${percent(summary.starts, summary.views)} des vues`,
          ],
          [
            "Terminées",
            summary.completions,
            `${percent(summary.completions, summary.starts)} des démarrages`,
          ],
          [
            "Abandons",
            abandonment,
            `${percent(abandonment, summary.starts)} des démarrages`,
          ],
          [
            "Lots retirés",
            summary.rewardsRedeemed,
            `${percent(summary.rewardsRedeemed, summary.rewardsIssued)} des lots émis`,
          ],
          [
            "Joueurs revenus",
            summary.returningPlayers,
            `${summary.uniquePlayers} joueurs uniques`,
          ],
        ].map(([label, value, hint]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-bold text-k-body">{label}</p>
            <p className="mt-1 text-2xl font-black text-k-ink">{value}</p>
            <p className="mt-1 text-xs text-zinc-500">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Chiffre d&apos;affaires attribué
          </p>
          <p className="mt-2 text-2xl font-black text-k-ink">
            {summary.basketObservations > 0
              ? euros(summary.basketRevenueCents)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {summary.basketObservations > 0
              ? `${summary.basketObservations} retraits renseignés`
              : "Aucun panier renseigné"}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Coût des lots retirés
          </p>
          <p className="mt-2 text-2xl font-black text-k-ink">
            {summary.rewardCostObservations > 0
              ? euros(summary.rewardCostCents)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {summary.rewardCostObservations > 0
              ? `${summary.rewardCostObservations} coûts configurés`
              : "Aucun coût configuré"}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Marge attribuable
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
              ? `${summary.marginObservations} retraits avec panier et coût`
              : "Nécessite panier et coût sur un même retrait"}
          </p>
        </Card>
      </div>

      <Card className="mb-6 overflow-hidden p-0">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="font-black text-k-ink">Comparaison par expérience</h3>
          <p className="text-xs text-zinc-500">
            Les taux sans dénominateur suffisant restent affichés « — ».
          </p>
        </div>
        {analytics.experiences.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Expérience</th>
                  <th className="px-3 py-3">Vues qualifiées</th>
                  <th className="px-3 py-3">Démarrages</th>
                  <th className="px-3 py-3">Complétion</th>
                  <th className="px-3 py-3">Retour</th>
                  <th className="px-3 py-3">Rédemption</th>
                  <th className="px-3 py-3">CA</th>
                  <th className="px-3 py-3">Coût</th>
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
                    <td className="px-3 py-3 tabular-nums">{row.views}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.starts} · {percent(row.starts, row.views)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.completions} · {percent(row.completions, row.starts)}
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
            Aucune expérience mesurée sur cette période.
          </p>
        )}
      </Card>

      <Card className="mb-8">
        <h3 className="font-black text-k-ink">Origine des visites qualifiées</h3>
        <p className="mb-4 text-xs text-zinc-500">
          QR, partage, parrainage ou accès direct — les visites non attribuables
          restent visibles.
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
                    : "CA —"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Aucune source mesurée.</p>
        )}
      </Card>
    </>
  );
}
