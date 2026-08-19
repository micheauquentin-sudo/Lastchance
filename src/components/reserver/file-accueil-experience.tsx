"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getQueuePublicState,
  queueJoin,
  queueLeave,
  type QueueJoinActionResult,
} from "@/actions/reserver";
import { DefiAntiRobot } from "@/components/reserver/defi-antirobot";
import {
  etatUiFile,
  formatHeure,
  LIBELLE_FILE_SANS_DELAI,
  QUEUE_DISPLAY_NAME_MAX,
  RESERVER_EMAIL_MAX,
  type EtatUiFile,
  type QueuePublicStateResult,
  type ReservationQueueStatus,
} from "@/lib/reserver";
import { useActionForm } from "@/lib/use-action-form";
import { useFilePoll } from "@/components/reserver/use-file-poll";

/**
 * LA FILE D'ACCUEIL, VUE DU CLIENT QUI POUSSE LA PORTE (RES-3).
 *
 * Il scanne le QR posé à l'entrée, il voit son RANG RÉEL, et quand le comptoir
 * l'appelle son téléphone le lui crie. C'est tout le parcours.
 *
 * ── AUCUN ETA, ET CE N'EST PAS UN OUBLI ──
 *
 * Pas de « ~15 min », pas de barre de progression temporelle, pas de compte à
 * rebours, pas de durée écoulée transformée en projection. Le critère est tenu
 * au plus bas — `queue_public_state` ne rend AUCUNE durée — et il l'est aussi
 * ici : rien dans ce fichier ne soustrait deux dates pour en faire une
 * promesse. La phrase qui l'explique au client est `LIBELLE_FILE_SANS_DELAI`,
 * écrite une seule fois dans `@/lib/reserver` pour que les deux écrans qui la
 * portent ne divergent jamais. La seule heure affichée est celle, FACTUELLE, de
 * l'inscription.
 *
 * ── L'APPEL PRIME SUR TOUT LE RESTE ──
 *
 * Quand l'état de la place passe à `appele`, l'écran n'affiche plus une
 * pastille en haut d'une liste : il DEVIENT l'appel. Plein écran, jaune sur
 * encre, `role="alert"` en `aria-live="assertive"` — le lecteur d'écran
 * interrompt sa lecture — et une vibration si l'appareil en a une. Le téléphone
 * est au fond d'une poche ou posé sur une table à trois mètres : un changement
 * discret ne se voit pas, et la personne rate son tour.
 *
 * L'ordre de test vient d'`etatUiPlaceFile` et il est le même partout : appelé
 * d'abord, le reste ensuite.
 *
 * ── CONVENTIONS VISUELLES ──
 *
 * Celles des dix autres parcours joueur : HTML natif, classes `k-*`, fond crème
 * posé par la page, cartes blanches à ombre dure, `text-k-body` pour le texte
 * secondaire (jamais `text-zinc-500`, dont le contraste sur crème n'est pas
 * tenu).
 */

const carteClass =
  "k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]";

/**
 * La cadence, et pourquoi elle dépend du rang.
 *
 * En tête de file, le prochain appel peut être le mien : deux secondes et
 * demie, comme la soirée live en phase de question. Au-delà du troisième rang,
 * il ne peut RIEN se passer pour moi dans les cinq prochaines secondes — la
 * file avance d'une personne à la fois — et rafraîchir plus vite fait chauffer
 * un téléphone pour lui montrer le même chiffre. Une fois appelé, l'écran ne
 * changera plus qu'au geste du comptoir : dix secondes suffisent à constater
 * que c'est fini.
 */
function cadenceFile(etat: QueuePublicStateResult): number {
  if (etat.state !== "in_queue") return 8_000;
  if (etat.entryStatus === "called") return 10_000;
  const rang = etat.position ?? 99;
  return rang <= 3 ? 2_500 : 5_000;
}

/**
 * Ce que le joueur VENAIT d'être quand il a disparu de la file.
 *
 * `queue_public_state` ne rend que les entrées VIVANTES : servi, absent ou
 * parti, elle répond `not_in_queue` — le même mot que pour quelqu'un qui n'a
 * jamais rejoint. Sans ce souvenir, l'écran de celui qu'on vient de servir
 * repartirait sur le formulaire d'inscription, et il croirait s'être fait
 * éjecter. Il n'invente rien : il ne fait que se rappeler ce que le SERVEUR
 * disait au tic précédent.
 *
 * Il ne distingue pas « servi » de « noté absent », et c'est délibéré : la RPC
 * ne le dit pas, et le deviner écrirait à quelqu'un qu'on l'a noté absent alors
 * qu'il est peut-être au comptoir.
 */
type Souvenir = "aucun" | "passe" | "retire" | "parti";

export function FileAccueilExperience({
  queueId,
  organizationName,
  logoUrl,
  initial,
  timeZone,
}: {
  queueId: string;
  organizationName: string;
  logoUrl: string | null;
  /** Assemblé par la page depuis `loadReserverQueuePublicContext`. */
  initial: QueuePublicStateResult;
  timeZone: string;
}) {
  const charger = useCallback(
    () => getQueuePublicState({ queueId }),
    [queueId],
  );
  const { etat, rafraichir } = useFilePoll(initial, charger, cadenceFile);

  const [souvenir, setSouvenir] = useState<Souvenir>("aucun");
  const precedentRef = useRef<QueuePublicStateResult>(initial);

  useEffect(() => {
    const avant = precedentRef.current;
    precedentRef.current = etat;
    if (etat.state !== "not_in_queue" || avant.state !== "in_queue") return;
    setSouvenir(avant.entryStatus === "called" ? "passe" : "retire");
  }, [etat]);

  if (etat.state === "unavailable") {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className={carteClass}>
          <h1 className="text-xl font-black text-k-ink">
            Cette file n&apos;est plus accessible
          </h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-k-body">
            Demandez au comptoir : on vous indiquera comment être servi.
          </p>
        </div>
      </div>
    );
  }

  const statutFile: ReservationQueueStatus = etat.queueStatus ?? "closed";
  const appele = etat.state === "in_queue" && etat.entryStatus === "called";

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* L'APPEL, MONTÉ EN PREMIER ET PAR-DESSUS TOUT. Il est rendu avant le
          reste du document pour que l'ordre de lecture et l'ordre de tabulation
          le donnent en premier, sans dépendre du seul `z-index`. */}
      {appele ? <AppelPleinEcran nomFile={etat.queueName} /> : null}

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
            🎫
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          {etat.queueName ?? "File d'accueil"}
        </h1>
        <EtatDeLaFile statut={statutFile} />
      </header>

      {etat.state === "in_queue" ? (
        <MonRang
          entryId={etat.entryId}
          position={etat.position}
          waitingCount={etat.waitingCount}
          joinedAt={etat.joinedAt}
          appele={appele}
          timeZone={timeZone}
          onDepart={() => {
            setSouvenir("parti");
            rafraichir();
          }}
        />
      ) : (
        <>
          {souvenir !== "aucun" ? (
            <SortieDeFile souvenir={souvenir} />
          ) : null}
          <RejoindreLaFile
            queueId={queueId}
            statutFile={statutFile}
            waitingCount={etat.waitingCount}
            onRejoint={rafraichir}
          />
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// L'appel — l'écran qui prime sur tous les autres
// ────────────────────────────────────────────────────────────

/**
 * Le motif de vibration, et pourquoi celui-là.
 *
 * Trois impulsions longues séparées de pauses courtes : c'est ce qui se
 * distingue d'une notification ordinaire dans une poche. `navigator.vibrate`
 * n'existe pas partout — WebKit iOS ne l'implémente pas — d'où la garde ; et
 * elle n'est de toute façon qu'un RENFORT : l'écran, lui, crie sur tous les
 * appareils.
 */
const VIBRATION_APPEL = [400, 120, 400, 120, 600];

function AppelPleinEcran({ nomFile }: { nomFile: string | null }) {
  useEffect(() => {
    // Un seul déclenchement par appel : ce composant n'est monté qu'à la
    // bascule vers `called` et démonté à sa résolution. Le navigateur refuse
    // silencieusement la vibration si la page n'a jamais été touchée — c'est sa
    // règle, pas une erreur à rattraper.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(VIBRATION_APPEL);
      } catch {
        // Rien à faire : la vibration est un renfort, jamais le message.
      }
    }
  }, []);

  return (
    <div
      // `fixed inset-0` : il couvre le rang, l'en-tête et le pied de page.
      // Quelqu'un qui regarde son téléphone de loin doit voir UNE chose.
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-k-ink px-6 text-center"
      role="alert"
      aria-live="assertive"
    >
      {nomFile ? (
        <p className="text-sm font-black uppercase tracking-[0.3em] text-k-yellow">
          {nomFile}
        </p>
      ) : null}
      <p className="mt-6 text-6xl font-black uppercase leading-none tracking-tight text-k-yellow sm:text-7xl">
        C&apos;est
        <br />à vous
      </p>
      <p className="mt-8 max-w-xs text-lg font-black leading-snug text-white">
        Présentez-vous au comptoir.
      </p>
      <p className="mt-3 max-w-xs text-sm font-bold leading-relaxed text-white/80">
        Cet écran reste affiché jusqu&apos;à ce qu&apos;on vous ait accueilli.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// L'état de la file — trois mots, et le deuxième demande une phrase
// ────────────────────────────────────────────────────────────

/**
 * « En pause » est le seul des trois états qui ne se comprend pas seul.
 *
 * Fermée, on ne prend plus personne ; en pause, on ne prend plus de monde MAIS
 * ON SERT ENCORE — c'est précisément ce qu'un commerçant fait à vingt minutes
 * de la fermeture. Sans cette phrase, quelqu'un qui est déjà 3e lit « en
 * pause » et s'en va en croyant sa place perdue.
 *
 * Les trois clés sont celles d'`etatUiFile` : le verdict est calculé là-bas,
 * ici on ne fait que le peindre.
 */
const LIBELLE_ETAT: Record<
  EtatUiFile,
  { titre: string; detail: string | null; ton: string }
> = {
  ouverte: { titre: "File ouverte", detail: null, ton: "bg-k-green/40" },
  en_pause: {
    titre: "Inscriptions en pause",
    detail:
      "On ne prend plus de monde pour le moment, mais on continue de servir ceux qui attendent déjà.",
    ton: "bg-amber-100",
  },
  fermee: {
    titre: "File fermée",
    detail: "Les inscriptions sont closes pour le moment.",
    ton: "bg-zinc-200",
  },
};

function EtatDeLaFile({ statut }: { statut: ReservationQueueStatus }) {
  const { titre, detail, ton } = LIBELLE_ETAT[etatUiFile(statut)];
  return (
    <div className="mt-3">
      <span
        className={`inline-flex items-center rounded-full border-2 border-k-ink px-3 py-1 text-xs font-black text-k-ink ${ton}`}
      >
        {titre}
      </span>
      {detail ? (
        <p className="mt-2 text-sm font-medium leading-relaxed text-k-body">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Mon rang
// ────────────────────────────────────────────────────────────

/**
 * LE RANG, EN TRÈS GRAND, ET HONNÊTE.
 *
 * « 4e » seul ne dit rien : quatrième sur cinq, c'est presque fini ; quatrième
 * sur quarante, c'est une autre journée. La taille de la file voyage donc
 * toujours avec le rang, et les deux viennent du MÊME document serveur — les
 * calculer séparément aurait laissé afficher « 4e sur 2 ».
 *
 * `aria-live="polite"` et non `assertive` : le rang change plusieurs fois par
 * minute, et interrompre la lecture d'écran à chaque personne servie rendrait
 * la page inutilisable. L'assertif est réservé à l'appel, qui n'arrive
 * qu'une fois.
 */
function MonRang({
  entryId,
  position,
  waitingCount,
  joinedAt,
  appele,
  timeZone,
  onDepart,
}: {
  /** L'entrée de CE navigateur. `queue_leave` la borne par l'empreinte du cookie. */
  entryId: string | null;
  position: number | null;
  waitingCount: number;
  joinedAt: string | null;
  appele: boolean;
  timeZone: string;
  onDepart: () => void;
}) {
  return (
    <section aria-labelledby="mon-rang-titre" className={carteClass}>
      <h2 id="mon-rang-titre" className="sr-only">
        Votre place dans la file
      </h2>

      <div aria-live="polite" className="text-center">
        {appele || position === null ? (
          <p className="text-3xl font-black leading-tight text-k-ink">
            C&apos;est à vous — présentez-vous au comptoir.
          </p>
        ) : (
          <>
            <p className="text-sm font-bold uppercase tracking-wide text-k-body">
              Vous êtes
            </p>
            <p className="mt-1 text-7xl font-black leading-none tabular-nums text-k-ink">
              {position}
              <span className="align-top text-4xl">
                {position === 1 ? "er" : "e"}
              </span>
            </p>
            <p className="mt-2 text-base font-bold text-k-ink">
              {waitingCount > 1
                ? `${waitingCount} personnes attendent`
                : "Vous êtes seul à attendre"}
            </p>
          </>
        )}
      </div>

      <p className="mt-4 border-t-2 border-k-ink/10 pt-3 text-center text-xs font-semibold leading-relaxed text-k-body">
        {joinedAt ? `Inscrit à ${formatHeure(joinedAt, timeZone)}. ` : ""}
        {LIBELLE_FILE_SANS_DELAI}
      </p>

      {entryId ? (
        <QuitterLaFile entryId={entryId} onDepart={onDepart} />
      ) : null}
    </section>
  );
}

/**
 * « Quitter la file » — confirmé, parce que le rang ne se récupère pas.
 *
 * Se réinscrire est possible, mais on repart DERNIER : le geste n'est pas
 * rattrapable en re-cliquant, et la confirmation le nomme au lieu de demander
 * « êtes-vous sûr ». Même règle que « Retirer » côté commerçant.
 */
function QuitterLaFile({
  entryId,
  onDepart,
}: {
  entryId: string;
  onDepart: () => void;
}) {
  const action = useCallback(async () => queueLeave({ entryId }), [entryId]);

  // PAS de `reloadOnSuccess` ici, contrairement au reste du module : cet écran
  // n'est pas dérivé de props serveur, il vit sur le scrutin. Recharger la page
  // coûterait une seconde d'écran blanc pour arriver au même endroit — le tic
  // suivant, déclenché tout de suite par `onDepart`, montre déjà le départ.
  const { state, pending, onSubmit } = useActionForm(action, {
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — vous êtes toujours dans la file.",
    onSuccess: onDepart,
  });

  return (
    <form
      onSubmit={(event) => {
        if (
          !confirm(
            "Quitter la file ? Vous perdez votre place, et si vous revenez vous repartirez en dernier.",
          )
        ) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="mt-4"
    >
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl border-2 border-k-ink bg-white px-4 py-3 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Sortie…" : "Quitter la file"}
      </button>
      <div aria-live="assertive">
        {state && !state.ok ? (
          <p className="mt-2 text-sm font-semibold text-red-600">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Sorties de file — sobres, et sans rien deviner
// ────────────────────────────────────────────────────────────

const MESSAGE_SORTIE: Record<
  Exclude<Souvenir, "aucun">,
  { titre: string; corps: string }
> = {
  passe: {
    titre: "Votre tour est passé",
    corps:
      "Le comptoir a clos votre passage. Si vous n'avez pas été servi, présentez-vous : on vous remettra dans la file.",
  },
  retire: {
    titre: "Vous n'êtes plus dans la file",
    corps:
      "Votre inscription a été retirée. Vous pouvez en reprendre une ci-dessous si la file est ouverte.",
  },
  parti: {
    titre: "Vous avez quitté la file",
    corps:
      "Votre place est repartie à la personne suivante. Vous pouvez vous réinscrire, en dernier.",
  },
};

function SortieDeFile({ souvenir }: { souvenir: Exclude<Souvenir, "aucun"> }) {
  const { titre, corps } = MESSAGE_SORTIE[souvenir];
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-2xl border-2 border-k-ink bg-white px-4 py-3"
    >
      <p className="text-sm font-black text-k-ink">{titre}</p>
      <p className="mt-1 text-sm font-medium leading-relaxed text-k-body">
        {corps}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Rejoindre
// ────────────────────────────────────────────────────────────

/**
 * Les deux états de `queue_join` qui ne sont pas une place.
 *
 * `unavailable` couvre AUSSI la file dont l'activité liée a été coupée : cet
 * écran ne connaît que le statut de la file, jamais celui de l'activité — c'est
 * `fileAccepteEntree` qui les combine côté serveur, et la RPC qui tranche sous
 * verrou. Le refus reste donc lisible sans que le client ait à comprendre
 * pourquoi.
 *
 * `invalid_email` n'y est pas : le champ est `type="email"`, le navigateur
 * refuse déjà la saisie malformée, et le message du cas résiduel vaut mieux
 * réécrit par le serveur. `already_waiting` non plus — c'est un rechargement de
 * page, pas une faute : la RPC rend le rang existant, et le scrutin l'affiche.
 */
const REFUS_JOINTE = {
  queue_full:
    "La file est complète pour le moment. Présentez-vous au comptoir, ou réessayez dans quelques minutes.",
  unavailable:
    "Cette file n'accepte plus d'inscription. Demandez au comptoir : on vous indiquera comment être servi.",
} as const;

/**
 * LE FORMULAIRE DE JOINTE — un bouton, et deux champs facultatifs.
 *
 * ── LE PRÉNOM EST FACULTATIF, ET IL SERT À UNE SEULE CHOSE ──
 *
 * À être appelé par son nom au comptoir, plutôt que « la personne suivante ».
 * C'est écrit sous le champ, parce qu'une demande d'identité sans motif se
 * refuse à raison. Sans prénom, l'écran du staff affiche « Client » et tout le
 * reste fonctionne à l'identique — le rang, l'appel, l'issue.
 *
 * ── LA CASE EST SÉPARÉE DU CHAMP EMAIL ──
 *
 * Même règle que la liste prioritaire (L5) et que la réservation : saisir une
 * adresse ne vaut pas consentement. La contrainte SQL est symétrique — l'adresse
 * et l'horodatage de consentement existent tous les deux ou aucun — et
 * l'équivalence est tranchée ICI, avant le réseau : une adresse saisie sans la
 * case cochée ne doit pas voyager pour être jetée à l'arrivée.
 */
function RejoindreLaFile({
  queueId,
  statutFile,
  waitingCount,
  onRejoint,
}: {
  queueId: string;
  statutFile: ReservationQueueStatus;
  waitingCount: number;
  onRejoint: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeDemande, setChallengeDemande] = useState(false);

  const action = useCallback(
    async (
      _prev: QueueJoinActionResult | null,
      formData: FormData,
    ): Promise<QueueJoinActionResult> => {
      const emailSaisi = String(formData.get("email") ?? "").trim();
      const consenti = formData.get("consent") === "on";
      if (emailSaisi && !consenti) {
        return {
          ok: false,
          error:
            "Cochez la case pour être prévenu par email, ou laissez l'adresse vide.",
        };
      }
      const prenom = String(formData.get("displayName") ?? "").trim();
      const resultat = await queueJoin({
        queueId,
        displayName: prenom || undefined,
        // L'ADRESSE NE PART QUE CONSENTIE — même règle, même raison qu'à la
        // réservation : sans consentement la base la jetterait, et l'envoyer
        // quand même la ferait traverser réseau et journaux pour rien.
        email: consenti && emailSaisi ? emailSaisi : undefined,
        consent: consenti,
        turnstileToken: captchaToken ?? undefined,
      });
      if (!resultat.ok && resultat.challengeRequired) setChallengeDemande(true);
      // `queue_full` et `unavailable` sont des SUCCÈS d'appel et des REFUS de
      // place : sans cette traduction, le formulaire se replierait sur un écran
      // inchangé et le client croirait à un clic perdu. Même geste, même raison
      // que `waitlist_full` sur la liste prioritaire (L5).
      if (resultat.ok && resultat.data.state in REFUS_JOINTE) {
        const motif = resultat.data.state as keyof typeof REFUS_JOINTE;
        return {
          ok: false,
          error:
            motif === "queue_full" && resultat.data.capacity
              ? `La file est complète (${resultat.data.capacity} personnes). Présentez-vous au comptoir, ou réessayez dans quelques minutes.`
              : REFUS_JOINTE[motif],
        };
      }
      return resultat;
    },
    [captchaToken, queueId],
  );

  const { state, pending, onSubmit } = useActionForm(action, {
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — vous n'êtes pas encore inscrit.",
    onSuccess: onRejoint,
  });

  if (statutFile !== "open") {
    return (
      <div className={carteClass}>
        <p className="text-sm font-bold leading-relaxed text-k-ink">
          {statutFile === "paused"
            ? "Les inscriptions sont en pause : présentez-vous au comptoir, on vous dira quand elles rouvrent."
            : "Les inscriptions sont closes. Revenez à la prochaine ouverture."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={carteClass}>
      <h2 className="text-lg font-black text-k-ink">Prenez votre tour</h2>
      <p className="mt-1 text-sm font-medium leading-relaxed text-k-body">
        {waitingCount > 0
          ? `${waitingCount} personne${waitingCount > 1 ? "s" : ""} devant vous en ce moment.`
          : "Personne n'attend en ce moment."}{" "}
        {LIBELLE_FILE_SANS_DELAI}
      </p>

      <label
        htmlFor="file-prenom"
        className="mt-4 mb-1.5 block text-sm font-bold text-k-ink"
      >
        Votre prénom{" "}
        <span className="font-medium text-k-body">(facultatif)</span>
      </label>
      <input
        id="file-prenom"
        name="displayName"
        type="text"
        autoComplete="given-name"
        maxLength={QUEUE_DISPLAY_NAME_MAX}
        placeholder="Camille"
        aria-describedby="file-prenom-aide"
        className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
      />
      <p
        id="file-prenom-aide"
        className="mt-1.5 text-xs font-medium leading-relaxed text-k-body"
      >
        Pour vous appeler par votre prénom au comptoir. Sans lui, tout
        fonctionne pareil : vous serez appelé à votre rang.
      </p>

      <label
        htmlFor="file-email"
        className="mt-4 mb-1.5 block text-sm font-bold text-k-ink"
      >
        Votre email{" "}
        <span className="font-medium text-k-body">(facultatif)</span>
      </label>
      <input
        id="file-email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        maxLength={RESERVER_EMAIL_MAX}
        placeholder="vous@exemple.fr"
        aria-describedby="file-email-aide"
        className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
      />

      {/* LA CASE EST SÉPARÉE DU CHAMP : saisir une adresse ne vaut pas
          consentement, ici comme à la réservation. */}
      <label
        htmlFor="file-consent"
        className="mt-3 flex cursor-pointer items-start gap-3"
      >
        <input
          id="file-consent"
          name="consent"
          type="checkbox"
          value="on"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-k-ink accent-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
        />
        <span className="text-sm font-bold text-k-ink">
          J&apos;accepte d&apos;être prévenu par email quand c&apos;est à moi.
        </span>
      </label>
      <p
        id="file-email-aide"
        className="mt-2 text-xs font-medium leading-relaxed text-k-body"
      >
        Votre adresse n&apos;est conservée et utilisée que si vous cochez cette
        case, et uniquement pour cet appel-là — jamais pour de la publicité.
      </p>

      {/* Le défi n'apparaît QUE si le serveur l'a demandé : un QR scanné en
          boutique ne doit pas commencer par une épreuve. Même motif que la
          liste prioritaire (L5) et que la réservation. */}
      <div aria-live="polite">
        <DefiAntiRobot
          id={`file-${queueId}`}
          action="reserver-queue-join"
          visible={challengeDemande}
          onToken={setCaptchaToken}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="k-btn mt-5 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Inscription…" : "Prendre mon tour"}
      </button>

      <div aria-live="assertive">
        {state && !state.ok ? (
          <p className="mt-2 text-sm font-semibold text-red-600">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
