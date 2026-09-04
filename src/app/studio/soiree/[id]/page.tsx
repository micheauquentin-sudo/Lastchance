import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { salleOuverteAuJoueur } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { readModulePageOpenCounts } from "@/lib/module-page-opens";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { EventStudio } from "@/components/event/event-studio";
import type {
  EditorOption,
  EditorQuestion,
  EditorSession,
} from "@/components/dashboard/event-editor";
import type {
  EventGameStatus,
  EventQuestionType,
  EventSessionStatus,
} from "@/types/database";

export const metadata: Metadata = { title: "Mon studio — soirée" };

/**
 * LE STUDIO DE LA SOIRÉE (VIT-47) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et un
 * studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est le
 * motif de `/vitrine-studio`, de `/poster/[id]` et des sept studios déjà livrés,
 * y compris dans ses gardes : session, organisation, puis le droit du module.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ CINQ FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/events/…")` de `src/actions/events.ts` — Next
 * revalide un CHEMIN, pas une ressource. C'est le défaut VIT-37 puis VIT-39,
 * mot pour mot : un enregistrement qui réussit sans jamais apparaître. Chacune
 * des huit revalidations détaillées de la soirée a donc désormais son jumeau
 * `/studio/soiree/${gameId}`, et `revalidation-studio.test.ts` échoue PAR
 * FONCTION s'il en manque un.
 *
 * ── LES COLONNES SONT CELLES DE LA PAGE DU TABLEAU DE BORD ──
 *
 * Recopiées, et non partagées, POUR LA MÊME RAISON QUE SUR LE QUIZ : une garde
 * textuelle (`code-ttl-days-chargement.test.ts`) vérifie la présence de
 * `code_ttl_days` dans la liste et sait résoudre une constante du MÊME fichier.
 * La liste vit donc ici en toutes lettres, comme là-bas — c'est ce que la garde
 * sait lire.
 *
 * ── CE QUE CETTE PAGE NE CHARGE PAS, ET C'EST DÉLIBÉRÉ ──
 *
 * Rien de la RELANCE, rien des tuiles de la Carte de l'Aventure, rien de l'état
 * temps réel d'une salle en cours. Le studio prépare une soirée ; la page de
 * suivi l'anime et la rejoue.
 */
export default async function StudioSoireePage({
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
  const capacites = await capacitesDuModule("events");
  if (!capacites.canExplore) notFound();

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
        .select(
          "id, position, question_type, prompt, time_limit_seconds, points_base",
        )
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
          "id, label, join_code, status, reward_label, reward_details, reward_stock, reward_claimed_count, code_ttl_days",
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
  const optionsByQuestion = new Map<
    string,
    Array<EditorOption & { position: number }>
  >();
  for (const o of optionRowList) {
    const list = optionsByQuestion.get(o.question_id) ?? [];
    list.push({
      id: o.id,
      label: o.label,
      isCorrect: o.is_correct,
      position: o.position,
    });
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

  // Compteurs d'ouvertures de TOUTES les salles en une requête : le studio est
  // un composant client, il ne peut pas les lire lui-même.
  const sessionOpens = await readModulePageOpenCounts(
    supabase,
    "events",
    ((sessionRows ?? []) as Array<{ id: string }>).map((s) => s.id),
  );

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
      code_ttl_days: number | null;
    }>
  ).map((s) => ({
    id: s.id,
    label: s.label,
    joinCode: s.join_code,
    // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif, et le studio est
    // un composant client qui ne peut pas lire APP_URL. La salle n'a pas de
    // slug : `/event/[code]` est résolu sur le `join_code` — c'est lui, pas
    // l'UUID, qui doit être imprimé, pour que le QR porte le même code que celui
    // lu à voix haute en salle. Même dérivation que la page de suivi, pour que
    // le QR d'ici soit celui qui est déjà collé sur les tables.
    publicUrl: `${APP_URL}/event/${s.join_code}`,
    openCount: sessionOpens[s.id] ?? 0,
    status: s.status,
    rewardLabel: s.reward_label,
    rewardDetails: s.reward_details,
    rewardStock: s.reward_stock,
    rewardClaimedCount: s.reward_claimed_count,
    codeTtlDays: s.code_ttl_days,
  }));

  const status = game.status as EventGameStatus;

  /**
   * LA MÊME ENTRÉE DE VÉRIFICATION QUE LA PAGE DU TABLEAU DE BORD, ET ELLE DOIT
   * LE RESTER : deux vérités sur « qu'est-ce qui manque ? » sont exactement ce
   * que `src/lib/activation/events.ts` a été écrit pour éviter.
   */
  const entreeVerification = {
    nombreQuestions: questions.length,
    status,
    salles: sessions.map((s) => ({
      label: s.label,
      joinCode: s.joinCode,
      rewardLabel: s.rewardLabel,
      rewardStock: s.rewardStock,
      codeTtlDays: s.codeTtlDays,
    })),
  };

  // Même règle que la page de suivi : la PREMIÈRE salle que le joueur peut
  // réellement ouvrir, jamais `sessions[0]` — une salle naît `draft`, et
  // `event_etat_partage` la refuse.
  const salleVisitable = sessions.find((s) => salleOuverteAuJoueur(s.status));

  return (
    <EventStudio
      gameId={game.id}
      gameName={game.name}
      status={status}
      questions={questions}
      sessions={sessions}
      entreeVerification={entreeVerification}
      organizationName={organization.name}
      logoUrl={organization.logo_url}
      hrefJeu={salleVisitable?.publicUrl ?? null}
      // Les trois actions d'écriture exigent `owner|editor` ET le droit
      // d'éditer un brouillon : mieux vaut ne rien proposer que laisser
      // l'action refuser après coup.
      peutEditer={
        (role === "owner" || role === "editor") && capacites.canEditDraft
      }
    />
  );
}
