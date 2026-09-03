import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { spinWheelIssue } from "@/components/dashboard/loyalty-settings-presets";
import { QuizStudio } from "@/components/quiz/quiz-studio";
import type {
  DashboardQuiz,
  DashboardQuizQuestion,
  QuizWheelOption,
} from "@/components/dashboard/quiz-editor";
import type { QuizOption, QuizQuestionType } from "@/lib/quiz";

export const metadata: Metadata = { title: "Mon studio — quiz" };

/**
 * LE STUDIO DU QUIZ (VIT-41) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est
 * le motif de `/vitrine-studio`, de `/poster/[id]` et de `/studio/calendrier`,
 * y compris dans ses gardes : session, organisation, puis le droit du module.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ DEUX FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/quiz/…")` de `src/actions/quiz.ts` — Next revalide
 * un CHEMIN, pas une ressource. C'est le défaut VIT-37 puis VIT-39, mot pour
 * mot : un enregistrement qui réussit sans jamais apparaître. Chacune des onze
 * revalidations détaillées du quiz a donc désormais son jumeau
 * `/studio/quiz/${id}`, et `revalidation-studio.test.ts` échoue s'il en manque
 * un.
 *
 * ── LES COLONNES SONT CELLES DE LA PAGE DU TABLEAU DE BORD ──
 *
 * Recopiées, et non partagées, POUR UNE RAISON PRÉCISE : une garde textuelle
 * (`code-ttl-days-chargement.test.ts`) vérifie la présence de `code_ttl_days`
 * dans la liste et sait résoudre une constante du MÊME fichier. La liste vit
 * donc ici en toutes lettres, comme là-bas — c'est ce que la garde sait lire.
 */
const QUIZ_COLUMNS =
  "id, name, theme, status, public_slug, intro_text, reward_mode, reward_threshold, draw_top_n, draw_state, drawn_at, reward_label, reward_details, reward_stock, reward_claimed_count, target_wheel_id, code_ttl_days, share_enabled";

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
  share_enabled: boolean;
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
function toWheelOptions(
  wheels: WheelRow[],
  prizes: PrizeRow[],
): QuizWheelOption[] {
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

export default async function StudioQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon quatre requêtes dont le résultat part aussitôt au
  // `notFound()`.
  const capacites = await capacitesDuModule("quiz");
  if (!capacites.canExplore) notFound();

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
  // PostgREST ne relie pas une chaîne de `select()` à une interface : les sept
  // pages de module portent le même cast depuis toujours, et l'écart est
  // documenté en tête de `src/lib/code-ttl-days-chargement.test.ts`. Ce qui
  // protège ici est la garde de CHARGEMENT — la colonne est-elle DEMANDÉE ? —,
  // pas ce cast, qui ne fait que nommer une forme invisible au compilateur.
  // unsafe-cast-justification: écart PostgREST/interface, garde de chargement ailleurs
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
    shareEnabled: row.share_enabled,
  };

  const questions: DashboardQuizQuestion[] = (
    // unsafe-cast-justification: écart PostgREST/interface, mêmes colonnes que la page du tableau de bord
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

  const roues = toWheelOptions(
    (wheelRows ?? []) as WheelRow[],
    (prizeRows ?? []) as PrizeRow[],
  );

  // Le même calcul que la page du tableau de bord, et il DOIT le rester : deux
  // vérités sur « qu'est-ce qui manque ? » sont exactement ce que
  // `src/lib/activation/quiz.ts` a été écrit pour éviter.
  const roueChoisie = quiz.targetWheelId
    ? (roues.find((r) => r.id === quiz.targetWheelId) ?? null)
    : null;
  const entreeVerification = {
    rewardMode: quiz.rewardMode,
    rewardLabel: quiz.rewardLabel,
    rewardStock: quiz.rewardStock,
    rewardClaimedCount: quiz.rewardClaimedCount,
    targetWheelId: quiz.targetWheelId,
    drawState: quiz.drawState,
    questionCount: questions.length,
    roueCible: roueChoisie
      ? { nom: roueChoisie.name, probleme: spinWheelIssue(roueChoisie) }
      : null,
  };

  // URL ABSOLUE : même source que la page du tableau de bord (APP_URL), pour
  // que le lien « Voir le jeu » mène là où mène le QR déjà imprimé.
  const publicUrl =
    quiz.status === "active"
      ? `${APP_URL}/quiz/${quiz.publicSlug ?? quiz.id}`
      : null;

  return (
    <QuizStudio
      quiz={quiz}
      questions={questions}
      roues={roues}
      entreeVerification={entreeVerification}
      publicUrl={publicUrl}
      // `updateQuiz` exige `owner|editor` ET le droit d'éditer un brouillon :
      // mieux vaut ne rien proposer que laisser l'action refuser après coup.
      peutEditer={
        (role === "owner" || role === "editor") && capacites.canEditDraft
      }
    />
  );
}
