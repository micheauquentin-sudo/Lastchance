import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { getCompetition } from "@/lib/competitions";
import { createClient } from "@/lib/supabase/server";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import {
  effectiveLocksAt,
  parseQuestionOptions,
  parseRewards,
  parseScoring,
  type ContestQuestionType,
} from "@/lib/pronostics";
import { FOOTBALL_EVENT_KIND } from "@/components/dashboard/contest-event-kinds";
import type {
  DashboardQuestion,
  GenericQuestionType,
} from "@/components/dashboard/contest-questions";
import { ContestStudio } from "@/components/pronos/contest-studio";
import type { Contest, ContestMatch } from "@/types/database";

export const metadata: Metadata = { title: "Mon studio — championnat" };

/**
 * LE STUDIO DU CHAMPIONNAT (VIT-43) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et un
 * studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est le
 * motif de `/vitrine-studio`, de `/studio/calendrier` et de `/studio/quiz`, y
 * compris dans ses gardes : session, organisation, puis le droit du module.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ TROIS FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/pronostics/…")` de `src/actions/pronostics.ts` —
 * Next revalide un CHEMIN, pas une ressource. C'est le défaut VIT-37, puis
 * VIT-39, puis VIT-41, mot pour mot : un enregistrement qui réussit sans jamais
 * apparaître. Chacune des dix-sept revalidations détaillées porte donc son
 * jumeau `/studio/pronostics/${id}`, et
 * `src/components/pronos/studio/revalidation-studio.test.ts` échoue s'il en
 * manque un.
 *
 * ── AUCUN `after()` DE SYNCHRO ICI, ET C'EST UN ARBITRAGE ──
 *
 * La page du tableau de bord lance `syncContestFixtures` en arrière-plan AU
 * RENDU quand un match auto vient de se terminer. Cette page-ci ne le fait pas :
 * chacune de ses écritures la revalide, donc elle se re-rend à chaque
 * enregistrement automatique, et reproduire l'`after()` appellerait le
 * fournisseur de calendriers à chaque réglage. La synchro reste au cron, au
 * suivi, et au bouton « Synchroniser » de l'étape « Les matchs ».
 *
 * ── LE DROIT EST BORNÉ À UN SEUL CHAMPIONNAT ──
 *
 * `capacitesDuModule("pronostics", id)` et non `("pronostics")` : le pass
 * « Saison de pronostics » est vendu pour UN championnat, et sans cet argument
 * le commerçant qui vient de le payer lirait « la publication demande d'ouvrir
 * ce module » sur le championnat que la base l'autorise déjà à publier. Même
 * lecture que la page du tableau de bord.
 *
 * Ce que cette page ne rend PAS, et volontairement : le classement, le palmarès
 * et la clôture. Ils sont gouvernés par `canViewPlayers = role === "owner"` et
 * vivent au suivi — un studio prépare, il n'exploite pas.
 */
export default async function StudioContestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon trois requêtes dont le résultat part aussitôt au
  // `notFound()`.
  const capacites = await capacitesDuModule("pronostics", id);
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();

  const [{ data: contest }, { data: matches }, { data: lockedFlag }] =
    await Promise.all([
      supabase
        .from("contests")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organization.id)
        .maybeSingle(),
      supabase
        .from("contest_matches")
        .select("*")
        .eq("contest_id", id)
        .order("kickoff_at", { ascending: true })
        .order("position", { ascending: true }),
      // Règlement verrouillé (premier pronostic ou coup d'envoi passé) : c'est
      // ce qui éteint l'enregistrement automatique du studio.
      supabase.rpc("contest_is_locked", { p_contest_id: id }),
    ]);

  if (!contest) notFound();

  const c = contest as Contest;
  const rows = (matches ?? []) as ContestMatch[];
  // Une ligne de `contest_matches` est soit un MATCH (question_type 'score' —
  // le football, inchangé), soit une QUESTION générique. Repli sur 'score' : la
  // colonne est NOT NULL DEFAULT 'score' en base. Même découpe que la page du
  // tableau de bord, et elle DOIT le rester.
  const matchList = rows.filter((m) => (m.question_type ?? "score") === "score");
  const questionRows = rows.filter(
    (m) => (m.question_type ?? "score") !== "score",
  );
  const questionTypes = Array.from(
    new Set(rows.map((m) => (m.question_type ?? "score") as ContestQuestionType)),
  );

  const competition = getCompetition(c.competition_key);
  if (!competition) notFound();
  const isFootball = c.event_kind === FOOTBALL_EVENT_KIND;

  const questions: DashboardQuestion[] = questionRows.map((m) => ({
    id: m.id,
    questionType: m.question_type as GenericQuestionType,
    prompt: m.prompt ?? "",
    options: parseQuestionOptions(m.options),
    rankingSize: m.ranking_size,
    locksAt: effectiveLocksAt(m, c),
    finished: m.status === "finished",
    correctAnswer: m.correct_answer,
  }));

  const scoring = parseScoring(c.scoring);
  const rewards = parseRewards(c.rewards);

  // Calendrier synchronisé : l'étape « Les matchs » n'a alors AUCUN formulaire
  // d'ajout, seulement un bouton de synchronisation et une liste en lecture.
  const autoCompetition = Boolean(competition.providerLeagueId);
  // Le barème dérive des types de questions RÉELLEMENT créés. Sur un événement
  // générique encore vide, il n'afficherait qu'un bloc « score » qui ne servira
  // jamais : l'étape renvoie alors là où la matière se crée.
  const baremeAMatiere = rows.length > 0 || isFootball;

  // Le MÊME objet d'entrée que la page du tableau de bord, et il DOIT le
  // rester : deux vérités sur « qu'est-ce qui manque ? » sont exactement ce que
  // `src/lib/activation/pronostics.ts` a été écrit pour éviter.
  const entreeVerification = {
    contestId: c.id,
    autoCompetition,
    nbMatchs: matchList.length,
    nbQuestions: questions.length,
    echeances: questions.map((q) => q.locksAt),
    nbRecompenses: rewards.length,
    tiebreakerQuestion: c.tiebreaker_question,
    tiebreakerAnswer: c.tiebreaker_answer,
    collectEmail: c.collect_email,
    collectPhone: c.collect_phone,
  };

  // URL ABSOLUE : même source que la page du tableau de bord (APP_URL), pour
  // que « Voir le jeu » mène là où mène le QR déjà imprimé.
  const publicUrl = c.status !== "draft" ? `${APP_URL}/pronos/${c.slug}` : null;

  return (
    <ContestStudio
      contest={c}
      matchs={matchList}
      questions={questions}
      questionTypes={questionTypes}
      scoring={scoring}
      rewards={rewards}
      competition={competition}
      organisation={{ name: organization.name, logoUrl: organization.logo_url }}
      // Les deux mêmes replis que l'en-tête de `/pronos/[slug]` : l'aperçu en
      // est une copie gardée, pas une réinvention.
      icone={competition.icon ?? "🏆"}
      sousTitre={
        isFootball ? `${competition.icon} ${competition.label}` : null
      }
      timeZone={organization.timezone}
      entreeVerification={entreeVerification}
      publicUrl={publicUrl}
      locked={lockedFlag === true}
      finalized={c.finalized_at !== null}
      // Le règlement d'un championnat n'est pas édité par un caissier : les RPC
      // exigent `is_org_editor`, et mieux vaut ne rien proposer que laisser
      // l'action refuser après coup. `canEditDraft` porte le droit du module.
      peutEditer={
        (role === "owner" || role === "editor") && capacites.canEditDraft
      }
      isFootball={isFootball}
      autoCompetition={autoCompetition}
      baremeAMatiere={baremeAMatiere}
    />
  );
}
