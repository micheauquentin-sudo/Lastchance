"use client";

import { useMemo } from "react";
import { CadreApercu } from "@/components/studio/cadre-apercu";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { QuizQuestionCard } from "@/components/quiz/quiz-question-card";
import { quizThemeTokens } from "@/components/quiz/quiz-theme";
import { fondPourQuizTheme } from "@/lib/fonds-ecran";
import type { DashboardQuizQuestion } from "@/components/dashboard/quiz-editor";
import type { QuizPlayableQuestion } from "@/lib/quiz";
import type { EtatQuiz } from "@/components/quiz/studio/etat";

/**
 * L'APERÇU DU QUIZ — ET C'EST LA VRAIE CARTE DE QUESTION (VIT-41).
 *
 * Il monte `QuizQuestionCard`, le composant EXACT que sert `/quiz/[slug]`, dans
 * `PlayerPageShell` avec le `pageStyle` et le fond du thème — les mêmes que la
 * page publique (`src/app/(player)/quiz/[slug]/page.tsx`). Ce qui se voit ici
 * est ce qui sera servi.
 *
 * `QuizQuestionCard` s'y prête sans une ligne d'adaptation, et c'est ce qui rend
 * l'aperçu possible : il est PUREMENT piloté par ses props et ses callbacks, il
 * n'importe aucune action serveur, et sa vue « question jouable »
 * (`QuizPlayableQuestion`) N'A AUCUN champ pour la bonne réponse — l'aperçu ne
 * PEUT donc pas laisser fuir ce qu'un joueur ne verrait qu'après avoir répondu.
 *
 * ── CE QUI N'EST PAS DANS LE CADRE, ET POURQUOI ON NE L'A PAS DESSINÉ ──
 *
 * 1. L'EN-TÊTE (logo, nom de l'établissement, nom du quiz). Le composant
 *    `Header` est privé de `quiz-experience.tsx`, qui importe SIX actions
 *    serveur : le monter ici ferait entrer tout le parcours joueur — inscription,
 *    soumission de réponse, roue offerte — dans l'écran de réglages. En
 *    redessiner une copie aurait été pire : deux en-têtes à tenir d'accord, et
 *    un aperçu qui se met à mentir dès que l'un des deux bouge (ADR-152).
 * 2. L'ÉCRAN D'ACCUEIL, donc la consigne d'introduction. Même raison, même
 *    fichier. L'étape « L'habillage » le dit en toutes lettres sous le champ.
 * 3. LE CHRONOMÈTRE. Le décompte se dérive des instants SERVEUR (`startedAt`,
 *    `serverNow`) : les simuler ferait tourner un vrai compte à rebours dans
 *    l'aperçu, qui atteindrait zéro pendant que le commerçant règle ses
 *    couleurs et afficherait alors « temps écoulé » sur une page que personne
 *    n'a jouée. Un aperçu figé sur un état que le joueur n'aura pas est
 *    exactement le défaut qu'on cherche à éviter ; ils restent donc `null`, et
 *    la carte omet la jauge — comme pour une question sans chronomètre.
 *
 * Ces trois manques sont ANNONCÉS dans la bannière. C'est la différence entre
 * un aperçu partiel et un faux aperçu : le premier dit ce qu'il ne montre pas.
 */

/** Aucun geste ne part au serveur depuis un aperçu. */
const rien = () => {};

/**
 * La question du commerçant, vue comme le joueur la reçoit.
 *
 * La conversion est une PROJECTION, jamais un enrichissement : chaque champ
 * vient de la ligne, `correctAnswer` n'a pas de destination dans le type cible,
 * et rien n'est inventé. C'est la même forme que produit `mapPlayableQuestion`
 * côté serveur.
 */
function versQuestionJouable(
  question: DashboardQuizQuestion,
): QuizPlayableQuestion {
  return {
    id: question.id,
    position: question.position,
    questionType: question.questionType,
    preset: question.preset,
    prompt: question.prompt,
    imageUrl: question.imageUrl,
    options: question.options,
    rankingSize: question.rankingSize,
    tolerance: question.tolerance,
    points: question.points,
    timeLimitSeconds: question.timeLimitSeconds,
  };
}

export function ApercuQuiz({
  etat,
  questions,
  selection,
}: {
  etat: EtatQuiz;
  /** Les questions EN BASE, dans l'ordre de jeu. */
  questions: DashboardQuizQuestion[];
  /** La question montrée, pilotée par le sélecteur du bandeau. */
  selection: string | null;
}) {
  const tokens = quizThemeTokens(etat.theme);

  const index = useMemo(() => {
    const trouve = questions.findIndex((q) => q.id === selection);
    return trouve >= 0 ? trouve : 0;
  }, [questions, selection]);

  const question = questions[index] ?? null;

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `QuizExperience` pose sur son propre conteneur. Un cadre plus
         large rendrait une mise en page que personne ne verra. La valeur reste
         LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre="w-full max-w-[448px]"
      legende="Aperçu — la question telle que la voient vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <p
          role="status"
          className="w-full max-w-[448px] shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
        >
          Aperçu : répondre ne fait rien ici. L&apos;en-tête (votre logo, le nom
          du quiz), l&apos;écran d&apos;accueil et le décompte du chronomètre
          n&apos;y sont pas — vos clients, eux, les verront.
        </p>
      }
    >
      <PlayerPageShell
        pageStyle={tokens.pageStyle}
        fond={fondPourQuizTheme(tokens.key)}
      >
        {/* `mx-auto max-w-md px-4 py-8` : le conteneur EXACT de
            `QuizExperience`. Le recopier est le seul moyen d'obtenir la même
            gouttière sans importer un composant qui traîne six actions
            serveur — et il est ici, à côté de la mention de sa source, plutôt
            que dilué dans le cadre. */}
        <div className="mx-auto max-w-md px-4 py-8">
          {question ? (
            <QuizQuestionCard
              /* REMONTÉE À CHAQUE QUESTION : la carte initialise sa saisie
                 depuis ses props une seule fois. Sans la clé, changer de
                 question garderait la réponse cliquée sur la précédente. */
              key={question.id}
              index={index}
              total={questions.length}
              question={versQuestionJouable(question)}
              startedAt={null}
              serverNow={null}
              receivedAt={0}
              tokens={tokens}
              /* `null` : aucun verdict, donc l'interface reste ouverte — c'est
                 ce que voit un joueur qui n'a pas encore répondu. */
              result={null}
              submitting={false}
              nextPending={false}
              error={null}
              onSubmit={rien}
              onNext={rien}
              onForfeit={rien}
            />
          ) : (
            <p className="k-border rounded-2xl bg-white p-5 text-center text-sm font-bold text-k-body shadow-[6px_6px_0_var(--color-k-ink)]">
              Ce quiz n&apos;a encore aucune question : écrivez-en une à
              l&apos;étape « Les questions » pour la voir apparaître ici.
            </p>
          )}
        </div>
      </PlayerPageShell>
    </CadreApercu>
  );
}
