import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasLoyaltyAccess } from "@/lib/subscription";
import { badgeDeRemise, descriptionDeCaisse } from "@/lib/caisse-remise";
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
 * la caisse a longtemps affichées EXACTEMENT PAREIL.
 *
 * Le caissier validait la remise, la page se rechargeait, et la carte repassait
 * en ambre sur « ⚠ Déjà remis le … » : mot pour mot, couleur pour couleur,
 * l'écran qu'un client de mauvaise foi obtient en représentant un code consommé
 * la veille. Le caissier distrait, ou celui qui reprend le poste, lisait un
 * avertissement de refus sur une remise qu'il venait lui-même d'autoriser.
 *
 * La règle vit dans `src/lib/caisse-remise.ts`, avec le récit du défaut qu'elle
 * ferme : la confirmation ne tenait qu'à l'horloge, donc un SECOND PORTEUR du
 * même code — capture d'écran, e-mail transféré — lisait dans les 90 s l'ordre
 * de remettre un lot déjà donné. `Date.now()` est injecté ici plutôt que lu
 * dans un corps de composant, que la règle `react-hooks/purity` refuse.
 */
/**
 * Fonction simple et non calcul de rendu, comme les deux prédicats
 * d'expiration ci-dessus : `Date.now()` dans un corps de composant est impur,
 * et la règle `react-hooks/purity` a raison de le refuser.
 */
const badgeAffiche = (at: string, remis: boolean) =>
  badgeDeRemise({ remisA: at, issuDuGeste: remis, maintenant: Date.now() });

function RedeemedBadge({
  at,
  fuseau,
  remis,
  suffix = null,
}: {
  at: string;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par CETTE remise ? */
  remis: boolean;
  suffix?: React.ReactNode;
}) {
  return badgeAffiche(at, remis) === "confirmation" ? (
    <p
      role="status"
      className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800"
    >
      ✓ Remise enregistrée — remettez le lot au client{suffix}
    </p>
  ) : (
    <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
      ⚠ Déjà remis le {formatDate(at, fuseau)}{suffix}
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
  searchParams: Promise<{ code?: string; remis?: string }>;
}) {
  const { code: rawCode, remis } = await searchParams;
  // POSÉ PAR LA REMISE ELLE-MÊME (`reloadWith` du bouton), jamais par une
  // recherche : le formulaire de saisie est un `GET` qui ne porte que `code`,
  // et le lien « Client suivant » repart d'une URL nue. C'est ce qui distingue
  // « vous venez de le remettre » de « quelqu'un d'autre représente ce code ».
  const issuDuGeste = remis === "1";
  // FUSEAU DE L'ÉTABLISSEMENT. Sans lui, `formatDate` retombait sur le
  // fuseau de l'hôte — UTC en production : « Déjà remis le 30 juil. 23:40 »
  // pour une remise faite le 31 à 1 h 40. Le caissier lisait le mauvais jour.
  const { organization: orgFuseau } = await getUserAndOrg();
  const fuseau = orgFuseau?.timezone ?? "Europe/Paris";
  // `lookup` porte QUATRE états : trouvé, annulé, introuvable, ou recherche
  // refusée par le rate-limit. Les confondre ferait annoncer « Code
  // introuvable » sur un lot valide (le caissier refuserait alors un client de
  // bonne foi) ou sur un lot annulé (il l'enverrait vérifier une saisie
  // pourtant exacte).
  const lookup = rawCode ? await lookupRedeemCode(rawCode) : null;
  const match = lookup?.status === "found" ? lookup.match : null;
  // LIBELLÉ GRAVÉ À L'ÉMISSION, quand le registre connaît ce code.
  //
  // Les cartes affichaient le libellé ACTUEL de la table parente. Le
  // commerçant renomme sa récompense — geste banal entre deux opérations —
  // et le client se présente avec un email qui annonce « Café offert » devant
  // un écran qui dit « Croissant offert ». Rien ne disait lequel faisait foi.
  //
  // `null` pour les codes ANTÉRIEURS au registre : on retombe alors sur la
  // table parente, c'est-à-dire l'ancien comportement, qui reste le meilleur
  // disponible pour eux.
  const nomGagne =
    (lookup?.status === "found" ? lookup.frozenLabel : null) ?? null;
  // DESCRIPTION GRAVÉE À L'ÉMISSION (migration 20260901120000), pendant du
  // libellé ci-dessus. C'est elle qui porte les CONDITIONS que le caissier
  // applique au comptoir : le titre gravé au-dessus d'une description courante
  // faisait se contredire les deux lignes d'une même carte.
  //
  // `null` pour un code antérieur au registre, pour un lot décrit après coup,
  // et TOUJOURS pour la famille pronostics — seule des neuf à ne jamais écrire
  // `reward_details`. Le repli sur la table parente y est le chemin normal.
  const descriptionGagnee =
    (lookup?.status === "found" ? lookup.frozenDetails : null) ?? null;

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

      {/* LOT ANNULÉ ≠ CODE INTROUVABLE. Le commerçant a supprimé la roue, la
          chasse ou le calendrier qui portait ce lot ; le registre le sait et
          l'a marqué annulé (20260902120000). Sans cette carte, le comptoir
          répondait « Code introuvable » — le mot d'un code inventé — devant un
          client qui a réellement gagné. Il repartait vérifier son e-mail pour
          un code qui ne redeviendra jamais valable. */}
      {lookup?.status === "cancelled" && (
        <Card className="border-amber-200 bg-amber-50 py-8 text-center">
          <p className="text-3xl mb-2">⊘</p>
          <p className="font-semibold text-amber-800">Ce lot a été annulé</p>
          {lookup.frozenLabel && (
            <p className="mt-1 text-sm font-medium text-amber-800">
              {lookup.frozenLabel}
            </p>
          )}
          <p className="text-sm text-amber-700/80 mt-1">
            {lookup.cancelledAt
              ? `Annulé le ${formatDate(lookup.cancelledAt, fuseau)} — ne le remettez pas.`
              : "Ne le remettez pas."}{" "}
            Le code est bien celui de votre établissement, mais l&apos;opération
            qui le portait a été supprimée : inutile de faire retaper la saisie.
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
        <WheelResult participation={match.participation} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />
      )}
      {match?.source === "hunt" && <HuntResult completion={match.completion} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />}
      {match?.source === "loyalty" && <LoyaltyResult reward={match.reward} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />}
      {match?.source === "jackpot" && <JackpotResult win={match.win} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />}
      {match?.source === "calendar" && <CalendarResult reward={match.reward} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />}
      {match?.source === "event" && <EventResult win={match.win} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />}
      {match?.source === "referral" && <ReferralResult reward={match.reward} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />}
      {match?.source === "quiz" && <QuizResult reward={match.reward} nomGagne={nomGagne} descriptionGagnee={descriptionGagnee} fuseau={fuseau} remis={issuDuGeste} />}
      {match?.source === "contest" && <ContestResult award={match.award} nomGagne={nomGagne} fuseau={fuseau} remis={issuDuGeste} />}

      <LoyaltyStaffStamp programs={staffPrograms} />
    </div>
  );
}

/** Lot de roue (participation) — parcours existant, inchangé. */
function WheelResult({
  participation,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  participation: CashierParticipation;
  /** Libellé gravé à l'émission, `null` pour un code antérieur au registre. */
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  // L'échéance SERVEUR fait foi : la RPC refuserait de toute façon —
  // l'affichage l'explique avant le clic.
  const expired = isLookupExpired(participation);
  const actionable =
    !participation.redeemed_at && !participation.cancelled_at && !expired;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: participation.prizes?.label,
    descriptionCourante: participation.prizes?.description,
  });
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
        {nomGagne ?? participation.prizes?.label ?? "Lot supprimé"}
      </p>
      {detailsGagnes && (
        <p className="text-sm text-zinc-600 mb-2">
          {detailsGagnes}
        </p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {participation.first_name ?? "Anonyme"} ·{" "}
        {participation.campaigns?.name ?? "Campagne supprimée"} · gagné le{" "}
        {formatDate(participation.created_at, fuseau)}
      </p>

      {participation.cancelled_at ? (
        <p className="inline-flex rounded-full bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700">
          ✖ Gain annulé le {formatDate(participation.cancelled_at, fuseau)}
        </p>
      ) : participation.redeemed_at ? (
        <RedeemedBadge remis={remis}
          at={participation.redeemed_at}
          fuseau={fuseau}
          suffix={
            participation.basket_cents !== null
              ? ` · panier ${(participation.basket_cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
              : null
          }
        />
      ) : expired ? (
        <p className="inline-flex rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
          ⏱ Code expiré le {formatDate(participation.redeem_expires_at!, fuseau)} — délai
          de retrait dépassé
        </p>
      ) : (
        <RedeemButton id={participation.id} />
      )}
    </Card>
  );
}

/** Lot de chasse au trésor (complétion) — code CHASSE-…, remis en caisse. */
function HuntResult({
  completion,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  completion: CashierHuntCompletion;
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  const actionable = !completion.redeemed_at;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: completion.reward_label,
    descriptionCourante: completion.reward_details,
  });
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
        {nomGagne || completion.reward_label || "Lot de la chasse"}
      </p>
      {detailsGagnes && (
        <p className="text-sm text-zinc-600 mb-2">{detailsGagnes}</p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {completion.hunt_name} · terminée le {formatDate(completion.completed_at, fuseau)}
      </p>

      {completion.redeemed_at ? (
        <RedeemedBadge remis={remis} at={completion.redeemed_at} fuseau={fuseau} />
      ) : (
        <HuntRedeemButton code={completion.code} />
      )}
    </Card>
  );
}

/** Lot de fidélité (récompense) — code FIDELITE-…, remis en caisse. */
function LoyaltyResult({
  reward,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  reward: CashierLoyaltyReward;
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  const actionable = !reward.redeemed_at;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: reward.reward_label,
    descriptionCourante: reward.reward_details,
  });
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
        {nomGagne || reward.reward_label || "Lot de fidélité"}
      </p>
      {detailsGagnes && (
        <p className="text-sm text-zinc-600 mb-2">{detailsGagnes}</p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {reward.program_name} · gagné le {formatDate(reward.earned_at, fuseau)}
      </p>

      {reward.redeemed_at ? (
        <RedeemedBadge remis={remis} at={reward.redeemed_at} fuseau={fuseau} />
      ) : (
        <LoyaltyRedeemButton code={reward.code} />
      )}
    </Card>
  );
}

/** Gain de jackpot collectif — code JACKPOT-…, remis en caisse. */
function JackpotResult({
  win,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  win: CashierJackpotWin;
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  const actionable = !win.redeemed_at;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: win.reward_label,
    descriptionCourante: win.reward_details,
  });
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
        {nomGagne || win.reward_label || "Lot du jackpot"}
      </p>
      {detailsGagnes && (
        <p className="text-sm text-zinc-600 mb-2">{detailsGagnes}</p>
      )}
      <p className="text-sm text-zinc-600 mb-5">
        {win.campaign_name} · gagné le {formatDate(win.drawn_at, fuseau)}
      </p>

      {win.redeemed_at ? (
        <RedeemedBadge remis={remis} at={win.redeemed_at} fuseau={fuseau} />
      ) : (
        <JackpotRedeemButton code={win.code} />
      )}
    </Card>
  );
}

/** Lot de calendrier — code CADEAU-…, remis en caisse (case-lot ou assiduité). */
function CalendarResult({
  reward,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  reward: CashierCalendarReward;
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  const actionable = !reward.redeemed_at;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: reward.reward_label,
    descriptionCourante: reward.reward_details,
  });
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
        {nomGagne || reward.reward_label || "Lot du calendrier"}
      </p>
      {detailsGagnes && (
        <p className="mb-2 text-sm text-zinc-600">{detailsGagnes}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {reward.calendar_name} · gagné le {formatDate(reward.created_at, fuseau)}
      </p>

      {reward.redeemed_at ? (
        <RedeemedBadge remis={remis} at={reward.redeemed_at} fuseau={fuseau} />
      ) : (
        <CalendarRedeemButton code={reward.code} />
      )}
    </Card>
  );
}

/** Gain du Mode événement en direct — code EVENT-…, remis en caisse. */
function EventResult({
  win,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  win: CashierEventWin;
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  const actionable = !win.redeemed_at;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: win.reward_label,
    descriptionCourante: win.reward_details,
  });
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
        {nomGagne || win.reward_label || "Lot de l'événement"}
      </p>
      {detailsGagnes && (
        <p className="mb-2 text-sm text-zinc-600">{detailsGagnes}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {win.session_label} · gagné le {formatDate(win.won_at, fuseau)}
      </p>

      {win.redeemed_at ? (
        <RedeemedBadge remis={remis} at={win.redeemed_at} fuseau={fuseau} />
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
function QuizResult({
  reward,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  reward: CashierQuizReward;
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  const actionable = !reward.redeemed_at;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: reward.reward_label,
    descriptionCourante: reward.reward_details,
  });
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
        {nomGagne || reward.reward_label || "Lot du quiz"}
      </p>
      {detailsGagnes && (
        <p className="mb-2 text-sm text-zinc-600">{detailsGagnes}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {reward.quiz_name} · gagné le {formatDate(reward.created_at, fuseau)}
      </p>

      {reward.redeemed_at ? (
        <RedeemedBadge remis={remis} at={reward.redeemed_at} fuseau={fuseau} />
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
function ReferralResult({
  reward,
  nomGagne,
  descriptionGagnee,
  fuseau,
  remis,
}: {
  reward: CashierReferralReward;
  nomGagne: string | null;
  /** Description gravée à l'émission, `null` : repli sur la table parente. */
  descriptionGagnee: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
  const actionable = !reward.redeemed_at;
  // DESCRIPTION GRAVÉE À L'ÉMISSION quand le registre en porte une : c'est
  // elle qui énonce les conditions appliquées au comptoir, et le titre
  // au-dessus est gravé lui aussi — les deux lignes disent enfin la même
  // chose. À défaut, repli sur la table parente, retiré si la récompense a
  // été renommée depuis (elle décrirait alors autre chose).
  const detailsGagnes = descriptionDeCaisse({
    detailsGraves: descriptionGagnee,
    nomGagne,
    labelCourant: reward.reward_label,
    descriptionCourante: reward.reward_details,
  });
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
        {nomGagne || reward.reward_label || "Lot de parrainage"}
      </p>
      {detailsGagnes && (
        <p className="mb-2 text-sm text-zinc-600">{detailsGagnes}</p>
      )}
      <p className="mb-5 text-sm text-zinc-600">
        {reward.campaign_name} · gagné le {formatDate(reward.created_at, fuseau)}
      </p>

      {reward.redeemed_at ? (
        <RedeemedBadge remis={remis} at={reward.redeemed_at} fuseau={fuseau} />
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
function ContestResult({
  award,
  nomGagne,
  fuseau,
  remis,
}: {
  award: CashierContestAward;
  nomGagne: string | null;
  /** Fuseau de l'établissement — jamais celui du serveur. */
  fuseau: string;
  /** La page vient-elle du rechargement déclenché par une remise ? */
  remis: boolean;
}) {
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
        {nomGagne || award.reward_label || "Lot du championnat"}
      </p>
      <p className="mb-5 text-sm text-zinc-600">
        {award.contest_name} · {award.player_name} · gagné le{" "}
        {formatDate(award.created_at, fuseau)}
      </p>

      {award.redeemed_at ? (
        <RedeemedBadge remis={remis}
          at={award.redeemed_at}
          fuseau={fuseau}
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
          ⏱ Code expiré le {formatDate(award.redeem_expires_at!, fuseau)} — délai de
          retrait dépassé
        </p>
      ) : (
        <ContestRedeemButton code={award.code} />
      )}
    </Card>
  );
}
