import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { salleOuverteAuJoueur } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { readModulePageOpenCounts } from "@/lib/module-page-opens";
import { EventStatusBadge } from "@/components/dashboard/event-status";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { relanceADeQuoiSAfficher } from "@/components/dashboard/relaunch-formula-state";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
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
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { Card } from "@/components/ui/card";
import { construireActivationEvent } from "@/lib/activation/events";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { carteTuile } from "@/lib/checklist/carte-tuile";
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

  /**
   * LA PREMIÈRE SALLE QUE LE JOUEUR PEUT RÉELLEMENT OUVRIR.
   *
   * `sessions[0]` était pris tel quel, sans regarder son statut — et une
   * session naît `draft` : le défaut de `event_sessions`, que
   * `createEventSession` ne pose jamais. Or `event_etat_partage` refuse
   * `draft`, donc « Voir le jeu » menait à « page introuvable » tant que
   * l'organisateur n'avait pas ouvert la salle depuis la télécommande.
   *
   * `find` et non `[0]` : une soirée porte plusieurs salles, et la plus
   * ancienne peut rester un brouillon pendant qu'une autre tourne — le lien
   * doit viser celle qui s'ouvre, pas celle qui a été créée en premier.
   *
   * `null` quand aucune ne s'ouvre : `VoirLeJeu` ne rend alors rien, ce qui
   * est son contrat (« un bouton qui mène à un écran fermé est pire que pas
   * de bouton »).
   */
  const salleVisitable = sessions.find((s) => salleOuverteAuJoueur(s.status));

  const status = game.status as EventGameStatus;
  const etape = parseEtape(ETAPES_EVENEMENT, etapeParam, "nulle");
  const hrefPour = (cle: string) => hrefEtapeEvenement(game.id, cle);

  // Relance : le Mode événement est le seul module à
  // porter une vraie RÉPÉTITION : un jeu encore en brouillon dont une salle est
  // déjà ouverte. Les statuts de salle viennent de `sessions`, déjà chargées.
  const marqueurs = {
    status,
    sessions: sessions.map((session) => ({ status: session.status })),
  };
  const peutCreerBrouillon = role === "owner" || role === "editor";
  // L'enveloppe repliable suit le MÊME verdict que la carte qu'elle contient :
  // sans ce test, elle restait à l'écran et s'ouvrait sur du vide, parce que
  // `RelaunchFormulaCard` rend `null` tant que l'animation n'est pas
  // terminée. Le pourquoi est écrit une fois, sur `relanceADeQuoiSAfficher`.
  const relance = {
    sourceState: etatSourceRelance("event", marqueurs),
    canCreateDraft: peutCreerBrouillon,
    isSupported: true,
  };

  const numero = etape ? numeroEtape(ETAPES_EVENEMENT, etape) : 0;

  /**
   * LA VÉRIFICATION, CALCULÉE UNE FOIS — POUR LES DEUX VISAGES.
   *
   * L'étape « La vérification » la rendait déjà ; la vue suivi en a désormais
   * besoin elle aussi, pour statuer ses tuiles. Un seul objet d'entrée, hissé
   * au-dessus du branchement : deux constructions séparées finiraient par
   * diverger, et la page dirait « tout est prêt » d'un côté pendant que
   * l'atelier dirait le contraire.
   */
  const entreeActivation = {
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
  const tuiles = tuilesDuModule(
    "evenement",
    construireActivationEvent(entreeActivation).controles,
  );
  /**
   * Titre, ancre, rang et verdict d'un bloc — TOUS pris dans
   * `checklist/tuiles.ts`. La page ne renomme ni ne renumérote rien :
   * réordonner la checklist réordonne les pastilles, et c'est le seul endroit
   * à toucher.
   */
  const bloc = (cle: string) => carteTuile(tuiles, cle);

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
          {/* OUVERT : c'est le geste de publication, et la Carte de
              l'Aventure y renvoie. Seul bloc de la page à le rester. */}
          <CarteRepliable {...bloc("statut")}>
            <EventGameStatusControls
              gameId={game.id}
              status={status}
              hrefJeu={salleVisitable?.publicUrl ?? null}
              // Les DEUX portes d'atelier de cette carte suivent l'entrée
              // principale : masquée pour l'une, redirigée vers le studio pour
              // l'autre, au-delà de `lg`. Voir l'en-tête de la prop.
              hrefStudio={`/studio/soiree/${game.id}`}
            />
          </CarteRepliable>

          {/* REPLIÉ : ce qui s'anime le soir venu, pas ce qui se prépare. */}
          <CarteRepliable
            {...bloc("suivi")}
            defaultOuvert={false}
            resume={
              sessions.length === 0
                ? "Aucune session préparée"
                : `${sessions.length} session${sessions.length > 1 ? "s" : ""}`
            }
          >
            <EventSessionsSection sessions={sessions} />
          </CarteRepliable>

          {/* LE STUDIO REMPLACE L'ATELIER AU-DELÀ DE `lg` (VIT-47).

              Tout s'y règle en voyant le téléphone du client. La carte est donc
              OUVERTE d'emblée : un commerçant qui vient régler quelque chose
              doit tomber dessus, pas la déplier.

              Elle ne s'affiche qu'à partir de `lg`, parce que le studio est à
              deux colonnes : en dessous, elles s'empilent et l'aperçu passe sous
              les réglages, ce qui lui retire sa raison d'être. Même arbitrage,
              et même motif, que `/dashboard/vitrine`, `/dashboard/calendar` et
              `/dashboard/quiz`.

              LA PASTILLE DE PRÉPARATION SUIT L'ENTRÉE PRINCIPALE : elle
              appartient à la préparation, pas à un écran. Sur grand écran, c'est
              le studio. */}
          <div className="hidden lg:block">
            <CarteRepliable
              {...bloc("atelier")}
              titre="Mon studio"
              defaultOuvert
              resume={`${questions.length} question${questions.length > 1 ? "s" : ""} — tout se règle ici, en voyant le résultat.`}
            >
              {/* LE BLOC ENVELOPPÉ PORTE SON PROPRE `<h2>`, ET CE N'EST PAS
                  DÉCORATIF. `CarteRepliable` rend son titre replié dans un
                  `<span>` — jamais un heading — précisément parce que le bloc
                  qu'elle enveloppe en porte déjà un du même nom (voir son
                  en-tête). Sans ce `<h2>`, la carte n'a AUCUN titre dans l'arbre
                  d'accessibilité : un lecteur d'écran ne l'annonce pas, et les
                  E2E qui cherchent `getByRole("heading")` ne la trouvent pas non
                  plus. */}
              <Card>
                <h2 className="font-semibold mb-1">Mon studio</h2>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm text-k-body">
                    Le téléphone de vos clients au centre, les réglages autour.
                    Le nom de la soirée, vos questions, leur rythme, les salles,
                    le lot et le QR — tout s&apos;y règle en voyant le résultat.
                  </p>
                  <Link
                    href={`/studio/soiree/${game.id}`}
                    className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
                  >
                    Ouvrir le studio
                  </Link>
                </div>
              </Card>
            </CarteRepliable>
          </div>

          {/* L'ATELIER RESTE, POUR LE TÉLÉPHONE. Ce qui est masqué au-delà de
              `lg` est l'ENTRÉE, jamais la ROUTE : `?etape=` demeure atteignable
              sur n'importe quelle taille d'écran — une adresse d'étape gardée en
              favori doit continuer de mener quelque part. */}
          <div className="lg:hidden">
            <CarteRepliable
              {...bloc("atelier")}
              defaultOuvert={false}
              resume={`${ETAPES_EVENEMENT.length} étapes de préparation.`}
            >
              <AtelierEntree
                etapes={ETAPES_EVENEMENT}
                hrefPour={hrefPour}
                titre="L'atelier de la soirée"
                sousTitre="Le nom du jeu, ses manches et le lot de chaque session. Chaque étape s'enregistre pour elle-même : vous pouvez vous arrêter et revenir."
              />
            </CarteRepliable>
          </div>

          <RelanceErreur message={relanceError} />

          {/* REPLIÉ : on relance une formule APRÈS la soirée, pas pendant
              qu'on la prépare. Le lien « Relancer » de la conclusion vise
              `#relance`, qui rouvre le bloc. */}
          {capacites.canExplore && relanceADeQuoiSAfficher(relance) && (
            <CarteRepliable
              {...bloc("relance")}
              defaultOuvert={false}
              resume="Repartir de ce jeu pour la prochaine soirée"
            >
              <RelaunchFormulaCard
                sourceName={game.name}
                occasionLabel="la prochaine soirée"
                {...relance}
                action={<RelaunchFormulaAction kind="event" sourceId={game.id} />}
              />
            </CarteRepliable>
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
                entree={entreeActivation}
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
