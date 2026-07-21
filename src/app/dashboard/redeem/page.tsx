import type { Metadata } from "next";
import { formatDate, normalizeRedeemCode } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import { RedeemScanner } from "@/components/dashboard/redeem-scanner";
import {
  lookupParticipationByCode,
  type CashierParticipation,
} from "@/actions/participations";

export const metadata: Metadata = { title: "Caisse" };

/** Échéance serveur dépassée (le retrait serait refusé par la RPC). */
const isLookupExpired = (found: {
  redeemed_at: string | null;
  cancelled_at: string | null;
  redeem_expires_at: string | null;
}) =>
  !found.redeemed_at &&
  !found.cancelled_at &&
  found.redeem_expires_at !== null &&
  new Date(found.redeem_expires_at).getTime() <= Date.now();

/**
 * Page caisse mobile-first : le staff tape le code du client et valide
 * la remise en un geste — sans chercher dans le tableau des
 * participations.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: rawCode } = await searchParams;
  const code = rawCode ? normalizeRedeemCode(rawCode) : "";
  let found: CashierParticipation | null = null;

  if (code) {
    found = await lookupParticipationByCode(code);
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-1">Caisse</h1>
      <p className="text-zinc-500 mb-8 text-sm">
        Scannez ou tapez le code du client pour valider la remise du gain.
      </p>

      <RedeemScanner />

      <form method="get" className="flex gap-2 mb-6">
        <input
          name="code"
          defaultValue={rawCode ?? ""}
          placeholder="GAIN-…"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 text-white text-base font-semibold px-5 hover:bg-zinc-700"
        >
          Vérifier
        </button>
      </form>

      {code && !found && (
        <Card className="border-red-200 bg-red-50 text-center py-8">
          <p className="text-3xl mb-2">✕</p>
          <p className="font-semibold text-red-700">Code introuvable</p>
          <p className="text-sm text-red-600/80 mt-1">
            Vérifiez la saisie — le code figure sur l&apos;écran ou
            l&apos;email du client.
          </p>
        </Card>
      )}

      {found && (() => {
        // L'échéance SERVEUR fait foi : la RPC refuserait de toute
        // façon — l'affichage l'explique avant le clic.
        const expired = isLookupExpired(found);
        const actionable = !found.redeemed_at && !found.cancelled_at && !expired;
        return (
          <Card
            className={
              actionable
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
            }
          >
            <p className="font-mono text-sm text-zinc-500 mb-3">
              {found.redeem_code}
            </p>
            <p className="text-2xl font-bold mb-1">
              {found.prizes?.label ?? "Lot supprimé"}
            </p>
            {found.prizes?.description && (
              <p className="text-sm text-zinc-600 mb-2">
                {found.prizes.description}
              </p>
            )}
            <p className="text-sm text-zinc-500 mb-5">
              {found.first_name ?? "Anonyme"} ·{" "}
              {found.campaigns?.name ?? "Campagne supprimée"} · gagné le{" "}
              {formatDate(found.created_at)}
            </p>

            {found.cancelled_at ? (
              <p className="inline-flex rounded-full bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700">
                ✖ Gain annulé le {formatDate(found.cancelled_at)}
              </p>
            ) : found.redeemed_at ? (
              <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
                ⚠ Déjà récupéré le {formatDate(found.redeemed_at)}
                {found.basket_cents !== null &&
                  ` · panier ${(found.basket_cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`}
              </p>
            ) : expired ? (
              <p className="inline-flex rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
                ⏱ Code expiré le {formatDate(found.redeem_expires_at!)} — délai
                de retrait dépassé
              </p>
            ) : (
              <RedeemButton id={found.id} />
            )}
          </Card>
        );
      })()}
    </div>
  );
}
