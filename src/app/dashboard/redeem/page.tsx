import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasLoyaltyAccess } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import { HuntRedeemButton } from "@/components/dashboard/hunt-redeem-button";
import { LoyaltyRedeemButton } from "@/components/dashboard/loyalty-redeem-button";
import { JackpotRedeemButton } from "@/components/dashboard/jackpot-redeem-button";
import { CalendarRedeemButton } from "@/components/dashboard/calendar-redeem-button";
import { EventRedeemButton } from "@/components/dashboard/event-redeem-button";
import { ReferralRedeemButton } from "@/components/dashboard/referral-redeem-button";
import { RedeemScanner } from "@/components/dashboard/redeem-scanner";
import {
  LoyaltyStaffStamp,
  type StaffLoyaltyProgram,
} from "@/components/dashboard/loyalty-staff-stamp";
import {
  lookupRedeemCode,
  type CashierCalendarReward,
  type CashierEventWin,
  type CashierHuntCompletion,
  type CashierJackpotWin,
  type CashierLoyaltyReward,
  type CashierParticipation,
  type CashierReferralReward,
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
 * de roue (GAIN-…), une chasse au trésor (CHASSE-…), un lot de fidélité
 * (FIDELITE-…) ou un jackpot collectif (JACKPOT-…) : l'affichage s'adapte à la
 * source. En mode fidélité « staff », une section dédiée valide une VISITE en
 * scannant le passeport du client.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: rawCode } = await searchParams;
  const match = rawCode ? await lookupRedeemCode(rawCode) : null;

  // Programmes de fidélité en mode staff : validation de visite en caisse.
  const { organization } = await getUserAndOrg();
  let staffPrograms: StaffLoyaltyProgram[] = [];
  if (organization && hasLoyaltyAccess(organization)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("loyalty_programs")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .eq("validation_mode", "staff")
      .order("created_at", { ascending: true });
    staffPrograms = (data ?? []) as StaffLoyaltyProgram[];
  }

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
          placeholder="GAIN-… CHASSE-… FIDELITE-… JACKPOT-… CADEAU-… EVENT-… PARRAIN-…"
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
      {match?.source === "hunt" && <HuntResult completion={match.completion} />}
      {match?.source === "loyalty" && <LoyaltyResult reward={match.reward} />}
      {match?.source === "jackpot" && <JackpotResult win={match.win} />}
      {match?.source === "calendar" && <CalendarResult reward={match.reward} />}
      {match?.source === "event" && <EventResult win={match.win} />}
      {match?.source === "referral" && <ReferralResult reward={match.reward} />}

      <LoyaltyStaffStamp programs={staffPrograms} />
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

/** Lot de fidélité (récompense) — code FIDELITE-…, remis en caisse. */
function LoyaltyResult({ reward }: { reward: CashierLoyaltyReward }) {
  const actionable = !reward.redeemed_at;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="font-mono text-sm text-zinc-600 mb-1">{reward.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        🎟️ Passeport fidélité
      </span>
      <p className="text-2xl font-bold mb-1">
        {reward.reward_label || "Lot de fidélité"}
      </p>
      {reward.reward_details && (
        <p className="text-sm text-zinc-600 mb-2">{reward.reward_details}</p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {reward.program_name} · gagné le {formatDate(reward.earned_at)}
      </p>

      {reward.redeemed_at ? (
        <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          ⚠ Déjà remis le {formatDate(reward.redeemed_at)}
        </p>
      ) : (
        <LoyaltyRedeemButton code={reward.code} />
      )}
    </Card>
  );
}

/** Gain de jackpot collectif — code JACKPOT-…, remis en caisse. */
function JackpotResult({ win }: { win: CashierJackpotWin }) {
  const actionable = !win.redeemed_at;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="font-mono text-sm text-zinc-600 mb-1">{win.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        🎰 Jackpot collectif
      </span>
      <p className="text-2xl font-bold mb-1">
        {win.reward_label || "Lot du jackpot"}
      </p>
      {win.reward_details && (
        <p className="text-sm text-zinc-600 mb-2">{win.reward_details}</p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {win.campaign_name} · gagné le {formatDate(win.drawn_at)}
      </p>

      {win.redeemed_at ? (
        <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          ⚠ Déjà remis le {formatDate(win.redeemed_at)}
        </p>
      ) : (
        <JackpotRedeemButton code={win.code} />
      )}
    </Card>
  );
}

/** Lot de calendrier — code CADEAU-…, remis en caisse (case-lot ou assiduité). */
function CalendarResult({ reward }: { reward: CashierCalendarReward }) {
  const actionable = !reward.redeemed_at;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="mb-1 font-mono text-sm text-zinc-600">{reward.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        🎁 Calendrier ·{" "}
        {reward.source === "completion" ? "Récompense d'assiduité" : "Case du jour"}
      </span>
      <p className="mb-1 text-2xl font-bold">
        {reward.reward_label || "Lot du calendrier"}
      </p>
      {reward.reward_details && (
        <p className="mb-2 text-sm text-zinc-600">{reward.reward_details}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {reward.calendar_name} · gagné le {formatDate(reward.created_at)}
      </p>

      {reward.redeemed_at ? (
        <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          ⚠ Déjà remis le {formatDate(reward.redeemed_at)}
        </p>
      ) : (
        <CalendarRedeemButton code={reward.code} />
      )}
    </Card>
  );
}

/** Gain du Mode événement en direct — code EVENT-…, remis en caisse. */
function EventResult({ win }: { win: CashierEventWin }) {
  const actionable = !win.redeemed_at;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="mb-1 font-mono text-sm text-zinc-600">{win.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        🎉 Événement live
      </span>
      <p className="mb-1 text-2xl font-bold">
        {win.reward_label || "Lot de l'événement"}
      </p>
      {win.reward_details && (
        <p className="mb-2 text-sm text-zinc-600">{win.reward_details}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {win.session_label} · gagné le {formatDate(win.won_at)}
      </p>

      {win.redeemed_at ? (
        <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          ⚠ Déjà remis le {formatDate(win.redeemed_at)}
        </p>
      ) : (
        <EventRedeemButton code={win.code} />
      )}
    </Card>
  );
}

/** Bénéficiaire d'un versement de parrainage, en clair pour la caisse. */
function referralBeneficiaryLabel(beneficiary: string): string {
  if (beneficiary === "filleul") return "Bonus de bienvenue";
  if (beneficiary === "chest") return "Coffre de l'équipe";
  return "Récompense de parrain";
}

/** Lot de parrainage — code PARRAIN-…, remis en caisse (versement 'lot'). */
function ReferralResult({ reward }: { reward: CashierReferralReward }) {
  const actionable = !reward.redeemed_at;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="mb-1 font-mono text-sm text-zinc-600">{reward.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        🤝 Parrainage · {referralBeneficiaryLabel(reward.beneficiary)}
      </span>
      <p className="mb-1 text-2xl font-bold">
        {reward.reward_label || "Lot de parrainage"}
      </p>
      {reward.reward_details && (
        <p className="mb-2 text-sm text-zinc-600">{reward.reward_details}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {reward.campaign_name} · gagné le {formatDate(reward.created_at)}
      </p>

      {reward.redeemed_at ? (
        <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          ⚠ Déjà remis le {formatDate(reward.redeemed_at)}
        </p>
      ) : (
        <ReferralRedeemButton code={reward.code} />
      )}
    </Card>
  );
}
