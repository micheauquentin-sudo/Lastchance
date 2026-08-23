import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * Chemin Stripe de bout en bout, sur l'org dédiée « E2E Stripe »
 * (comp_access=false : le statut d'abonnement gouverne réellement).
 *
 * - checkout : le bouton « Démarrer mon abonnement » échoue proprement
 *   sans STRIPE_PRICE_ID_STARTER (message exact) — le redirect vers le
 *   vrai Stripe Checkout n'est pas testable en CI.
 * - webhook : événements RÉELLEMENT signés (generateTestHeaderString)
 *   postés sur /api/stripe/webhook ; la route re-vérifie l'abonnement
 *   via l'API Stripe → stub local (e2e/api-stubs.mjs, STRIPE_API_BASE).
 *   Couvre : signature absente/invalide, activation (base + badge UI),
 *   idempotence des doublons, résiliation, client inconnu,
 *   checkout.session.completed sans effet.
 *
 * Mono-projet (desktop-smoke) : les événements mutent le statut de
 * l'org — deux projets parallèles se marcheraient dessus.
 */
const ORG_ID = "e2e10000-0000-4000-8000-000000000002";
const CUSTOMER = "cus_e2e_stripe";
const WEBHOOK = "/api/stripe/webhook";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

/** Corps brut + en-tête Stripe-Signature valide (même secret que l'app). */
function signedEvent(type: string, subscriptionId: string, id: string) {
  const payload = JSON.stringify({
    id,
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: subscriptionId, customer: CUSTOMER } },
  });
  const signature = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, signature };
}

async function orgStatus(): Promise<string> {
  const { data, error } = await admin()
    .from("organizations")
    .select("subscription_status")
    .eq("id", ORG_ID)
    .single();
  expect(error).toBeNull();
  return data!.subscription_status;
}

async function orgPlan(): Promise<string> {
  const { data, error } = await admin()
    .from("organizations")
    .select("plan")
    .eq("id", ORG_ID)
    .single();
  expect(error).toBeNull();
  return data!.plan;
}

/** Photographie Stripe des droits (source « stripe » = fait foi). */
async function stripeEntitlements(): Promise<Record<string, boolean>> {
  const { data, error } = await admin()
    .from("organization_entitlements")
    .select("entitlement, active")
    .eq("organization_id", ORG_ID)
    .eq("source", "stripe");
  expect(error).toBeNull();
  const rows = (data ?? []) as Array<{ entitlement: string; active: boolean }>;
  return Object.fromEntries(rows.map((row) => [row.entitlement, row.active]));
}

test.describe("stripe — checkout non configuré", () => {
  test.use({ storageState: "e2e/.auth/stripeOwner.json" });

  test("le bouton d'abonnement échoue proprement sans price id @smoke", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-smoke", "Mono-projet : mute l'org Stripe");

    await page.goto("/dashboard/settings");
    await expect(page.getByText("Période d'essai")).toBeVisible();
    await page.getByRole("button", { name: "Démarrer mon abonnement" }).click();
    // L'org est sur l'offre par défaut (Coup d'envoi), dont aucun prix n'est
    // configuré en CI — le message nomme l'offre depuis PLANS.
    await expect(
      page.getByText(
        "La facturation de l'offre Coup d'envoi n'est pas encore configurée.",
      ),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("stripe — webhook signé", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : les événements mutent le statut de l'org Stripe",
    );
  });

  test.beforeAll(async ({}, testInfo) => {
    // Le customer est posé ici (pas au seed) : le test checkout ci-dessus
    // exige une org SANS stripe_customer_id, et ce describe tourne après.
    // Garde projet : les beforeAll s'exécutent même quand tous les tests
    // sont skip — sans elle, les projets mobiles poseraient le customer
    // en parallèle PENDANT le test checkout de desktop-smoke.
    if (testInfo.project.name !== "desktop-smoke") return;
    const { error } = await admin()
      .from("organizations")
      .update({ stripe_customer_id: CUSTOMER })
      .eq("id", ORG_ID);
    expect(error).toBeNull();
  });

  test("signature absente ou invalide → 400 @smoke", async ({ request }) => {
    const { payload } = signedEvent("customer.subscription.updated", "sub_e2e_active", `evt_sig_${Date.now()}`);

    const noHeader = await request.post(WEBHOOK, {
      data: payload,
      headers: { "Content-Type": "application/json" },
    });
    expect(noHeader.status()).toBe(400);
    expect(await noHeader.json()).toEqual({ error: "Signature absente" });

    const badSignature = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_mauvais_secret",
    });
    const forged = await request.post(WEBHOOK, {
      data: payload,
      headers: { "Content-Type": "application/json", "Stripe-Signature": badSignature },
    });
    expect(forged.status()).toBe(400);
    expect(await forged.json()).toEqual({ error: "Signature invalide" });
  });

  test("activation d'abonnement : base + badge UI @smoke", async ({ request, browser }) => {
    const { payload, signature } = signedEvent(
      "customer.subscription.updated",
      "sub_e2e_active",
      `evt_act_${Date.now()}`,
    );
    const res = await request.post(WEBHOOK, {
      data: payload,
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(await orgStatus()).toBe("active");

    // Les items de l'abonnement font foi : l'offre et les droits sont
    // dérivés du prix retourné par Stripe, pas d'un état local.
    expect(await orgPlan()).toBe("engagement");
    const granted = await stripeEntitlements();
    expect(granted.loyalty).toBe(true);
    expect(granted.pronostics).toBe(false);

    // L'owner voit le nouveau statut et le bouton de gestion du portail.
    const context = await browser.newContext({
      storageState: "e2e/.auth/stripeOwner.json",
      ignoreHTTPSErrors: true,
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    });
    const page = await context.newPage();
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Actif", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gérer mon abonnement" })).toBeVisible();
    await context.close();
  });

  test("un doublon d'événement est ignoré (idempotence) @smoke", async ({ request }) => {
    const { payload, signature } = signedEvent(
      "customer.subscription.updated",
      "sub_e2e_active",
      `evt_dup_${Date.now()}`,
    );
    const headers = { "Content-Type": "application/json", "Stripe-Signature": signature };

    const first = await request.post(WEBHOOK, { data: payload, headers });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ received: true });

    const replay = await request.post(WEBHOOK, { data: payload, headers });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
  });

  test("résiliation : l'accès retombe @smoke", async ({ request }) => {
    const { payload, signature } = signedEvent(
      "customer.subscription.updated",
      "sub_e2e_canceled",
      `evt_del_${Date.now()}`,
    );
    const res = await request.post(WEBHOOK, {
      data: payload,
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    });
    expect(res.status()).toBe(200);
    expect(await orgStatus()).toBe("canceled");
    // Résiliation = tous les droits Stripe retombent, plan inchangé.
    expect((await stripeEntitlements()).loyalty).toBe(false);
  });

  test("client Stripe inconnu → 500 sans effet @smoke", async ({ request }) => {
    const before = await orgStatus();
    const { payload, signature } = signedEvent(
      "customer.subscription.updated",
      "sub_e2e_ghost",
      `evt_ghost_${Date.now()}`,
    );
    const res = await request.post(WEBHOOK, {
      data: payload,
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    });
    expect(res.status()).toBe(500);
    // LE MESSAGE A CHANGE DE MAIN, PAS DE SENS. Depuis la projection de
    // facturation (20261030120000), c'est ELLE qui rencontre la premiere un
    // client Stripe inconnu et refuse. Ce que ce test protege — 500, donc
    // Stripe rejoue, et aucun effet sur l'organisation — est inchange.
    expect(await res.json()).toEqual({
      error: "Projection de facturation echouee",
    });
    expect(await orgStatus()).toBe(before);
  });

  test("checkout.session.completed : accepté, sans effet @smoke", async ({ request }) => {
    const before = await orgStatus();
    const payload = JSON.stringify({
      id: `evt_cs_${Date.now()}`,
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { customer: CUSTOMER } },
    });
    const signature = new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const res = await request.post(WEBHOOK, {
      data: payload,
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(await orgStatus()).toBe(before);
  });
});
