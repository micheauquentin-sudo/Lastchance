"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getLobbyState,
  joinLobby,
  leaveLobby,
  lockLobby,
  type JoinLobbyOutcome,
} from "@/actions/lobby";
import type { LobbyStateView } from "@/lib/lobby";
import type { ActionResult } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { LobbyCarton } from "@/components/lobby/lobby-shell";
import { messageRefusEntree } from "@/components/lobby/refus";

/**
 * `/lobby/[code]` — l'écran unique du socle : on y entre, puis on y attend.
 *
 * ── Deux écrans, un seul composant, et pourquoi ──
 *
 * « Rejoindre » et « salle d'attente » ne sont pas deux pages : c'est le MÊME
 * salon vu avant et après l'entrée. Les séparer en routes obligerait à passer
 * l'identifiant du lobby dans l'URL — c'est-à-dire à publier ce que la base
 * garde derrière l'appartenance.
 *
 * ── QUI DÉCIDE DE LA MOITIÉ AFFICHÉE : LE SERVEUR ──
 *
 * `dejaMembre` vient de la page, qui a lu le cookie httpOnly de CETTE salle sur
 * la requête. Ce composant n'a plus aucune mémoire à lui : il ne devine pas
 * l'appartenance, il la reçoit. Après une entrée ou une sortie réussie, il ne
 * bascule donc pas d'écran tout seul — il demande au serveur de redire l'état
 * (`router.refresh()`), et la vérité reste au même endroit. Un état client qui
 * doublerait le cookie finirait par le contredire : lien partagé rouvert dans un
 * autre onglet, rechargement sur un second appareil, cookie expiré avant la
 * mémoire d'onglet.
 *
 * ── Le scrutin, et son budget ──
 *
 * Une lecture toutes les 3 s PAR ÉCRAN OUVERT, suspendue dès que l'onglet
 * passe en arrière-plan (`document.hidden`) et reprise à la première seconde de
 * retour au premier plan. Pire cas d'un salon plein de douze : quatre lectures
 * par seconde — et en pratique bien moins, un téléphone posé sur une table
 * s'éteignant tout seul. Le scrutin S'ARRÊTE DÉFINITIVEMENT sur un état
 * terminal (`locked`, `closed`, `expired`) : rien n'en bouge plus, continuer
 * serait payer pour relire la même ligne.
 */

/** Cadence du scrutin, en millisecondes. */
const INTERVALLE_MS = 3000;

/**
 * La moitié LISIBLE de `LobbyStateView`. L'autre moitié — `unavailable` — n'est
 * pas un état de salle mais un refus, et elle a son propre écran : la garder
 * dans le type de rendu obligerait chaque accès à `status` à repasser par une
 * garde qui a déjà été faite une fois, au moment de la lecture.
 */
type SalleView = Extract<LobbyStateView, { state: "ok" }>;

/** États après lesquels plus rien ne change : on cesse de lire. */
const TERMINAUX: ReadonlySet<string> = new Set(["locked", "closed", "expired"]);

/** Le message d'indisponibilité, à l'identique partout — voir `refus.ts`. */
const INDISPONIBLE = messageRefusEntree("indisponible");

/**
 * Ce qu'il faut dire d'une tentative d'entrée qui n'a pas abouti, ou rien.
 *
 * Deux canaux, et ils ne disent pas la même chose : `{ ok: false }` est une
 * PANNE ou une saisie à corriger — son message vient de l'action et s'affiche
 * tel quel ; `{ ok: true }` avec un `etat` autre que « joined » est un refus
 * NORMAL, retraduit pour quelqu'un qui tient un code dans la main.
 */
function messageEchecEntree(
  etat: ActionResult<JoinLobbyOutcome> | null,
): string | undefined {
  if (!etat) return undefined;
  if (!etat.ok) return etat.error;
  return etat.data.etat === "joined"
    ? undefined
    : messageRefusEntree(etat.data.etat);
}

export function SalonLobby({
  code,
  lobbyId,
  dejaMembre,
}: {
  code: string;
  lobbyId: string;
  dejaMembre: boolean;
}) {
  return dejaMembre ? (
    <SalleAttente lobbyId={lobbyId} />
  ) : (
    <EcranRejoindre code={code} />
  );
}

/* ────────────────────────────────────────────────────────────
   Entrer par le code
   ──────────────────────────────────────────────────────────── */

function EcranRejoindre({ code }: { code: string }) {
  const [etat, action, enCours] = useActionState(joinLobby, null);
  const router = useRouter();
  const idPseudo = useId();

  // ENTRÉ : le cookie de la salle vient d'être posé PAR L'ACTION, côté serveur.
  // On ne bascule donc pas d'écran ici — on redemande la page, qui relira ce
  // cookie et peindra la salle d'attente. C'est un aller-retour de plus, et
  // c'est le prix d'une seule source de vérité : l'alternative était un état
  // client qui affirme l'appartenance sans jamais pouvoir la vérifier.
  const entre = Boolean(etat && etat.ok && etat.data.etat === "joined");
  useEffect(() => {
    if (entre) router.refresh();
  }, [entre, router]);

  return (
    <LobbyCarton>
      <form action={action} className="space-y-5">
        <input type="hidden" name="code" value={code} />
        <div>
          <Label htmlFor={idPseudo}>Votre prénom ou pseudo</Label>
          <Input
            id={idPseudo}
            name="pseudo"
            type="text"
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            maxLength={24}
            required
            placeholder="Camille"
          />
          <p className="mt-1.5 text-xs text-k-body/80">
            C’est le nom que les autres verront dans le salon.
          </p>
        </div>

        {/* LES TROIS REFUS SONT DISTINCTS À L'ÉCRAN — mais « expiré », « clos »,
            « inventé » et « malformé » n'en font qu'UN. La base les confond
            délibérément (`join_player_lobby`) pour ne pas apprendre à qui sonde
            ce qui existe ; les distinguer ici rétablirait l'oracle. */}
        <FieldError message={messageEchecEntree(etat)} />

        <Button disabled={enCours || entre} className="w-full">
          {enCours ? "Entrée…" : "Rejoindre le salon"}
        </Button>
      </form>
    </LobbyCarton>
  );
}

/* ────────────────────────────────────────────────────────────
   Salle d'attente
   ──────────────────────────────────────────────────────────── */

function SalleAttente({ lobbyId }: { lobbyId: string }) {
  const [vue, setVue] = useState<SalleView | null>(null);
  const [perdu, setPerdu] = useState(false);
  const [enAction, demarrer] = useTransition();
  const lireRef = useRef<() => void>(() => undefined);
  const router = useRouter();

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
      // Onglet en arrière-plan : rien n'est lu. C'est la moitié du budget.
      if (arrete || document.hidden) return;
      try {
        const suivant = await getLobbyState(lobbyId);
        if (!vivant) return;
        if (suivant.state !== "ok") {
          // Refus MUET de `lobby_state` : salle inconnue, cookie effacé OU
          // jeton non membre, indistinctement — et l'écran n'en dira pas plus
          // que la base, qui les confond exprès.
          setPerdu(true);
          stopper();
          return;
        }
        setVue(suivant);
        if (TERMINAUX.has(suivant.status)) stopper();
      } catch {
        // Un échec isolé est la vie normale d'un téléphone en salle : le
        // scrutin suivant rattrape, l'écran garde son dernier état connu.
      }
    };

    lireRef.current = () => {
      void lire();
    };
    void lire();
    minuterie = window.setInterval(() => {
      void lire();
    }, INTERVALLE_MS);

    const surVisibilite = () => {
      if (!document.hidden) void lire();
    };
    document.addEventListener("visibilitychange", surVisibilite);

    return () => {
      vivant = false;
      lireRef.current = () => undefined;
      stopper();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [lobbyId]);

  // SORTIR, C'EST LE SERVEUR QUI L'ACTE : `leaveLobby` retire le membre ET
  // efface le cookie de la salle. La page, redemandée juste après, n'y voit plus
  // d'appartenance et repeint l'écran « rejoindre ». Le `finally` reste : une
  // panne de transport ne doit pas laisser le bouton sans réponse — au pire le
  // rafraîchissement retrouve la salle, ce que le TTL finira de régler.
  const quitter = () => {
    demarrer(async () => {
      try {
        await leaveLobby(lobbyId);
      } finally {
        router.refresh();
      }
    });
  };

  const verrouiller = () => {
    demarrer(async () => {
      await lockLobby(lobbyId);
      lireRef.current();
    });
  };

  if (perdu) {
    // MÊME GESTE QUE « QUITTER », et c'est voulu : le cookie de cette salle ne
    // vaut plus rien (effacé ailleurs, salle disparue, jeton non membre). Le
    // faire retirer par le serveur est la seule façon de revenir à l'écran
    // « rejoindre » — un bouton qui se contenterait de recharger repeindrait la
    // même impasse, cookie mort en main.
    return (
      <LobbyCarton>
        <p className="text-center text-sm text-k-body">{INDISPONIBLE}</p>
        <Button
          variant="secondary"
          className="mt-4 w-full"
          disabled={enAction}
          onClick={quitter}
        >
          Réessayer avec ce code
        </Button>
      </LobbyCarton>
    );
  }

  if (!vue) {
    return (
      <LobbyCarton>
        <p className="text-center text-sm text-k-body" aria-live="polite">
          Ouverture du salon…
        </p>
      </LobbyCarton>
    );
  }

  const restants = msRestants(vue.expiresAt);
  // Arrondi PAR EXCÈS et plancher à une minute : « expire dans ~0 min » sur un
  // salon encore vivant serait un mensonge dans le sens qui coûte — celui qui
  // fait partir les gens.
  const restantes = Math.max(1, Math.ceil(restants / 60000));
  // L'EXPIRATION SE CONSTATE, elle ne s'écrit pas (ADR-111) : un salon dont la
  // date de mort est passée est mort, même si sa colonne `status` dit encore
  // « lobby ». L'écran applique la même règle que la base plutôt que d'attendre
  // qu'une écriture la lui apprenne.
  if (vue.status === "expired" || restants <= 0) {
    return <EcranExpire />;
  }

  if (vue.status === "locked") {
    return <EcranDepart membres={vue.membres.length} />;
  }

  if (vue.status === "closed") {
    return (
      <LobbyCarton>
        <p className="text-center text-sm text-k-body">
          Ce salon a été refermé. Demandez-en un nouveau à la personne qui vous
          a partagé le code.
        </p>
      </LobbyCarton>
    );
  }

  const hote = vue.joinCode !== null;
  const total = vue.membres.length;

  return (
    <div className="space-y-4">
      {hote && (
        <LobbyCarton className="text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-k-body">
            Montrez-le
          </p>
          {/* `tracking` large et `tabular-nums` : ce code se lit à voix haute
              par-dessus une table, et se recopie sur un autre téléphone. */}
          <p className="mt-1 font-mono text-4xl font-black tabular-nums tracking-[0.2em] text-k-ink">
            {vue.joinCode}
          </p>
          <p className="mt-2 text-xs text-k-body">
            Les autres entrent ce code pour vous rejoindre.
          </p>
        </LobbyCarton>
      )}

      <LobbyCarton>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-k-ink">
            Dans le salon
          </h2>
          <p className="text-sm font-bold tabular-nums text-k-body">
            <span aria-hidden="true">
              {total}/{vue.capacite}
            </span>
            <span className="sr-only">
              {total} {total > 1 ? "personnes" : "personne"} sur {vue.capacite}
            </span>
          </p>
        </div>

        <ol className="mt-3 space-y-1.5">
          {vue.membres.map((membre) => (
            <li
              key={`${membre.rang}-${membre.pseudo}`}
              className="flex items-center gap-2.5 rounded-xl border-2 border-k-ink/15 px-3 py-2"
            >
              <span className="w-5 shrink-0 text-sm font-black tabular-nums text-k-body">
                {membre.rang}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
                {membre.pseudo}
              </span>
              {membre.estMoi && (
                <span className="shrink-0 rounded-full border-2 border-k-ink bg-k-yellow px-2 py-0.5 text-[11px] font-black text-k-ink">
                  vous
                </span>
              )}
            </li>
          ))}
        </ol>

        <p className="mt-3 text-xs text-k-body" aria-live="polite">
          Ce salon expire dans ~{restantes}&nbsp;min.
        </p>
      </LobbyCarton>

      <div className="space-y-2">
        {hote && (
          <>
            {/* DÉSACTIVÉ SOUS DEUX MEMBRES, et le bouton n'est que la politesse :
                `lock_player_lobby` refuse de son côté, c'est LUI le filet. Un
                bouton grisé explique, il ne garde pas. */}
            <Button
              className="w-full"
              disabled={total < 2 || enAction}
              onClick={verrouiller}
            >
              Verrouiller et commencer
            </Button>
            {total < 2 && (
              <p className="text-center text-xs text-k-body">
                Attendez qu’au moins une autre personne vous rejoigne.
              </p>
            )}
          </>
        )}
        <Button
          variant="ghost"
          className="w-full"
          disabled={enAction}
          onClick={quitter}
        >
          Quitter le salon
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Écrans terminaux
   ──────────────────────────────────────────────────────────── */

function EcranDepart({ membres }: { membres: number }) {
  return (
    <LobbyCarton className="text-center">
      <p className="text-4xl" aria-hidden="true">
        🎬
      </p>
      <h2 className="mt-2 text-xl font-black text-k-ink">
        La partie commence
      </h2>
      <p className="mt-2 text-sm text-k-body">
        Le salon est fermé, vous êtes {membres}. Gardez cet écran ouvert.
      </p>
      {/* Le jeu lui-même appartient à L17 (Duo Miroir) et L18 (Portrait de la
          Bande). Ce lot livre la salle d'attente, pas ce qu'on y joue : cet
          écran est le point de branchement, et il le dit sans le promettre. */}
    </LobbyCarton>
  );
}

/**
 * Le salon a fini de vivre pendant qu'on le regardait.
 *
 * AUCUN LIEN « ouvrir un nouveau salon », et c'est un renoncement assumé : ce
 * lien exigeait le slug du commerce, que seule la mémoire d'onglet du créateur
 * portait — donc il n'apparaissait déjà que pour l'hôte, et jamais pour les
 * invités arrivés par un code partagé. Le reconstruire côté serveur voudrait
 * dire nommer le commerce à quiconque tient un code, ce que ce chemin refuse
 * partout ailleurs. L'écran se tait plutôt que d'inventer un lien.
 */
function EcranExpire() {
  return (
    <LobbyCarton className="text-center">
      <p className="text-sm text-k-body">
        Ce salon a pris fin — les salons ne vivent qu’une petite demi-heure.
      </p>
    </LobbyCarton>
  );
}

/**
 * Millisecondes restantes avant la mort du salon, jamais négatives.
 *
 * `String(...)` avant `Date.parse` : l'action peut rendre l'instant en texte
 * ISO comme en `Date`, et cet écran n'a pas à choisir pour elle. Une date
 * illisible rend zéro — donc « expiré », le côté prudent : un salon qu'on ne
 * sait pas dater ne doit pas être présenté comme éternel.
 */
function msRestants(expiresAt: SalleView["expiresAt"]): number {
  const fin = Date.parse(String(expiresAt));
  if (Number.isNaN(fin)) return 0;
  return Math.max(0, fin - Date.now());
}
