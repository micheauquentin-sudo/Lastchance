import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { optionalEnv } from "@/lib/env";
import { recordCounter, reportError, reportSecurityEvent } from "@/lib/monitoring";
import { getStripe, hasLiveStripeSubscription } from "@/lib/stripe";
import { TRIAL_EXPIRY_GRACE_DAYS } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Résiliation des essais jamais convertis : GET /api/cron/expire-trials
 *
 * Déclenché par Vercel Cron, protégé par CRON_SECRET (header
 * Authorization: Bearer …), instrumenté comme les huit autres workers.
 *
 * LE DÉFAUT QU'IL FERME. Un essai qui expire sans souscription restait
 * `subscription_status = 'trialing'` indéfiniment. Ce n'était PAS un trou
 * d'accès — `hasActiveAccess` coupe sur `trial_ends_at`, pas sur le statut —
 * mais la base affirmait « en essai » sur des comptes dont l'essai était fini
 * depuis des mois : le back-office comptait des essais qui n'existaient plus,
 * et personne, commerçant compris, ne lisait l'état réel.
 *
 * CINQ PROPRIÉTÉS, par ordre de ce qu'elles coûtent si elles manquent.
 *
 * 1. JAMAIS DE RÉSILIATION SANS AVOIR DEMANDÉ À STRIPE. Le statut local est un
 *    cache de l'état Stripe ; inventer une transition depuis un `trial_ends_at`
 *    dépassé reviendrait à décider à la place de la source de vérité.
 *    `hasLiveStripeSubscription` pose exactement la question, et elle ne peut
 *    pas se poser en local : `mapStripeStatus` replie `unpaid` (abonnement
 *    vivant) sur le même `canceled` qu'un `incomplete_expired` mort. Seule
 *    exception, et elle est logique : un `stripe_customer_id` NUL signifie que
 *    la page de paiement n'a jamais été ouverte — `ensureStripeCustomer` écrit
 *    cet identifiant AVANT `checkout.sessions.create`. Sans client Stripe, il
 *    ne peut exister aucun abonnement, et l'appel serait impossible de toute
 *    façon (il faut un customer pour lister ses abonnements).
 *
 * 2. UNE PANNE STRIPE NE RÉSILIE PERSONNE. C'est la propriété la plus
 *    importante du lot. Un incident chez Stripe ne peut pas se traduire par la
 *    résiliation en masse des clients : tout échec d'appel fait SAUTER
 *    l'organisation — jamais basculer — et le cron repasse le lendemain. Un
 *    essai reste alors `trialing` un jour de plus, ce qui est exactement l'état
 *    d'avant ce cron : le pire cas du filet est le statu quo.
 *
 * 3. UN ABONNEMENT VIVANT SOUS UN STATUT `trialing` EST UN WEBHOOK PERDU. Ce
 *    n'est pas un cas nominal : Stripe a annoncé quelque chose que nous n'avons
 *    pas appliqué. On ne résilie évidemment pas, et surtout on le REMONTE —
 *    compteur `billing.trial_status_desync` (une ligne par organisation, donc
 *    `ops_metrics_summary` en donne le NOMBRE, visible au back-office avec les
 *    autres mesures) et un événement Sentry par passage. Sans ce signal, un
 *    webhook perdu reste invisible pour toujours.
 *
 * 4. IDEMPOTENT. Le lot ne contient que des `trialing` : une organisation déjà
 *    `canceled` n'est jamais relue, donc jamais retouchée, et deux passages ne
 *    font pas deux fois le travail. L'écriture elle-même est un UPDATE
 *    CONDITIONNEL (`subscription_status = 'trialing'`) : un webhook arrivé
 *    entre la lecture et l'écriture — l'événement hors ordre — gagne, et le
 *    cron ne le piétine pas.
 *
 * 5. DÉLAI DE GRÂCE de TRIAL_EXPIRY_GRACE_DAYS après `trial_ends_at` (voir son
 *    motif dans `@/lib/subscription`).
 *
 * COMP_ACCESS : les organisations en accès offert NE SONT PAS exclues, et
 * c'est délibéré. `comp_access` est un droit d'accès accordé par le
 * back-office, orthogonal à l'état Stripe (`hasActiveAccess` le teste en
 * premier, avant tout statut) : les coupler ferait dire deux choses au même
 * champ. Aucun accès n'est perdu, et aucun message ne change — le bandeau
 * « Accès offert » masque déjà les bandeaux d'abonnement. Les exclure aurait
 * au contraire laissé le mensonge intact précisément sur les comptes qu'un
 * administrateur regarde le plus.
 *
 * Aucun identifiant d'organisation ne transite par les logs ni par les
 * compteurs. Le résidu se retrouve sans eux : une organisation encore
 * `trialing` avec un `trial_ends_at` dépassé après un passage EST, par
 * construction, soit un webhook perdu, soit une organisation sautée pour cause
 * de panne Stripe.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Plafond par passage. Le cron est quotidien et le travail est un rattrapage :
 * un parc plus grand que le lot se solde en quelques jours, sans jamais faire
 * expirer la fonction au milieu d'une série d'appels Stripe.
 */
const BATCH_SIZE = 200;

/**
 * Marge avant la limite Vercel (`maxDuration = 60`) : on ne DÉMARRE plus une
 * organisation au-delà. Motif emprunté à /api/cron/sync-contests.
 *
 * ── POURQUOI UN PLAFOND DE LIGNES NE SUFFIT PAS ─────────────────
 *
 * `BATCH_SIZE` borne le NOMBRE d'organisations, pas le TEMPS qu'elles
 * prennent : chacune peut déclencher un appel réseau à Stripe
 * (`hasLiveStripeSubscription`), et 200 appels lents dépassent la minute bien
 * avant d'épuiser le lot. Ce qui arrivait alors n'était pas une erreur mais
 * une COUPURE : la fonction était tuée en plein milieu, le heartbeat restait
 * ouvert en `running` — indistinguable d'un worker encore au travail — et le
 * back-office ne voyait ni l'échec, ni les organisations non traitées. Sortir
 * proprement à 45 s clôt le journal, compte le reliquat, et le cron du
 * lendemain reprend par les essais les plus anciens (`order by trial_ends_at`)
 * : les non-traités d'aujourd'hui sont en tête demain.
 */
const TIME_BUDGET_MS = 45_000;

const MS_PER_DAY = 86_400_000;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  // Ouverture best-effort, comme les autres crons quotidiens : le journal de
  // santé ne gouverne pas le travail métier.
  const run = await startWorkerRunSafely(admin, "expire-trials");

  const cutoff = new Date(
    Date.now() - TRIAL_EXPIRY_GRACE_DAYS * MS_PER_DAY,
  ).toISOString();

  const { data, error } = await admin
    .from("organizations")
    .select("id, stripe_customer_id")
    .eq("subscription_status", "trialing")
    .lt("trial_ends_at", cutoff)
    // Les essais les plus anciens d'abord : sur un parc plus grand que le lot,
    // le rattrapage progresse au lieu de repasser sur les mêmes lignes.
    .order("trial_ends_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    reportError("cron.expire-trials", error.message);
    await finishWorkerRunSafely(admin, run, "failed", { canceled: 0 }, "read_failed");
    return NextResponse.json({ error: "Résiliation impossible" }, { status: 500 });
  }

  const candidates = (data ?? []) as Array<{
    id: string;
    stripe_customer_id: string | null;
  }>;

  let canceled = 0;
  let liveSubscription = 0;
  let stripeUnavailable = 0;
  let writeFailed = 0;
  let alreadyMoved = 0;
  let firstStripeError: unknown = null;

  // Client Stripe créé à la demande : un parc sans aucun candidat porteur de
  // client Stripe ne doit pas échouer sur un `STRIPE_SECRET_KEY` absent.
  let stripe: Stripe | null = null;
  const stripeClient = (): Stripe => (stripe ??= getStripe());

  let traites = 0;

  for (const org of candidates) {
    // Le budget se lit EN TÊTE, avant tout appel réseau : une fois Stripe
    // interrogé, la seconde est dépensée quoi qu'on décide ensuite.
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    traites += 1;

    if (org.stripe_customer_id) {
      let live: boolean;
      try {
        live = await hasLiveStripeSubscription(stripeClient(), org.stripe_customer_id);
      } catch (err) {
        // PROPRIÉTÉ 2. On saute, on compte, on réessaiera demain. Une seule
        // remontée après la boucle : une panne Stripe générale produirait
        // sinon un événement par organisation du lot.
        stripeUnavailable += 1;
        firstStripeError ??= err;
        continue;
      }
      if (live) {
        // PROPRIÉTÉ 3. Un webhook n'a pas été appliqué : ne rien casser, et
        // le dire. Un compteur par organisation, pour que le back-office lise
        // un nombre et non un booléen.
        liveSubscription += 1;
        recordCounter("billing.trial_status_desync");
        continue;
      }
    }

    // PROPRIÉTÉ 4. `.eq("subscription_status", "trialing")` : le webhook qui
    // aurait bougé le statut depuis la lecture garde la main.
    const { data: updated, error: updateError } = await admin
      .from("organizations")
      .update({ subscription_status: "canceled" })
      .eq("id", org.id)
      .eq("subscription_status", "trialing")
      .select("id");

    if (updateError) {
      writeFailed += 1;
      continue;
    }
    if ((updated ?? []).length > 0) canceled += 1;
    else alreadyMoved += 1;
  }

  if (firstStripeError) {
    reportError("cron.expire-trials.stripe", firstStripeError);
  }
  if (writeFailed > 0) {
    reportError(
      "cron.expire-trials.write",
      `${writeFailed} bascule(s) de statut refusée(s)`,
    );
  }
  if (liveSubscription > 0) {
    reportSecurityEvent("stripe_trial_status_desync", {
      organizations: liveSubscription,
    });
  }

  // Ce que le budget a laissé sur la table. Le lot est ordonné et la boucle
  // n'en saute aucun élément : tout ce qui suit le point de sortie est, par
  // construction, non traité.
  const deferred = candidates.length - traites;

  // DÉGRADÉ, pas ÉCHOUÉ, et seulement sur ce qui relève de CE worker : Stripe
  // injoignable, écriture refusée, ou budget épuisé. Le désaccord de statut est
  // une anomalie AMONT (un webhook perdu), déjà remontée à Sentry et comptée :
  // la faire aussi virer le heartbeat au rouge ferait tomber l'objectif
  // « workers » du back-office pour une panne qui n'est pas la sienne.
  //
  // Un reliquat compte comme dégradé pour la même raison qu'à /api/cron/reengage
  // : le travail fait est réel, la COUVERTURE ne l'est pas. Un parc qui déborde
  // le budget tous les jours doit se voir, sans quoi la fenêtre de rattrapage
  // s'allonge en silence.
  const degraded = stripeUnavailable > 0 || writeFailed > 0 || deferred > 0;
  const counters = {
    candidates: candidates.length,
    canceled,
    liveSubscription,
    stripeUnavailable,
    writeFailed,
    alreadyMoved,
    deferred,
  };
  await finishWorkerRunSafely(
    admin,
    run,
    degraded ? "degraded" : "succeeded",
    counters,
    // Le code de sortie nomme la cause DOMINANTE : un reliquat se rattrape
    // demain, une panne Stripe demande un regard. Motif `organizations_deferred`
    // repris tel quel de /api/cron/reengage.
    stripeUnavailable > 0 || writeFailed > 0
      ? "stripe_or_write_unavailable"
      : deferred > 0
        ? "organizations_deferred"
        : undefined,
  );

  return NextResponse.json(
    { ok: true, ...counters },
    { headers: { "cache-control": "no-store" } },
  );
}
