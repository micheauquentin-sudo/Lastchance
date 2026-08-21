import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { reportError, reportSecurityEvent } from "@/lib/monitoring";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Purge RGPD automatique : GET /api/cron/purge-data
 *
 * Déclenché par un cron (Vercel Cron). Protégé par CRON_SECRET (header
 * Authorization: Bearer …). Pour chaque organisation ayant choisi une
 * durée de conservation (data_retention_months), supprime :
 *  - les participations (données personnelles : prénom/email/téléphone)
 *    plus anciennes que la durée choisie ;
 *  - les abonnés newsletter désinscrits depuis plus longtemps que cette
 *    durée (minimisation — aucune base légale à les garder après leur
 *    désinscription + la période de conservation).
 *  - les joueurs des championnats de pronostics et leurs grilles associées.
 *  - les joueurs des chasses au trésor (scans et complétions en cascade).
 *  - les passeports de fidélité DORMANTS (tampons et récompenses en cascade),
 *    bornés à la dernière activité (voir purge_expired_loyalty_members).
 *  - les joueurs de jackpot DORMANTS (identité + cooldown), bornés à la
 *    dernière activité (voir purge_expired_jackpot_players ; les entrées de
 *    tirage et les gains anonymes, sans PII, ne sont pas cascadés).
 *  - la PII des participations de QUIZ anciennes : NEUTRALISÉE (prénom, email,
 *    avatar, opt-in) et non supprimée, pour ne pas détruire le registre des
 *    codes émis ni le classement (voir purge_expired_quiz_players).
 *  - les SCOPES de méta-progression dormants (clés, missions, badges, objets et
 *    ouvertures de coffre en cascade), bornés à la dernière activité de
 *    l'appartenance joueur ; la configuration du commerçant reste intacte
 *    (voir purge_expired_meta_progression).
 *  - les LOBBIES joueurs expirés et leurs membres (pseudos saisis en salle
 *    d'attente), datés sur `expires_at` et non sur l'heure du cron — ADR-111,
 *    voir purge_expired_lobbies.
 * ⚠️ CE N'EST PAS UN OPT-IN, et l'écrire ici était faux — sur le premier
 * fichier qu'on ouvre pour savoir QUI est purgé. `00019:18-19` a posé
 * `data_retention_months default 12` ET rempli toutes les lignes existantes :
 * plus aucune organisation ne porte `null`, et aucune n'a rien coché. CHAQUE
 * organisation purge, à douze mois par défaut, et la valeur reste modifiable
 * par le propriétaire (bornée `between 1 and 60` par `00016`).
 * `20260902120000:82-83` le dit déjà côté base ; la conséquence pratique est
 * que rien ici n'est conditionné à un choix du commerçant.
 *
 * Hygiène technique (indépendante de la rétention choisie) : les mesures
 * d'exploitation de plus de 30 j, les seaux de rate-limit expirés, et le
 * journal de santé des workers (ops_worker_runs — rétention 30 j et
 * fermeture des exécutions abandonnées, sans quoi un `running` éternel
 * ferait mentir `last_status` indéfiniment).
 *
 * Et une SONDE, qui ne purge rien : le journal d'échecs du moteur de
 * méta-progression sur 24 h, remonté en événement de sécurité s'il n'est pas vide
 * (voir plus bas — le trigger avale ses erreurs mission par mission, personne ne
 * verrait un échec systématique autrement).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Ouverture BEST-EFFORT : une purge RGPD ne peut pas être suspendue
  // parce que le journal de santé est indisponible (table absente tant
  // que la migration 20260805240000 n'est pas appliquée, base
  // momentanément injoignable). `null` = pas de journal, la purge
  // continue ; l'échec est déjà remonté à Sentry par startWorkerRun.
  const run = await startWorkerRunSafely(admin, "purge-data");

  const [
    personal,
    contests,
    hunts,
    loyalty,
    jackpot,
    events,
    calendars,
    referral,
    quizzes,
    progression,
    experienceEvents,
    rewardIssuances,
    lobbies,
  ] = await Promise.all([
    admin.rpc("purge_expired_personal_data"),
    admin.rpc("purge_expired_contest_players"),
    admin.rpc("purge_expired_hunt_players"),
    admin.rpc("purge_expired_loyalty_members"),
    admin.rpc("purge_expired_jackpot_players"),
    admin.rpc("purge_expired_event_sessions"),
    admin.rpc("purge_expired_calendar_players"),
    admin.rpc("purge_expired_referral_data"),
    // Quiz : la purge NEUTRALISE la PII (prénom, email, avatar, opt-in) au lieu de
    // supprimer la participation — supprimer cascaderait quiz_answers ET
    // quiz_rewards, détruisant le registre des codes émis (un lot non encore remis
    // en caisse deviendrait inexploitable) et le classement. Il ne reste ensuite
    // qu'un hash non inversible, un score et un temps.
    admin.rpc("purge_expired_quiz_players"),
    // Méta-progression : supprime les SCOPES joueur (progression_player_seasons)
    // dormants depuis plus longtemps que la rétention choisie — missions,
    // contributions, badges, objets et ouvertures de coffre partent en cascade.
    // La fenêtre se mesure sur `last_progress_at` (l'activité réelle DANS la
    // saison) et une organisation sans rétention déclarée n'y échappe pas : elle
    // retombe sur le plafond de 24 mois. La CONFIGURATION du commerçant
    // (saisons, missions, collections, coffres) reste intacte : elle ne porte
    // aucune donnée personnelle. Le même appel borne à 90 j le journal de panne
    // du moteur. Aucun code de caisse n'est concerné, ce module n'en émet pas.
    admin.rpc("purge_expired_meta_progression"),
    // Journal d'expérience : `experience_events` est alimentée par CINQ
    // triggers, sur chaque tour de roue, chaque scan et chaque complétion des
    // neuf modules. Sa purge existait, était autorisée au service role
    // (20260805160000), et **n'était appelée par personne** : la fonction
    // dormait depuis sa création et la table croissait sans borne, sans
    // respecter aucune rétention.
    //
    // C'est la seule purge conçue pour s'appliquer SANS opt-in du commerçant :
    // une organisation qui n'a pas déclaré de rétention retombe sur un plafond
    // de 13 mois, au lieu d'être épargnée. Un journal d'analytique qui garde
    // indéfiniment un `player_key` n'est pas un détail d'exploitation.
    //
    // Trouvée par une critique de complétude, pas par l'audit : `docs/audit-3-
    // backlog.md` cochait « ✅ Purge / rétention » sur la seule EXISTENCE de la
    // fonction. L'existence n'est pas l'exécution.
    admin.rpc("purge_expired_experience_events"),
    // Registre universel : `reward_issuances` n'avait ni purge ni propagation
    // de suppression — ses dix triggers de miroir sont `after insert or
    // update`, jamais `after delete`, et `source_id` est polymorphe, sans clé
    // étrangère. Après la purge RGPD d'un module, le registre conservait donc
    // indéfiniment le code de retrait, le libellé, le panier encaissé et
    // l'identifiant du caissier.
    //
    // Aggravé par la migration 20260807120000, qui y a rétro-alimenté tout le
    // parc historique : le registre est passé d'un miroir des émissions
    // récentes à une copie de l'intégralité de l'historique.
    //
    // Même fenêtre de rétention que les purges de module — c'est ce qui tient
    // lieu de propagation. Mais un lot ENCORE ENCAISSABLE n'est jamais
    // supprimé : le perdre ferait dire « code introuvable » à un caissier
    // tenant un lot valide, exactement ce que le registre existe pour éviter.
    //
    // ⚠️ CETTE PHRASE A ÉTÉ FAUSSE, ET ELLE EST REDEVENUE VRAIE PAR UN AUTRE
    // MÉCANISME QUE CELUI QU'ELLE DÉCRIT — d'où ce paragraphe.
    //
    // `20260902120000` a fait de la purge son propre déclencheur : les cinq
    // purges ci-dessus suppriment une ligne SOURCE sur le seul critère d'âge,
    // la cascade armait le trigger d'annulation du registre, la ligne devenait
    // donc « terminée », donc purgeable — la nuit même. Sept familles sur neuf
    // n'ayant aucune expiration, ces lignes étaient auparavant protégées À VIE.
    // Un lot encore dû disparaissait ainsi en deux temps, dans la même
    // exécution de ce cron.
    //
    // Ce qui la rend vraie aujourd'hui n'est PAS « une ligne annulée n'est pas
    // purgée » — une annulation DÉCIDÉE l'est toujours. C'est que la purge pose
    // désormais une cause distincte (`cancelled_reason = « source purgée »`,
    // via le réglage `lastchance.purge_maintenance`) et que
    // `purge_expired_reward_issuances` refuse de tenir cette cause-là pour
    // terminale. Autrement dit la protection ne tient pas à l'état de la ligne
    // mais à QUI l'a annulée — et donc à l'ORDRE des deux gestes dans une même
    // transaction. Déplacer l'un des cinq `set_config`, ou annuler une source
    // hors de ce cron sans poser le réglage, rendrait cette phrase fausse une
    // seconde fois sans qu'aucun appel de ce fichier n'ait changé.
    admin.rpc("purge_expired_reward_issuances"),
    // Lobbies joueurs (L16) : salles d'attente gratuites, et les pseudos qu'on
    // y saisit. Aucune donnée d'abonné, aucun code encaissable — mais un pseudo
    // reste une saisie de personne, et une salle morte n'a plus de raison
    // d'exister une seconde de plus que son `expires_at`.
    //
    // SON SEUIL EST DATÉ SUR `expires_at`, PAS SUR `now()` (ADR-111), et c'est
    // ce qui la distingue des purges ci-dessus : l'expiration d'un lobby est
    // CONSTATÉE à la lecture, aucun worker ne l'écrit. Un cron qui rattrape
    // trois jours de retard efface donc exactement ce qu'il aurait effacé à
    // l'heure — et une panne de ce cron ne prolonge la vie d'aucune salle,
    // puisque rien n'attendait le cron pour qu'elle soit morte.
    admin.rpc("purge_expired_lobbies"),
  ]);

  // Seaux de rate-limit expirés : `public.rate_limits` est une table de
  // compteurs à fenêtre fixe, jamais nettoyée par ses écrivains (chaque nouvelle
  // fenêtre insère une ligne, les seaux d'échecs de fidélité en ajoutent
  // encore). Sans cet appel elle croît indéfiniment. Rétention 24 h = la plus
  // longue fenêtre en vigueur, `RATE_LIMITS.newsletterSend` (86 400 s) ; les
  // suivantes sont très en dessous (authSignup 1 h, pronoRegisterIp 1 h).
  // NE PAS abaisser cette valeur sans vérifier RATE_LIMITS : une rétention plus
  // courte que la plus longue fenêtre remettrait à zéro des compteurs
  // anti-spam ENCORE actifs.
  const { error: bucketsError } = await admin.rpc("prune_rate_limits", {
    p_older_than_seconds: 86_400,
  });
  if (bucketsError) reportError("cron.purge-data.rate-limits", bucketsError.message);

  // Santé du MOTEUR de méta-progression. Le trigger `apply_meta_progression_event`
  // attrape ses erreurs MISSION PAR MISSION pour ne jamais casser l'événement
  // analytique porteur : sans ce relevé, une mission qui ne progresse JAMAIS —
  // pour TOUS les joueurs d'une enseigne — est totalement silencieuse (le journal
  // se remplit, personne ne le lit, et le commerçant constate seulement que « les
  // missions ne bougent pas »). Ce cron tourne à 03:00 tous les jours : la fenêtre
  // de 24 h se recolle exactement d'une exécution à l'autre, sans trou ni double
  // comptage. Relevé APRÈS la purge, qui n'efface que les traces hors rétention.
  // Best-effort et jamais bloquant : une sonde muette ne doit pas faire échouer
  // une purge RGPD réussie.
  const { data: engineFailures, error: engineError } = await admin
    .from("progression_engine_failures")
    .select("mission_id, sqlstate")
    .gt("failed_at", new Date(Date.now() - 86_400_000).toISOString())
    .limit(200);
  if (engineError) {
    reportError("cron.purge-data.progression-engine", engineError.message);
  } else if ((engineFailures ?? []).length > 0) {
    const rows = engineFailures ?? [];
    reportSecurityEvent("progression_engine_failures", {
      sampled: rows.length,
      // La ventilation par mission EST le signal : concentré = une configuration
      // cassée, réparti = une panne de plateforme.
      missions_affected: new Set(
        rows.flatMap((row) => (row.mission_id ? [row.mission_id] : [])),
      ).size,
      sqlstates: [...new Set(rows.map((row) => row.sqlstate ?? "inconnu"))],
    });
  }

  // Mesures d'exploitation : sans valeur au-delà de 30 jours.
  const { error: metricsError } = await admin
    .from("ops_metrics")
    .delete()
    .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (metricsError) reportError("cron.purge-data.metrics", metricsError.message);

  // Journal de santé des workers : MÊME NIVEAU que l'hygiène ci-dessus —
  // aucune donnée personnelle, aucune dépendance à la rétention choisie
  // par le commerçant, et surtout jamais bloquant pour la purge RGPD, qui
  // est la raison d'être de ce cron. La fonction fait deux gestes
  // indissociables (refermer les exécutions abandonnées, puis purger
  // au-delà de 30 j en préservant la dernière exécution et le dernier
  // succès de chaque worker) ; ses valeurs par défaut sont celles de la
  // migration, on ne les redéclare pas ici.
  let workerRunsReaped = 0;
  let workerRunsDeleted = 0;
  const { data: workerRunsPurge, error: workerRunsError } = await admin.rpc(
    "purge_ops_worker_runs",
  );
  if (workerRunsError) {
    reportError("cron.purge-data.worker-runs", workerRunsError.message);
  } else {
    const row = ((workerRunsPurge ?? []) as Array<{
      reaped?: number;
      deleted?: number;
    }>)[0];
    workerRunsReaped = Number(row?.reaped ?? 0);
    workerRunsDeleted = Number(row?.deleted ?? 0);
  }

  if (
    personal.error ||
    contests.error ||
    hunts.error ||
    loyalty.error ||
    jackpot.error ||
    events.error ||
    calendars.error ||
    referral.error ||
    quizzes.error ||
    progression.error ||
    experienceEvents.error ||
    rewardIssuances.error ||
    lobbies.error
  ) {
    reportError(
      "cron.purge-data",
      personal.error?.message ??
        contests.error?.message ??
        hunts.error?.message ??
        loyalty.error?.message ??
        jackpot.error?.message ??
        events.error?.message ??
        calendars.error?.message ??
        referral.error?.message ??
        quizzes.error?.message ??
        progression.error?.message ??
        experienceEvents.error?.message ??
        rewardIssuances.error?.message ??
        lobbies.error?.message ??
        "unknown",
    );
    // Le message d'origine part à Sentry ; le journal de santé ne garde
    // qu'une catégorie, sans nom de table ni identifiant d'organisation.
    await finishWorkerRunSafely(
      admin,
      run,
      "failed",
      { workerRunsReaped, workerRunsDeleted },
      "purge_failed",
    );
    return NextResponse.json({ error: "Purge impossible" }, { status: 500 });
  }
  const result = ((personal.data ?? [])[0] ?? {}) as {
    organizations_processed?: number;
    participations_deleted?: number;
    subscribers_deleted?: number;
  };

  // Les trois gestes d'hygiène (seaux, mesures, journal des workers) et la
  // sonde du moteur sont best-effort : ils n'annulent pas une purge RGPD
  // réussie, ils DÉGRADENT le passage au lieu de l'échouer — sans quoi leur
  // panne serait aussi muette que celle qu'ils servent à révéler.
  const hygieneDegraded = Boolean(
    bucketsError || metricsError || engineError || workerRunsError,
  );
  // Clôture best-effort : la purge est faite, la signaler comme échouée
  // ferait mentir la réponse sur un travail RGPD réellement accompli.
  await finishWorkerRunSafely(
    admin,
    run,
    hygieneDegraded ? "degraded" : "succeeded",
    {
      orgsProcessed: result.organizations_processed ?? 0,
      participationsDeleted: result.participations_deleted ?? 0,
      subscribersDeleted: result.subscribers_deleted ?? 0,
      contestPlayersDeleted: Number(contests.data ?? 0),
      huntPlayersDeleted: Number(hunts.data ?? 0),
      loyaltyMembersDeleted: Number(loyalty.data ?? 0),
      jackpotPlayersDeleted: Number(jackpot.data ?? 0),
      eventPlayersDeleted: Number(events.data ?? 0),
      calendarPlayersDeleted: Number(calendars.data ?? 0),
      referralDataPurged: Number(referral.data ?? 0),
      quizPlayersAnonymized: Number(quizzes.data ?? 0),
      progressionScopesDeleted: Number(progression.data ?? 0),
      lobbiesDeleted: Number(lobbies.data ?? 0),
      workerRunsReaped,
      workerRunsDeleted,
    },
    hygieneDegraded ? "hygiene_partial_failure" : undefined,
  );

  return NextResponse.json(
    {
      ok: true,
      orgsProcessed: result.organizations_processed ?? 0,
      participationsDeleted: result.participations_deleted ?? 0,
      subscribersDeleted: result.subscribers_deleted ?? 0,
      contestPlayersDeleted: Number(contests.data ?? 0),
      huntPlayersDeleted: Number(hunts.data ?? 0),
      loyaltyMembersDeleted: Number(loyalty.data ?? 0),
      jackpotPlayersDeleted: Number(jackpot.data ?? 0),
      eventPlayersDeleted: Number(events.data ?? 0),
      calendarPlayersDeleted: Number(calendars.data ?? 0),
      referralDataPurged: Number(referral.data ?? 0),
      quizPlayersAnonymized: Number(quizzes.data ?? 0),
      progressionScopesDeleted: Number(progression.data ?? 0),
      lobbiesDeleted: Number(lobbies.data ?? 0),
      workerRunsReaped,
      workerRunsDeleted,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
