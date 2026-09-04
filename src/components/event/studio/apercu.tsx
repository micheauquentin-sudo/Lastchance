"use client";

import { useMemo } from "react";
import { CadreApercu } from "@/components/studio/cadre-apercu";
import { EventPlayer } from "@/components/event/event-player";
import type { EditorQuestion } from "@/components/dashboard/event-editor";
import type { EtatRythme } from "@/components/event/studio/etat";
import type { EventPublicState } from "@/lib/event";

/**
 * L'APERÇU DE LA SOIRÉE — ET C'EST LA VRAIE PAGE JOUEUR (VIT-47).
 *
 * Il monte `EventPlayer`, le composant EXACT que sert `/event/[code]`, dans un
 * cadre à la largeur de cette page. Ce qui se voit ici est ce qui sera servi :
 * l'en-tête avec le logo et le nom de la soirée, la carte de question, les
 * boutons de réponse tactiles, le salon d'attente.
 *
 * ── POURQUOI PAS UNE COPIE REDESSINÉE ──
 *
 * Parce qu'une copie se met à mentir dès que la page joueur bouge, et que c'est
 * le seul défaut d'un aperçu qui ne se VOIT pas (ADR-152) : rien ne casse, tout
 * a l'air de fonctionner, et l'écart ne se découvre qu'en salle un vendredi
 * soir. Le prix à payer est de couper les actions serveur du parcours, une par
 * une — c'est fait dans `event-player.tsx` et `use-event-poll.ts`, sous le
 * drapeau `apercu`, et l'en-tête de `EventPlayer` les énumère.
 *
 * ── L'ÉTAT EST FABRIQUÉ, ET IL NE MENT PAS POUR AUTANT ──
 *
 * Il n'y a aucune session en direct pendant qu'on prépare une soirée : l'état
 * public n'existe donc pas encore. Il est construit ici, à partir de ce que le
 * commerçant a réellement enregistré — sa question, ses options, son lot — et
 * de rien d'autre. Deux valeurs sont posées et méritent leur raison :
 *
 *  · `startedAt: null`. Le décompte se dérive des instants SERVEUR : simuler un
 *    lancement ferait tourner un vrai compte à rebours dans l'aperçu, qui
 *    atteindrait zéro pendant que le commerçant règle ses points et afficherait
 *    « Temps écoulé » sur une question que personne n'a jouée. `computeCountdown`
 *    rend alors un chrono PLEIN et non expiré — exactement l'instant où la
 *    question s'affiche en salle, qui est celui qu'on veut régler.
 *  · `you` à zéro. Le bandeau de score s'affiche donc, vide, comme au premier
 *    instant d'une partie.
 *
 * ── CE QUI N'EST PAS DANS LE CADRE, ET C'EST ANNONCÉ ──
 *
 * 1. L'ÉCRAN D'INSCRIPTION (pseudo, avatar). Il porte `joinEvent` et le
 *    Turnstile ; le monter ferait entrer l'inscription dans un écran de
 *    réglages. Il ne dépend d'aucun réglage de ce studio, donc rien ne se règle
 *    en le regardant.
 * 2. LA RÉVÉLATION, LE CLASSEMENT ET L'ÉCRAN DE FIN. Ils dépendent d'une partie
 *    JOUÉE — des réponses, un podium, un code EVENT- émis. Les fabriquer aurait
 *    montré un classement inventé, c'est-à-dire le faux aperçu qu'on cherche à
 *    éviter. L'écran de fin, en outre, est le seul à porter une action serveur
 *    résiduelle (`invitationPasseport`).
 * 3. L'ÉCRAN DE SALLE (le vidéoprojecteur). C'est un second média, pas la même
 *    page : il se projette, il ne se tient pas dans la main. Le cadre d'un
 *    studio est celui du téléphone.
 *
 * Ces trois manques sont ANNONCÉS dans la bannière. C'est la différence entre un
 * aperçu partiel et un faux aperçu : le premier dit ce qu'il ne montre pas.
 */

/** Largeur de `EventPlayer` — `mx-auto max-w-md`, soit 448 px. Voir plus bas. */
const CADRE = "w-full max-w-[448px]";

export function ApercuSoiree({
  gameName,
  organizationName,
  logoUrl,
  question,
  rythme,
  salle,
  /**
   * La phase montrée, décidée par l'étape ouverte. « Vos questions » et « Le
   * temps de réponse » regardent une question ; « Les salles », « Le lot » et
   * « Le QR » regardent le salon, parce que c'est l'écran sur lequel le client
   * tombe en scannant l'affiche qu'on est en train de préparer.
   */
  phase,
}: {
  gameName: string;
  organizationName: string;
  logoUrl: string | null;
  /** La question regardée, `null` si la soirée n'en a aucune. */
  question: EditorQuestion | null;
  /** Le rythme EN COURS DE RÉGLAGE — l'aperçu suit la saisie, pas la base. */
  rythme: EtatRythme | null;
  /** Le code d'accès de la salle regardée, pour le lien d'invitation du salon. */
  salle: { joinCode: string; rewardStock: number } | null;
  phase: "question" | "lobby";
}) {
  const etat = useMemo<EventPublicState>(() => {
    const joinCode = salle?.joinCode ?? "XXXXXX";
    return {
      state: "ok",
      session: {
        id: "apercu",
        revision: 0,
        status: phase === "question" ? "live" : "lobby",
        // `question_active` et non `question` : c'est le nom de la PHASE dans la
        // machine à états serveur, et `viewForPhase` est la seule chose qui la
        // traduit en écran. La prop de ce composant nomme l'écran voulu, la
        // valeur ci-dessous nomme la phase qui le produit — les confondre
        // ferait retomber l'aperçu sur le salon d'attente par le `default`.
        phase: phase === "question" ? "question_active" : "lobby",
        joinCode,
        rewardLabel: "",
        rewardStock: salle?.rewardStock ?? 0,
        rewardClaimedCount: 0,
        maxParticipants: 100,
      },
      question:
        phase === "question" && question
          ? {
              id: question.id,
              questionType: question.questionType,
              prompt: question.prompt,
              // LE TEMPS EN COURS DE SAISIE, pas celui de la base : c'est
              // l'étape « Le temps de réponse » qui pilote ce nombre, et un
              // aperçu qui montrerait la valeur d'avant ne servirait à rien.
              timeLimitSeconds:
                rythme?.timeLimitSeconds ?? question.timeLimitSeconds,
              // JAMAIS D'INSTANT DE LANCEMENT — voir l'en-tête du fichier.
              startedAt: null,
              // `is_correct` n'a AUCUNE destination dans ce type : l'aperçu ne
              // PEUT donc pas laisser fuir la bonne réponse, comme la vraie page
              // (invariant #1 de `src/lib/event.ts`).
              options: question.options.map((o, position) => ({
                id: o.id,
                label: o.label,
                position,
              })),
            }
          : null,
      correctOptionId: null,
      distribution: null,
      leaderboard: [],
      you: { score: 0, rank: 0, win: null },
      serverNow: null,
    };
  }, [phase, question, rythme, salle]);

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `EventPlayer` pose sur son propre conteneur. Un cadre plus
         large rendrait une mise en page que personne ne verra. La valeur reste
         LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre={CADRE}
      legende="Aperçu — la soirée telle que la voient vos clients sur leur téléphone. Vos modifications s'enregistrent toutes seules."
      banniere={
        <p
          role="status"
          className={`${CADRE} shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink`}
        >
          Aperçu : répondre ne fait rien ici, et le chronomètre ne tourne pas.
          L&apos;écran d&apos;inscription, la révélation, le classement et
          l&apos;écran de salle n&apos;y sont pas — vos clients, eux, les
          verront.
        </p>
      }
    >
      <div className="bg-k-bg">
        <EventPlayer
          /* REMONTÉ À CHAQUE QUESTION ET À CHAQUE PHASE : `EventPlayer` garde en
             mémoire locale la réponse cliquée pour la question courante. Sans
             la clé, changer de question dans le sélecteur laisserait la coche
             sur l'ancienne. */
          key={`${phase}-${question?.id ?? "vide"}`}
          apercu
          sessionId="apercu"
          joinCode={etat.session?.joinCode ?? "XXXXXX"}
          organizationName={organizationName}
          logoUrl={logoUrl}
          title={gameName}
          initial={etat}
          hasIdentity
          realtimeEnabled={false}
        />
        {phase === "question" && !question ? (
          <p className="mx-auto max-w-md px-4 pb-8 text-center text-sm font-bold text-k-body">
            Cette soirée n&apos;a encore aucune question : écrivez-en une à
            l&apos;étape « Vos questions » pour la voir apparaître ici.
          </p>
        ) : null}
      </div>
    </CadreApercu>
  );
}
