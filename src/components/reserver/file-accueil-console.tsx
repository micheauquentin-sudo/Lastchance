"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getQueueStaffState,
  queueCallNext,
  queueReopen,
  queueResolve,
} from "@/actions/reserver";
import { FieldError } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import type {
  QueueStaffEntryView,
  QueueStaffStateResult,
  ReservationQueueStatus,
} from "@/lib/reserver";
import { useActionForm } from "@/lib/use-action-form";
import type { ActionResult } from "@/lib/utils";
import { useFilePoll } from "@/components/reserver/use-file-poll";

/**
 * LA CONSOLE D'ACCUEIL — l'écran qu'on regarde debout, derrière le comptoir.
 *
 * Un geste principal, énorme : « Appeler le suivant ». Puis, sur la personne
 * appelée, les trois seules issues qui existent : servi, absent, ou bien c'est
 * nous qui nous sommes trompés d'appel et elle repart en tête.
 *
 * ── ELLE FONCTIONNE POUR UN CAISSIER, ET C'EST LE POINT ──
 *
 * Appeler, servir, noter une absence sont des gestes de COMPTOIR, pas de
 * gestion : le rôle `cashier` les fait. Créer une file, la renommer, la mettre
 * en pause restent au propriétaire ou à l'éditeur — c'est du paramétrage, et
 * `capacitesDuModule` le tranche côté page. Cette console ne porte donc AUCUN
 * bouton de configuration : elle est le poste de travail, pas le réglage.
 *
 * ── PAS DE `reloadOnSuccess` ICI, ET C'EST L'INVERSE DU RESTE DU MODULE ──
 *
 * La règle du dépôt pose `reloadOnSuccess` là où le rafraîchissement est le SEUL
 * moyen d'afficher le résultat d'un geste — sinon le commerçant re-clique et
 * crée un doublon. Cet écran est le cas où cette condition est FAUSSE : il vit
 * sur le scrutin, chaque geste déclenche un tic immédiat, et la liste se
 * redessine en moins d'une seconde sans perdre le défilement. Un rechargement
 * franc coûterait ici une seconde d'écran blanc À CHAQUE CLIENT SERVI, devant
 * quelqu'un qui attend. Les formulaires de CRUD des files, eux, gardent
 * `reloadOnSuccess` : leur liste est bien dérivée du rendu serveur.
 *
 * ── QUELS GESTES SE CONFIRMENT, ET LESQUELS NON ──
 *
 * « Absent » et « Remettre en tête » se confirment : le premier clôt le passage
 * de quelqu'un qui est peut-être aux toilettes, le second réordonne la file au
 * détriment de celui qui était premier. Les deux nomment leur conséquence
 * plutôt que de demander « êtes-vous sûr ».
 *
 * « Appeler le suivant » et « Servi » ne se confirment PAS, délibérément : ce
 * sont les deux gestes du flux normal, répétés à chaque client. Une boîte de
 * dialogue à chaque personne accueillie ferait deux clics là où il en faut un,
 * pendant que la file regarde — et une confirmation qu'on clique cent fois par
 * jour ne protège plus de rien, elle s'apprend par cœur. Leurs erreurs sont
 * toutes deux rattrapables : un appel de trop se répare par « Remettre en
 * tête », et un « servi » par erreur ne retire une place à personne.
 */

/**
 * Cinq secondes, quel que soit l'état.
 *
 * Le comptoir n'a pas de « moment critique » comme le joueur en tête de file :
 * une personne peut arriver ou quitter la file à tout instant, et l'écran est
 * ouvert en permanence sur un poste fixe. Une cadence constante et modeste est
 * ce qui coûte le moins pour ce qu'elle rend — le scrutin se met de toute façon
 * en pause dès que l'onglet passe en arrière-plan.
 */
const CADENCE_COMPTOIR = 5_000;

export function FileAccueilConsole({ queueId }: { queueId: string }) {
  const charger = useCallback(
    () => getQueueStaffState({ queueId }),
    [queueId],
  );
  // `null` au départ, et lecture IMMÉDIATE : la console est montée par le clic
  // du commerçant sur une file, pas par le rendu serveur de la page — elle n'a
  // donc aucun état à hériter. Le charger côté page aurait coûté une lecture
  // par file listée pour n'en montrer qu'une.
  const { etat, rafraichir } = useFilePoll<QueueStaffStateResult | null>(
    null,
    charger,
    () => CADENCE_COMPTOIR,
    true,
  );

  // L'horloge d'affichage des durées d'attente. Trente secondes : les durées
  // sont affichées à la minute, un tic plus rapide redessinerait la liste pour
  // le même texte.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (etat === null) {
    return (
      <p
        role="status"
        className="rounded-xl border-2 border-dashed border-k-ink/25 px-4 py-6 text-center text-sm font-semibold text-k-body"
      >
        Ouverture de la console…
      </p>
    );
  }

  if (!etat.ok || !etat.queue) {
    return (
      <p className="rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-sm font-bold text-k-ink">
        Cette file est introuvable. Rechargez la page.
      </p>
    );
  }

  // Les APPELÉS d'abord, c'est déjà l'ordre rendu par `queue_staff_state` : on
  // ne retrie rien ici, on ne fait que séparer les deux groupes.
  const appele =
    etat.entries.find((e: QueueStaffEntryView) => e.status === "called") ?? null;
  const enAttente = etat.entries.filter(
    (e: QueueStaffEntryView) => e.status === "waiting",
  );

  return (
    <div>
      <AppelerLeSuivant
        queueId={queueId}
        queueStatus={etat.queue.status}
        attente={etat.live.waiting}
        dejaAppele={appele !== null}
        onGeste={rafraichir}
      />

      {appele ? (
        <AuComptoir
          entree={appele}
          maintenant={maintenant}
          onGeste={rafraichir}
        />
      ) : null}

      <ListeAttente entrees={enAttente} maintenant={maintenant} />

      <CompteursDuJour today={etat.today} />

      <InfoBulle
        id={`file-console-aide-${queueId}`}
        resume="Comment la file se comporte-t-elle ?"
        className="mt-4"
      >
        Le rang affiché à vos clients est calculé à chaque lecture, dans
        l&apos;ordre exact des inscriptions : personne ne peut être doublé, et
        vous ne pouvez pas réordonner la file. Aucun délai d&apos;attente
        n&apos;est annoncé à vos clients — ni sur leur écran, ni sur le vôtre :
        une estimation ratée coûte plus cher que pas d&apos;estimation du tout.
        « Remettre en tête » existe pour la seule erreur qui arrive vraiment :
        avoir appelé une personne pour une autre.
      </InfoBulle>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Le geste principal
// ────────────────────────────────────────────────────────────

function AppelerLeSuivant({
  queueId,
  queueStatus,
  attente,
  dejaAppele,
  onGeste,
}: {
  queueId: string;
  queueStatus: ReservationQueueStatus;
  attente: number;
  dejaAppele: boolean;
  onGeste: () => void;
}) {
  const [annonce, setAnnonce] = useState<string | null>(null);

  const { state, pending, onSubmit } = useActionForm(queueCallNext, {
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — personne n'a été appelé.",
    onSuccess: (resultat) => {
      // Le PRÉNOM APPELÉ est le seul retour qui compte : c'est ce qu'on dit à
      // voix haute dans la seconde qui suit. Il vient de la réponse du geste,
      // pas du tic de scrutin suivant, qui arriverait trop tard.
      setAnnonce(
        resultat.state === "called"
          ? `${resultat.displayName ?? "Client suivant"} — appelé.`
          : "Personne n'attend dans cette file.",
      );
      onGeste();
    },
  });

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="queueId" value={queueId} />
      <button
        type="submit"
        disabled={pending || attente === 0}
        className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-6 text-xl font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-50"
      >
        {pending
          ? "Appel…"
          : attente === 0
            ? "Personne n'attend"
            : dejaAppele
              ? "Appeler le suivant aussi"
              : "Appeler le suivant"}
      </button>

      {queueStatus !== "open" ? (
        <p className="mt-2 text-xs font-semibold text-k-body">
          {queueStatus === "paused"
            ? "Les inscriptions sont en pause : personne ne peut plus rejoindre, mais vous continuez à servir ceux qui attendent."
            : "La file est fermée aux inscriptions. Vous pouvez encore servir ceux qui attendent."}
        </p>
      ) : null}

      {/* Région vivante montée EN PERMANENCE : un `aria-live` créé en même
          temps que son contenu n'annonce rien. */}
      <div aria-live="polite" className="mt-2 min-h-[1.25rem]">
        {annonce ? (
          <p className="text-sm font-black text-k-ink">{annonce}</p>
        ) : null}
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// La personne au comptoir, et ses trois issues
// ────────────────────────────────────────────────────────────

function AuComptoir({
  entree,
  maintenant,
  onGeste,
}: {
  entree: QueueStaffEntryView;
  maintenant: number;
  onGeste: () => void;
}) {
  return (
    <section
      aria-labelledby={`comptoir-${entree.entryId}`}
      className="mt-5 rounded-2xl border-2 border-k-ink bg-k-yellow/30 p-4"
    >
      <p className="text-xs font-black uppercase tracking-wide text-k-body">
        Au comptoir
      </p>
      <h3
        id={`comptoir-${entree.entryId}`}
        className="mt-1 text-2xl font-black leading-tight text-k-ink"
      >
        {entree.displayName ?? "Client"}
      </h3>
      <p className="mt-0.5 text-xs font-semibold text-k-body">
        Appelé {depuis(entree.calledAt ?? entree.joinedAt, maintenant)} · dans la
        file {depuis(entree.joinedAt, maintenant)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <GesteIssue
          entree={entree}
          issue="served"
          onGeste={onGeste}
        />
        <GesteIssue
          entree={entree}
          issue="no_show"
          onGeste={onGeste}
        />
        <GesteIssue
          entree={entree}
          issue="reopen"
          onGeste={onGeste}
        />
      </div>
    </section>
  );
}

type Issue = "served" | "no_show" | "reopen";

const LIBELLE_ISSUE: Record<
  Issue,
  {
    label: string;
    labelEnCours: string;
    classe: string;
    /** `null` = geste du flux normal, non confirmé. Voir l'en-tête du fichier. */
    confirmation: ((nom: string) => string) | null;
    erreurReseau: string;
  }
> = {
  served: {
    label: "Servi",
    labelEnCours: "…",
    classe: "border-k-ink bg-white text-k-ink hover:bg-k-green/40",
    confirmation: null,
    erreurReseau:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — rien n'a été enregistré.",
  },
  no_show: {
    label: "Absent",
    labelEnCours: "…",
    classe: "border-k-ink bg-white text-k-ink hover:bg-zinc-200",
    confirmation: (nom) =>
      `Noter ${nom} comme absent ? Son passage est clos et sa place ne lui est plus tenue : s'il revient, il devra reprendre un tour.`,
    erreurReseau:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — rien n'a été enregistré.",
  },
  reopen: {
    label: "Remettre en tête",
    labelEnCours: "…",
    classe: "border-k-ink bg-white text-k-body hover:bg-k-yellow/40",
    confirmation: (nom) =>
      `Remettre ${nom} en tête de file ? À utiliser si vous avez appelé la mauvaise personne : elle repasse devant celle qui était première.`,
    erreurReseau:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — la personne est toujours appelée.",
  },
};

function GesteIssue({
  entree,
  issue,
  onGeste,
}: {
  entree: QueueStaffEntryView;
  issue: Issue;
  onGeste: () => void;
}) {
  const config = LIBELLE_ISSUE[issue];
  const nom = entree.displayName ?? "ce client";

  /**
   * Deux actions, une seule forme d'appel — et un adaptateur qui JETTE la
   * donnée rendue.
   *
   * « Remettre en tête » n'est PAS une issue : la RPC est distincte, et un
   * troisième `outcome` aurait été refusé côté base. Leurs deux résultats ne
   * portent pas les mêmes champs (`QueueReopenResult` a un rang, pas
   * `QueueResolveResult`), donc `useActionForm` ne peut pas les unifier. Ce
   * bouton n'affiche aucun des deux — ce qu'il montre vient du tic de scrutin
   * suivant — d'où le `null` : l'adaptateur ne perd rien qui soit lu.
   */
  const action = useCallback(
    async (
      _prev: ActionResult<null> | null,
      formData: FormData,
    ): Promise<ActionResult<null>> => {
      const resultat =
        issue === "reopen"
          ? await queueReopen(null, formData)
          : await queueResolve(null, formData);
      return resultat.ok ? { ok: true, data: null } : resultat;
    },
    [issue],
  );

  const { state, pending, onSubmit } = useActionForm(action, {
    networkError: config.erreurReseau,
    onSuccess: onGeste,
  });

  return (
    <form
      onSubmit={(event) => {
        const demande = config.confirmation;
        if (demande && !confirm(demande(nom))) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      <input type="hidden" name="entryId" value={entree.entryId} />
      {issue === "reopen" ? null : (
        <input type="hidden" name="outcome" value={issue} />
      )}
      <button
        type="submit"
        disabled={pending}
        // La console porte trois boutons identiques par ligne appelée : au
        // lecteur d'écran, « Servi » seul ne dit pas QUI. Le nom accessible
        // porte donc la personne, la surface visible reste courte.
        aria-label={`${config.label} — ${nom}`}
        className={`rounded-xl border-2 px-4 py-2.5 text-sm font-black disabled:pointer-events-none disabled:opacity-60 ${config.classe}`}
      >
        {pending ? config.labelEnCours : config.label}
      </button>
      <div aria-live="assertive">
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// La file vivante
// ────────────────────────────────────────────────────────────

function ListeAttente({
  entrees,
  maintenant,
}: {
  entrees: QueueStaffEntryView[];
  maintenant: number;
}) {
  return (
    <section aria-labelledby="file-attente-titre" className="mt-5">
      <h3
        id="file-attente-titre"
        className="text-sm font-black uppercase tracking-wide text-k-body"
      >
        En attente ({entrees.length})
      </h3>

      {entrees.length === 0 ? (
        <p className="mt-2 rounded-xl border-2 border-dashed border-k-ink/25 px-4 py-6 text-center text-sm font-semibold text-k-body">
          Personne n&apos;attend en ce moment.
        </p>
      ) : (
        // `aria-live="polite"` : la liste bouge toute seule au fil du scrutin.
        // Poli, jamais assertif — au comptoir, on lit l'écran, on n'attend pas
        // qu'il interrompe.
        <ol aria-live="polite" className="mt-2 space-y-1.5">
          {entrees.map((entree) => (
            <li
              key={entree.entryId}
              className="flex items-center gap-3 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2"
            >
              <span className="w-8 shrink-0 text-center text-lg font-black tabular-nums text-k-ink">
                {entree.position ?? "–"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
                {entree.displayName ?? (
                  <span className="text-k-body">Client</span>
                )}
              </span>
              <span className="shrink-0 text-xs font-semibold text-k-body">
                {depuis(entree.joinedAt, maintenant)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Les compteurs du jour
// ────────────────────────────────────────────────────────────

/**
 * Servis, absents, partis — les trois seules issues, donc les trois seuls
 * chiffres. Leur rapport est la mesure honnête d'une journée d'accueil ; un
 * quatrième chiffre inventé (« temps moyen ») serait exactement l'ETA que ce
 * module refuse, déguisé en statistique.
 *
 * Le jour est celui du FUSEAU DE L'ORGANISATION, tranché côté serveur : le
 * recalculer avec l'horloge du poste de caisse ferait changer le compte selon
 * la machine.
 */
function CompteursDuJour({
  today,
}: {
  today: { served: number; noShow: number; left: number };
}) {
  return (
    <section aria-labelledby="file-compteurs-titre" className="mt-5">
      <h3 id="file-compteurs-titre" className="sr-only">
        Compteurs du jour
      </h3>
      <dl className="grid grid-cols-3 gap-2">
        <Compteur label="Servis" valeur={today.served} />
        <Compteur label="Absents" valeur={today.noShow} />
        <Compteur label="Partis" valeur={today.left} />
      </dl>
      <p className="mt-1.5 text-xs font-semibold text-k-body">
        Depuis ce matin, dans le fuseau de votre commerce.
      </p>
    </section>
  );
}

function Compteur({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2 text-center">
      <dt className="text-xs font-bold uppercase tracking-wide text-k-body">
        {label}
      </dt>
      <dd className="text-2xl font-black tabular-nums text-k-ink">{valeur}</dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Durées
// ────────────────────────────────────────────────────────────

/**
 * « depuis 12 min » — une durée ÉCOULÉE, jamais une durée RESTANTE.
 *
 * La distinction est tout le critère RES-3 : le temps déjà passé est un FAIT
 * mesuré, celui qui reste serait une promesse. Cette fonction ne sait rien de
 * l'avenir, et n'est appelée que sur l'écran du staff — l'écran du client
 * n'affiche aucune durée du tout.
 */
function depuis(iso: string | null, maintenant: number): string {
  // `joinedAt` et `calledAt` sont nullables dans `QueueStaffEntryView` : la
  // console rend alors une chaîne vide plutôt qu'un « depuis NaN min ». Un
  // horodatage manquant ne se remplace pas par l'heure du poste de caisse.
  if (!iso) return "";
  const horodatage = Date.parse(iso);
  if (!Number.isFinite(horodatage)) return "";
  const minutes = Math.max(0, Math.floor((maintenant - horodatage) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `depuis ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return `depuis ${heures} h${reste > 0 ? ` ${String(reste).padStart(2, "0")}` : ""}`;
}
