import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { readModulePageOpenCounts } from "@/lib/module-page-opens";
import { EventStatusBadge } from "@/components/dashboard/event-status";
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
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  ETAPES_EVENEMENT,
  hrefEtapeEvenement,
  titreEtapeEvenement,
} from "@/components/dashboard/atelier-event-etapes";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import { AtelierEventVerification } from "@/components/dashboard/atelier-event-verification";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import {
  EventGameSettings,
  EventGameStatusControls,
  EventQuestionsSection,
  EventSessionsPrepareSection,
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
 * LA PAGE D'UN JEU D'ÉVÉNEMENT — DEUX VISAGES SUR UNE SEULE ROUTE.
 *
 * URL nue : la vue SUIVI — l'état, les salles avec leur code d'accès, leur QR,
 * « Piloter », « Écran », et la relance après la soirée. `?etape=` : l'ATELIER,
 * où l'on prépare le jeu, ses manches et ses sessions.
 *
 * La carte « Sessions en direct » était le seul endroit du produit qui mêlait
 * les deux : on y réglait le lot d'une soirée à venir juste à côté du bouton
 * qui la pilote en direct. La coupe passe là, et elle est possible parce que
 * `updateEventSession` est une action distincte du reste du module.
 */
export default async function EventGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ relance_error?: string | string[]; etape?: string }>;
}) {
  const { id } = await params;
  const { relance_error: relanceError, etape: etapeParam } = await searchParams;
  const { organization, role } = await getUserAndOrg();
  if (!organization) notFound();
  // §3 du cahier : découvrir est ouvert, seule la PUBLICATION est payante (et
  // fermée en base). La page ne se referme plus sur le droit payé — seulement
  // sur `canExplore`, faux pour la caisse, dont le rôle ne prépare rien.
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

  // Compteurs d'ouvertures de TOUTES les sessions en une requête : l'éditeur
  // est un composant client, il ne peut pas les lire lui-même.
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
    // URL ABSOLUE : un QR ne peut pas encoder un chemin relatif, et l'éditeur
    // est un composant client qui ne peut pas lire APP_URL. La session n'a pas
    // de slug : `/event/[code]` est résolu par `loadEventPublicContext` sur le
    // `join_code` (posé par trigger, non nul) — c'est lui, pas l'UUID, qui doit
    // être imprimé, pour que le QR porte le même code que celui lu à voix haute
    // en salle.
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
  const etape = parseEtape(ETAPES_EVENEMENT, etapeParam, "nulle");
  const hrefPour = (cle: string) => hrefEtapeEvenement(game.id, cle);

  // Carte de l'Aventure et relance. Le Mode événement est le seul module à
  // porter une vraie RÉPÉTITION : un jeu encore en brouillon dont une salle est
  // déjà ouverte. Les statuts de salle viennent de `sessions`, déjà chargées.
  const marqueurs = {
    status,
    sessions: sessions.map((session) => ({ status: session.status })),
  };
  // `editeur` vise désormais l'ATELIER (`?etape=jeu`) et non l'ancre
  // `#reglages` : les cartes de préparation ont quitté la vue par défaut,
  // l'ancre serait un clic mort.
  const etapesAventure = construireEtapesAventure({
    marqueurs: { kind: "event", ...marqueurs },
    capacites,
    liens: {
      editeur: hrefPour("jeu"),
      // La salle la plus récente est celle qu'on vient d'ouvrir : c'est son
      // lien qu'on teste avant de le lire à voix haute en salle.
      apercu: sessions[0]?.publicUrl ?? null,
      suivi: "#suivi",
      statut: "#statut",
    },
  });
  const conclusion = conclusionAventure(etapesAventure, {
    relanceHref: capacites.canExplore ? "#relance" : null,
  });
  const peutCreerBrouillon = role === "owner" || role === "editor";

  const numero = etape ? numeroEtape(ETAPES_EVENEMENT, etape) : 0;

  // Le bandeau d'offre se lit sur LES DEUX VUES, comme sur le quiz et le
  // calendrier. Il ne vivait que dans l'atelier : sans add-on, la vue suivi
  // portait « Ouvrir aux joueurs » sans un mot sur la raison du refus à venir.
  const bandeauModule = (
    <ModuleCapabilityNotice capacites={capacites} entitlement="events">
      Quiz, sondages et pronostics ; écran de salle plein écran ; télécommande
      organisateur ; lot à stock fini.
    </ModuleCapabilityNotice>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/events"
          className="text-sm text-zinc-600 hover:text-k-ink"
        >
          ← Événements live
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🎬
          </span>
          <h1 className="text-2xl font-bold">{game.name}</h1>
          <EventStatusBadge status={status} />
        </div>
      </div>

      {bandeauModule}

      {etape === null ? (
        <>
          <GuidedJourney
            steps={etapesAventure}
            title="Carte de l'Aventure"
            conclusion={conclusion}
          />

          <div id="statut" className="scroll-mt-24">
            <EventGameStatusControls gameId={game.id} status={status} />
          </div>

          <div id="suivi" className="scroll-mt-24">
            <EventSessionsSection sessions={sessions} />
          </div>

          {/* LA PORTE D'ENTRÉE DE L'ATELIER. Les cartes de préparation ont
              quitté cette vue : sans ce bloc, le commerçant n'aurait plus aucun
              chemin vers elles depuis la page qu'il consulte le plus. */}
          <AtelierEntree
            etapes={ETAPES_EVENEMENT}
            hrefPour={hrefPour}
            titre="L'atelier de la soirée"
            sousTitre="Le nom du jeu, ses manches et le lot de chaque session. Chaque étape s'enregistre pour elle-même : vous pouvez vous arrêter et revenir."
          />

          <RelanceErreur message={relanceError} />

          {capacites.canExplore && (
            <div id="relance" className="scroll-mt-24">
              <RelaunchFormulaCard
                sourceName={game.name}
                occasionLabel="la prochaine soirée"
                sourceState={etatSourceRelance("event", marqueurs)}
                canCreateDraft={peutCreerBrouillon}
                isSupported
                action={<RelaunchFormulaAction kind="event" sourceId={game.id} />}
              />
            </div>
          )}
        </>
      ) : (
        <>
          {/* Lu DÈS L'ENTRÉE : on ne guide pas quelqu'un pendant quatre étapes
              pour lui refuser la publication au bout. */}
          <AtelierStepper
            etapes={ETAPES_EVENEMENT}
            courante={etape}
            hrefPour={hrefPour}
          />

          <section
            aria-label={`Étape ${numero} sur ${ETAPES_EVENEMENT.length} — ${titreEtapeEvenement(etape)}`}
          >
            {etape === "jeu" && (
              <EventGameSettings gameId={game.id} name={game.name} />
            )}

            {etape === "manches" && (
              <EventQuestionsSection gameId={game.id} questions={questions} />
            )}

            {etape === "soiree" && (
              <EventSessionsPrepareSection
                gameId={game.id}
                gameActive={status === "active"}
                sessions={sessions}
              />
            )}

            {etape === "verification" && (
              <AtelierEventVerification
                gameId={game.id}
                entree={{
                  nombreQuestions: questions.length,
                  status,
                  salles: sessions.map((s) => ({
                    label: s.label,
                    joinCode: s.joinCode,
                    rewardLabel: s.rewardLabel,
                    rewardStock: s.rewardStock,
                    codeTtlDays: s.codeTtlDays,
                  })),
                }}
              />
            )}
          </section>

          <AtelierNavigationEtape
            precedente={etapeVoisine(ETAPES_EVENEMENT, etape, -1)}
            suivante={etapeVoisine(ETAPES_EVENEMENT, etape, 1)}
            hrefPour={hrefPour}
          />

          <Link
            href={`/dashboard/events/${game.id}`}
            className="inline-block text-sm font-bold text-k-body hover:text-k-ink"
          >
            ← Retour au suivi
          </Link>
        </>
      )}
    </div>
  );
}
