import { Card } from "@/components/ui/card";

export interface PrizePerformanceRow {
  prize_id: string;
  label: string;
  color: string | null;
  distributed: number;
  claimed: number;
  redeemed: number;
}

/** Taux formaté (num/den), « — » si le dénominateur est nul. */
function rate(num: number, den: number): string {
  if (den <= 0) return "—";
  return `${Math.round((num / den) * 100)} %`;
}

/**
 * Performance par lot : distribués (spins gagnants), réclamés
 * (formulaire rempli), récupérés (validés au comptoir). Les taux
 * réclamation/récupération aident le commerçant à ajuster poids et
 * stocks. Données issues de la RPC campaign_prize_performance.
 */
export function PrizePerformance({ rows }: { rows: PrizePerformanceRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      distributed: acc.distributed + r.distributed,
      claimed: acc.claimed + r.claimed,
      redeemed: acc.redeemed + r.redeemed,
    }),
    { distributed: 0, claimed: 0, redeemed: 0 },
  );

  return (
    <Card>
      <h2 className="font-semibold mb-1">Performance par lot</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Distribués, réclamés et récupérés au comptoir — pour ajuster
        probabilités et stocks.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun lot gagnant pour l&apos;instant.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200">
                <th className="py-2 pr-3 font-medium">Lot</th>
                <th className="py-2 px-3 font-medium text-right">Distribués</th>
                <th className="py-2 px-3 font-medium text-right">Réclamés</th>
                <th className="py-2 px-3 font-medium text-right">Récupérés</th>
                <th className="py-2 pl-3 font-medium text-right">Récup.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.prize_id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: r.color ?? "#999" }}
                      />
                      {r.label}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {r.distributed}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {r.claimed}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {r.redeemed}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums text-zinc-500">
                    {rate(r.redeemed, r.distributed)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {totals.distributed}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {totals.claimed}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {totals.redeemed}
                </td>
                <td className="py-2 pl-3 text-right tabular-nums text-zinc-500">
                  {rate(totals.redeemed, totals.distributed)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
