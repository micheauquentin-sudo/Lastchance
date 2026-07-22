import type { Metadata } from "next";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import { HuntRedeemButton } from "@/components/dashboard/hunt-redeem-button";
import { RedeemScanner } from "@/components/dashboard/redeem-scanner";
import {
  lookupRedeemCode,
  type CashierHuntCompletion,
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
 * Page caisse mobile-first : le staff tape (ou scanne) le code du client et
 * valide la remise en un geste. Flux unifié — le code peut désigner un lot
 * de roue (GAIN-…) ou une chasse au trésor (CHASSE-…) : l'affichage
 * s'adapte à la source.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: rawCode } = await searchParams;
  const match = rawCode ? await lookupRedeemCode(rawCode) : null;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-1">Caisse</h1>
      <p className="text-zinc-600 mb-8 text-sm">
        Scannez ou tapez le code du client pour valider la remise du gain.
      </p>

      <RedeemScanner />

      <form method="get" className="flex gap-2 mb-6">
        <input
          name="code"
          aria-label="Code du client"
          defaultValue={rawCode ?? ""}
          placeholder="GAIN-… ou CHASSE-…"
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

      {rawCode && !match && (
        <Card className="border-red-200 bg-red-50 text-center py-8">
          <p className="text-3xl mb-2">✕</p>
          <p className="font-semibold text-red-700">Code introuvable</p>
          <p className="text-sm text-red-600/80 mt-1">
            Vérifiez la saisie — le code figure sur l&apos;écran ou
            l&apos;email du client.
          </p>
        </Card>
      )}

      {match?.source === "wheel" && (
        <WheelResult participation={match.participation} />
      )}
      {match?.source === "hunt" && (
        <HuntResult completion={match.completion} />
      )}
    </div>
  );
}

/** Lot de roue (participation) — parcours existant, inchangé. */
function WheelResult({ participation }: { participation: CashierParticipation }) {
  // L'échéance SERVEUR fait foi : la RPC refuserait de toute façon —
  // l'affichage l'explique avant le clic.
  const expired = isLookupExpired(participation);
  const actionable =
    !participation.redeemed_at && !participation.cancelled_at && !expired;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="font-mono text-sm text-zinc-600 mb-3">
        {participation.redeem_code}
      </p>
      <p className="text-2xl font-bold mb-1">
        {participation.prizes?.label ?? "Lot supprimé"}
      </p>
      {participation.prizes?.description && (
        <p className="text-sm text-zinc-600 mb-2">
          {participation.prizes.description}
        </p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {participation.first_name ?? "Anonyme"} ·{" "}
        {participation.campaigns?.name ?? "Campagne supprimée"} · gagné le{" "}
        {formatDate(participation.created_at)}
      </p>

      {participation.cancelled_at ? (
        <p className="inline-flex rounded-full bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700">
          ✖ Gain annulé le {formatDate(participation.cancelled_at)}
        </p>
      ) : participation.redeemed_at ? (
        <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          ⚠ Déjà récupéré le {formatDate(participation.redeemed_at)}
          {participation.basket_cents !== null &&
            ` · panier ${(participation.basket_cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`}
        </p>
      ) : expired ? (
        <p className="inline-flex rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
          ⏱ Code expiré le {formatDate(participation.redeem_expires_at!)} — délai
          de retrait dépassé
        </p>
      ) : (
        <RedeemButton id={participation.id} />
      )}
    </Card>
  );
}

/** Lot de chasse au trésor (complétion) — code CHASSE-…, remis en caisse. */
function HuntResult({ completion }: { completion: CashierHuntCompletion }) {
  const actionable = !completion.redeemed_at;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="font-mono text-sm text-zinc-600 mb-1">{completion.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        🗺️ Chasse au trésor
      </span>
      <p className="text-2xl font-bold mb-1">
        {completion.reward_label || "Lot de la chasse"}
      </p>
      {completion.reward_details && (
        <p className="text-sm text-zinc-600 mb-2">{completion.reward_details}</p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {completion.hunt_name} · terminée le {formatDate(completion.completed_at)}
      </p>

      {completion.redeemed_at ? (
        <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          ⚠ Déjà remis le {formatDate(completion.redeemed_at)}
        </p>
      ) : (
        <HuntRedeemButton code={completion.code} />
      )}
    </Card>
  );
}
