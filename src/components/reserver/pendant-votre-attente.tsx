"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  consumeReserverWaitSpin,
  waitUsePause,
  type ReserverWaitSpinOutcome,
} from "@/actions/reserver";
import { ClaimForm, type ClaimConfig } from "@/components/wheel/claim-form";
import {
  etatUiPauseChance,
  type ReserverAttenteView,
} from "@/lib/reserver";

/**
 * « PENDANT VOTRE ATTENTE » — LE MODE ATTENTE ACTIVE (RES-4, lot L7).
 *
 * ── LA SECTION EST FACULTATIVE, ET ELLE LE DIT ELLE-MÊME ──
 *
 * C'est le critère dur du cahier, et il est tenu à trois endroits à la fois :
 * la phrase `PHRASE_NON_NECESSAIRE` est rendue EN TÊTE de la section, avant
 * toute carte ; la section est POSÉE SOUS le rang (jamais au-dessus), parce que
 * ce que le client vient chercher en rouvrant sa page c'est sa place, pas un
 * jeu ; et aucune de ces trois cartes n'écrit quoi que ce soit dans la file ou
 * la réservation — `wait_session_use_pause` ne touche que la session d'attente,
 * et ne revérifie même pas la vivacité de la source. Ne rien toucher ici ne
 * coûte RIEN, et c'est écrit noir sur blanc.
 *
 * ── L'APPEL PRIME, ET CE FICHIER N'A RIEN À FAIRE POUR ÇA ──
 *
 * `AppelPleinEcran` est `fixed inset-0 z-50` et monté AVANT le document. Cette
 * section vit dans le flux ordinaire et n'utilise ni `fixed` ni `z-index` : elle
 * ne peut pas recouvrir l'appel. La page va plus loin et la DÉMONTE quand le
 * statut passe à `called` — c'est la fermeture propre du cahier, et elle ne perd
 * rien : le tour est tiré, journalisé dans `spins` et retenu par la session
 * (`pause_resulting_spin_id`), donc il se retrouve.
 *
 * ── POURQUOI PAS DE ROUE QUI TOURNE ICI ──
 *
 * Les quatre frères (`calendar`, `loyalty`, `quiz`, `referral`) animent
 * `WheelSvg` parce que leur contexte public transporte les SEGMENTS de la roue
 * cible. Le contexte d'attente ne les transporte pas, et c'est cohérent : la
 * campagne vient du PARENT (file ou activité), jamais de l'appelant — c'est ce
 * qui rend « gains décidés côté serveur » vrai, et la roue n'est même choisie
 * qu'au moment du tirage. Plutôt que d'animer à vide, la Pause Chance réutilise
 * ce qui compte — `ClaimForm`, le flux GAIN-… commun aux six parcours — et
 * révèle le résultat que le serveur a déjà tranché. C'est aussi la lecture la
 * plus honnête du critère : l'animation est facultative, y compris pour nous.
 */

export const PHRASE_NON_NECESSAIRE =
  "Aucune animation n'est nécessaire pour conserver votre place.";

const carteClass =
  "k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]";

/**
 * Collecte par défaut : AUCUNE.
 *
 * La configuration réelle de la campagne n'est pas résolue côté client — la
 * campagne vient du parent, et l'écran ne la connaît que par son identifiant.
 * Demander une adresse qu'on ne sait pas devoir demander serait pire que de ne
 * pas la demander : le code s'affiche, et il se retire au comptoir.
 */
const COLLECTE_MUETTE: ClaimConfig = {
  collectEmail: false,
  collectPhone: false,
  codeTtlSeconds: null,
};

export function PendantVotreAttente({
  attente,
  organizationName,
  organizationId = null,
  claimConfig = COLLECTE_MUETTE,
}: {
  attente: ReserverAttenteView;
  organizationName: string;
  organizationId?: string | null;
  claimConfig?: ClaimConfig;
}) {
  // `animations` est calculée côté serveur (`animationsAttente`) : l'ordre
  // d'affichage et la présence de chaque tuile sont tranchés une seule fois,
  // pas redécidés par chaque écran qui la rend.
  if (attente.animations.length === 0) return null;

  return (
    <section aria-labelledby="attente-active-titre" className="mt-6">
      <h2
        id="attente-active-titre"
        className="mb-2 text-sm font-black uppercase tracking-wide text-k-body"
      >
        ✨ Pendant votre attente
      </h2>
      {/* LA PHRASE EN TÊTE, avant toute carte : elle est la condition de tout
          ce qui suit, pas une note de bas de page. */}
      <p className="mb-3 rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-xs font-bold leading-relaxed text-k-ink">
        {PHRASE_NON_NECESSAIRE} Votre rang ne dépend que de votre heure
        d&apos;arrivée.
      </p>

      <ul className="space-y-3">
        {attente.animations.map((animation) => (
          <li key={animation}>
            {animation === "quiz" && attente.quizId ? (
              <CarteQuiz quizId={attente.quizId} />
            ) : null}
            {animation === "pause" ? (
              <CartePauseChance
                attente={attente}
                organizationName={organizationName}
                organizationId={organizationId}
                claimConfig={claimConfig}
              />
            ) : null}
            {animation === "activite" && attente.activityId ? (
              <CarteDecouvrir activityId={attente.activityId} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Quiz éclair
// ────────────────────────────────────────────────────────────

/**
 * L'IDENTIFIANT SUFFIT, et ce n'est pas un raccourci.
 *
 * `loadQuizPublicContext` accepte indifféremment un UUID ou un `public_slug` —
 * le segment `[slug]` est un `slugOrId`. Faire voyager le slug jusqu'ici aurait
 * demandé une jointure de plus dans le contexte d'attente pour arriver à la même
 * page, et aurait ouvert un écart le jour où le commerçant renomme son quiz.
 */
function CarteQuiz({ quizId }: { quizId: string }) {
  return (
    <div className={carteClass}>
      <p className="text-base font-black text-k-ink">🧠 Quiz éclair</p>
      <p className="mt-1 text-sm font-medium leading-relaxed text-k-body">
        Quelques questions, le temps d&apos;attendre. Vous pouvez l&apos;arrêter
        quand vous voulez, et revenir à cette page à tout moment.
      </p>
      <Link
        href={`/quiz/${quizId}`}
        className="k-btn mt-4 block w-full rounded-2xl border-2 border-k-ink bg-white px-6 py-3 text-center text-sm font-black uppercase tracking-wider text-k-ink hover:bg-k-yellow/30"
      >
        Ouvrir le quiz
      </Link>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Découvrir le lieu
// ────────────────────────────────────────────────────────────

function CarteDecouvrir({ activityId }: { activityId: string }) {
  return (
    <div className={carteClass}>
      <p className="text-base font-black text-k-ink">📍 Découvrir le lieu</p>
      <p className="mt-1 text-sm font-medium leading-relaxed text-k-body">
        Ce qui se passe ici, et ce qu&apos;on peut y réserver.
      </p>
      <Link
        href={`/reserver/${activityId}`}
        className="k-btn mt-4 block w-full rounded-2xl border-2 border-k-ink bg-white px-6 py-3 text-center text-sm font-black uppercase tracking-wider text-k-ink hover:bg-k-yellow/30"
      >
        Voir l&apos;activité
      </Link>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Pause Chance
// ────────────────────────────────────────────────────────────

/**
 * Les deux refus de `wait_session_use_pause`, dans les mots du joueur.
 *
 * `unconfigured` ne devrait pas arriver — la tuile n'est rendue que si le
 * serveur a listé l'animation `pause` — mais il PEUT : le commerçant a pu
 * retirer sa campagne entre le rendu et le clic. Il n'est donc pas traité comme
 * une panne, et il ne dit rien de la place dans la file, qui n'a pas bougé.
 */
const REFUS_PAUSE: Record<"unconfigured" | "unknown", string> = {
  unconfigured:
    "Le jeu n'est plus proposé pour le moment. Votre place, elle, n'a pas bougé.",
  unknown: "Cette attente est introuvable. Rechargez la page.",
};

type PhasePause = "repos" | "en_cours" | "resolu" | "erreur";

function CartePauseChance({
  attente,
  organizationName,
  organizationId,
  claimConfig,
}: {
  attente: ReserverAttenteView;
  organizationName: string;
  organizationId: string | null;
  claimConfig: ClaimConfig;
}) {
  const [resultat, setResultat] = useState<ReserverWaitSpinOutcome | null>(null);
  const [phase, setPhase] = useState<PhasePause>("repos");
  const [erreur, setErreur] = useState("");

  // `absente` ne peut pas arriver ici (l'animation ne serait pas listée), mais
  // le verdict vient de `@/lib/reserver` plutôt que d'un `!== null` réécrit sur
  // place : `absente` et `utilisee` sont deux choses différentes, et c'est
  // là-bas que la nuance est tranchée une fois pour toutes.
  const etat = etatUiPauseChance(attente);
  const dejaJouee = etat === "utilisee";

  const jouer = useCallback(async () => {
    setPhase("en_cours");
    setErreur("");

    let octroi;
    try {
      octroi = await waitUsePause({ sessionId: attente.sessionId });
    } catch {
      setErreur("Connexion perdue. Vérifiez votre réseau puis réessayez.");
      setPhase("erreur");
      return;
    }
    if (!octroi.ok) {
      setErreur(octroi.error);
      setPhase("erreur");
      return;
    }

    const etatOctroi = octroi.data.state;
    if (etatOctroi === "unconfigured" || etatOctroi === "unknown") {
      setErreur(REFUS_PAUSE[etatOctroi]);
      setPhase("erreur");
      return;
    }

    // `granted` ET `already_used` mènent au MÊME endroit : les deux rendent le
    // jeton de CETTE session, et `consume_reserver_wait_spin_grant` est
    // idempotente — elle rend le tour déjà tiré plutôt que d'en accorder un
    // second. Taire `already_used` aurait puni un rechargement de page d'un tour
    // perdu, ce que le SQL a explicitement refusé de faire.
    const jeton = octroi.data.grantToken;
    if (!jeton) {
      setErreur(
        "Le tour n'a pas pu se lancer. Votre place n'a pas bougé — réessayez.",
      );
      setPhase("erreur");
      return;
    }

    let tirage;
    try {
      tirage = await consumeReserverWaitSpin({
        sessionId: attente.sessionId,
        grantToken: jeton,
      });
    } catch {
      setErreur("Connexion perdue. Vérifiez votre réseau puis réessayez.");
      setPhase("erreur");
      return;
    }
    if (!tirage.ok) {
      setErreur(tirage.error);
      setPhase("erreur");
      return;
    }

    setResultat(tirage.data);
    setPhase("resolu");
  }, [attente.sessionId]);

  return (
    <div className={carteClass}>
      <p className="text-base font-black text-k-ink">🍀 Pause Chance</p>
      <p className="mt-1 text-sm font-medium leading-relaxed text-k-body">
        Un tour offert,{" "}
        <strong className="font-black text-k-ink">
          une seule fois pendant votre attente
        </strong>
        . Il n&apos;influence jamais votre rang.
      </p>

      {phase === "resolu" && resultat ? (
        <RevelationPause
          resultat={resultat}
          organizationName={organizationName}
          organizationId={organizationId}
          claimConfig={claimConfig}
          slug={attente.sessionId}
        />
      ) : (
        <>
          {/* « Déjà jouée » N'EST PAS un écran mort : la session garde le tour,
              et le bouton le REDEMANDE au serveur plutôt que d'afficher un
              souvenir. Le rejeu est borné à l'étage du dessous — la RPC rend le
              tour déjà tiré, elle n'en accorde pas un second. */}
          <button
            type="button"
            onClick={() => void jouer()}
            disabled={phase === "en_cours"}
            className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
          >
            {phase === "en_cours"
              ? "Tirage…"
              : dejaJouee
                ? "Revoir mon tour"
                : "Tenter ma chance"}
          </button>
          {dejaJouee && phase !== "en_cours" ? (
            <p className="mt-2 text-center text-xs font-bold text-k-body">
              Vous l&apos;avez déjà jouée pendant cette attente.
            </p>
          ) : null}
          <div aria-live="assertive">
            {phase === "erreur" ? (
              <p role="alert" className="mt-3 text-sm font-bold text-red-700">
                {erreur}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * La révélation, sans roue et sans suspense inventé.
 *
 * `no_prize` n'est PAS une défaite : le SQL sort AVANT toute écriture et le
 * jeton reste intact — le tour est encore là quand le commerçant aura
 * réapprovisionné. Le confondre avec « perdu » ferait croire au joueur qu'il a
 * dépensé sa seule Pause Chance pour rien.
 *
 * `already_consumed` non plus : c'est le MÊME tour qu'on relit. Sans libellé —
 * la RPC ne rend alors que l'identifiant du tour — l'écran le dit tel quel et
 * renvoie au comptoir, plutôt que de nommer un lot qu'il n'a pas reçu.
 */
function RevelationPause({
  resultat,
  organizationName,
  organizationId,
  claimConfig,
  slug,
}: {
  resultat: ReserverWaitSpinOutcome;
  organizationName: string;
  organizationId: string | null;
  claimConfig: ClaimConfig;
  /** `ClaimForm` s'en sert comme clé d'écran, jamais comme secret. */
  slug: string;
}) {
  if (resultat.state === "no_prize") {
    return (
      <Verdict>
        ⏳ Rien à distribuer en ce moment — votre tour reste offert, réessayez un
        peu plus tard.
      </Verdict>
    );
  }

  // `unavailable` n'apparaît PAS ici : l'action le traduit en refus
  // (`ok: false`), rendu par la branche d'erreur de la tuile — laquelle rappelle
  // que le tour reste offert et que la place n'a pas bougé.

  if (resultat.isLosing) {
    return (
      <Verdict>
        Pas de gain cette fois. Merci d&apos;avoir joué — et votre place n&apos;a
        pas bougé.
      </Verdict>
    );
  }

  const rejoue = resultat.state === "already_consumed";

  return (
    <div role="status" aria-live="polite" className="mt-4">
      {rejoue ? (
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-k-body">
          Pause Chance déjà jouée
        </p>
      ) : null}
      <p className="text-xs font-mono font-bold tracking-[0.3em] text-k-green">
        ✦ GAGNÉ ✦
      </p>
      <h3 className="mt-1 text-2xl font-black leading-tight text-k-ink">
        {resultat.label ?? "Un lot vous attend"}
      </h3>
      {resultat.description ? (
        <p className="mt-1 text-sm font-medium leading-relaxed text-k-body">
          {resultat.description}
        </p>
      ) : null}
      {/* LE GAIN EST UN CODE STANDARD, remis en caisse comme tous les autres :
          aucune économie parallèle, aucun retrait spécial. */}
      <p className="mt-2 text-sm font-bold leading-relaxed text-k-ink">
        À retirer au comptoir lors de votre passage.
      </p>
      {resultat.claimToken ? (
        <div className="mt-3">
          <ClaimForm
            claimToken={resultat.claimToken}
            config={claimConfig}
            slug={slug}
            organizationName={organizationName}
            organizationId={organizationId}
            kermesse
          />
        </div>
      ) : null}
    </div>
  );
}

/** Les issues sobres : un encart, une phrase, et rien qui clignote. */
function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="mt-4">
      <p className="rounded-xl border-2 border-k-ink bg-zinc-50 px-3 py-2 text-sm font-bold leading-relaxed text-k-ink">
        {children}
      </p>
    </div>
  );
}
