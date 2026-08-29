"use client";

import { useCallback, useState } from "react";
import {
  cancelReservation,
  rejoindreListeAttenteTable,
  reserveSlot,
  reserverTable,
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
  PHRASES_RESERVATION,
  type EtatReservationTable,
} from "@/lib/plan-de-salle";
import {
  etatUiCreneau,
  formatCreneau,
  libelleTaillePersonnes,
  LIBELLE_FENETRE_CHECKIN,
  placesParReservation,
  RESERVER_EMAIL_MAX,
  RESERVER_PARTY_SIZE_MAX,
  RESERVER_PARTY_SIZE_MIN,
  type PublicWaitlistItem,
  type ReserverActivityKind,
  type ReserverAttenteView,
  type WaitlistJoinResult,
} from "@/lib/reserver";
import type {
  ReserverMaReservationView,
  ReserverSlotPublicView,
} from "@/lib/reserver-context";
import { useActionForm } from "@/lib/use-action-form";
import type { ActionResult } from "@/lib/utils";

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
  bookingMode = "moment",
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
  /**
   * D'OÙ VIENNENT LES CRÉNEAUX — et donc COMMENT ON RÉSERVE (RDV-8).
   *
   * `moment` (atelier, dégustation, file d'accueil) : une place se prend dans
   * une jauge, l'effectif est celui du format, et rien ne change de ce que ce
   * fichier faisait avant ce lot. `rendez_vous` (restaurant) : le client
   * annonce COMBIEN ILS SERONT, et c'est `reserve_table` qui cherche une table
   * assez grande sous verrou.
   *
   * Le défaut est `moment` pour la même raison que celui d'`emailObligatoire` :
   * un appelant qui ne connaît pas ce champ garde le comportement d'avant, et
   * l'ajout de cette règle ne bascule personne à son insu.
   */
  bookingMode?: string;
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

  const surTable = bookingMode === "rendez_vous";
  /**
   * L'EFFECTIF EST PORTÉ PAR L'ÉCRAN, PAS PAR LE CRÉNEAU — et c'est le seul
   * arbitrage structurant de ce lot.
   *
   * « Vous serez combien ? » est une question qu'on pose UNE FOIS, en tête de
   * la liste. Un sélecteur par créneau aurait posé dix fois la même question,
   * et surtout laissé le client changer d'avis entre deux lignes sans s'en
   * apercevoir : il aurait réservé pour quatre sur un créneau après avoir
   * regardé les disponibilités pour deux. Une seule valeur, visible en
   * permanence au-dessus des créneaux, supprime cet écart par construction.
   *
   * Deux par défaut : c'est la table la plus demandée d'un restaurant, et un
   * défaut à une personne aurait fait cliquer tout le monde.
   */
  const [effectif, setEffectif] = useState(2);

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
          <>
            {/* Le sélecteur d'effectif est AU-DESSUS des créneaux, jamais
                dedans : on choisit combien on est, PUIS on regarde à quelle
                heure. L'inverse ferait lire des heures avant de savoir pour
                quel groupe elles valent. */}
            {surTable ? (
              <SelecteurEffectif effectif={effectif} onChange={setEffectif} />
            ) : null}
            <ul className="space-y-4">
              {libres.map((creneau) => (
                <li key={creneau.id}>
                  {/* DEUX COMPOSANTS, PAS UN SEUL À BRANCHES. Le parcours
                      Moment est en production et sa non-régression prime :
                      tresser `reserve_slot` et `reserve_table` dans une même
                      fonction aurait mêlé leurs états, leurs refus et leurs
                      hooks, et la première correction de l'un aurait bougé
                      l'autre. Ils ne partagent que la carte et la palette. */}
                  {surTable ? (
                    <CreneauTable
                      organizationId={organizationId}
                      creneau={creneau}
                      timeZone={timeZone}
                      effectif={effectif}
                    />
                  ) : (
                    <CreneauReservable
                      organizationId={organizationId}
                      creneau={creneau}
                      timeZone={timeZone}
                      kind={kind}
                      emailObligatoire={emailObligatoire}
                    />
                  )}
                </li>
              ))}
            </ul>
          </>
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
// RÉSERVER UNE TABLE (RDV-8) — l'effectif d'abord, la salle tranche
// ────────────────────────────────────────────────────────────

/** Borne l'effectif saisi sur les CHECK de la base, jamais plus large. */
function bornerEffectif(valeur: number): number {
  if (!Number.isFinite(valeur)) return RESERVER_PARTY_SIZE_MIN;
  return Math.min(
    RESERVER_PARTY_SIZE_MAX,
    Math.max(RESERVER_PARTY_SIZE_MIN, Math.trunc(valeur)),
  );
}

/** Les valeurs qu'on propose d'un doigt ; au-delà, on saisit. */
const EFFECTIFS_RAPIDES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * « VOUS SEREZ COMBIEN ? » — la question posée une seule fois.
 *
 * Huit boutons couvrent l'écrasante majorité des couverts d'un restaurant, et
 * un champ prend le reste : proposer trente boutons aurait noyé les cinq qui
 * servent. Le champ n'apparaît pas en second choix caché — un groupe de douze
 * ne doit pas avoir à deviner qu'il existe.
 */
function SelecteurEffectif({
  effectif,
  onChange,
}: {
  effectif: number;
  onChange: (valeur: number) => void;
}) {
  const horsBoutons = effectif > EFFECTIFS_RAPIDES.length;

  return (
    <fieldset className="mb-4 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[3px_3px_0_var(--color-k-ink)]">
      <legend className="px-2 text-sm font-black uppercase tracking-wide text-k-ink">
        Vous serez combien ?
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {EFFECTIFS_RAPIDES.map((valeur) => {
          const actif = effectif === valeur;
          return (
            <button
              key={valeur}
              type="button"
              // `aria-pressed` plutôt qu'un groupe de radios : ce sont des
              // boutons, ils en gardent le comportement au clavier, et l'état
              // sélectionné reste annoncé.
              aria-pressed={actif}
              onClick={() => onChange(valeur)}
              className={`h-12 w-12 rounded-xl border-2 border-k-ink text-base font-black tabular-nums text-k-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
                actif
                  ? "bg-k-yellow shadow-[3px_3px_0_var(--color-k-ink)]"
                  : "bg-white hover:bg-k-yellow/40"
              }`}
            >
              {valeur}
            </button>
          );
        })}
      </div>

      <label
        htmlFor="effectif-au-dela"
        className="mt-4 block text-sm font-bold text-k-ink"
      >
        Plus de {EFFECTIFS_RAPIDES.length} personnes ?
      </label>
      <input
        id="effectif-au-dela"
        type="number"
        inputMode="numeric"
        min={RESERVER_PARTY_SIZE_MIN}
        max={RESERVER_PARTY_SIZE_MAX}
        step={1}
        // Le champ ne montre un nombre que lorsqu'il PORTE le choix : le
        // laisser refléter « 2 » quand le bouton 2 est actif aurait donné deux
        // contrôles allumés pour une seule valeur.
        value={horsBoutons ? effectif : ""}
        placeholder={`jusqu'à ${RESERVER_PARTY_SIZE_MAX}`}
        onChange={(e) => {
          const brut = e.target.value.trim();
          // Champ vidé : on retombe sur le choix par défaut plutôt que sur
          // `NaN`, qui aurait fait partir une demande sans effectif.
          onChange(brut === "" ? 2 : bornerEffectif(Number(brut)));
        }}
        aria-describedby="effectif-au-dela-aide"
        className="mt-1.5 w-28 rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base tabular-nums text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
      />
      <p
        id="effectif-au-dela-aide"
        className="mt-2 text-xs font-medium leading-relaxed text-k-body"
      >
        Ce nombre vaut pour tous les créneaux ci-dessous : nous cherchons une
        table pour {effectif} personne{effectif > 1 ? "s" : ""} à l&apos;heure
        que vous choisirez.
      </p>
    </fieldset>
  );
}

/**
 * UN CRÉNEAU DE RESTAURANT — et pourquoi l'écran n'annonce aucun chiffre.
 *
 * Pas de « il reste 2 tables », pas de « table jusqu'à 6 » : ce serait une
 * lecture de plus par chargement de page, et surtout un chiffre déjà périmé au
 * moment où le client le lit. Le client dit son effectif, clique, et
 * `reserve_table` tranche sous verrou — `reserved` ou `full`. L'écran n'est
 * jamais un second juge, c'est la discipline de tout le module.
 *
 * `full` n'est donc PAS un cul-de-sac : c'est exactement le moment où la liste
 * d'attente a un sens, pour CET effectif-là.
 */
function CreneauTable({
  organizationId,
  creneau,
  timeZone,
  effectif,
}: {
  organizationId: string;
  creneau: ReserverSlotPublicView;
  timeZone: string;
  /** Choisi UNE FOIS en tête de liste, jamais ici. */
  effectif: number;
}) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeDemande, setChallengeDemande] = useState(false);
  /**
   * Le refus, AVEC l'effectif qui l'a produit.
   *
   * Mémoriser l'effectif refusé et non relire celui de la tête de liste évite
   * une dérive silencieuse : le client passe de 4 à 6 après avoir vu
   * « complet », et le formulaire d'attente aurait alors parlé d'un effectif
   * que la base n'a jamais refusé. Ici, la liste d'attente porte exactement la
   * demande qui a échoué.
   */
  const [refus, setRefus] = useState<{
    etat: Exclude<EtatReservationTable["state"], "reserved">;
    effectif: number;
  } | null>(null);

  const action = useCallback(
    async (
      _prev: unknown,
      formData: FormData,
    ): Promise<ActionResult<EtatReservationTable>> => {
      const emailSaisi = String(formData.get("email") ?? "").trim();

      // UN RENDEZ-VOUS SANS ADRESSE EST INGÉRABLE (RDV-4), et une table en est
      // un : sans elle le restaurant ne peut ni confirmer, ni prévenir s'il
      // doit annuler. Le refus est tranché ICI, avant le réseau, pour que
      // l'adresse ne voyage jamais pour rien.
      if (!emailSaisi) {
        return {
          ok: false,
          error:
            "Indiquez votre email : il sert à vous confirmer la table et à vous prévenir en cas d'empêchement.",
        };
      }

      const resultat = await reserverTable({
        organizationId,
        slotId: creneau.id,
        partySize: effectif,
        email: emailSaisi,
        // L'accord transactionnel accompagne l'adresse par construction : la
        // contrainte `reservations_consent_state` est une ÉQUIVALENCE, et le
        // message de confirmation EST l'exécution du service demandé — pas une
        // sollicitation. Aucun message publicitaire ne passe par ce canal.
        consent: true,
        turnstileToken: captchaToken ?? undefined,
      });

      if (!resultat.ok) {
        if (resultat.challengeRequired) setChallengeDemande(true);
        return resultat;
      }

      if (resultat.data.state === "reserved") {
        setRefus(null);
        return resultat;
      }

      // Les phrases de refus viennent TOUTES de `PHRASES_RESERVATION` : elles
      // sont écrites et testées dans le module pur, et une variante recopiée
      // ici aurait divergé au premier ajustement.
      setRefus({ etat: resultat.data.state, effectif });
      return { ok: false, error: PHRASES_RESERVATION[resultat.data.state] };
    },
    [organizationId, creneau.id, effectif, captchaToken],
  );

  // `reloadOnSuccess` : identique au parcours Moment, et pour la même raison —
  // le code qui vient d'être émis n'existe nulle part dans cette liste, seule
  // la relecture serveur le fait apparaître en haut de page.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — votre table n'a pas été prise.",
  });

  /**
   * L'écran ne juge QUE l'heure et l'ouverture.
   *
   * `remaining` est neutralisé volontairement : la question « y a-t-il une
   * table pour vous » n'a pas de réponse dans une jauge de places — douze
   * couverts libres sur six tables de deux ne prennent pas un groupe de
   * quatre. C'est `reserve_table` qui répond, et lui seul.
   */
  const etat = etatUiCreneau({
    status: creneau.status,
    startsAt: creneau.startsAt,
    remaining: 1,
  });
  const champEmailId = `table-email-${creneau.id}`;

  return (
    <div className={carteClass}>
      <p className="text-base font-black leading-snug text-k-ink">
        {formatCreneau(creneau.startsAt, creneau.endsAt, timeZone)}
      </p>

      {etat !== "ouvert" ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink bg-zinc-100 px-3 py-2 text-center text-sm font-black text-k-ink">
          Fermé
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4">
          <label
            htmlFor={champEmailId}
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Votre email{" "}
            <span className="font-medium text-k-body">(obligatoire)</span>
          </label>
          <input
            id={champEmailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={RESERVER_EMAIL_MAX}
            required
            placeholder="vous@exemple.fr"
            aria-describedby={`${champEmailId}-aide`}
            className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          />
          <p
            id={`${champEmailId}-aide`}
            className="mt-2 text-xs font-medium leading-relaxed text-k-body"
          >
            Votre adresse sert à confirmer cette table et à vous prévenir en cas
            d&apos;empêchement — jamais pour de la publicité. Votre code
            s&apos;affiche aussi sur cette page.
          </p>

          {/* Région vivante montée EN PERMANENCE : un `aria-live` créé en même
              temps que son contenu n'annonce rien. */}
          <div aria-live="polite">
            <DefiAntiRobot
              id={`table-${creneau.id}`}
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
              : `Réserver pour ${effectif} personne${effectif > 1 ? "s" : ""}`}
          </button>

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
                className="mt-3 text-center text-sm font-bold text-k-ink"
              >
                {state.error}
              </p>
            ) : null}
          </div>
        </form>
      )}

      {/* COMPLET N'EST PAS UN CUL-DE-SAC : c'est la seule issue utile quand
          aucune table n'est assez grande à cette heure-là. Les autres refus
          n'ouvrent rien — se mettre en attente ne corrige ni une adresse
          invalide, ni un créneau qui vient de fermer. */}
      {refus?.etat === "full" ? (
        <AttenteTable
          organizationId={organizationId}
          creneau={creneau}
          effectif={refus.effectif}
        />
      ) : null}
    </div>
  );
}

/**
 * ÊTRE PRÉVENU SI UNE TABLE SE LIBÈRE — et ce que cela n'est PAS.
 *
 * On NOTIFIE, on ne TIENT pas. Plusieurs personnes peuvent attendre le même
 * effectif à la même heure, toutes sont prévenues, et la première qui revient
 * prend la table. L'écran le dit avant l'inscription ET après : quelqu'un qui
 * croit sa table acquise ne revient que pour un refus, et c'est le commerçant
 * qui encaisse la déception.
 *
 * L'adresse est REQUISE ici, contrairement à la liste des Moments : sans elle
 * il n'y a rien à prévenir, donc rien à inscrire.
 */
function AttenteTable({
  organizationId,
  creneau,
  effectif,
}: {
  organizationId: string;
  creneau: ReserverSlotPublicView;
  /** L'effectif que la base VIENT de refuser, pas celui de la tête de liste. */
  effectif: number;
}) {
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeDemande, setChallengeDemande] = useState(false);

  const action = useCallback(
    async (
      _prev: unknown,
      formData: FormData,
    ): Promise<ActionResult<WaitlistJoinResult>> => {
      const emailSaisi = String(formData.get("email") ?? "").trim();
      const consenti = formData.get("consent") === "on";

      // Les deux refus sont tranchés AVANT le réseau : une inscription sans
      // adresse n'a pas d'objet, et une adresse sans la case cochée serait
      // jetée par la base (`reservations_consent_state` est une équivalence) —
      // l'envoyer l'aurait fait traverser réseau et journaux pour rien.
      if (!emailSaisi) {
        return {
          ok: false,
          error:
            "Indiquez votre email : sans lui, personne ne peut vous prévenir qu'une table s'est libérée.",
        };
      }
      if (!consenti) {
        return {
          ok: false,
          error:
            "Cochez la case pour être prévenu par email quand une table se libère.",
        };
      }

      const resultat = await rejoindreListeAttenteTable({
        organizationId,
        slotId: creneau.id,
        partySize: effectif,
        email: emailSaisi,
        consent: true,
        turnstileToken: captchaToken ?? undefined,
      });
      if (!resultat.ok) {
        if (resultat.challengeRequired) setChallengeDemande(true);
        return resultat;
      }

      // `not_full` n'est pas un échec de la base, mais c'en est un pour le
      // client : il a demandé à être prévenu d'une place qui est déjà là. On le
      // renvoie vers le bouton de réservation, juste au-dessus.
      if (resultat.data.state === "not_full") {
        return {
          ok: false,
          error:
            "Une table vient de se libérer à cette heure-là : réservez-la directement avec le bouton ci-dessus.",
        };
      }
      if (resultat.data.state === "waitlist_full") {
        const plafond = resultat.data.waitlistCapacity;
        return {
          ok: false,
          error: plafond
            ? `La liste d'attente de ce créneau est complète (${plafond} personnes). Essayez une autre heure.`
            : "La liste d'attente de ce créneau est complète. Essayez une autre heure.",
        };
      }
      if (resultat.data.state === "already_reserved") {
        return {
          ok: false,
          error:
            "Vous avez déjà une réservation sur ce créneau : elle est en haut de cette page.",
        };
      }
      if (resultat.data.state === "invalid_email") {
        return { ok: false, error: PHRASES_RESERVATION.invalid_email };
      }
      if (resultat.data.state === "unavailable") {
        return { ok: false, error: PHRASES_RESERVATION.unavailable };
      }
      return resultat;
    },
    [organizationId, creneau.id, effectif, captchaToken],
  );

  // PAS de `reloadOnSuccess` ici, contrairement à la réservation : ce qu'il y a
  // à montrer — « c'est noté, pour tant de personnes, et rien ne vous est
  // réservé » — tient entièrement dans la réponse. Recharger la page l'aurait
  // effacé et renvoyé le client sur un formulaire vide, qu'il aurait resoumis.
  const { state, pending, onSubmit } = useActionForm(action, {
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — vous n'êtes pas encore inscrit.",
  });

  const inscrit =
    state?.ok &&
    (state.data.state === "waiting" || state.data.state === "already_waiting");

  const champEmailId = `table-attente-email-${creneau.id}`;
  const champConsentId = `table-attente-consent-${creneau.id}`;

  if (inscrit) {
    return (
      <div className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/40 px-4 py-3 shadow-[3px_3px_0_var(--color-k-ink)]">
        <p role="status" className="text-base font-black leading-snug text-k-ink">
          C&apos;est noté : vous serez prévenu si une table pour {effectif}{" "}
          personne{effectif > 1 ? "s" : ""} se libère à cette heure-là.
        </p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-k-ink">
          <strong className="font-black">
            Aucune table ne vous est réservée pour autant.
          </strong>{" "}
          Plusieurs personnes peuvent être prévenues en même temps, et la
          première qui réserve prend la place — revenez vite quand vous recevrez
          le message.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4">
      <p className="rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-sm font-bold leading-relaxed text-k-ink">
        {PHRASES_RESERVATION.full}
      </p>

      <label
        htmlFor={champEmailId}
        className="mt-4 mb-1.5 block text-sm font-bold text-k-ink"
      >
        Votre email{" "}
        <span className="font-medium text-k-body">(obligatoire)</span>
      </label>
      <input
        id={champEmailId}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        maxLength={RESERVER_EMAIL_MAX}
        required
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
          J&apos;accepte d&apos;être prévenu par email si une table pour{" "}
          {effectif} personne{effectif > 1 ? "s" : ""} se libère à cette heure.
        </span>
      </label>
      <p
        id={`${champEmailId}-aide`}
        className="mt-2 text-xs font-medium leading-relaxed text-k-body"
      >
        Votre adresse n&apos;est utilisée que pour ce message-là — jamais pour de
        la publicité.{" "}
        <strong className="font-bold text-k-ink">
          Être prévenu ne réserve rien : plusieurs personnes reçoivent l&apos;avis
          et la première qui revient prend la table.
        </strong>
      </p>

      <div aria-live="polite">
        <DefiAntiRobot
          id={`table-attente-${creneau.id}`}
          action="reserver-waitlist-join"
          visible={challengeDemande}
          onToken={setCaptchaToken}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-white px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink hover:bg-k-yellow/40 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Inscription…" : "Me prévenir si une table se libère"}
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
