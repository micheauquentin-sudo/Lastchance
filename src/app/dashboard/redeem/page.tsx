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
import { QuizRedeemButton } from "@/components/dashboard/quiz-redeem-button";
import { ContestRedeemButton } from "@/components/dashboard/contest-redeem-button";
import { RedeemScanner } from "@/components/dashboard/redeem-scanner";
import {
  LoyaltyStaffStamp,
  type StaffLoyaltyProgram,
} from "@/components/dashboard/loyalty-staff-stamp";
import {
  lookupRedeemCode,
  type CashierCalendarReward,
  type CashierContestAward,
  type CashierEventWin,
  type CashierHuntCompletion,
  type CashierJackpotWin,
  type CashierLoyaltyReward,
  type CashierParticipation,
  type CashierQuizReward,
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
 * Idem pour un lot de pronostics : l'annulation y est portée par `status`
 * (pas de colonne `cancelled_at`), d'où ce prédicat dédié.
 */
const isContestAwardExpired = (award: CashierContestAward) =>
  !award.redeemed_at &&
  award.status !== "cancelled" &&
  award.redeem_expires_at !== null &&
  new Date(award.redeem_expires_at).getTime() <= Date.now();

/**
 * « Vous venez de le remettre » ou « il l'a déjà eu » — deux situations que
 * la caisse affichait EXACTEMENT PAREIL.
 *
 * Le caissier validait la remise, la page se rechargeait, et la carte
 * repassait en ambre sur « ⚠ Déjà remis le … » : mot pour mot, couleur pour
 * couleur, l'écran qu'un client de mauvaise foi obtient en représentant un
 * code consommé la veille. Aucune confirmation n'existait — le caissier
 * distrait, ou celui qui reprend le poste, lisait un avertissement de refus
 * sur une remise qu'il venait lui-même d'autoriser, et hésitait à donner le
 * lot devant le client.
 *
 * La distinction est faite CÔTÉ SERVEUR, à partir de l'horodatage en base, et
 * non d'un état client : ce dernier ne survivrait ni au rechargement qui suit
 * la remise, ni au changement de poste. Quatre-vingt-dix secondes, parce que
 * c'est le temps d'un geste de comptoir — au-delà, c'est de l'histoire.
 */
/**
 * Quatre-vingt-dix secondes : le temps d'un geste de comptoir. Fonction
 * simple et non calcul de rendu, comme les deux prédicats d'expiration
 * ci-dessus — `Date.now()` dans un corps de composant est impur, et la règle
 * `react-hooks/purity` a raison de le refuser.
 */
const vientDEtreRemis = (at: string) =>
  Date.now() - new Date(at).getTime() < 90_000;

function RedeemedBadge({
  at,
  suffix = null,
}: {
  at: string;
  suffix?: React.ReactNode;
}) {
  return vientDEtreRemis(at) ? (
    <p
      role="status"
      className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800"
    >
      ✓ Remise enregistrée — remettez le lot au client{suffix}
    </p>
  ) : (
    <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
      ⚠ Déjà remis le {formatDate(at)}{suffix}
    </p>
  );
}

/**
 * Page caisse mobile-first : le staff tape (ou scanne) le code du client et
 * valide la remise en un geste. Flux unifié — le code peut désigner un lot
 * de roue (GAIN-…), une chasse au trésor (CHASSE-…), un lot de fidélité
 * (FIDELITE-…), un jackpot collectif (JACKPOT-…), un calendrier (CADEAU-…),
 * un événement live (EVENT-…), un parrainage (PARRAIN-…), un quiz (QUIZ-…)
 * ou un championnat de pronostics (PRONO-…) : l'affichage s'adapte à la
 * source. En mode fidélité « staff », une section dédiée valide une VISITE en
 * scannant le passeport du client.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: rawCode } = await searchParams;
  // `lookup` porte trois états : trouvé, introuvable, ou recherche refusée par
  // le rate-limit. Les confondre ferait annoncer « Code introuvable » sur un
  // lot valide (le caissier refuserait alors un client de bonne foi).
  const lookup = rawCode ? await lookupRedeemCode(rawCode) : null;
  const match = lookup?.status === "found" ? lookup.match : null;

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
          placeholder="GAIN-… CHASSE-… FIDELITE-… JACKPOT-… CADEAU-… EVENT-… PARRAIN-… QUIZ-… PRONO-…"
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

      {/* REPARTIR À VIDE. Après une remise, la page revient avec le code
          dans l'URL, et le champ le conserve — curseur en fin de saisie. Le
          client suivant se présente, le caissier tape par-dessus, et la
          recherche part sur les DEUX codes collés bout à bout : « Code
          introuvable », devant quelqu'un qui a pourtant un vrai lot. Il
          devait tout effacer à la main, à chaque client.

          Un lien plutôt qu'un bouton à JavaScript : la caisse doit marcher
          sur le téléphone d'appoint du commerce, pas seulement sur le bon. */}
      {rawCode && (
        <p className="-mt-4 mb-6">
          <a
            href="/dashboard/redeem"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            ↺ Client suivant
          </a>
        </p>
      )}

      {lookup?.status === "not_found" && (
        <Card className="border-red-200 bg-red-50 text-center py-8">
          <p className="text-3xl mb-2">✕</p>
          <p className="font-semibold text-red-700">Code introuvable</p>
          <p className="text-sm text-red-600/80 mt-1">
            Vérifiez la saisie — le code figure sur l&apos;écran ou
            l&apos;email du client.
          </p>
        </Card>
      )}

      {lookup?.status === "rate_limited" && (
        <Card className="border-amber-200 bg-amber-50 text-center py-8">
          <p className="text-3xl mb-2">⏳</p>
          <p className="font-semibold text-amber-700">
            Trop de recherches, patientez quelques secondes
          </p>
          <p className="text-sm text-amber-700/80 mt-1">
            Ce code n&apos;a PAS été vérifié — relancez la recherche dans un
            instant plutôt que de le refuser.
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
      {match?.source === "quiz" && <QuizResult reward={match.reward} />}
      {match?.source === "contest" && <ContestResult award={match.award} />}

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
        <RedeemedBadge
          at={participation.redeemed_at}
          suffix={
            participation.basket_cents !== null
              ? ` · panier ${(participation.basket_cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
              : null
          }
        />
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
        <RedeemedBadge at={completion.redeemed_at} />
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
        <RedeemedBadge at={reward.redeemed_at} />
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
        <RedeemedBadge at={win.redeemed_at} />
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
        <RedeemedBadge at={reward.redeemed_at} />
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
        <RedeemedBadge at={win.redeemed_at} />
      ) : (
        <EventRedeemButton code={win.code} />
      )}
    </Card>
  );
}

/** Mode qui a émis un lot de quiz, en clair pour la caisse. */
function quizSourceLabel(source: string): string {
  if (source === "threshold") return "Seuil de bonnes réponses";
  if (source === "draw") return "Tirage au sort";
  if (source === "ranking") return "Classement";
  if (source === "instant") return "Gain immédiat";
  return "Quiz";
}

/** Lot de quiz — code QUIZ-…, remis en caisse. */
function QuizResult({ reward }: { reward: CashierQuizReward }) {
  const actionable = !reward.redeemed_at;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="mb-1 font-mono text-sm text-zinc-600">{reward.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        🧠 Quiz · {quizSourceLabel(reward.emitted_by)}
        {reward.rank !== null ? ` · ${reward.rank}ᵉ` : ""}
      </span>
      <p className="mb-1 text-2xl font-bold">
        {reward.reward_label || "Lot du quiz"}
      </p>
      {reward.reward_details && (
        <p className="mb-2 text-sm text-zinc-600">{reward.reward_details}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {reward.quiz_name} · gagné le {formatDate(reward.created_at)}
      </p>

      {reward.redeemed_at ? (
        <RedeemedBadge at={reward.redeemed_at} />
      ) : (
        <QuizRedeemButton code={reward.code} />
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
        <RedeemedBadge at={reward.redeemed_at} />
      ) : (
        <ReferralRedeemButton code={reward.code} />
      )}
    </Card>
  );
}

/**
 * Lot de pronostics — code PRONO-…, remis en caisse. Seule source, avec la
 * roue, à porter les TROIS refus possibles (annulé par le commerçant, déjà
 * remis, code expiré) : on les distingue à l'écran plutôt que de laisser le
 * caissier cliquer pour découvrir le motif.
 */
function ContestResult({ award }: { award: CashierContestAward }) {
  const cancelled = award.status === "cancelled";
  // L'échéance SERVEUR fait foi : la RPC refuserait de toute façon —
  // l'affichage l'explique avant le clic (miroir de WheelResult).
  const expired = isContestAwardExpired(award);
  const actionable = !award.redeemed_at && !cancelled && !expired;
  return (
    <Card
      className={
        actionable ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }
    >
      <p className="mb-1 font-mono text-sm text-zinc-600">{award.code}</p>
      <span className="mb-3 inline-flex rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
        ⚽ Pronostics
        {award.rank !== null
          ? ` · ${award.rank}${award.rank === 1 ? "ᵉʳ" : "ᵉ"}`
          : ""}
      </span>
      <p className="mb-1 text-2xl font-bold">
        {award.reward_label || "Lot du championnat"}
      </p>
      <p className="mb-5 text-sm text-zinc-600">
        {award.contest_name} · {award.player_name} · gagné le{" "}
        {formatDate(award.created_at)}
      </p>

      {award.redeemed_at ? (
        <RedeemedBadge
          at={award.redeemed_at}
          suffix={
            award.basket_cents !== null
              ? ` · panier ${(award.basket_cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
              : null
          }
        />
      ) : cancelled ? (
        <p className="inline-flex rounded-full bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700">
          ✖ Lot annulé
        </p>
      ) : expired ? (
        <p className="inline-flex rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
          ⏱ Code expiré le {formatDate(award.redeem_expires_at!)} — délai de
          retrait dépassé
        </p>
      ) : (
        <ContestRedeemButton code={award.code} />
      )}
    </Card>
  );
}
