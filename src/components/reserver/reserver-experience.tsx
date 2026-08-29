"use client";

import { useCallback, useState } from "react";
import {
  cancelReservation,
  reserveSlot,
  type ReserveSlotActionResult,
} from "@/actions/reserver";
import { DefiAntiRobot } from "@/components/reserver/defi-antirobot";
import {
  BandeauDuo,
  EtapesExperience,
  ExergueExperience,
  PreparationExperience,
} from "@/components/reserver/experience-immersive";
import {
  MaFileAttente,
  RejoindreFileAttente,
} from "@/components/reserver/file-attente";
import { uniteJauge } from "@/components/reserver/formats-experience";
import { AjouterAgenda } from "@/components/reserver/ajouter-agenda";
import { PendantVotreAttente } from "@/components/reserver/pendant-votre-attente";
import {
  etatUiCreneau,
  formatCreneau,
  libelleTaillePersonnes,
  LIBELLE_FENETRE_CHECKIN,
  placesParReservation,
  RESERVER_EMAIL_MAX,
  type PublicWaitlistItem,
  type ReserverActivityKind,
  type ReserverAttenteView,
} from "@/lib/reserver";
import type {
  ReserverMaReservationView,
  ReserverSlotPublicView,
} from "@/lib/reserver-context";
import { useActionForm } from "@/lib/use-action-form";

/**
 * LE PARCOURS JOUEUR DE « RÉSERVER » — mobile d'abord, sans compte.
 *
 * Le client scanne le QR du commerce, voit les créneaux ouverts, prend sa
 * place, et repart avec un code à donner au comptoir. Aucun compte, aucun mot
 * de passe : son identité est le cookie HTTP-only, et la base n'en voit jamais
 * que l'empreinte.
 *
 * ── AUCUN JETON DANS L'URL, NULLE PART ──
 *
 * Ni à la confirmation, ni à l'annulation (ADR-109 : « le QR public est une
 * adresse, jamais une preuve de présence »). Une adresse se recopie dans une
 * conversation, se retrouve dans l'historique d'un téléphone prêté, part dans
 * le `Referer` de la première ressource externe chargée. La preuve de
 * possession est le cookie, et elle ne quitte pas l'en-tête.
 *
 * ── CONVENTIONS VISUELLES ──
 *
 * HTML natif et classes `k-*`, comme les neuf autres parcours joueur : les
 * primitives `Button`/`Card` sont celles du tableau de bord. Fond crème
 * (`bg-k-bg`) posé par la page, cartes blanches, encre pour le texte — jamais
 * de `text-zinc-500`, dont le contraste sur crème n'est pas tenu (le corps de
 * texte secondaire est `text-k-body`, mesuré).
 */

const carteClass =
  "k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]";

export function ReserverExperience({
  organizationId,
  activityName,
  description,
  organizationName,
  logoUrl,
  creneaux,
  mesReservations,
  maFile,
  timeZone,
  attente = null,
  kind = "standard",
  promise = null,
  durationMinutes = null,
  steps = [],
  preparation = null,
  emailObligatoire = false,
}: {
  /**
   * Chez QUI le joueur croit réserver. `reserve_slot` l'exige : c'est la borne
   * de locataire de la RPC — sans elle, un identifiant de créneau, qui circule
   * en clair dans les URL publiques, suffisait à écrire dans les tables d'une
   * AUTRE organisation. Il vient du contexte de CETTE page, jamais d'une saisie.
   */
  organizationId: string;
  activityName: string;
  description: string | null;
  /**
   * L'adresse est-elle EXIGÉE pour réserver ? Vrai pour un rendez-vous, faux
   * pour un Moment. Le DÉFAUT est `false` : un appelant qui ne la connaît pas
   * (page d'invitation, parcours hérité) garde le comportement d'avant, et
   * l'ajout de cette règle ne durcit personne à son insu.
   */
  emailObligatoire?: boolean;
  organizationName: string;
  logoUrl: string | null;
  /** Créneaux OUVERTS et À VENIR, déjà filtrés et ordonnés côté serveur. */
  creneaux: ReserverSlotPublicView[];
  /** La réservation VIVANTE de ce navigateur sur chaque créneau, par `slotId`. */
  mesReservations: Record<string, ReserverMaReservationView>;
  /**
   * L'inscription VIVANTE de ce navigateur sur la liste prioritaire de chaque
   * créneau, par `slotId`.
   *
   * C'est l'AIGUILLAGE du parcours, pas un ornement : un joueur qui détient une
   * offre reçoit `full` de `reserve_slot` — sa place est déjà comptée comme
   * tenue — et son chemin passe donc par `claimWaitlistOffer`, jamais par le
   * bouton de réservation.
   */
  maFile: Record<string, PublicWaitlistItem>;
  timeZone: string;
  /**
   * Le Mode Attente active (RES-4), rattaché à la réservation CONFIRMÉE de ce
   * navigateur. `null` tant qu'il n'y en a aucune : il n'y a alors pas
   * d'attente, donc rien à occuper.
   */
  attente?: ReserverAttenteView | null;
  /**
   * LES EXPÉRIENCES SIGNATURE (RES-5), et pourquoi elles vivent DANS ce
   * composant plutôt que dans une page à part.
   *
   * Ce qui change entre les trois formats, c'est ce qu'on RACONTE avant les
   * créneaux — pas la mécanique. Les créneaux, le code d'arrivée, la liste
   * prioritaire et le Mode Attente sont rigoureusement les mêmes, et un second
   * composant « page signature » les aurait dupliqués, donc fait diverger dès la
   * première correction.
   *
   * `standard` est le défaut de tous ces props : l'écran rendu est alors, au
   * pixel près, celui d'avant ce lot — chaque bloc immersif rend `null` sans sa
   * matière.
   */
  kind?: ReserverActivityKind;
  promise?: string | null;
  durationMinutes?: number | null;
  steps?: readonly { title: string; body: string }[];
  preparation?: string | null;
}) {
  // Les créneaux réservés d'abord, en tête de page : c'est ce que le client
  // rouvre sa page pour retrouver — son code — et non pour réserver une
  // deuxième fois.
  const reservees = creneaux.filter((c) => mesReservations[c.id]);
  // PUIS les créneaux où il attend. Ils sont SORTIS des créneaux libres, et
  // c'est le point d'attention du lot : une place tenue pour lui compte dans la
  // capacité, donc la jauge lui répond « complet » — son chemin de réservation
  // est « Prendre la place » (`claim_waitlist_offer`), jamais le bouton
  // « Réserver ma place », qui se ferait répondre `full` par la base.
  const enAttente = creneaux.filter(
    (c) => !mesReservations[c.id] && maFile[c.id],
  );
  const libres = creneaux.filter(
    (c) => !mesReservations[c.id] && !maFile[c.id],
  );

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
            🕑
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          {activityName}
        </h1>
        {/* La promesse passe AVANT la description : elle dit pourquoi on vient,
            la description dit comment ça se passe.

            LE BLOC EST GATÉ SUR LE FORMAT, pas seulement sur la présence de sa
            matière — et les deux ne sont PAS équivalents depuis que
            `updateReserverActivity` préserve délibérément les quatre colonnes de
            présentation quand on repasse une activité en « Standard » (pour que
            le commerçant retrouve ses cartes en revenant). Une activité standard
            garde donc sa promesse et sa durée EN BASE, et sans ce test elle les
            affichait encore : l'écran contredisait le format que le commerçant
            venait de choisir. La préservation en base reste — c'est l'affichage
            qui suit le format. */}
        {kind !== "standard" ? (
          <ExergueExperience
            promise={promise}
            durationMinutes={durationMinutes}
          />
        ) : null}
        {description ? (
          <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
            {description}
          </p>
        ) : null}
      </header>

      {/* Le bandeau du duo est EN HAUT, avant tout le reste : « à deux » change
          la décision de venir, pas seulement le libellé du bouton. */}
      {kind === "duo" ? <BandeauDuo /> : null}

      {reservees.length > 0 ? (
        <section aria-labelledby="mes-reservations-titre" className="mb-6">
          <h2
            id="mes-reservations-titre"
            className="mb-3 text-sm font-black uppercase tracking-wide text-k-body"
          >
            🎫 {reservees.length > 1 ? "Mes réservations" : "Ma réservation"}
          </h2>
          <ul className="space-y-3">
            {reservees.map((creneau) => (
              <li key={creneau.id}>
                <MaReservation
                  creneau={creneau}
                  reservation={mesReservations[creneau.id]}
                  activityName={activityName}
                  organizationName={organizationName}
                  timeZone={timeZone}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs font-medium text-k-body">
            Ces réservations sont retenues sur cet appareil, sans compte. Sur un
            autre téléphone elles n&apos;apparaîtront pas — présentez simplement
            votre code au comptoir.
          </p>

          {/* Le Mode Attente active (RES-4), SOUS la réservation confirmée et
              jamais au-dessus : le code est ce que le client rouvre sa page
              pour retrouver. Il n'est proposé QUE si une réservation existe —
              sans elle, il n'y a pas d'attente à occuper. */}
          {attente ? (
            <PendantVotreAttente
              attente={attente}
              organizationId={organizationId}
              organizationName={organizationName}
            />
          ) : null}
        </section>
      ) : null}

      {enAttente.length > 0 ? (
        <section aria-labelledby="ma-file-titre" className="mb-6">
          <h2
            id="ma-file-titre"
            className="mb-3 text-sm font-black uppercase tracking-wide text-k-body"
          >
            ⏳ Ma file d&apos;attente
          </h2>
          <ul className="space-y-3">
            {enAttente.map((creneau) => (
              <li key={creneau.id}>
                <MaFileAttente
                  creneau={creneau}
                  entree={maFile[creneau.id]}
                  timeZone={timeZone}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* LES ÉTAPES ET LA PRÉPARATION SONT AVANT LES CRÉNEAUX, ET APRÈS LE CODE.
          Avant les créneaux, parce qu'elles servent à décider de réserver ;
          après « ma réservation », parce que ce que le client rouvre sa page
          pour retrouver reste son code. Les deux sont gatées sur le FORMAT —
          même raison que l'exergue plus haut : une activité repassée en
          « Standard » garde sa préparation en base, et l'écran ne doit pas
          continuer à la rendre. Les composants rendent aussi `null` sans
          matière ; ce test-ci répond à l'autre question. */}
      {kind === "signature" ? <EtapesExperience steps={steps} /> : null}
      {kind !== "standard" ? (
        <PreparationExperience kind={kind} preparation={preparation} />
      ) : null}

      <section aria-labelledby="creneaux-titre" className="mb-6">
        <h2
          id="creneaux-titre"
          className="mb-3 text-sm font-black uppercase tracking-wide text-k-body"
        >
          Créneaux disponibles
        </h2>
        {libres.length === 0 ? (
          <div className={carteClass}>
            <p className="text-center text-sm font-bold text-k-ink">
              {reservees.length > 0 || enAttente.length > 0
                ? "Aucun autre créneau n'est ouvert à la réservation pour le moment."
                : "Aucun créneau n'est ouvert à la réservation pour le moment."}
            </p>
            <p className="mt-1 text-center text-sm font-medium text-k-body">
              Repassez plus tard, ou demandez au comptoir quand la prochaine
              séance sera annoncée.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {libres.map((creneau) => (
              <li key={creneau.id}>
                <CreneauReservable
                  organizationId={organizationId}
                  creneau={creneau}
                  timeZone={timeZone}
                  kind={kind}
                  emailObligatoire={emailObligatoire}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Un créneau libre, et son formulaire de réservation
// ────────────────────────────────────────────────────────────

function CreneauReservable({
  organizationId,
  creneau,
  timeZone,
  kind,
  emailObligatoire,
}: {
  organizationId: string;
  creneau: ReserverSlotPublicView;
  timeZone: string;
  kind: ReserverActivityKind;
  /** Vrai pour un rendez-vous : sans adresse, le commerçant ne peut ni
   *  confirmer, ni prévenir s'il doit annuler. */
  emailObligatoire: boolean;
}) {
  const duo = kind === "duo";
  /**
   * L'UNITÉ DE LA JAUGE, ET LE VERDICT D'ÉCRAN QUI EN DÉCOULE.
   *
   * Un Atelier Duo dont il reste UNE place n'est pas « 1 place restante » : il
   * est COMPLET, parce que `reserve_slot` y refuserait `full` — la réservation
   * en demande deux. `pairesRestantes` est tranché côté serveur, par la même
   * arithmétique que la RPC ; on le passe à `etatUiCreneau` à la place de
   * `remaining` pour que l'écran et la base disent le même mot.
   *
   * `pairesRestantes` est `null` HORS d'un duo — là, une place restante EST une
   * réservation possible, et le chargeur ne rend pas deux fois le même nombre.
   * Le `??` est donc la lecture littérale de ce contrat, pas un garde-fou.
   */
  const unites = creneau.pairesRestantes ?? creneau.remaining;
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeDemande, setChallengeDemande] = useState(false);

  /**
   * `reserveSlot` prend un OBJET, pas un `FormData` — le contrat des actions
   * publiques du dépôt. `useActionForm` attend la forme `(prev, formData)` :
   * cet adaptateur fait le pont, et il reste indispensable pour la raison qui a
   * fait naître ce hook (docs/bugs.md) — un `pending` qui ne retombe pas laisse
   * le bouton figé sur « Réservation… » alors que la place EST prise.
   */
  const action = useCallback(
    async (_prev: unknown, formData: FormData) => {
      const emailSaisi = String(formData.get("email") ?? "").trim();
      const consenti = formData.get("consent") === "on";

      // MÊME RÈGLE QUE `reserveSlotSchema` (équivalence email/consentement),
      // tranchée ICI plutôt qu'au serveur : une adresse saisie sans la case
      // cochée ne doit JAMAIS traverser le réseau (voir plus bas), donc le
      // refus ne peut pas venir de la réponse de `reserveSlot` — à ce
      // moment-là l'adresse aurait déjà voyagé pour rien.
      // UN RENDEZ-VOUS SANS ADRESSE EST INGÉRABLE (RDV-4) : le commerçant ne
      // pourrait ni confirmer, ni prévenir s'il doit annuler. Le refus est
      // tranché ICI, avant le réseau, avec la phrase que le client doit lire.
      // Un MOMENT — atelier, dégustation — se prend très bien sans rien
      // laisser : la règle suit l'usage, pas le module.
      if (emailObligatoire && !emailSaisi) {
        return {
          ok: false,
          error:
            "Indiquez votre email : il sert à vous confirmer le rendez-vous et à vous prévenir en cas d'empêchement.",
        } satisfies ReserveSlotActionResult;
      }

      if (emailSaisi && !consenti) {
        return {
          ok: false,
          error:
            "Cochez la case pour recevoir votre confirmation par email, ou laissez l'adresse vide.",
        } satisfies ReserveSlotActionResult;
      }

      const resultat = await reserveSlot({
        organizationId,
        slotId: creneau.id,
        // L'ADRESSE NE PART QUE CONSENTIE. La RPC la jetterait de toute façon
        // sans le consentement — mais l'envoyer quand même la ferait traverser
        // le réseau et les journaux pour rien.
        // En RENDEZ-VOUS, l'adresse et l'accord transactionnel vont ensemble
        // par construction : le client vient de demander un service dont la
        // confirmation EST le message. Ce n'est pas du consentement
        // pré-coché — c'est l'exécution de ce qu'il demande, et l'écran le dit
        // en toutes lettres au lieu de présenter une case. La contrainte
        // `reservations_consent_state` (ÉQUIVALENCE email/consentement) exige
        // de toute façon que les deux aillent de pair.
        email: emailObligatoire
          ? emailSaisi || undefined
          : consenti && emailSaisi
            ? emailSaisi
            : undefined,
        consent: emailObligatoire ? Boolean(emailSaisi) : consenti,
        // L'UNITÉ DU FORMAT, jamais un chiffre saisi : `reserve_slot` EXIGE
        // qu'elle égale la sienne et répond `invalid_party_size` sinon. La page
        // ne propose donc aucun sélecteur de nombre de personnes — il n'y a rien
        // à choisir, et un champ modifiable n'aurait produit que des refus.
        partySize: placesParReservation(kind),
        turnstileToken: captchaToken ?? undefined,
      });
      if (!resultat.ok && resultat.challengeRequired) {
        setChallengeDemande(true);
      }
      return resultat;
    },
    [organizationId, creneau.id, captchaToken, kind, emailObligatoire],
  );

  // `reloadOnSuccess` : le rafraîchissement est le SEUL moyen pour cette page de
  // montrer le code qui vient d'être émis — la liste n'a aucun état local. Le
  // client qui ne voit rien re-clique ; la RPC est idempotente et lui rendrait
  // la même place, mais il aurait cru avoir échoué.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — votre place n'a pas été prise.",
  });

  const etat = etatUiCreneau({
    status: creneau.status,
    startsAt: creneau.startsAt,
    remaining: unites,
  });
  const champConsentId = `consent-${creneau.id}`;
  const champEmailId = `email-${creneau.id}`;

  return (
    <div className={carteClass}>
      <p className="text-base font-black leading-snug text-k-ink">
        {formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)}
      </p>

      {etat === "ouvert" ? (
        <p className="mt-1 text-sm font-bold text-k-body">
          {/* « 3 duos possibles » et non « 6 places restantes » : le chiffre brut
              serait exact et trompeur — il laisserait croire qu'on peut venir
              seul. Le chiffre garde son emphase, comme avant ce lot. */}
          <span className="font-black tabular-nums text-k-ink">{unites}</span>{" "}
          {uniteJauge(kind, unites)}
        </p>
      ) : (
        <p className="mt-3 rounded-xl border-2 border-k-ink bg-zinc-100 px-3 py-2 text-center text-sm font-black text-k-ink">
          {etat === "complet" ? "Complet" : "Fermé"}
        </p>
      )}

      {etat === "ouvert" ? (
        <form onSubmit={onSubmit} className="mt-4">
          <label
            htmlFor={champEmailId}
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Votre email{" "}
            <span className="font-medium text-k-body">
              {emailObligatoire ? "(obligatoire)" : "(facultatif)"}
            </span>
          </label>
          <input
            id={champEmailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={RESERVER_EMAIL_MAX}
            required={emailObligatoire}
            placeholder="vous@exemple.fr"
            aria-describedby={`${champEmailId}-aide`}
            className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          />

          {/* LA CASE EST SÉPARÉE DU CHAMP, ET C'EST TOUT LE POINT.
              Sans elle, saisir une adresse vaudrait consentement — or une
              adresse conservée sans base n'a aucune finalité. La base le refuse
              d'ailleurs (`reservations_consent_state` est une ÉQUIVALENCE :
              email et consentement vont ensemble ou pas du tout), et
              `reserve_slot` JETTE l'adresse quand la case n'est pas cochée. La
              phrase sous le champ dit exactement cela, avant le clic. */}
          {/* EN RENDEZ-VOUS, PAS DE CASE — et ce n'est pas un contournement.
              Le message de confirmation et l'avis d'annulation sont
              l'EXÉCUTION du service demandé, pas une sollicitation : leur base
              légale est le contrat, pas le consentement. Présenter une case
              pré-cochée aurait été le vrai contournement ; ici on affirme
              simplement ce qui va se passer. Aucun message publicitaire ne
              passe par ce canal, et rien d'autre n'est envoyé. */}
          {emailObligatoire ? null : (
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
          )}
          <p
            id={`${champEmailId}-aide`}
            className="mt-2 text-xs font-medium leading-relaxed text-k-body"
          >
            {emailObligatoire
              ? "Votre adresse sert à confirmer ce rendez-vous et à vous prévenir en cas d'empêchement — jamais pour de la publicité. Votre code s'affiche aussi sur cette page."
              : "Votre adresse n'est conservée et utilisée que si vous cochez cette case, et uniquement pour ces messages-là — jamais pour de la publicité. Sans email la réservation fonctionne : votre code s'affiche sur cette page."}
          </p>

          {/* Région vivante montée EN PERMANENCE : un `aria-live` créé en même
              temps que son contenu n'annonce rien, et l'apparition du contrôle
              anti-robot est précisément ce qu'un lecteur d'écran doit entendre.
              Le bloc lui-même vit dans `defi-antirobot.tsx` depuis que le lot L5
              ouvre deux autres formulaires publics qui peuvent le demander. */}
          <div aria-live="polite">
            <DefiAntiRobot
              id={creneau.id}
              action="reserver-reserve"
              visible={challengeDemande}
              onToken={setCaptchaToken}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
          >
            {pending
              ? "Réservation…"
              : duo
                ? "Réserver pour deux"
                : "Réserver ma place"}
          </button>

          {/* Régions vivantes montées EN PERMANENCE : un `aria-live` créé en
              même temps que son contenu n'annonce rien. */}
          <div aria-live="polite">
            {state?.ok ? (
              <p
                role="status"
                className="mt-3 rounded-xl border-2 border-k-ink bg-k-green/20 px-3 py-2 text-center text-sm font-black text-k-ink"
              >
                C&apos;est réservé ! Votre code apparaît en haut de cette page.
              </p>
            ) : null}
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
      ) : null}

      {/* COMPLET N'EST PLUS UN CUL-DE-SAC (RES-2). La liste prioritaire n'est
          proposée que là : sur un créneau fermé ou passé, `waitlist_join`
          répondrait `unavailable`, et sur un créneau ouvert, `not_full` — le
          joueur y a une place ordinaire à prendre. */}
      {etat === "complet" ? (
        <RejoindreFileAttente
          organizationId={organizationId}
          creneau={creneau}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// « Mes réservations » — l'identité est le cookie, jamais l'URL
// ────────────────────────────────────────────────────────────

export function MaReservation({
  creneau,
  reservation,
  activityName,
  organizationName,
  timeZone,
}: {
  creneau: ReserverSlotPublicView;
  reservation: ReserverMaReservationView;
  activityName: string;
  /** Nom du commerce — il nomme l'événement dans l'agenda du client. */
  organizationName: string;
  timeZone: string;
}) {
  // `cancelReservation` prend un OBJET : même adaptateur que la réservation.
  // Aucun identifiant ne transite par l'URL — la preuve de possession est le
  // cookie, que la server action relit elle-même.
  const action = useCallback(
    () => cancelReservation({ reservationId: reservation.reservationId }),
    [reservation.reservationId],
  );
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — rien n'a été annulé.",
  });

  const annulee = reservation.status === "cancelled";
  const arrivee = reservation.status === "checked_in";
  // Le créneau a-t-il déjà commencé ? `cancel_reservation` refuse `too_late`
  // passé `starts_at`, et proposer un bouton qui n'aboutira pas est pire que de
  // ne pas en proposer.
  //
  // La question est posée à `etatUiCreneau` plutôt qu'à un `Date.now()` écrit
  // ici : la comparaison à l'horloge reste dans la fonction pure du module, où
  // elle est déjà paramétrable et testée, et la frontière entre « à venir » et
  // « passé » est la MÊME que pour les créneaux libres au-dessus.
  //
  // `status` et `remaining` sont neutralisés VOLONTAIREMENT : `etatUiCreneau`
  // teste l'ouverture AVANT le temps, si bien qu'un créneau fermé rendrait
  // « fermé » même une fois commencé — et le bouton d'annulation serait resté
  // affiché sur un créneau d'hier, pour échouer en `too_late`. Ici on ne lui
  // demande QUE l'heure.
  const commence =
    etatUiCreneau({
      status: "open",
      startsAt: creneau.startsAt,
      remaining: 1,
    }) === "passe";

  return (
    <div className={carteClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex rounded-full border-2 border-k-ink bg-k-yellow/50 px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
          {annulee ? "Annulée" : arrivee ? "Arrivé" : "Confirmée"}
        </p>
        <p className="text-sm font-black text-k-ink">{activityName}</p>
      </div>

      <p className="mt-3 text-sm font-bold text-k-ink">
        {formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)}
      </p>

      {annulee ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink/20 bg-zinc-50 px-3 py-2 text-sm font-bold text-k-body">
          Cette réservation a été annulée : votre place est retournée au créneau.
        </p>
      ) : (
        <>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-k-body">
            Votre code d&apos;arrivée
          </p>
          <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-k-ink">
            {reservation.code}
          </p>
          {/* La mention « pour 2 personnes » (RES-5) : sur un Atelier Duo, le
              code seul ne dit pas qu'il tient deux places — le client qui
              relit sa confirmation doit le savoir avant de se présenter seul
              au comptoir. `libelleTaillePersonnes` rend `null` sous 2, donc
              une réservation standard ne voit rien de nouveau. */}
          {libelleTaillePersonnes(reservation.partySize) ? (
            <p className="mt-1 text-sm font-black text-k-ink">
              Réservation {libelleTaillePersonnes(reservation.partySize)}
            </p>
          ) : null}
          <p className="mt-3 text-sm font-medium text-k-body">
            Donnez-le au comptoir en arrivant. {LIBELLE_FENETRE_CHECKIN}
          </p>

          {/* L'AGENDA APRÈS LE CODE, et seulement pour une réservation VIVANTE :
              proposer d'inscrire un rendez-vous annulé serait absurde.
              L'événement ne porte NI le code NI l'email — un fichier d'agenda
              se synchronise chez des tiers, s'y écrire un code de retrait
              reviendrait à le diffuser. */}
          <AjouterAgenda
            className="mt-4 border-t-2 border-k-ink/10 pt-4"
            uid={`reservation-${reservation.reservationId}`}
            rdv={{
              titre: activityName,
              commerce: organizationName,
              debut: creneau.startsAt,
              fin: creneau.endsAt,
            }}
          />
        </>
      )}

      {arrivee ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink bg-k-green/20 px-3 py-2 text-sm font-black text-k-ink">
          ✓ Votre arrivée a été enregistrée. Bon moment !
        </p>
      ) : null}

      {/* Le bouton d'annulation ne s'affiche QUE là où il peut réussir : une
          arrivée déjà enregistrée ne s'annule plus (réécrire l'histoire
          fausserait le taux de présence du commerçant, et la base le refuse),
          une réservation déjà annulée n'a rien à annuler, et un créneau commencé
          ne se désiste plus. */}
      {!annulee && !arrivee && !commence ? (
        <form onSubmit={onSubmit} className="mt-4">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:pointer-events-none disabled:opacity-60"
          >
            {pending ? "Annulation…" : "Annuler ma réservation"}
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
      ) : null}

      {!annulee && !arrivee && commence ? (
        <p className="mt-4 text-center text-xs font-medium text-k-body">
          Ce créneau a commencé : il n&apos;est plus possible de l&apos;annuler
          depuis cette page.
        </p>
      ) : null}
    </div>
  );
}
