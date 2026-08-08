import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuizLeaderboard } from "@/actions/quiz";
import { loadCalendarSpinBundles } from "@/lib/calendar-spin-bundle";
import { loadQuizPublicContext } from "@/lib/quiz-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { PageOpenBeacon } from "@/components/page-open-beacon";
import { QuizExperience } from "@/components/quiz/quiz-experience";
import { quizThemeTokens } from "@/components/quiz/quiz-theme";
import type { QuizLeaderboardEntry } from "@/lib/quiz";

/**
 * Page publique d'un quiz — DA « Kermesse / carton », déclinée par habillage
 * (restaurant, cave, musée, boutique, sport, entreprise). Le client arrive en
 * scannant le QR du commerce et joue en libre-service, question par question.
 *
 * Rendu DYNAMIQUE : l'état dépend du cookie joueur (questions déjà répondues,
 * score, lot). Aucune écriture au chargement — rejoindre, présenter une question
 * et répondre passent tous par une action explicite.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((slug: string) => loadQuizPublicContext(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await loadContext(slug);
  if (!ctx.ok) return { title: "Quiz", robots: { index: false } };

  const name = ctx.publicState.quiz?.name ?? "Quiz";
  return {
    title: name,
    description: `Jouez au quiz de ${ctx.organization.name} — correction immédiate.`,
    // Page privée par commerce : suivable par lien, pas indexée.
    robots: { index: false },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await loadContext(slug);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (quiz inconnu, archivé, module coupé, abonnement inactif…).
  if (!ctx.ok || !ctx.publicState.quiz) notFound();

  const quiz = ctx.publicState.quiz;

  // Classement : servi uniquement par les modes qui l'exposent au joueur.
  let leaderboard: QuizLeaderboardEntry[] = [];
  if (quiz.rewardMode === "ranking" || quiz.rewardMode === "draw") {
    leaderboard = await getQuizLeaderboard({ quizId: ctx.quizId, limit: 20 });
  }

  // Tour de roue DÉJÀ acquis et non consommé (le joueur revient sur la page) :
  // on précharge SA roue, et elle seule — le joueur y a droit à cet instant.
  // Rien n'est préchargé tant qu'aucun lot n'a été émis pour lui.
  const reward = ctx.publicState.reward;
  const spinBundles =
    reward?.spinGrantToken && reward.targetWheelId
      ? await loadCalendarSpinBundles(
          createAdminClient(),
          [reward.targetWheelId],
          ctx.organization.id,
        )
      : {};
  const spinBundle = reward?.targetWheelId
    ? (spinBundles[reward.targetWheelId] ?? null)
    : null;

  const tokens = quizThemeTokens(quiz.theme);

  return (
    <PlayerPageShell pageStyle={tokens.pageStyle} decor={tokens.decor}>
      <PageOpenBeacon module="quiz" publicId={ctx.publicSlug} />
      <QuizExperience
        quizId={ctx.quizId}
        publicSlug={ctx.publicSlug}
        organizationName={ctx.organization.name}
        organizationId={ctx.organization.id}
        logoUrl={ctx.organization.logo_url}
        initialState={ctx.publicState}
        initialLeaderboard={leaderboard}
        initialSpinBundle={spinBundle}
        shareEnabled={ctx.shareEnabled}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Quiz proposé par {ctx.organization.name} · propulsé par{" "}
        <Link
          href="/?utm_source=quiz&utm_medium=footer"
          className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
        >
          Lastchance
        </Link>
      </footer>
    </PlayerPageShell>
  );
}
