import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { hasQuizAccess } from "@/lib/quiz-context";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {
  QuizQuestionsEditor,
  QuizRewardEditor,
  QuizSettings,
  QuizStatusControls,
  type DashboardQuiz,
  type DashboardQuizQuestion,
  type QuizWheelOption,
} from "@/components/dashboard/quiz-editor";
import { QuizStatusBadge } from "@/components/dashboard/quiz-status";
import { PublicShare } from "@/components/dashboard/public-share";
import { quizThemeTokens } from "@/components/quiz/quiz-theme";
import type { QuizOption, QuizQuestionType } from "@/lib/quiz";

export const metadata: Metadata = { title: "Quiz" };

const QUIZ_COLUMNS =
  "id, name, theme, status, public_slug, intro_text, reward_mode, reward_threshold, draw_top_n, draw_state, drawn_at, reward_label, reward_details, reward_stock, reward_claimed_count, target_wheel_id, code_ttl_days";

interface QuizRow {
  id: string;
  name: string;
  theme: DashboardQuiz["theme"];
  status: DashboardQuiz["status"];
  public_slug: string;
  intro_text: string | null;
  reward_mode: DashboardQuiz["rewardMode"];
  reward_threshold: number | null;
  draw_top_n: number | null;
  draw_state: "pending" | "done";
  drawn_at: string | null;
  reward_label: string | null;
  reward_details: string | null;
  reward_stock: number;
  reward_claimed_count: number;
  target_wheel_id: string | null;
  code_ttl_days: number | null;
}

interface QuestionRow {
  id: string;
  position: number;
  question_type: QuizQuestionType;
  preset: string;
  prompt: string;
  options: unknown;
  correct_answer: unknown;
  image_url: string | null;
  time_limit_seconds: number | null;
  points: number;
  tolerance: number | null;
  ranking_size: number | null;
}

interface WheelRow {
  id: string;
  name: string;
}
interface PrizeRow {
  wheel_id: string;
  label: string;
  is_losing: boolean;
  stock: number | null;
  weight: number;
}

/** Options ordonnées d'une question, sans jamais faire confiance au jsonb. */
function toOptions(raw: unknown): QuizOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    if (!id) return [];
    return [{ id, label: typeof record.label === "string" ? record.label : "" }];
  });
}

/**
 * Roues + état de leurs lots, tel que le sélecteur de tour offert en a besoin.
 * Miroir du filtre de tirage d'un tour offert (`is_active and weight > 0 and
 * (is_losing or stock > 0)`) : un lot non perdant « vide = illimité » est hors
 * tirage — c'est ce que l'avertissement annonce au commerçant.
 */
function toWheelOptions(wheels: WheelRow[], prizes: PrizeRow[]): QuizWheelOption[] {
  const byWheel = new Map<string, PrizeRow[]>();
  for (const prize of prizes) {
    const list = byWheel.get(prize.wheel_id) ?? [];
    list.push(prize);
    byWheel.set(prize.wheel_id, list);
  }
  return wheels.map((w) => {
    const drawn = (byWheel.get(w.id) ?? []).filter((p) => p.weight > 0);
    return {
      id: w.id,
      name: w.name,
      unlimitedPrizes: drawn
        .filter((p) => !p.is_losing && p.stock === null)
        .map((p) => p.label),
      hasDrawablePrize: drawn.some((p) => p.is_losing || (p.stock ?? 0) > 0),
    };
  });
}

export default async function QuizDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await getUserAndOrg();
  if (!organization || !hasQuizAccess(organization)) notFound();
  const supabase = await createClient();

  const [
    { data: quizRow },
    { data: questionRows },
    { data: wheelRows },
    { data: prizeRows },
  ] = await Promise.all([
    supabase
      .from("quizzes")
      .select(QUIZ_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("quiz_questions")
      .select(
        "id, position, question_type, preset, prompt, options, correct_answer, image_url, time_limit_seconds, points, tolerance, ranking_size",
      )
      .eq("quiz_id", id)
      .eq("organization_id", organization.id)
      .order("position", { ascending: true }),
    supabase
      .from("wheels")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("prizes")
      .select("wheel_id, label, is_losing, stock, weight")
      .eq("organization_id", organization.id)
      .eq("is_active", true),
  ]);

  if (!quizRow) notFound();
  const row = quizRow as unknown as QuizRow;

  const quiz: DashboardQuiz = {
    id: row.id,
    name: row.name,
    theme: row.theme,
    status: row.status,
    publicSlug: row.public_slug,
    introText: row.intro_text,
    rewardMode: row.reward_mode,
    rewardThreshold: row.reward_threshold,
    drawTopN: row.draw_top_n,
    rewardLabel: row.reward_label ?? "",
    rewardDetails: row.reward_details,
    rewardStock: row.reward_stock,
    rewardClaimedCount: row.reward_claimed_count,
    targetWheelId: row.target_wheel_id,
    drawState: row.draw_state,
    drawnAt: row.drawn_at,
    codeTtlDays: row.code_ttl_days,
  };

  const questions: DashboardQuizQuestion[] = (
    (questionRows ?? []) as unknown as QuestionRow[]
  ).map((q) => ({
    id: q.id,
    position: q.position,
    questionType: q.question_type,
    preset: q.preset,
    prompt: q.prompt,
    options: toOptions(q.options),
    correctAnswer: q.correct_answer ?? null,
    imageUrl: q.image_url,
    timeLimitSeconds: q.time_limit_seconds,
    points: q.points,
    tolerance: q.tolerance,
    rankingSize: q.ranking_size,
  }));

  const wheels = toWheelOptions(
    (wheelRows ?? []) as WheelRow[],
    (prizeRows ?? []) as PrizeRow[],
  );
  const tokens = quizThemeTokens(quiz.theme);
  // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif. Même source
  // que les pronostics (APP_URL), pour que le QR imprimé reste valable.
  const publicUrl = `${APP_URL}/quiz/${quiz.publicSlug ?? quiz.id}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/quiz" className="text-sm text-zinc-500 hover:text-k-ink">
          ← Quiz
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {tokens.titleEmoji}
          </span>
          <h1 className="text-2xl font-bold">{quiz.name}</h1>
          <QuizStatusBadge status={quiz.status} />
        </div>
      </div>

      <QuizStatusControls quiz={quiz} />

      {/* §4 du cahier : le QR ne rend pas jouable un brouillon. On n'affiche
          donc le QR et le lien QUE si le quiz est publié — un QR imprimé et
          collé en vitrine survit à la page qui l'a produit, alors qu'un
          bandeau d'avertissement, non. Le commerçant non publié lit pourquoi
          le bloc manque plutôt que de recevoir un code mort. */}
      <Card>
        <h2 className="font-semibold mb-1">QR code et lien du quiz</h2>
        {quiz.status === "active" ? (
          <>
            <p className="text-sm text-zinc-500 mb-3">
              Affichez le QR code en boutique ou partagez le lien : vos clients
              jouent depuis leur téléphone.
            </p>
            <PublicShare
              url={publicUrl}
              fileName={`quiz-${quiz.publicSlug ?? quiz.id}`}
              qrLabel={quiz.name}
            />
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            Publiez le quiz pour obtenir son QR code et son lien : tant qu&apos;il
            n&apos;est pas actif, la page publique reste fermée aux joueurs.
          </p>
        )}
      </Card>

      <QuizSettings quiz={quiz} />

      <QuizQuestionsEditor quizId={quiz.id} questions={questions} />

      <QuizRewardEditor quiz={quiz} wheels={wheels} />
    </div>
  );
}
