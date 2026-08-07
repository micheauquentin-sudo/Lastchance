import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { NewQuizForm } from "@/components/dashboard/new-quiz-form";
import { QuizStatusBadge } from "@/components/dashboard/quiz-status";
import { quizThemeTokens } from "@/components/quiz/quiz-theme";
import type { QuizStatus, QuizTheme } from "@/lib/quiz";

export const metadata: Metadata = { title: "Quiz" };

interface QuizListRow {
  id: string;
  name: string;
  status: QuizStatus;
  theme: QuizTheme;
  reward_mode: string;
  reward_claimed_count: number;
  reward_stock: number;
  created_at: string;
}

export default async function QuizListPage() {
  const { organization } = await getUserAndOrg();

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule("quiz");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();
  const [{ data: quizzes }, { data: questionRows }] = await Promise.all([
    supabase
      .from("quizzes")
      .select(
        "id, name, status, theme, reward_mode, reward_claimed_count, reward_stock, created_at",
      )
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quiz_questions")
      .select("quiz_id")
      .eq("organization_id", organization!.id),
  ]);

  const quizList = (quizzes ?? []) as QuizListRow[];
  const questionCounts = new Map<string, number>();
  for (const row of (questionRows ?? []) as Array<{ quiz_id: string }>) {
    questionCounts.set(row.quiz_id, (questionCounts.get(row.quiz_id) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Quiz"
        sousTitre="Vos clients jouent depuis leur téléphone, la correction est immédiate, le lot se retire en caisse."
        actions={capacites.canEditDraft ? <NewQuizForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="quiz">
        7 modèles de questions (choix, vrai/faux, image mystère, estimation,
        chronométrée, classement, réponse libre), 5 modes de récompense,
        classement public et remise en caisse.
      </ModuleCapabilityNotice>

      {!quizList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucun quiz pour l&apos;instant. Créez le premier !
          </p>
          {/* LE BOUTON EST ICI AUSSI : « créez le premier » sans rien à
              cliquer laissait le seul bouton en haut d'écran, hors du regard
              de celui qui vient de lire la phrase. */}
          {capacites.canEditDraft ? (
            <div className="mt-4 flex justify-center">
              <NewQuizForm instanceId="-vide" />
            </div>
          ) : null}
        </Card>
      ) : (
        <ul className="space-y-3">
          {quizList.map((q) => {
            const tokens = quizThemeTokens(q.theme);
            const count = questionCounts.get(q.id) ?? 0;
            return (
              <li key={q.id}>
                <Link
                  href={`/dashboard/quiz/${q.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        {tokens.titleEmoji}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{q.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {tokens.label} · {count} question
                          {count > 1 ? "s" : ""} · créé le{" "}
                          {formatDate(q.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {q.reward_mode !== "none" && (
                        <span className="hidden text-sm text-zinc-500 sm:inline">
                          <span className="font-semibold text-zinc-900 tabular-nums">
                            {q.reward_claimed_count}/{q.reward_stock}
                          </span>{" "}
                          lot{q.reward_stock > 1 ? "s" : ""}
                        </span>
                      )}
                      <QuizStatusBadge status={q.status} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
