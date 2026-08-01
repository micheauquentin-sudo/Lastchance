"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { logAdminAction } from "@/lib/admin/audit";
import { AdminForbiddenError, authorizeAction } from "@/lib/admin/auth";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import { authorizeOrTrace } from "@/lib/admin/denied-trace";
import {
  buildWorkerCronUrl,
  checkCadenceEnvironment,
} from "@/lib/admin/worker-cadence";
import { APP_URL, optionalEnv } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { workerCadenceSchema } from "@/lib/validations/admin";
import type { ActionResult } from "@/lib/utils";

/**
 * Teste la chaîne HTTP + file + claim + clôture avec un job inerte.
 * Le mode probe de la route ne réclame aucun job métier et ne draine
 * aucun webhook.
 */
export async function runWorkerProbe(
  _previous: ActionResult | null,
): Promise<ActionResult> {
  void _previous;
  let actor;
  try {
    actor = await authorizeAction("monitoring.probe");
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof AdminForbiddenError
          ? error.message
          : "Action non autorisée.",
    };
  }

  const cronSecret = optionalEnv("CRON_SECRET");
  if (!cronSecret) {
    return { ok: false, error: "CRON_SECRET n'est pas configuré." };
  }

  const admin = createAdminClient();
  const probeKey = `ops-probe:${actor.id}:${randomUUID()}`;
  const enqueued = await enqueueJob(admin, {
    type: "ops.probe",
    payload: {},
    idempotencyKey: probeKey,
    maxAttempts: 1,
  });
  if (!enqueued) {
    return { ok: false, error: "Impossible de déposer le test dans la file." };
  }

  try {
    const response = await fetch(new URL("/api/cron/jobs?probe=1", APP_URL), {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as {
      probe?: boolean;
      completed?: number;
    };
    const ok =
      response.ok
      && body.probe === true
      && Number(body.completed ?? 0) >= 1;

    await logAdminAction({
      actor,
      action: "monitoring.worker.probe",
      targetType: "worker",
      metadata: {
        ok,
        http_status: response.status,
        completed: Number(body.completed ?? 0),
      },
    });
    revalidatePath("/admin/monitoring");
    return ok
      ? { ok: true, data: undefined }
      : { ok: false, error: "Le worker n'a pas terminé le job de test." };
  } catch (error) {
    reportError("admin.worker-probe", error);
    await logAdminAction({
      actor,
      action: "monitoring.worker.probe",
      targetType: "worker",
      metadata: { ok: false, failure: "request_failed" },
    });
    return { ok: false, error: "Le worker est injoignable." };
  }
}

/* ════════════════════════════════════════════════════════════
 * CADENCE RAPIDE — poser dans le Vault les deux secrets qui réveillent
 * le pg_cron, sans qu'aucun humain ne voie le secret.
 *
 * ── Le fait produit ──
 *
 * `/api/cron/jobs` ne tourne QU'UNE FOIS PAR JOUR : `vercel.json` le planifie à
 * `20 4 * * *`, et le plan Hobby n'accepte pas mieux (assertion « les crons
 * Vercel restent quotidiens » dans `cron-coverage.test.ts`). Conséquence
 * mesurable pour un client : un code de retrait envoyé par SMS peut arriver
 * 24 h après le gain.
 *
 * ── Pourquoi cette action, plutôt qu'un bout de SQL collé à la main ──
 *
 * `CRON_SECRET` est une variable d'environnement SENSIBLE de Vercel : elle ne se
 * relit ni par la CLI ni par personne. L'APPLICATION, elle, l'a dans son propre
 * environnement — c'est même elle qui la vérifie à chaque appel de cron. Elle
 * peut donc la déposer dans le Vault sans que la valeur transite par un humain,
 * un presse-papier ou un journal. Un opérateur qui collerait le SQL devrait
 * d'abord faire ressortir le secret quelque part ; ici, il ne le voit jamais.
 *
 * ── Ce que cette action NE fait pas ──
 *
 * Elle ne planifie rien : le pg_cron `lastchance-jobs-worker` existe depuis
 * `20260722100000_jobs_queue.sql`, toutes les 5 minutes, et porte lui-même sa
 * garde (`where (select count(*) from vault.decrypted_secrets where name in
 * (…)) = 2`). Il est inerte faute des deux secrets, et rien d'autre.
 * ════════════════════════════════════════════════════════════ */

/**
 * Nom de la RPC qui écrit dans le Vault
 * (`20260831120000_worker_vault_write.sql`) :
 *
 *   public.set_worker_vault_secrets(p_worker text, p_url text, p_secret text)
 *
 * `security definer`, `service_role` seule, `revoke all … from public, anon,
 * authenticated`. Elle lit `vault_url_secret` / `vault_shared_secret` dans
 * `ops_worker_definitions` — l'appelant ne CHOISIT donc pas où le secret est
 * écrit — puis crée ou remplace les deux entrées du Vault.
 *
 * Tant qu'elle n'existe pas, l'appel échoue proprement (PostgREST `PGRST202`)
 * et cette action le dit : aucun demi-état, aucun secret posé à moitié.
 */
const RPC_CADENCE = "set_worker_vault_secrets";

/**
 * Ce que la RPC REND — et pourquoi il faut le lire, sous peine de journaliser
 * un refus comme un succès.
 *
 * Cette fonction ne LÈVE que sur un refus d'autorisation. Les cinq refus
 * MÉTIER (`unknown_worker`, `no_vault_secrets`, `registry_conflict`,
 * `empty_value`, `vault_error`) sont RENDUS dans `status`, délibérément.
 *
 * LA RAISON, CORRIGÉE. La première rédaction affirmait ici qu'une exception
 * ferait journaliser le jeton par PostgreSQL, « STATEMENT + DETAIL: parameters ».
 * C'est FAUX sur la configuration mesurée : `log_min_error_statement` gouverne
 * le TEXTE de l'instruction, pas ses VALEURS ; les valeurs relèvent de
 * `log_parameter_max_length_on_error`, qui vaut `0` — PostgreSQL ne journalise
 * donc AUCUN paramètre lié, et PostgREST lie le corps en `$1`. Sur une levée,
 * le journal montre `$1`, jamais le jeton.
 *
 * La vraie raison est plus solide que celle qu'elle remplace, et c'est
 * pourquoi il ne faut PAS défaire ce design en découvrant que la fuite
 * n'existait pas : un refus PRÉVISIBLE — worker inconnu, registre à moitié
 * rempli — n'a rien à faire dans un journal d'ERREUR ; le rendre ne dépend
 * d'AUCUN réglage de journalisation, et reste correct le jour où quelqu'un
 * relève `log_parameter_max_length_on_error` pour diagnostiquer autre chose.
 * C'est de la défense en profondeur, pas une fuite colmatée.
 *
 * Conséquence directe et non théorique : sur un refus, `error` vaut `null`.
 * Un appelant qui ne regarde que `error` afficherait un succès ET écrirait à
 * l'audit une activation qui n'a PAS eu lieu. C'est la classe de défaut que ce
 * projet a déjà payée — « un back-office qui n'enregistrait que ses succès » —
 * ici retournée : un journal qui n'enregistre que des succès, y compris quand
 * il n'y en a pas.
 *
 * On lit donc `written`, et non `status === 'written'` : le jour où un statut
 * s'ajoute côté base, un test sur le libellé se tromperait en silence, un test
 * sur le booléen non. `status` sert à DIRE pourquoi, jamais à décider.
 */
interface CadenceRpcRow {
  status: string;
  written: boolean;
  url_secret_name: string | null;
  shared_secret_name: string | null;
  url_created: boolean | null;
  shared_created: boolean | null;
  also_affects_workers: string[] | null;
  /** SQLSTATE seul (5 caractères), jamais `sqlerrm`. Sûr à journaliser. */
  error_code: string | null;
}

/**
 * Message d'écran par statut de refus. Aucun ne recopie une valeur transmise :
 * ce sont des phrases fixes indexées par une étiquette fermée.
 */
const CADENCE_REFUS_MESSAGES: Record<string, string> = {
  unknown_worker: "Worker inconnu du registre.",
  no_vault_secrets:
    "Ce worker n'a pas de cadence rapide : aucun secret Vault ne lui est associé dans le registre.",
  registry_conflict:
    "Le registre donne le même nom aux deux entrées Vault de ce worker : l'écriture poserait le jeton dans l'entrée d'URL. Corrigez le registre avant de réessayer.",
  empty_value:
    "L'URL ou le secret transmis est vide : le planificateur se réveillerait toutes les 5 minutes pour ne rien faire.",
  vault_error:
    "Le Vault a refusé l'écriture. Rien n'a été posé : les deux entrées sont écrites ensemble ou pas du tout.",
};

/**
 * Active la cadence rapide d'un worker (5 min côté Postgres au lieu du cron
 * quotidien de Vercel).
 *
 * Six gardes, chacune pour une raison DIFFÉRENTE :
 *
 *  1. RBAC — `monitoring.cadence`, super_admin seul, session fraîche exigée, et
 *     le refus est tracé. Ce n'est pas un geste de commerçant.
 *  2. L'URL doit être joignable depuis Postgres — publique, en https, ni boucle
 *     locale ni réseau privé. Voir l'en-tête de `@/lib/admin/worker-cadence`.
 *  3. Le déploiement doit ÊTRE la production. Distincte de la 2, et c'est tout
 *     le point : la 2 dit « public », la 3 dit « nous ». Une preview porte le
 *     même code, le même back-office et le même `CRON_SECRET`, sur une URL
 *     publique en https que la 2 accepte : armer depuis elle fait émettre le
 *     jeton par Postgres, 288 fois par jour, vers un hôte qui n'est pas la
 *     production — et fait DISPARAÎTRE le bouton qui répare.
 *  4. `CRON_SECRET` absente : refus DIT. Un échec muet ici laisserait croire la
 *     cadence armée alors que le pg_cron resterait sous sa garde des deux
 *     secrets.
 *  5. Le secret ne sort nulle part : ni dans le retour, ni dans l'audit, ni
 *     dans un message d'erreur, ni dans Sentry. Seuls les NOMS des entrées du
 *     Vault circulent, et vers le journal seulement — le retour de l'action ne
 *     porte plus rien du tout.
 *  6. Le STATUT RENDU par la RPC décide, et non l'absence d'erreur. La RPC ne
 *     lève que sur un refus d'autorisation : ses refus métier arrivent avec
 *     `error === null`, et les ignorer ferait afficher un succès ET journaliser
 *     une activation qui n'a pas eu lieu.
 */
export async function enableWorkerFastCadence(
  formData: FormData,
): Promise<ActionResult> {
  // ── GARDE 1 : RBAC + fraîcheur, refus tracé ──────────────
  const guard = await authorizeOrTrace(
    "monitoring.cadence",
    "monitoring.cadence.enable.denied",
    // `targetId` reste nul : `auditTargetId` n'accepte qu'un uuid, or la cible
    // est ici un NOM de worker. Il part donc dans `metadata` plutôt que de
    // forcer une valeur que la contrainte de la table refuserait — auquel cas
    // on perdrait la trace, précisément pour la requête fabriquée qu'on
    // cherche à voir.
    { type: "worker", id: null },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = workerCadenceSchema.safeParse({ worker: formData.get("worker") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { worker } = parsed.data;

  const db = createAdminBackofficeClient();

  /* Le registre décide QUELS workers ont une cadence rapide, et sous quels
   * noms de secrets. Deux lignes seulement portent aujourd'hui les deux
   * colonnes (`jobs`, `sync-contests`) ; les autres sont des crons quotidiens
   * sans prérequis Vault. Lire la ligne AVANT l'appel n'est que le message :
   * la RPC relit le registre et reste le rempart. */
  const { data: definition, error: definitionError } = await db
    .from("ops_worker_definitions")
    .select("worker, vault_url_secret, vault_shared_secret")
    .eq("worker", worker)
    .maybeSingle();
  if (definitionError) {
    reportError("admin.worker-cadence.registry", definitionError.message);
    return { ok: false, error: "Registre des workers illisible." };
  }
  if (!definition) {
    return { ok: false, error: "Worker inconnu du registre." };
  }
  if (!definition.vault_url_secret || !definition.vault_shared_secret) {
    return {
      ok: false,
      error:
        "Ce worker n'a pas de cadence rapide : aucun secret Vault ne lui est associé dans le registre.",
    };
  }

  /* ── GARDE 2 : l'URL doit être joignable depuis Postgres ── */
  const cible = buildWorkerCronUrl(worker, APP_URL);
  if (!cible.ok) {
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: { worker, refusal: cible.refusal },
    });
    return { ok: false, error: cible.error };
  }

  /* ── GARDE 3 : ce déploiement EST-IL la production ? ──────
   * Placée APRÈS la garde d'URL, et l'ordre se justifie : les deux refuseraient
   * un `http://localhost:3000`, mais la garde 2 le refuse en NOMMANT l'adresse
   * locale, là où celle-ci ne saurait dire que « pas le domaine de production ».
   * Le message le plus précis doit gagner. Ce que la garde 3 attrape et que la
   * 2 laisse passer est exactement l'inverse : une preview, ou une production
   * au `NEXT_PUBLIC_APP_URL` périmé — publiques, en https, et pas nous.
   *
   * `process.env` est lu ICI et passé au module de gardes, qui reste pur et
   * donc exhaustivement testable. */
  const environnement = checkCadenceEnvironment(
    {
      vercelEnv: optionalEnv("VERCEL_ENV"),
      productionHost: optionalEnv("VERCEL_PROJECT_PRODUCTION_URL"),
    },
    APP_URL,
  );
  if (!environnement.ok) {
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: { worker, refusal: environnement.refusal },
    });
    return { ok: false, error: environnement.error };
  }

  /* ── GARDE 4 : sans CRON_SECRET, on le DIT ─────────────── */
  const cronSecret = optionalEnv("CRON_SECRET");
  if (!cronSecret) {
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: { worker, refusal: "cron_secret_absent" },
    });
    return {
      ok: false,
      error:
        "CRON_SECRET n'est pas configuré dans cet environnement : la cadence rapide poserait un secret que la route refuserait.",
    };
  }

  const { data, error } = await db.rpc(RPC_CADENCE, {
    p_worker: worker,
    p_url: cible.url,
    p_secret: cronSecret,
  });
  if (error) {
    /* ── GARDE 5 : le message d'erreur n'est PAS journalisé ──
     * Une erreur Postgres peut recopier la valeur d'un paramètre (« value too
     * long for type… »), et `p_secret` en est un. Seul le code SQLSTATE sort
     * d'ici : il suffit à distinguer « RPC absente » (PGRST202) d'un refus de
     * droits, et il ne peut porter aucune valeur. */
    const code = typeof error.code === "string" ? error.code : "inconnu";
    reportError("admin.worker-cadence.rpc", `echec RPC (code ${code})`);
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: { worker, refusal: "rpc_error", code },
    });
    return {
      ok: false,
      error:
        code === "PGRST202"
          ? "La fonction d'écriture au Vault n'existe pas encore en base."
          : "Écriture des secrets impossible.",
    };
  }

  /* ── GARDE 6 : le STATUT RENDU décide, pas l'absence d'erreur ──
   * La RPC ne lève que sur un refus d'autorisation ; ses cinq refus métier
   * arrivent ici avec `error === null`. Ne lire que `error` afficherait un
   * succès et écrirait à l'audit une activation qui n'a pas eu lieu. */
  const row = (Array.isArray(data) ? data[0] : data) as CadenceRpcRow | undefined;
  if (!row || row.written !== true) {
    /* Aucune ligne du tout : la RPC existe (pas d'erreur) mais n'a rien rendu.
     * On ne sait donc RIEN de ce qui a été écrit — le dire vaut mieux que de
     * choisir entre « réussi » et « refusé » sans preuve. */
    const refusal = row ? row.status : "rpc_sans_ligne";
    const code = row?.error_code ?? null;
    reportError(
      "admin.worker-cadence.refus",
      `cadence refusee (worker ${worker}, statut ${refusal}${code ? `, code ${code}` : ""})`,
    );
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: {
        worker,
        refusal,
        ...(code ? { code } : {}),
        /* Ce que l'écriture AURAIT touché : la RPC le calcule même sur un
         * refus, et le journal doit garder la même colonne dans les deux cas —
         * sinon on ne pourrait pas comparer une tentative à son aboutissement. */
        also_affects_workers: row?.also_affects_workers ?? [],
      },
    });
    return {
      ok: false,
      error:
        CADENCE_REFUS_MESSAGES[refusal]
        ?? "Écriture des secrets impossible : la base a refusé sans que ce statut soit connu de l'application.",
    };
  }

  /* Ce qui entre au journal : le worker, l'URL posée (publique par
   * construction — c'est celle du site), les NOMS des deux entrées du Vault
   * TELS QUE LA RPC LES A RÉSOLUS (elle relit le registre, elle est l'autorité
   * — les recopier depuis la pré-lecture ferait mentir le journal le jour où
   * les deux divergent), le fait créé/remplacé, et les workers voisins dont
   * une entrée vient d'être réécrite par ce même geste. Jamais le contenu. Les
   * clés sont suffixées `_name` pour qu'aucun lecteur du journal ne prenne un
   * nom pour une valeur. */
  await logAdminAction({
    actor,
    action: "monitoring.cadence.enable",
    targetType: "worker",
    metadata: {
      worker,
      url: cible.url,
      url_secret_name: row.url_secret_name ?? definition.vault_url_secret,
      shared_secret_name: row.shared_secret_name ?? definition.vault_shared_secret,
      url_created: row.url_created,
      shared_created: row.shared_created,
      also_affects_workers: row.also_affects_workers ?? [],
      /* La garde d'hôte a-t-elle RÉELLEMENT joué ? À `false`, seule
       * `VERCEL_ENV` a été vérifiée : une production au `NEXT_PUBLIC_APP_URL`
       * périmé serait passée. Le journal doit permettre de le relire après
       * coup — un « autorisé » sans nuance laisserait croire à une garde qui
       * n'a pas eu lieu. */
      production_host_verified: environnement.hostChecked,
    },
  });
  revalidatePath("/admin/monitoring");
  /* Rien n'est renvoyé au client. Le retour d'une Server Action appelée depuis
   * un composant client est SÉRIALISÉ et transmis au navigateur : le jeter au
   * rendu ne l'empêche pas d'avoir voyagé. L'`url` que cette action rendait
   * autrefois n'était consommée nulle part (le panneau la jetait) ; la retirer
   * vaut mieux que de commenter qu'on l'ignore. */
  return { ok: true, data: undefined };
}
