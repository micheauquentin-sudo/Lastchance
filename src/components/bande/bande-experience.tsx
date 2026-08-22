"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  getBandeRecap,
  getBandeState,
  nextBande,
  revealBande,
  startBande,
  voteBande,
} from "@/actions/bande";
import type {
  BandeRecapLigneView,
  BandeResultatView,
  BandeStateView,
} from "@/lib/bande";
import { LobbyCarton } from "@/components/lobby/lobby-shell";
import { SortieApresJeu } from "@/components/sortie/sortie-apres-jeu";
import type { SortieApresJeu as SortieApresJeuView } from "@/lib/sortie-apres-jeu";

/**
 * PORTRAIT DE LA BANDE (L18) — l'écran de jeu, monté à la place de « la partie
 * commence ».
 *
 * ── QUATRE MOMENTS, UN SEUL COMPOSANT ──
 *
 * LA QUESTION (un bouton par personne, plus « Je passe »), L'ATTENTE INVISIBLE
 * (un compte, jamais des noms), LA RÉVÉLATION (des barres, jamais un auteur) et
 * LE RÉCAPITULATIF ne sont pas quatre écrans : c'est la MÊME partie vue à quatre
 * instants, et le seul document qui les distingue est `bande_state`. Motif exact
 * de `DuoExperience` (L17), et pour les mêmes raisons — les séparer en routes
 * aurait exigé de publier l'identifiant de la salle dans l'URL, que L16 garde
 * derrière l'appartenance.
 *
 * ── CE QUE CET ÉCRAN NE DIRA JAMAIS : QUI A VOTÉ ──
 *
 * C'est LA promesse du cahier, et elle tient à ce que l'écran n'a rien à
 * filtrer : aucune RPC du lot ne rend un votant. `votesExprimes` est un COMPTE,
 * `resultats` un décompte PAR CIBLE. Il n'existe donc, nulle part dans ce
 * fichier, de valeur qui pourrait attribuer une voix à quelqu'un — et c'est
 * volontaire : une garde d'affichage s'oublie, une donnée absente ne s'affiche
 * pas. `e2e/bande.spec.ts` tient cette absence sur le HTML transmis.
 *
 * ── LE POURCENTAGE VIENT DU SERVEUR ──
 *
 * `bande_state` le calcule sur le dénominateur FIGÉ du tour, arrondi une fois.
 * Le refaire ici donnerait un second arrondi, qui finirait par différer d'un
 * point sur une tablée de sept — et deux téléphones posés sur la même table
 * n'afficheraient pas le même chiffre.
 *
 * ── LE SCRUTIN, ET SON BUDGET ──
 *
 * Motif `SalleAttente` : une lecture toutes les 3 s, suspendue quand l'onglet
 * dort, reprise à la première seconde de retour. Contrairement à L17, il NE
 * S'ARRÊTE PAS à la première révélation — une partie a plusieurs questions, et
 * c'est le sondage qui apprend aux autres que l'hôte est passé à la suivante.
 * Il s'arrête au RÉCAPITULATIF (plus rien ne bougera) et sur une salle refermée
 * avant la fin (plus personne ne peut voter, donc plus rien ne peut avancer).
 *
 * ── LA SALLE FERMÉE AU RÉCAPITULATIF EST NORMALE ──
 *
 * Le récapitulatif ferme la salle, exactement comme la révélation en L17. C'est
 * pourquoi `SalonLobby` monte cet écran AVANT ses écrans « expiré » et
 * « refermé », et pourquoi le test `recap` passe ici avant `salleClose` : une
 * partie terminée n'est pas une panne.
 */

/** Cadence du scrutin, en millisecondes — celle du salon. */
const INTERVALLE_MS = 3000;

/** La moitié LISIBLE de `BandeStateView` : `unavailable` est un refus. */
type VueBande = Extract<BandeStateView, { state: "ok" }>;

/**
 * L'ouverture de la partie, telle que `startBande` la tranche.
 *
 * PAS DE `non_configure`, contrairement à L17 : le pack a toujours une valeur
 * (défaut `amis`, en base comme en TypeScript), il n'existe donc aucun état
 * « le commerçant n'a rien composé ».
 */
type Ouverture = "attente" | "prete" | "unavailable";

/** Le refus indistinct d'un vote — un seul message, toutes causes confondues. */
const REFUS_VOTE =
  "Ce vote n’a pas pu être enregistré. Réessayez dans un instant.";

/**
 * Le repli quand la question a été retirée du pack depuis la partie jouée.
 *
 * `questionBande` rend `null` dans ce cas (voir `src/lib/bande.ts`), et un tour
 * sans texte reste un tour parfaitement jouable : les voix ont été comptées, le
 * récapitulatif les porte. Peindre un vide aurait fait croire à une panne ; dire
 * ce qui s'est passé coûte une phrase.
 */
const QUESTION_RETIREE = "Cette question ne fait plus partie du jeu.";

export function BandeExperience({
  lobbyId,
  statutSalle,
  hote,
  sortie,
}: {
  lobbyId: string;
  /** Le statut du lobby au moment du branchement — `SalonLobby` le détient. */
  statutSalle: "locked" | "closed";
  /**
   * Le porteur de cet écran est-il l'hôte ? `SalonLobby` le sait par
   * `joinCode`, que `lobby_state` ne rend qu'au créateur. Ce n'est PAS la garde
   * — `bande_reveal` et `bande_next` recomparent l'empreinte au créateur — c'est
   * ce qui évite de montrer à toute la table deux boutons qu'elle ne peut pas
   * presser.
   */
  hote: boolean;
  /** VIT-11 : proposé sous le récapitulatif, jamais avant. */
  sortie: SortieApresJeuView | null;
}) {
  const [ouverture, setOuverture] = useState<Ouverture>("attente");
  const [vue, setVue] = useState<VueBande | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enGeste, demarrerGeste] = useTransition();
  // RELECTURE ATTENDABLE, motif `SalleAttente` : les boutons restent désactivés
  // JUSQU'AU RETOUR de la relecture, sinon l'écran rend la main sur un tour qui
  // n'a pas encore appris que le vote est scellé.
  const lireRef = useRef<() => Promise<void>>(async () => undefined);
  // COMPTEUR DE GÉNÉRATION — motif `SalleAttente` / `DuoExperience`, et pour la
  // même course : une lecture EN VOL depuis avant le vote rapporte un tour
  // encore sans `monVote` et, si elle revient après la relecture, redonne le
  // bulletin à quelqu'un qui a déjà scellé — c'est-à-dire lui fait viser un
  // second vote que `bande_vote` refusera.
  const generationRef = useRef(0);

  useEffect(() => {
    let vivant = true;
    let arrete = false;
    let minuterie: number | null = null;

    const stopper = () => {
      arrete = true;
      if (minuterie !== null) {
        window.clearInterval(minuterie);
        minuterie = null;
      }
    };

    const lire = async () => {
      if (arrete || document.hidden) return;
      const generation = ++generationRef.current;
      try {
        const suivant = await getBandeState(lobbyId);
        // DÉPASSÉE PENDANT LE VOL : une lecture plus récente fait foi.
        if (!vivant || generation !== generationRef.current) return;
        if (suivant.state !== "ok") return;
        setVue(suivant);
        // Le récapitulatif est terminal. Une salle refermée AVANT la fin l'est
        // aussi : plus personne ne peut voter, donc plus rien ne peut avancer.
        if (suivant.partie.status === "recap" || suivant.salleClose) {
          stopper();
        }
      } catch {
        // Un échec isolé est la vie normale d'un téléphone en salle : le tic
        // suivant rattrape, l'écran garde son dernier état connu.
      }
    };
    lireRef.current = lire;

    // OUVRIR — OU RETROUVER — LA PARTIE. `bande_start` est idempotente : douze
    // téléphones peuvent l'appeler à la même seconde, la base leur rend la même
    // partie. L'écran n'a donc pas à savoir lequel est arrivé le premier.
    const ouvrir = async () => {
      try {
        const debut = await startBande(lobbyId);
        if (!vivant) return;
        if (debut.state !== "ok") {
          setOuverture("unavailable");
          return;
        }
        setOuverture("prete");
        await lire();
        if (!vivant || arrete) return;
        minuterie = window.setInterval(() => {
          void lire();
        }, INTERVALLE_MS);
      } catch {
        if (vivant) setOuverture("unavailable");
      }
    };
    void ouvrir();

    const surVisibilite = () => {
      if (!document.hidden) void lire();
    };
    document.addEventListener("visibilitychange", surVisibilite);

    return () => {
      vivant = false;
      lireRef.current = async () => undefined;
      stopper();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [lobbyId]);

  /**
   * VOTER — nommer quelqu'un, OU PASSER. Irréversible dans les deux cas.
   *
   * `cibleMemberId === null` poste un champ VIDE, que l'action lit comme un
   * passe (contrat de `voteBande`). Aucune chaîne magique n'est inventée ici :
   * c'est la forme qu'un bouton « Je passe » produit naturellement.
   *
   * `deja-vote` ne dit RIEN à l'utilisateur : c'est le double-clic ou le
   * changement d'avis, et la relecture qui suit peint le vote figé — la seule
   * réponse honnête. On relit dans TOUS les cas, refus compris : le tour a pu
   * être révélé entre l'affichage et le doigt.
   */
  const voter = (cibleMemberId: string | null) => {
    demarrerGeste(async () => {
      setRefus(null);
      try {
        const formData = new FormData();
        formData.set("lobby_id", lobbyId);
        formData.set("cible_member_id", cibleMemberId ?? "");
        const resultat = await voteBande(null, formData);
        if (!resultat.ok) setRefus(resultat.error);
        else if (resultat.data.etat === "indisponible") setRefus(REFUS_VOTE);
      } catch {
        setRefus(REFUS_VOTE);
      }
      await lireRef.current();
    });
  };

  /**
   * L'HÔTE CLÔT LA QUESTION. Idempotent côté base : le double-clic ne punit pas.
   *
   * `trop_tot` EST UNE RÉPONSE, PAS UNE PANNE (revue L18, E-1) : sous trois
   * réponses, révéler reviendrait à lire le vote d'une personne qu'on vient de
   * voir taper. L'hôte doit lire ce qui manque — le taire lui ferait croire à
   * un bouton cassé, et recommencer.
   */
  const reveler = () => {
    demarrerGeste(async () => {
      setRefus(null);
      try {
        const verdict = await revealBande(lobbyId);
        if (verdict.state === "trop_tot") {
          const manque = verdict.requis - verdict.exprimes;
          setRefus(
            `Encore ${manque} réponse${manque > 1 ? "s" : ""} avant de pouvoir révéler : ` +
              "en dessous, on devinerait qui a voté quoi.",
          );
        }
      } catch {
        // Le sondage rattrape : rien à dire de plus qu'un écran inchangé.
      }
      await lireRef.current();
    });
  };

  /** L'HÔTE PASSE À LA SUITE — ou au récapitulatif, si c'était la dernière. */
  const suivante = () => {
    demarrerGeste(async () => {
      setRefus(null);
      try {
        await nextBande(lobbyId);
      } catch {
        // Idem : c'est la relecture, et non ce retour, qui peint la suite.
      }
      await lireRef.current();
    });
  };

  if (ouverture === "unavailable") {
    return (
      <LobbyCarton className="text-center">
        <p className="text-sm text-k-body">Cette partie n’est plus accessible.</p>
      </LobbyCarton>
    );
  }

  if (ouverture === "attente" || !vue) {
    return (
      <LobbyCarton>
        <p className="text-center text-sm text-k-body" aria-live="polite">
          Le jeu s’ouvre…
        </p>
      </LobbyCarton>
    );
  }

  // LE RÉCAPITULATIF D'ABORD, TOUJOURS : il ferme la salle en même temps qu'il
  // arrive, donc `closed` est ici l'état NORMAL d'une partie qui s'est bien
  // déroulée. Placé plus bas, il aurait été remplacé par « ce salon a été
  // refermé » — une panne affichée à la fin d'une partie réussie.
  if (vue.partie.status === "recap") {
    return <EcranRecapitulatif lobbyId={lobbyId} sortie={sortie} />;
  }

  // Puis, et seulement sur une partie encore en cours : la salle a été refermée
  // sous les doigts des joueurs. Aucun bulletin — chaque nom mènerait au refus.
  if (statutSalle === "closed" || vue.salleClose) {
    return <EcranSalleRefermee />;
  }

  return (
    <EcranTour
      vue={vue}
      hote={hote}
      refus={refus}
      enGeste={enGeste}
      onVoter={voter}
      onReveler={reveler}
      onSuivante={suivante}
    />
  );
}

/**
 * LA SALLE REFERMÉE AVANT LA FIN — dire ce qui s'est passé, sans le déguiser.
 *
 * Motif exact de L17 : ni « une erreur est survenue » (il n'y en a pas eu), ni
 * « réessayez » (il n'y a rien à réessayer), ni le nom de qui a refermé.
 */
function EcranSalleRefermee() {
  return (
    <LobbyCarton className="text-center">
      <h2 className="text-lg font-black text-k-ink">
        Ce salon a été refermé avant la fin de la partie.
      </h2>
      <p className="mt-2 text-sm text-k-body">
        Les questions restantes ne seront pas posées. Demandez une nouvelle
        partie au comptoir.
      </p>
    </LobbyCarton>
  );
}

/* ────────────────────────────────────────────────────────────
   LE TOUR — la question, l'attente, la révélation
   ──────────────────────────────────────────────────────────── */

function EcranTour({
  vue,
  hote,
  refus,
  enGeste,
  onVoter,
  onReveler,
  onSuivante,
}: {
  vue: VueBande;
  hote: boolean;
  refus: string | null;
  enGeste: boolean;
  onVoter: (cibleMemberId: string | null) => void;
  onReveler: () => void;
  onSuivante: () => void;
}) {
  const { partie, tour, monVote, participants, resultats } = vue;
  const revelee = tour.status === "revelee";
  const autres = participants.filter((p) => !p.estMoi);

  return (
    <div className="space-y-4">
      <LobbyCarton>
        <p className="text-xs font-black uppercase tracking-wide text-k-body">
          Question {tour.position} sur {partie.nbQuestions}
        </p>
        <h2 className="mt-1.5 text-xl font-black leading-tight text-k-ink">
          {tour.questionTexte ?? QUESTION_RETIREE}
        </h2>
      </LobbyCarton>

      {refus && (
        <LobbyCarton>
          <p className="text-sm font-semibold text-red-600" role="alert">
            {refus}
          </p>
        </LobbyCarton>
      )}

      {revelee ? (
        <EcranRevelation
          resultats={resultats ?? []}
          denominateur={tour.denominateur}
        />
      ) : monVote ? (
        <EcranAttente
          // `?? 0` PLUTÔT QU'UN TEST : ce compte n'est nul que pour qui n'a pas
          // voté (revue L18, E-1), et cette branche exige `monVote`. Le repli
          // n'est donc atteignable que sur un document incohérent, où « 0 sur
          // N » est la seule phrase qui n'affirme rien de faux.
          votesExprimes={tour.votesExprimes ?? 0}
          denominateur={tour.denominateur}
        />
      ) : (
        <EcranBulletin
          autres={autres}
          enGeste={enGeste}
          onVoter={onVoter}
        />
      )}

      {/* LES DEUX GESTES DE L'HÔTE, ET UN SEUL À LA FOIS. Ils ne sont montrés
          qu'à lui parce que la base ne les accorde qu'à lui — mais c'est la base
          qui garde (`bande_reveal`, `bande_next` recomparent l'empreinte au
          créateur), pas cette condition d'affichage. */}
      {hote && (
        <LobbyCarton>
          {revelee ? (
            <>
              <button
                type="button"
                disabled={enGeste}
                onClick={onSuivante}
                className="min-h-12 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-4 py-3 font-black text-k-ink shadow-[4px_4px_0_var(--color-k-ink)] transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink disabled:opacity-50"
              >
                {tour.position >= partie.nbQuestions
                  ? "Voir le portrait de la bande"
                  : "Question suivante"}
              </button>
              <p className="mt-2 text-center text-xs text-k-body">
                Vous seul pouvez faire avancer la partie.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={enGeste}
                onClick={onReveler}
                className="min-h-12 w-full rounded-2xl border-2 border-k-ink bg-white px-4 py-3 font-black text-k-ink transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink disabled:opacity-50"
              >
                Révéler maintenant
              </button>
              {/* LE DÉNOMINATEUR NE BOUGE PAS, et c'est ce qui rend ce bouton
                  nécessaire : quelqu'un qui ferme son téléphone au milieu d'une
                  question empêcherait la révélation automatique d'arriver. Les
                  absents restent des abstentions. */}
              <p className="mt-2 text-center text-xs text-k-body">
                Sans attendre ceux qui ne répondent pas.
              </p>
            </>
          )}
        </LobbyCarton>
      )}
    </div>
  );
}

/**
 * LE BULLETIN — un bouton par personne, plus « Je passe ».
 *
 * ── LE PASSE EST D'ÉGALE DIGNITÉ ──
 *
 * Il n'est ni plus petit, ni grisé, ni relégué sous un repli : c'est un COUP
 * JOUABLE (il s'écrit en base, il compte dans le verrouillage de la question) et
 * l'écrire comme un renoncement pousserait à nommer quelqu'un pour ne pas avoir
 * l'air de se dérober. C'est l'écart assumé avec L17, où ne rien choisir n'était
 * pas jouable.
 *
 * ── SOI-MÊME N'EST PAS DANS LA LISTE ──
 *
 * `bande_vote` refuse l'auto-désignation ; ce filtre ne garde donc rien, il
 * évite d'offrir un bouton dont chaque doigt tomberait sur un refus.
 */
function EcranBulletin({
  autres,
  enGeste,
  onVoter,
}: {
  autres: VueBande["participants"];
  enGeste: boolean;
  onVoter: (cibleMemberId: string | null) => void;
}) {
  return (
    <LobbyCarton>
      {/* LE SEUIL EST ÉCRIT, PARCE QUE LA PROMESSE NE TIENT QU'À PARTIR DE LÀ.
          À deux, il n'y a qu'une voix par question : celui qui passe sait que
          l'unique bulletin est celui de l'autre, et la révélation le lui nomme.
          Promettre le secret sans condition serait faux sur l'écran même où le
          joueur le vérifierait. */}
      <p className="text-sm text-k-body">
        Nommez quelqu’un — ou passez. Dès trois joueurs, personne ne saura ce que
        vous avez répondu.
      </p>
      <ul className="mt-3 space-y-2">
        {autres.map((participant) => (
          <li key={participant.memberId}>
            <button
              type="button"
              disabled={enGeste}
              onClick={() => onVoter(participant.memberId)}
              className="min-h-14 w-full rounded-2xl border-2 border-k-ink/25 bg-white px-4 py-3 text-left font-bold text-k-ink transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink disabled:opacity-50"
            >
              {participant.pseudo}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            disabled={enGeste}
            onClick={() => onVoter(null)}
            className="min-h-14 w-full rounded-2xl border-2 border-dashed border-k-ink/40 bg-white px-4 py-3 text-left font-bold text-k-ink transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink disabled:opacity-50"
          >
            Je passe
            <span className="mt-0.5 block text-xs font-semibold text-k-body">
              Aucun nom sur cette question.
            </span>
          </button>
        </li>
      </ul>
    </LobbyCarton>
  );
}

/**
 * L'ATTENTE INVISIBLE — un COMPTE, jamais des noms.
 *
 * « 3 sur 5 ont répondu » dit exactement ce dont la table a besoin (est-ce que
 * ça avance ?) sans rien dire de ce qu'elle ne doit pas savoir (qui traîne, qui
 * a nommé qui). C'est la seule information que `bande_state` rend sur l'attente,
 * et ce n'est pas une limite technique : nommer les retardataires mettrait une
 * pression que ce jeu refuse de créer.
 *
 * L'ÉCRAN NE RAPPELLE PAS QUI VOUS AVEZ NOMMÉ. Le vote est scellé et
 * irréversible — le réafficher n'ouvrirait aucun geste, et poserait le nom d'une
 * personne sur un écran que le voisin de table peut lire par-dessus l'épaule.
 */
function EcranAttente({
  votesExprimes,
  denominateur,
}: {
  votesExprimes: number;
  denominateur: number;
}) {
  return (
    <LobbyCarton className="text-center">
      <h2 className="text-lg font-black text-k-ink">
        Votre vote est enregistré.
      </h2>
      <p className="mt-2 text-sm text-k-body" aria-live="polite">
        <span className="font-black tabular-nums text-k-ink">
          {votesExprimes}
        </span>{" "}
        sur {denominateur}{" "}
        {votesExprimes > 1 ? "ont répondu" : "a répondu"}. Gardez cet écran
        ouvert.
      </p>
    </LobbyCarton>
  );
}

/**
 * LA RÉVÉLATION — des barres, et aucun auteur.
 *
 * ── LES EX ÆQUO SONT TOUS LÀ ──
 *
 * `bande_state` ordonne par voix décroissantes puis pseudo, et rend TOUTES les
 * lignes. Aucune n'est coupée ici : garder « le premier » aurait fait disparaître
 * la moitié d'une égalité, c'est-à-dire effacer quelqu'un que la tablée a nommé.
 *
 * ── LE DÉNOMINATEUR EST CELUI DU TOUR, PAS LE NOMBRE DE VOTANTS ──
 *
 * « 3 personnes sur 5 » : les cinq sont ceux à qui la question a été posée, y
 * compris ceux qui n'ont pas répondu. Recompter sur les seuls votants aurait
 * affiché 100 % pour une voix unique.
 */
function EcranRevelation({
  resultats,
  denominateur,
}: {
  resultats: BandeResultatView[];
  denominateur: number;
}) {
  if (resultats.length === 0) {
    return (
      <LobbyCarton className="text-center">
        <h2 className="text-lg font-black text-k-ink">
          Personne n’a été nommé.
        </h2>
        <p className="mt-2 text-sm text-k-body">
          Tout le monde a passé sur cette question — c’est une réponse comme une
          autre.
        </p>
      </LobbyCarton>
    );
  }

  return (
    <LobbyCarton>
      <h2 className="text-sm font-black uppercase tracking-wide text-k-ink">
        La réponse de la table
      </h2>
      <ul className="mt-3 space-y-3">
        {resultats.map((ligne, index) => (
          <li key={`${ligne.cibleMemberId ?? "parti"}-${ligne.ciblePseudo}-${index}`}>
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-bold text-k-ink">
                {ligne.ciblePseudo}
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-k-ink">
                {ligne.pourcentage}&nbsp;%
              </span>
            </p>
            {/* La barre est DÉCORATIVE : le chiffre et le décompte sont écrits
                juste à côté, en toutes lettres. La faire lire n'ajouterait rien
                à un lecteur d'écran. */}
            <div
              aria-hidden="true"
              className="mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-k-ink/20 bg-white"
            >
              <div
                className="h-full rounded-full bg-k-yellow"
                style={{ width: `${Math.min(100, Math.max(0, ligne.pourcentage))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-k-body">
              {ligne.voix} personne{ligne.voix > 1 ? "s" : ""} sur{" "}
              {denominateur}
            </p>
          </li>
        ))}
      </ul>
    </LobbyCarton>
  );
}

/* ────────────────────────────────────────────────────────────
   LE RÉCAPITULATIF
   ──────────────────────────────────────────────────────────── */

/**
 * LE PORTRAIT DE SESSION — qui a été nommé, et sur quelles questions.
 *
 * ── UNE LECTURE, PAS UN SONDAGE ──
 *
 * `bande_recap` est lue UNE FOIS : la partie est terminée, la salle est fermée,
 * rien de ce document ne changera plus. Continuer à sonder serait payer pour
 * relire la même ligne sur douze téléphones posés sur la même table.
 *
 * ── SEULS LES NOMMÉS Y SONT ──
 *
 * `bande_recap` n'émet pas de ligne pour qui personne n'a nommé, et cet écran
 * n'en fabrique pas : lister tout le monde avec un zéro aurait construit le
 * classement que le cahier exclut — un tableau où chacun lit son rang par le
 * bas. Il n'y a ni gain, ni point, ni podium dans ce fichier.
 */
function EcranRecapitulatif({
  lobbyId,
  sortie,
}: {
  lobbyId: string;
  sortie: SortieApresJeuView | null;
}) {
  const [portrait, setPortrait] = useState<BandeRecapLigneView[] | null>(null);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const recap = await getBandeRecap(lobbyId);
        if (!vivant) return;
        if (recap.state !== "ok") setEchec(true);
        else setPortrait(recap.portrait);
      } catch {
        if (vivant) setEchec(true);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [lobbyId]);

  return (
    <div className="space-y-4">
      <LobbyCarton className="text-center">
        <p className="text-4xl" aria-hidden="true">
          🎭
        </p>
        <h2 className="mt-2 text-xl font-black text-k-ink">
          Le portrait de la bande
        </h2>
      </LobbyCarton>

      {echec && (
        <LobbyCarton className="text-center">
          <p className="text-sm text-k-body">
            Le portrait n’a pas pu être relu. La partie, elle, est bien terminée.
          </p>
        </LobbyCarton>
      )}

      {portrait !== null &&
        (portrait.length === 0 ? (
          <LobbyCarton className="text-center">
            <p className="text-sm text-k-body">
              Personne n’a été nommé de la partie. C’est rare, et c’est permis.
            </p>
          </LobbyCarton>
        ) : (
          <ul className="space-y-3">
            {portrait.map((ligne, index) => (
              <li key={`${ligne.cibleMemberId ?? "parti"}-${ligne.ciblePseudo}-${index}`}>
                <LobbyCarton>
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-lg font-black text-k-ink">
                      {ligne.ciblePseudo}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-k-body">
                      nommé{ligne.foisNomme > 1 ? "e" : ""} {ligne.foisNomme}{" "}
                      fois
                    </span>
                  </p>
                  <ul className="mt-2 space-y-1">
                    {ligne.questions.map((question) => (
                      <li
                        key={question.cle}
                        className="text-sm leading-snug text-k-body"
                      >
                        · {question.texte ?? QUESTION_RETIREE}
                      </li>
                    ))}
                  </ul>
                </LobbyCarton>
              </li>
            ))}
          </ul>
        ))}

      {/* LA PHRASE DE FIN, ET ELLE N'EST PAS DÉCORATIVE. C'est la promesse du
          cahier écrite là où elle se vérifie : aucun votant n'a été nommé de la
          partie, et ce portrait ne quitte pas cette table.
          ELLE PORTE SON SEUIL. La couche technique ne nomme jamais de votant,
          mais à deux l'arithmétique le fait à sa place : une question, une voix,
          et celui qui passe la déduit. Le secret est une propriété du nombre,
          pas seulement du code — la phrase le dit donc. */}
      <LobbyCarton className="text-center">
        <p className="text-sm text-k-body">
          Dès trois joueurs, personne ne saura jamais qui a voté pour qui. Rien
          de tout ceci ne sort de cette table&nbsp;: il n’y a ni gagnant, ni
          classement, ni lot — vous pouvez refermer cet écran.
        </p>
      </LobbyCarton>

      <SortieApresJeu sortie={sortie} />
    </div>
  );
}
