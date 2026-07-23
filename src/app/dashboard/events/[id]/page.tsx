import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasEventsAccess } from "@/lib/subscription";
import { EventStatusBadge } from "@/components/dashboard/event-status";
import {
  EventGameSettings,
  EventQuestionsSection,
  EventSessionsSection,
  type EditorOption,
  type EditorQuestion,
  type EditorSession,
} from "@/components/dashboard/event-editor";
import type {
  EventGameStatus,
  EventQuestionType,
  EventSessionStatus,
} from "@/types/database";

export const metadata: Metadata = { title: "Jeu — Événement en direct" };

/**
 * Éditeur d'un jeu du Mode événement (le segment [id] désigne le JEU) : nom +
 * statut, questions (quiz / sondage / pronostic) avec leurs options, et sessions
 * live (lot à stock fini, code d'accès, lien télécommande).
 */
export default async function EventGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await getUserAndOrg();
  if (!organization || !hasEventsAccess(organization)) notFound();

  const supabase = await createClient();
  const { data: game } = await supabase
    .from("event_games")
    .select("id, name, status")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!game) notFound();

  const [{ data: questionRows }, { data: optionRows }, { data: sessionRows }] =
    await Promise.all([
      supabase
        .from("event_questions")
        .select("id, position, question_type, prompt, time_limit_seconds, points_base")
        .eq("game_id", id)
        .eq("organization_id", organization.id)
        .order("position", { ascending: true }),
      supabase
        .from("event_question_options")
        .select("id, question_id, position, label, is_correct")
        .eq("organization_id", organization.id),
      supabase
        .from("event_sessions")
        .select(
          "id, label, join_code, status, reward_label, reward_details, reward_stock, reward_claimed_count",
        )
        .eq("game_id", id)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false }),
    ]);

  // Options groupées par question, triées par position (ordre d'édition stable).
  const optionRowList = (optionRows ?? []) as Array<{
    id: string;
    question_id: string;
    position: number;
    label: string;
    is_correct: boolean;
  }>;
  const optionsByQuestion = new Map<string, Array<EditorOption & { position: number }>>();
  for (const o of optionRowList) {
    const list = optionsByQuestion.get(o.question_id) ?? [];
    list.push({ id: o.id, label: o.label, isCorrect: o.is_correct, position: o.position });
    optionsByQuestion.set(o.question_id, list);
  }
  for (const [, list] of optionsByQuestion) {
    list.sort((a, b) => a.position - b.position);
  }

  const questions: EditorQuestion[] = (
    (questionRows ?? []) as Array<{
      id: string;
      position: number;
      question_type: EventQuestionType;
      prompt: string;
      time_limit_seconds: number;
      points_base: number;
    }>
  ).map((q) => ({
    id: q.id,
    position: q.position,
    questionType: q.question_type,
    prompt: q.prompt,
    timeLimitSeconds: q.time_limit_seconds,
    pointsBase: q.points_base,
    options: optionsByQuestion.get(q.id) ?? [],
  }));

  const sessions: EditorSession[] = (
    (sessionRows ?? []) as Array<{
      id: string;
      label: string | null;
      join_code: string;
      status: EventSessionStatus;
      reward_label: string;
      reward_details: string | null;
      reward_stock: number;
      reward_claimed_count: number;
    }>
  ).map((s) => ({
    id: s.id,
    label: s.label,
    joinCode: s.join_code,
    status: s.status,
    rewardLabel: s.reward_label,
    rewardDetails: s.reward_details,
    rewardStock: s.reward_stock,
    rewardClaimedCount: s.reward_claimed_count,
  }));

  const status = game.status as EventGameStatus;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/events"
          className="text-sm text-zinc-500 hover:text-k-ink"
        >
          ← Événements
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🎬
          </span>
          <h1 className="text-2xl font-bold">{game.name}</h1>
          <EventStatusBadge status={status} />
        </div>
      </div>

      <EventGameSettings gameId={game.id} name={game.name} status={status} />
      <EventQuestionsSection gameId={game.id} questions={questions} />
      <EventSessionsSection
        gameId={game.id}
        gameActive={status === "active"}
        sessions={sessions}
      />
    </div>
  );
}
