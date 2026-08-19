"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  claimWaitlistOffer,
  waitlistJoin,
  waitlistLeave,
  type WaitlistJoinActionResult,
} from "@/actions/reserver";
import { DefiAntiRobot } from "@/components/reserver/defi-antirobot";
import {
  etatUiEntreeFile,
  formatCreneau,
  RESERVER_EMAIL_MAX,
  type ClaimWaitlistOfferResult,
  type ClaimWaitlistOfferState,
  type EtatUiEntreeFile,
  type PublicWaitlistItem,
  type WaitlistLeaveResult,
  type WaitlistLeaveState,
} from "@/lib/reserver";
import type { ReserverSlotPublicView } from "@/lib/reserver-context";
import { useActionForm } from "@/lib/use-action-form";
import type { ActionResult } from "@/lib/utils";

/**
 * LA LISTE PRIORITAIRE, VUE DU JOUEUR (RES-2, lot L5).
 *
 * ── LA JAUGE NE DIT PLUS TOUTE LA VÉRITÉ, ET C'EST VOULU ──
 *
 * Depuis que les offres tenues comptent dans la capacité, un créneau dont une
 * place est RÉSERVÉE à quelqu'un de la liste s'affiche « complet » à tout le
 * monde — y compris à celui pour qui elle est tenue. Son chemin de réservation
 * n'est donc PAS le bouton « Réserver ma place », qui se ferait répondre `full`
 * par la base : c'est « Prendre la place », qui appelle `claim_waitlist_offer`
 * et ne repasse pas par la jauge. C'est pour cette raison que les créneaux où
 * ce navigateur attend sont sortis de la liste des créneaux libres et remontés
 * dans leur propre section, au-dessus.
 *
 * ── LE RANG EST HONNÊTE, ET IL N'EST PAS UNE PROMESSE ──
 *
 * Le rang affiché est celui que la base a compté au chargement, sur les seules
 * entrées vivantes (`waiting` + `offered`) — jamais un « il reste 2 personnes
 * devant vous » interpolé côté client. Il peut avancer entre deux ouvertures de
 * page ; il ne recule que si quelqu'un devant se retire, ce qui est le
 * fonctionnement même de la file. La phrase qui l'accompagne ne promet aucune
 * place : elle dit ce qui se passera SI une se libère.
 */

const carteClass =
  "k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]";

// ────────────────────────────────────────────────────────────
// Rejoindre — sur un créneau COMPLET seulement
// ────────────────────────────────────────────────────────────

/**
 * Le formulaire d'inscription, rendu à la place du bouton « Réserver » quand le
 * créneau est complet.
 *
 * L'ÉQUIVALENCE EMAIL / CONSENTEMENT est la même que celle de la réservation,
 * et elle est tranchée ICI, avant le réseau : `reservation_waitlist_entries`
 * porte la même contrainte que `reservations` (les deux ensemble ou rien), et
 * une adresse saisie sans la case cochée ne doit pas voyager pour être jetée.
 *
 * Sur cette liste-ci, l'adresse a une finalité de plus, et c'est ce que dit
 * l'aide sous le champ : sans email, personne ne PRÉVIENT le joueur que sa
 * place est là — il doit rouvrir la page avant l'échéance.
 */
export function RejoindreFileAttente({
  organizationId,
  creneau,
}: {
  organizationId: string;
  creneau: ReserverSlotPublicView;
}) {
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeDemande, setChallengeDemande] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  const action = useCallback(
    async (_prev: unknown, formData: FormData) => {
      const emailSaisi = String(formData.get("email") ?? "").trim();
      const consenti = formData.get("consent") === "on";

      if (emailSaisi && !consenti) {
        return {
          ok: false,
          error:
            "Cochez la case pour être prévenu par email, ou laissez l'adresse vide.",
        } satisfies WaitlistJoinActionResult;
      }

      const resultat = await waitlistJoin({
        organizationId,
        slotId: creneau.id,
        // L'ADRESSE NE PART QUE CONSENTIE — même règle, même raison qu'à la
        // réservation : sans consentement la base la jetterait, et l'envoyer
        // quand même la ferait traverser réseau et journaux pour rien.
        email: consenti && emailSaisi ? emailSaisi : undefined,
        consent: consenti,
        turnstileToken: captchaToken ?? undefined,
      });
      if (!resultat.ok && resultat.challengeRequired) setChallengeDemande(true);
      // `waitlist_full` EST un échec, et c'est le seul état de cette RPC dont
      // le rechargement ne montrerait RIEN : l'écran réafficherait le même
      // bouton « Rejoindre la liste d'attente », et le joueur croirait à un clic
      // perdu. Il devient donc un refus lisible — et nommé, pas muet : ce refus
      // ne révèle rien qu'il ne voie déjà (le créneau est complet, sa capacité
      // est affichée), et « la liste est complète » est actionnable là où
      // « indisponible » ne l'est pas.
      if (resultat.ok && resultat.data.state === "waitlist_full") {
        const plafond = resultat.data.waitlistCapacity;
        return {
          ok: false,
          error: plafond
            ? `La liste d'attente de ce créneau est complète (${plafond} personnes). Revenez un peu plus tard, ou choisissez un autre créneau.`
            : "La liste d'attente de ce créneau est complète. Revenez un peu plus tard, ou choisissez un autre créneau.",
        } satisfies WaitlistJoinActionResult;
      }
      // `not_full` n'est PAS un échec, et n'est pas non plus une inscription :
      // une place s'est libérée entre l'affichage et le clic, et la base renvoie
      // le joueur vers la réservation ordinaire. Le rechargement la lui montre,
      // avec son bouton « Réserver ma place » — d'où le succès.
      return resultat;
    },
    [organizationId, creneau.id, captchaToken],
  );

  // `reloadOnSuccess` : la section « Ma file d'attente » est entièrement dérivée
  // de props serveur, sans état local. Sans rechargement, le joueur ne voit rien
  // se passer et re-clique — la RPC est idempotente (`already_waiting` rend le
  // même rang), mais il aurait cru avoir échoué.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — vous n'êtes pas encore inscrit.",
  });

  const champEmailId = `attente-email-${creneau.id}`;
  const champConsentId = `attente-consent-${creneau.id}`;

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-white px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink hover:bg-k-yellow/30"
      >
        Rejoindre la liste d&apos;attente
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4">
      <p className="rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-xs font-medium leading-relaxed text-k-body">
        Si une place se libère, elle vous est proposée{" "}
        <strong className="font-black text-k-ink">à vous en priorité</strong>,
        chacun son tour, et tenue quelques heures. Rien n&apos;est réservé tant
        que vous ne l&apos;avez pas prise.
      </p>

      <label
        htmlFor={champEmailId}
        className="mt-4 mb-1.5 block text-sm font-bold text-k-ink"
      >
        Votre email{" "}
        <span className="font-medium text-k-body">(facultatif)</span>
      </label>
      <input
        id={champEmailId}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        maxLength={RESERVER_EMAIL_MAX}
        placeholder="vous@exemple.fr"
        aria-describedby={`${champEmailId}-aide`}
        className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
      />

      {/* LA CASE EST SÉPARÉE DU CHAMP : saisir une adresse ne vaut pas
          consentement, ici comme à la réservation. */}
      <label
        htmlFor={champConsentId}
        className="mt-3 flex cursor-pointer items-start gap-3"
      >
        <input
          id={champConsentId}
          name="consent"
          type="checkbox"
          value="on"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-k-ink accent-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
        />
        <span className="text-sm font-bold text-k-ink">
          J&apos;accepte d&apos;être prévenu par email quand une place se libère
          pour moi.
        </span>
      </label>
      <p
        id={`${champEmailId}-aide`}
        className="mt-2 text-xs font-medium leading-relaxed text-k-body"
      >
        Votre adresse n&apos;est conservée et utilisée que si vous cochez cette
        case, et uniquement pour ces messages-là — jamais pour de la publicité.
        <strong className="font-bold text-k-ink">
          {" "}
          Sans email, revenez sur cette page pour voir si votre tour est venu :
          une place proposée ne vous attend pas indéfiniment.
        </strong>
      </p>

      <div aria-live="polite">
        <DefiAntiRobot
          id={`attente-${creneau.id}`}
          action="reserver-waitlist-join"
          visible={challengeDemande}
          onToken={setCaptchaToken}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="k-btn flex-1 rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? "Inscription…" : "M'inscrire sur la liste"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          disabled={pending}
          className="rounded-2xl border-2 border-k-ink bg-white px-4 py-4 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:pointer-events-none disabled:opacity-60"
        >
          Annuler
        </button>
      </div>

      <div aria-live="assertive">
        {state && !state.ok ? (
          <p
            role="alert"
            className="mt-3 text-center text-sm font-bold text-red-700"
          >
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// « Ma file d'attente » — le rang, l'offre, et ses deux gestes
// ────────────────────────────────────────────────────────────

export function MaFileAttente({
  creneau,
  entree,
  timeZone,
}: {
  creneau: ReserverSlotPublicView;
  entree: PublicWaitlistItem;
  timeZone: string;
}) {
  /**
   * L'ÉTAT VIENT DU SERVEUR, PAS DE L'HORLOGE DU TÉLÉPHONE.
   *
   * `etatUiEntreeFile` lit `offerLive`, tranché par `reservation_public_state`
   * avec l'horloge de la base. Comparer `offerExpiresAt` à `Date.now()` ici
   * rétablirait exactement ce que le SQL a écarté : une place « encore à moi »
   * qui dépend d'un appareil mal réglé — dans les deux sens.
   */
  const etat = etatUiEntreeFile(entree);
  const offerte = etat === "offre";

  return (
    <div className={carteClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex rounded-full border-2 border-k-ink bg-k-blue/30 px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
          {LIBELLE_ETAT[etat]}
        </p>
      </div>

      <p className="mt-3 text-sm font-bold text-k-ink">
        {formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)}
      </p>

      {etat === "attente" ? (
        <>
          <p className="mt-4 text-base font-black text-k-ink">
            Vous êtes{" "}
            <span className="tabular-nums">{ordinal(entree.position)}</span> sur
            la liste.
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-k-body">
            Ce rang est celui de maintenant, pas une promesse : dès qu&apos;une
            place se libère, elle est proposée à la personne en tête, une seule à
            la fois. Votre tour avance à chaque désistement.
          </p>
        </>
      ) : null}

      {offerte ? <OffreVivante entree={entree} /> : null}

      {etat === "offre_expiree" || etat === "expiree" ? (
        <p className="mt-4 rounded-xl border-2 border-k-ink bg-zinc-100 px-3 py-2 text-sm font-bold text-k-ink">
          Une place vous avait été proposée, et son délai est écoulé : elle
          repart à la personne suivante. Vous pouvez vous réinscrire sur la liste
          si le créneau est encore complet.
        </p>
      ) : null}

      {etat === "partie" ? (
        <p className="mt-4 rounded-xl border-2 border-k-ink/20 bg-zinc-50 px-3 py-2 text-sm font-bold text-k-body">
          Vous vous êtes retiré de cette liste.
        </p>
      ) : null}

      {etat === "convertie" ? (
        <p className="mt-4 rounded-xl border-2 border-k-ink bg-k-green/20 px-3 py-2 text-sm font-black text-k-ink">
          ✓ Vous avez pris cette place : votre code est plus haut sur cette page.
        </p>
      ) : null}

      {/* Les deux gestes n'existent QUE tant que l'entrée est vivante. Sur une
          entrée terminale les RPC refuseraient, et proposer un bouton qui
          n'aboutira pas est pire que de ne pas en proposer.

          `offre_expiree` en est exclue AUSSI : la ligne est encore `offered` en
          base — le balayage n'est pas passé — mais `claim_waitlist_offer` la
          refuserait paresseusement. Le bouton serait un piège. */}
      {offerte ? <PrendreLaPlace entryId={entree.entryId} /> : null}
      {etat === "attente" || offerte ? (
        <LaisserPasser entryId={entree.entryId} offerte={offerte} />
      ) : null}
    </div>
  );
}

const LIBELLE_ETAT: Record<EtatUiEntreeFile, string> = {
  attente: "Sur la liste",
  offre: "Place proposée",
  offre_expiree: "Délai écoulé",
  convertie: "Place prise",
  expiree: "Délai écoulé",
  partie: "Retiré",
};

/** « 1er », « 2e », « 3e »… — la seule irrégularité du français est le premier. */
function ordinal(position: number): string {
  const rang =
    Number.isFinite(position) && position >= 1 ? Math.trunc(position) : 1;
  return rang === 1 ? "1er" : `${rang}e`;
}

// ────────────────────────────────────────────────────────────
// L'offre vivante et son échéance
// ────────────────────────────────────────────────────────────

function OffreVivante({ entree }: { entree: PublicWaitlistItem }) {
  return (
    <div className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/40 px-4 py-3">
      <p className="text-base font-black leading-snug text-k-ink">
        🎉 Une place est à vous — si vous la prenez maintenant.
      </p>
      <p className="mt-1 text-sm font-medium leading-relaxed text-k-ink">
        Elle est tenue rien que pour vous, et pour un temps limité. Passé ce
        délai, elle repart à la personne suivante sur la liste.
      </p>
      {entree.offerExpiresAt ? (
        <CompteARebours echeance={entree.offerExpiresAt} />
      ) : null}
    </div>
  );
}

/**
 * L'échéance, en toutes lettres et qui décroît.
 *
 * ── POURQUOI ELLE N'EST CALCULÉE QUE CÔTÉ CLIENT ──
 *
 * « Il vous reste 12 min » rendu au serveur serait faux dès la seconde suivante,
 * et un rendu serveur/client divergent casse l'hydratation. Le compteur ne
 * s'affiche donc qu'une fois hydraté (motif `useClientDateLabel` du jackpot), et
 * la carte reste lisible sans lui.
 *
 * IL N'EST PAS UN JUGE. À zéro, il n'efface pas le bouton : c'est
 * `claim_waitlist_offer` qui tranche, sous verrou, avec l'horloge de la base —
 * la seule qui fasse foi. Le compteur dit « le délai est écoulé », et le clic
 * rapportera `expired` si c'est vrai.
 */
function CompteARebours({ echeance }: { echeance: string }) {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!hydrated) return null;
  const fin = Date.parse(echeance);
  if (Number.isNaN(fin)) return null;

  const restant = Math.max(0, Math.floor((fin - maintenant) / 1000));
  const minutes = Math.floor(restant / 60);
  const secondes = restant % 60;

  return (
    <p
      // MUET, délibérément : un compteur qui s'annonce chaque seconde rendrait
      // la page inaudible et couvrirait le bouton « Prendre la place », qui est
      // la seule chose à faire. Le lecteur d'écran lit la valeur quand il arrive
      // dessus, et l'échéance est de toute façon rejugée par la base.
      aria-live="off"
      className="mt-3 rounded-lg border-2 border-k-ink bg-white px-3 py-2 text-center"
    >
      {restant > 0 ? (
        <>
          <span className="block text-[11px] font-black uppercase tracking-wider text-k-body">
            Il vous reste
          </span>
          <span className="block font-mono text-2xl font-black tabular-nums text-k-ink">
            {minutes}:{String(secondes).padStart(2, "0")}
          </span>
        </>
      ) : (
        <span className="block text-sm font-black text-k-ink">
          Le délai est écoulé — essayez tout de même, la place n&apos;est
          peut-être pas encore repartie.
        </span>
      )}
    </p>
  );
}

const emptySubscribe = () => () => {};

// ────────────────────────────────────────────────────────────
// Les deux gestes
// ────────────────────────────────────────────────────────────

function PrendreLaPlace({ entryId }: { entryId: string }) {
  // AUCUNE organisation dans le corps : `claimWaitlistOffer` la lit sur
  // l'entrée elle-même, comme `cancelReservation` la lit sur la réservation. Le
  // seul secret transmis est l'identifiant d'entrée, que ce navigateur détient
  // déjà — la preuve de possession reste le cookie.
  const action = useCallback(async (): Promise<
    ActionResult<ClaimWaitlistOfferResult>
  > => {
    const resultat = await claimWaitlistOffer({ entryId });
    if (!resultat.ok || resultat.data.state === "claimed") return resultat;
    return { ok: false, error: REFUS_CLAIM[resultat.data.state] };
  }, [entryId]);

  // `reloadOnSuccess` : le code de la réservation qui vient de naître n'existe
  // nulle part dans cet écran — seule la relecture serveur le fait apparaître.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — la place vous est toujours tenue.",
  });

  return (
    <form onSubmit={onSubmit} className="mt-4">
      <button
        type="submit"
        disabled={pending}
        className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Réservation…" : "Prendre la place"}
      </button>
      <div aria-live="assertive">
        {state && !state.ok ? (
          <p
            role="alert"
            className="mt-2 text-center text-sm font-bold text-red-700"
          >
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function LaisserPasser({
  entryId,
  offerte,
}: {
  entryId: string;
  offerte: boolean;
}) {
  const action = useCallback(async (): Promise<
    ActionResult<WaitlistLeaveResult>
  > => {
    const resultat = await waitlistLeave({ entryId });
    if (!resultat.ok || resultat.data.state === "left") return resultat;
    return { ok: false, error: REFUS_LEAVE[resultat.data.state] };
  }, [entryId]);

  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — vous êtes toujours sur la liste.",
  });

  return (
    <form
      onSubmit={(event) => {
        if (
          !confirm(
            offerte
              ? "Laisser passer cette place ? Elle est proposée immédiatement à la personne suivante, et vous sortez de la liste."
              : "Vous retirer de cette liste d'attente ? Vous perdrez votre rang.",
          )
        ) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="mt-2"
    >
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending
          ? "…"
          : offerte
            ? "Laisser passer"
            : "Me retirer de la liste"}
      </button>
      <div aria-live="assertive">
        {state && !state.ok ? (
          <p
            role="alert"
            className="mt-2 text-center text-sm font-bold text-red-700"
          >
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Les états de refus, dans les mots du joueur.
 *
 * `unknown` couvre l'entrée inconnue ET celle d'une autre identité : la RPC les
 * rend indistincts volontairement, et ces messages ne les distinguent pas non
 * plus. `unavailable` couvre le créneau qui a commencé, l'activité coupée et
 * l'entrée qui n'est plus offerte — un seul message, pour la même raison.
 */
const REFUS_CLAIM: Record<Exclude<ClaimWaitlistOfferState, "claimed">, string> =
  {
    unknown: "Cette inscription est introuvable. Rechargez la page.",
    unavailable:
      "Cette place n'est plus disponible. Rechargez la page pour voir où vous en êtes.",
    expired:
      "Le délai est écoulé : la place est repartie à la personne suivante. Vous pouvez vous réinscrire si le créneau est encore complet.",
  };

const REFUS_LEAVE: Record<Exclude<WaitlistLeaveState, "left">, string> = {
  unknown: "Cette inscription est introuvable. Rechargez la page.",
  converted:
    "Vous avez déjà pris cette place : elle ne se laisse plus passer, elle s'annule depuis votre réservation.",
  expired: "Ce délai était déjà écoulé — la place est repartie sans vous.",
};
