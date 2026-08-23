import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { pathToFileURL } from "node:url";

const PROJECTION_RPC = "apply_stripe_subscription_projection_v1";
const PRODUCTION_SUPABASE_HOST = "drwzwvgxjknrgpfmthaf.supabase.co";
const PLACE_ADDON_PRICES = {
  vitrine: 2000,
  reserver: 3000,
};

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variable requise absente: ${name}`);
  return value;
}

export function parseArgs(args) {
  const known = new Set(["--confirm-production", "--dry-run"]);
  for (const arg of args) {
    if (!known.has(arg)) throw new Error(`Argument inconnu: ${arg}`);
  }
  return {
    confirmProduction: args.includes("--confirm-production"),
    dryRun: args.includes("--dry-run"),
  };
}

export function assertProductionSupabaseUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== PRODUCTION_SUPABASE_HOST ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Refus: l'environnement Supabase n'est pas la production attendue.");
  }
  return url.toString();
}

function unixSecondsToIso(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function monthlyAmountForSubscriptionItem(item) {
  const recurring = item.price.recurring;
  const amount = item.price.unit_amount;
  const quantity = item.quantity ?? 1;
  if (
    !recurring ||
    recurring.usage_type === "metered" ||
    amount === null ||
    !Number.isSafeInteger(amount) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    recurring.interval_count < 1
  ) {
    return null;
  }

  const billed = amount * quantity;
  const monthly = (() => {
    switch (recurring.interval) {
      case "day":
        return (billed * 365) / (12 * recurring.interval_count);
      case "week":
        return (billed * 52) / (12 * recurring.interval_count);
      case "month":
        return billed / recurring.interval_count;
      case "year":
        return billed / (12 * recurring.interval_count);
      default:
        return Number.NaN;
    }
  })();
  return Number.isSafeInteger(Math.round(monthly)) ? Math.round(monthly) : null;
}

/** Même représentation que `projectStripeSubscriptionItems` dans src/lib/stripe.ts. */
export function projectSubscriptionItems(subscription) {
  const items = subscription.items.data.map((item) => {
    const recurring = item.price.recurring;
    return {
      item_id: item.id,
      price_id: item.price.id,
      product_id:
        typeof item.price.product === "string"
          ? item.price.product
          : item.price.product?.id ?? null,
      price_nickname: item.price.nickname,
      quantity: item.quantity ?? 1,
      currency: item.price.currency,
      unit_amount_cents: item.price.unit_amount,
      recurring_interval: recurring?.interval ?? null,
      recurring_interval_count: recurring?.interval_count ?? null,
      usage_type: recurring?.usage_type ?? null,
      current_period_end: unixSecondsToIso(item.current_period_end),
      monthly_amount_cents: monthlyAmountForSubscriptionItem(item),
    };
  });
  const nextBillingAt = items
    .map((item) => item.current_period_end)
    .filter((value) => value !== null)
    .sort()[0] ?? null;
  const mrrMonthlyCents = items.every((item) => item.monthly_amount_cents !== null)
    ? items.reduce((sum, item) => sum + item.monthly_amount_cents, 0)
    : null;
  return { items, mrrMonthlyCents, nextBillingAt };
}

export async function validatePlaceAddonPrices(stripe, priceIds) {
  if (priceIds.vitrine === priceIds.reserver) {
    throw new Error("Les prix Vitrine et Réserver doivent être distincts");
  }
  for (const [entitlement, priceId] of Object.entries(priceIds)) {
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const product = price.product;
    if (
      price.livemode !== true ||
      !price.active ||
      price.currency !== "eur" ||
      !price.recurring ||
      price.recurring.interval !== "month" ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed" ||
      price.unit_amount !== PLACE_ADDON_PRICES[entitlement] ||
      typeof product === "string" ||
      product.active !== true
    ) {
      throw new Error("Configuration de prix Vitrine ou Réserver invalide");
    }
  }
}

function summary() {
  return {
    scanned: 0,
    applied: 0,
    unchanged: 0,
    unmatchedCustomer: 0,
    truncatedItems: 0,
    failed: 0,
  };
}

/**
 * Relit Stripe puis écrit uniquement la projection facturation existante.
 * Aucun appel n'actualise les droits, le plan ou les abonnements Stripe.
 */
export async function reconcileSubscriptionProjections({
  stripe,
  supabase,
  priceIds,
  dryRun,
  now = new Date(),
}) {
  await validatePlaceAddonPrices(stripe, priceIds);
  const counters = summary();
  const eventCreatedAt = now.toISOString();

  for await (const listed of stripe.subscriptions.list({ limit: 100, status: "all" })) {
    counters.scanned += 1;
    try {
      // La liste peut tronquer les items ; seule la relecture courante est fiable.
      const current = await stripe.subscriptions.retrieve(listed.id);
      if (current.items.has_more) {
        counters.truncatedItems += 1;
        continue;
      }
      const customerId = typeof current.customer === "string"
        ? current.customer
        : current.customer.id;
      const billing = projectSubscriptionItems(current);
      if (dryRun) {
        counters.unchanged += 1;
        continue;
      }

      const { data, error } = await supabase.rpc(PROJECTION_RPC, {
        p_event_id: `backfill:${current.id}:${eventCreatedAt}`,
        p_event_created_at: eventCreatedAt,
        p_customer_id: customerId,
        p_subscription_id: current.id,
        p_stripe_status: current.status,
        p_cancel_at_period_end: current.cancel_at_period_end,
        p_cancel_at: unixSecondsToIso(current.cancel_at),
        p_canceled_at: unixSecondsToIso(current.canceled_at),
        p_ended_at: unixSecondsToIso(current.ended_at),
        p_next_billing_at: billing.nextBillingAt,
        p_items: billing.items,
        p_mrr_monthly_cents: billing.mrrMonthlyCents,
      });
      if (error) {
        if (error.message === "unknown stripe customer") {
          counters.unmatchedCustomer += 1;
          continue;
        }
        counters.failed += 1;
        continue;
      }
      if (data?.[0]?.applied) counters.applied += 1;
      else counters.unchanged += 1;
    } catch {
      counters.failed += 1;
    }
  }
  return counters;
}

export async function main(args = process.argv.slice(2)) {
  const { confirmProduction, dryRun } = parseArgs(args);
  if (!confirmProduction) {
    throw new Error("Refus: --confirm-production est requis avant toute écriture.");
  }

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertProductionSupabaseUrl(supabaseUrl);
  const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  const supabase = createClient(
    supabaseUrl,
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const counters = await reconcileSubscriptionProjections({
    stripe,
    supabase,
    dryRun,
    priceIds: {
      vitrine: requiredEnv("STRIPE_PRICE_ID_ADDON_VITRINE"),
      reserver: requiredEnv("STRIPE_PRICE_ID_ADDON_RESERVER"),
    },
  });
  const result = {
    ok:
      counters.scanned > 0 &&
      counters.applied + counters.unchanged > 0 &&
      counters.failed === 0 &&
      counters.truncatedItems === 0,
    dryRun,
    ...counters,
  };
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Les erreurs de Stripe/Supabase peuvent contenir des identifiants : jamais les afficher.
    console.error("Backfill impossible");
    process.exitCode = 1;
  });
}
