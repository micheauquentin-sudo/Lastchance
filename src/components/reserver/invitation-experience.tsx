"use client";

import { useCallback, useState } from "react";
import {
  redeemInvitation,
  type RedeemInvitationActionResult,
} from "@/actions/reserver";
import { DefiAntiRobot } from "@/components/reserver/defi-antirobot";
import { MaReservation } from "@/components/reserver/reserver-experience";
import { formatCreneau, RESERVER_EMAIL_MAX } from "@/lib/reserver";
import type {
  ReserverMaReservationView,
  ReserverSlotPublicView,
} from "@/lib/reserver-context";
import { useActionForm } from "@/lib/use-action-form";

/**
 * L'INVITATION PRIVÉE, VUE DE L'INVITÉ (RES-2, lot L5).
 *
 * ── LE JETON NE S'AFFICHE NULLE PART ──
 *
 * Il arrive par l'URL, il repart dans le corps du POST, et c'est tout : aucun
 * texte, aucun `<code>`, aucun lien de partage ne le remontre. Un invité qui
 * fait lire son écran à son voisin ne lui donne pas de quoi prendre une
 * deuxième place, et une capture d'écran de la page de confirmation ne vaut pas
 * invitation. Le jeton reste une propriété de l'adresse, jamais du contenu.
 *
 * ── UN SEUL MESSAGE DE REFUS ──
 *
 * `redeem_invitation` rend `unavailable` pour NEUF motifs (jeton inconnu,
 * révoqué, fermé, expiré, épuisé, d'une autre organisation, créneau absent ou
 * en brouillon ou passé, activité coupée, droit `vitrine` retiré). Les
 * distinguer donnerait un oracle à qui tape des jetons au hasard : « révoqué »
 * apprend que le jeton a été valide, « épuisé » apprend combien de personnes
 * sont venues. L'écran ne les distingue donc pas non plus.
 *
 * ── LE CRÉNEAU PEUT ÊTRE FERMÉ AU PUBLIC, ET C'EST LE CAS D'USAGE ──
 *
 * « J'ouvre cinq places à mes habitués » : la page n'affiche donc AUCUNE
 * pastille « fermé » sur les créneaux qu'elle propose. Ce qui arrête une
 * invitation, ce sont ses propres interrupteurs, pas l'ouverture publique du
 * créneau — et le chargeur a déjà écarté ce qui ne serait pas réservable.
 */

const carteClass =
  "k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]";

export function InvitationExperience({
  token,
  organizationName,
  logoUrl,
  activityName,
  activityDescription,
  invitationLabel,
  creneaux,
  mesReservations,
  timeZone,
}: {
  /**
   * Le jeton clair, UNIQUEMENT pour le corps de l'appel à `redeemInvitation` —
   * jamais rendu. Il n'est pas relu de l'URL côté client : la page serveur l'a
   * déjà résolu, et deux lectures du même secret sont une occasion de plus de
   * le laisser fuir.
   */
  token: string;
  organizationName: string;
  logoUrl: string | null;
  activityName: string;
  activityDescription: string | null;
  /** Le libellé donné par le commerçant — « Habitués du samedi », etc. */
  invitationLabel: string;
  /** Les créneaux que CETTE invitation ouvre, déjà filtrés côté serveur. */
  creneaux: ReserverSlotPublicView[];
  /** La réservation VIVANTE de ce navigateur sur chacun d'eux, par `slotId`. */
  mesReservations: Record<string, ReserverMaReservationView>;
  timeZone: string;
}) {
  const reservees = creneaux.filter((c) => mesReservations[c.id]);
  const libres = creneaux.filter((c) => !mesReservations[c.id]);

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={organizationName}
            width={56}
            height={56}
            className="mx-auto mb-3 h-14 w-14 rounded-full border-2 border-k-ink bg-white object-cover"
          />
        ) : (
          <div className="mx-auto mb-3 text-4xl" aria-hidden>
            ✉️
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <p className="mt-2 inline-flex rounded-full border-2 border-k-ink bg-k-yellow/60 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-k-ink">
          Invitation privée
        </p>
        <h1 className="mt-3 text-2xl font-black leading-tight text-k-ink">
          {activityName}
        </h1>
        <p className="mt-1 text-sm font-bold text-k-body">{invitationLabel}</p>
        {activityDescription ? (
          <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
            {activityDescription}
          </p>
        ) : null}
      </header>

      {reservees.length > 0 ? (
        <section aria-labelledby="invitation-reservations-titre" className="mb-6">
          <h2
            id="invitation-reservations-titre"
            className="mb-3 text-sm font-black uppercase tracking-wide text-k-body"
          >
            🎫 {reservees.length > 1 ? "Vos places" : "Votre place"}
          </h2>
          <ul className="space-y-3">
            {reservees.map((creneau) => (
              <li key={creneau.id}>
                <MaReservation
                  creneau={creneau}
                  reservation={mesReservations[creneau.id]}
                  activityName={activityName}
                  timeZone={timeZone}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs font-medium text-k-body">
            Cette place est retenue sur cet appareil, sans compte. Présentez
            votre code au comptoir en arrivant.
          </p>
        </section>
      ) : null}

      {libres.length > 0 ? (
        <section aria-labelledby="invitation-creneaux-titre" className="mb-6">
          <h2
            id="invitation-creneaux-titre"
            className="mb-3 text-sm font-black uppercase tracking-wide text-k-body"
          >
            {libres.length > 1 ? "Choisissez votre créneau" : "Votre créneau"}
          </h2>
          <ul className="space-y-4">
            {libres.map((creneau) => (
              <li key={creneau.id}>
                <CreneauInvite
                  token={token}
                  creneau={creneau}
                  timeZone={timeZone}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : reservees.length === 0 ? (
        <div className={carteClass}>
          <p className="text-center text-sm font-bold text-k-ink">
            Cette invitation n&apos;ouvre aucun créneau pour le moment.
          </p>
          <p className="mt-1 text-center text-sm font-medium text-k-body">
            Demandez au comptoir : la personne qui vous l&apos;a envoyée pourra
            vous en proposer un autre.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Un créneau ouvert par l'invitation
// ────────────────────────────────────────────────────────────

function CreneauInvite({
  token,
  creneau,
  timeZone,
}: {
  token: string;
  creneau: ReserverSlotPublicView;
  timeZone: string;
}) {
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeDemande, setChallengeDemande] = useState(false);

  const action = useCallback(
    async (_prev: unknown, formData: FormData) => {
      const emailSaisi = String(formData.get("email") ?? "").trim();
      const consenti = formData.get("consent") === "on";

      // MÊME ÉQUIVALENCE QUE LA RÉSERVATION PUBLIQUE, tranchée avant le réseau :
      // une adresse saisie sans la case cochée ne doit pas voyager pour être
      // jetée par la base.
      if (emailSaisi && !consenti) {
        return {
          ok: false,
          error:
            "Cochez la case pour recevoir votre confirmation par email, ou laissez l'adresse vide.",
        } satisfies RedeemInvitationActionResult;
      }

      // AUCUNE organisation dans le corps : `redeemInvitation` la résout à
      // partir de l'empreinte du jeton. La lui passer en aurait fait une entrée
      // client de plus à valider, pour une valeur qu'elle sait déjà.
      const resultat = await redeemInvitation({
        token,
        slotId: creneau.id,
        email: consenti && emailSaisi ? emailSaisi : undefined,
        consent: consenti,
        turnstileToken: captchaToken ?? undefined,
      });
      if (!resultat.ok && resultat.challengeRequired) setChallengeDemande(true);
      if (resultat.ok && resultat.data.state === "full") {
        return {
          ok: false,
          error:
            "Ce créneau est complet : toutes les places sont prises, invitation comprise.",
        } satisfies RedeemInvitationActionResult;
      }
      if (resultat.ok && resultat.data.state === "unavailable") {
        return {
          ok: false,
          error: REFUS_INDISTINCT,
        } satisfies RedeemInvitationActionResult;
      }
      return resultat;
    },
    [token, creneau.id, captchaToken],
  );

  // `reloadOnSuccess` : le code émis n'existe nulle part dans cet écran — seule
  // la relecture serveur le fait apparaître, en haut de page. La RPC est
  // idempotente (`already_reserved` rend la même place et ne brûle aucun usage),
  // mais l'invité qui ne voit rien re-clique en croyant avoir échoué.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — votre place n'a pas été prise.",
  });

  const champEmailId = `invite-email-${creneau.id}`;
  const champConsentId = `invite-consent-${creneau.id}`;

  return (
    <div className={carteClass}>
      <p className="text-base font-black leading-snug text-k-ink">
        {formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)}
      </p>

      <form onSubmit={onSubmit} className="mt-4">
        <label
          htmlFor={champEmailId}
          className="mb-1.5 block text-sm font-bold text-k-ink"
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
            J&apos;accepte de recevoir par email la confirmation, le rappel et
            l&apos;éventuelle annulation de cette réservation.
          </span>
        </label>
        <p
          id={`${champEmailId}-aide`}
          className="mt-2 text-xs font-medium leading-relaxed text-k-body"
        >
          Votre adresse n&apos;est conservée et utilisée que si vous cochez cette
          case, et uniquement pour ces messages-là — jamais pour de la publicité.
          Sans email l&apos;invitation fonctionne : votre code s&apos;affiche sur
          cette page.
        </p>

        <div aria-live="polite">
          <DefiAntiRobot
            id={`invite-${creneau.id}`}
            action="reserver-invitation"
            visible={challengeDemande}
            onToken={setCaptchaToken}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? "Réservation…" : "Réserver ma place"}
        </button>

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
    </div>
  );
}

/**
 * LE message de refus — un seul, pour les neuf motifs que `redeem_invitation`
 * rend indistinctement. Il ne dit ni pourquoi, ni depuis quand : il dit quoi
 * faire.
 */
const REFUS_INDISTINCT =
  "Cette invitation n'est plus valable. Demandez-en une nouvelle à la personne qui vous l'a envoyée.";
