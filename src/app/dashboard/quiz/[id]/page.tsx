import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {
  QuizDrawCard,
  QuizQuestionsEditor,
  QuizRewardEditor,
  QuizSettings,
  QuizStatusControls,
  type DashboardQuiz,
  type DashboardQuizQuestion,
  type QuizWheelOption,
} from "@/components/dashboard/quiz-editor";
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  definitionEtapeQuiz,
  ETAPES_QUIZ,
  hrefEtapeQuiz,
  type EtapeQuiz,
} from "@/components/dashboard/atelier-quiz-etapes";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { AtelierEntreeQuiz } from "@/components/dashboard/atelier-quiz-entree";
import { AtelierQuizVerification } from "@/components/dashboard/atelier-quiz-verification";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { spinWheelIssue } from "@/components/dashboard/loyalty-settings-presets";
import { QuizStatusBadge } from "@/components/dashboard/quiz-status";
import { PublicShare } from "@/components/dashboard/public-share";
import { GuidedJourney } from "@/components/dashboard/guided-journey";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import {
  conclusionAventure,
  construireEtapesAventure,
} from "@/lib/experience-lifecycle";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ relance_error?: string | string[]; etape?: string }>;
}) {
  const { id } = await params;
  const { relance_error: relanceError, etape: etapeParam } = await searchParams;
  // L'ABSENCE de `?etape=` n'est pas la première étape : c'est la vue SUIVI.
  const etape = parseEtape(ETAPES_QUIZ, etapeParam, "nulle") as EtapeQuiz | null;
  const { organization, role } = await getUserAndOrg();
  if (!organization) notFound();
  // REFUS AVANT LECTURE, comme sur les quatre autres modules : `capacites`
  // vivait dans la salve ci-dessous, si bien qu'un caissier déclenchait quatre
  // requêtes dont le résultat partait aussitôt au `notFound()`. Ce qui reste
  // parallèle l'est resté — seul le droit d'entrée passe devant.
  //
  // Lues DÈS L'ENTRÉE, et c'est ce qui remplace l'ancien `hasQuizAccess` : la
  // page détail rendait un 404 à qui n'avait pas payé le module, alors que la
  // page LISTE lui laissait créer ce brouillon. Le cahier §3 tranche l'inverse
  // — on découvre et on prépare librement, seule la PUBLICATION est
  // verrouillée, et elle l'est en base (`assert_module_publish_allowed`).
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
  const openCount = await readModulePageOpenCount(
    supabase,
    "quiz",
    quiz.id,
  );

  // Carte de l'Aventure et relance : les marqueurs viennent des colonnes déjà
  // sélectionnées par `QUIZ_COLUMNS`, sans requête supplémentaire.
  const marqueurs = {
    status: quiz.status,
    draw_state: quiz.drawState,
    drawn_at: quiz.drawnAt,
  };
  const etapes = construireEtapesAventure({
    marqueurs: { kind: "quiz", ...marqueurs },
    capacites,
    // Les ancres de SUIVI restent des ancres (elles vivent sur cette vue), mais
    // « Compléter les réglages » désigne désormais une ÉTAPE : les cartes
    // d'édition ne sont plus rendues sur la vue nue, `#reglages` y serait un
    // clic mort. C'est le patron de la campagne, qui pointe déjà une route.
    liens: {
      editeur: hrefEtapeQuiz(quiz.id, "quiz"),
      // La page publique n'est ouverte qu'une fois le quiz actif : proposer son
      // lien avant, c'est promettre un écran fermé.
      apercu: quiz.status === "active" ? publicUrl : null,
      suivi: "#suivi",
      statut: "#statut",
    },
  });
  // Pas de CTA vers une ancre qui n'existera pas : sans droit d'exploration, la
  // carte de relance n'est pas montée.
  const conclusion = conclusionAventure(etapes, {
    relanceHref: capacites.canExplore ? "#relance" : null,
  });
  const peutCreerBrouillon = role === "owner" || role === "editor";

  const enTete = (
    <div>
      <Link href="/dashboard/quiz" className="text-sm text-zinc-600 hover:text-k-ink">
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
  );

  const bandeauModule = (
    <ModuleCapabilityNotice capacites={capacites} entitlement="quiz">
      7 modèles de questions (choix, vrai/faux, image mystère, estimation,
      chronométrée, classement, réponse libre), 5 modes de récompense, classement
      public et remise en caisse.
    </ModuleCapabilityNotice>
  );

  // ── LE MODE ATELIER : une seule étape à l'écran, rien d'autre ──
  //
  // Ni Carte de l'Aventure ni carte de relance ici : le fil des étapes EST la
  // progression, et un geste d'exploitation n'a rien à faire au milieu d'une
  // préparation. La vue suivi reste à un clic.
  if (etape) {
    const definition = definitionEtapeQuiz(etape);
    const numero = numeroEtape(ETAPES_QUIZ, etape);
    const hrefPour = (cle: string) => hrefEtapeQuiz(quiz.id, cle as EtapeQuiz);
    const roueChoisie = quiz.targetWheelId
      ? (wheels.find((w) => w.id === quiz.targetWheelId) ?? null)
      : null;

    return (
      <div className="space-y-6">
        {enTete}
        {bandeauModule}

        <div>
          <AtelierStepper
            etapes={ETAPES_QUIZ}
            courante={etape}
            hrefPour={hrefPour}
          />

          <section
            aria-label={`Étape ${numero} sur ${ETAPES_QUIZ.length} — ${definition.titre}`}
          >
            {etape === "quiz" && <QuizSettings quiz={quiz} />}

            {etape === "questions" && (
              <QuizQuestionsEditor quizId={quiz.id} questions={questions} />
            )}

            {etape === "dotation" && (
              <QuizRewardEditor quiz={quiz} wheels={wheels} />
            )}

            {etape === "verification" && (
              <AtelierQuizVerification
                quizId={quiz.id}
                entree={{
                  rewardMode: quiz.rewardMode,
                  rewardLabel: quiz.rewardLabel,
                  rewardStock: quiz.rewardStock,
                  rewardClaimedCount: quiz.rewardClaimedCount,
                  targetWheelId: quiz.targetWheelId,
                  drawState: quiz.drawState,
                  questionCount: questions.length,
                  roueCible: roueChoisie
                    ? {
                        nom: roueChoisie.name,
                        probleme: spinWheelIssue(roueChoisie),
                      }
                    : null,
                }}
              />
            )}
          </section>

          <AtelierNavigationEtape
            precedente={etapeVoisine(ETAPES_QUIZ, etape, -1)}
            suivante={etapeVoisine(ETAPES_QUIZ, etape, 1)}
            hrefPour={hrefPour}
          />
        </div>

        <Link
          href={`/dashboard/quiz/${quiz.id}`}
          className="inline-block text-sm font-bold text-zinc-600 hover:text-k-ink"
        >
          ← Retour au suivi
        </Link>
      </div>
    );
  }

  // ── LA VUE SUIVI (URL nue) ──
  return (
    <div className="space-y-6">
      {enTete}
      {bandeauModule}

      <GuidedJourney
        steps={etapes}
        title="Carte de l'Aventure"
        conclusion={conclusion}
      />

      <div id="statut" className="scroll-mt-24">
        <QuizStatusControls quiz={quiz} />
      </div>

      {/* §4 du cahier : le QR ne rend pas jouable un brouillon. On n'affiche
          donc le QR et le lien QUE si le quiz est publié — un QR imprimé et
          collé en vitrine survit à la page qui l'a produit, alors qu'un
          bandeau d'avertissement, non. Le commerçant non publié lit pourquoi
          le bloc manque plutôt que de recevoir un code mort. */}
      <Card id="suivi" className="scroll-mt-24">
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
              openCount={openCount}
            />
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            Publiez le quiz pour obtenir son QR code et son lien : tant qu&apos;il
            n&apos;est pas actif, la page publique reste fermée aux joueurs.
          </p>
        )}
      </Card>

      {/* Le tirage est un geste d'EXPLOITATION, définitif et one-shot : il vit
          sur le suivi, pas au milieu du fil de préparation. */}
      <QuizDrawCard quiz={quiz} />

      <AtelierEntreeQuiz quizId={quiz.id} />

      <RelanceErreur message={relanceError} />

      {capacites.canExplore && (
        <div id="relance" className="scroll-mt-24">
            <RelaunchFormulaCard
              sourceName={quiz.name}
              sourceState={etatSourceRelance("quiz", marqueurs)}
              canCreateDraft={peutCreerBrouillon}
              isSupported
              action={<RelaunchFormulaAction kind="quiz" sourceId={quiz.id} />}
            />
        </div>
      )}
    </div>
  );
}
