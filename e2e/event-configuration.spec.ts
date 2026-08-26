import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * DE LA SESSION CRÉÉE AU SALON OUVERT — le parcours que personne ne couvrait.
 *
 * `event-remote-cycle.spec.ts` part d'une session DÉJÀ en `lobby` (il le dit
 * lui-même) et joue le cycle question → révélation. Tout ce qui précède —
 * créer une session, la piloter, l'ouvrir — n'était couvert par AUCUN test.
 * C'est exactement là que deux défauts sont passés en production :
 *
 *   · « Écran » était rendu sur une session en brouillon, alors que
 *     `/event/[code]/screen` refuse `draft` : un onglet sur un 404, à tous les
 *     coups. Ce fichier l'asserte des DEUX côtés — le bouton absent, ET la
 *     page qui répond 404 tant que le salon est fermé.
 *   · « Piloter » est la SEULE porte qui ouvre un salon. Un plantage de cette
 *     page — et elle faisait trois lectures dont deux facultatives — laisse
 *     l'organisateur sans recours, en soirée, devant du public. Le simple fait
 *     d'y arriver et d'y démarrer la session est donc asserté ici.
 *
 * `@smoke` — DONC UN SEUL PROJET. Ce parcours MUTE l'état d'une session
 * (draft → lobby) ; le jouer en parallèle sur mobile-chrome et mobile-safari
 * ferait courir les deux navigateurs après la même ligne. C'est la mésaventure
 * déjà consignée en tête d'`event-remote-cycle.spec.ts`, et on ne la rejoue
 * pas : la session ci-dessous est propre à ce fichier, et le tag la borne à
 * `desktop-smoke`.
 */

const GAME_ID = "e2ed0000-0000-4000-8000-000000000001";
const ORG_ID = "e2e10000-0000-4000-8000-000000000001";
const SESSION_ID = "e2ed0000-0000-4000-8000-0000000000c1";
const JOIN_CODE = "E2ECFG";
const LABEL = "Configuration E2E";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

test.describe("mode événement — de la session créée au salon ouvert", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(async () => {
    const supabase = admin();
    await supabase.from("event_sessions").delete().eq("id", SESSION_ID);
    const { error } = await supabase.from("event_sessions").insert({
      id: SESSION_ID,
      game_id: GAME_ID,
      organization_id: ORG_ID,
      label: LABEL,
      join_code: JOIN_CODE,
      // L'ÉTAT DE DÉPART EST LE DÉFAUT DE LA TABLE : une session naît
      // `draft`, et c'est précisément l'état où les deux défauts vivaient.
      status: "draft",
      reward_label: "Café de configuration",
      reward_stock: 2,
    });
    if (error) throw new Error(`seed session configuration : ${error.message}`);
  });

  test.afterAll(async () => {
    await admin().from("event_sessions").delete().eq("id", SESSION_ID);
  });

  test("une session neuve ne fuit pas côté joueur, puis s'ouvre depuis la télécommande @smoke", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ── 1. La page joueur et l'écran de salle sont FERMÉS tant que c'est un
    // brouillon. C'est la garde de `event_etat_partage`, vue du dehors.
    expect((await page.request.get(`/event/${JOIN_CODE}/screen`)).status()).toBe(404);
    expect((await page.request.get(`/event/${JOIN_CODE}`)).status()).toBe(404);

    // ── 2. Le panel n'offre donc AUCUN lien vers ces pages.
    await page.goto(`/dashboard/events/${GAME_ID}`);
    const developper = page.getByRole("button", { name: /Développer/ });
    for (let restants = await developper.count(); restants > 0; restants -= 1) {
      await developper.first().click();
    }
    const ligne = page.locator("li").filter({ hasText: LABEL });
    await expect(ligne.getByText("Brouillon")).toBeVisible();
    await expect(ligne.getByRole("link", { name: /Écran/ })).toHaveCount(0);

    // « Piloter » reste, LUI, toujours offert : c'est la seule porte du salon.
    const piloter = ligne.getByRole("link", { name: /Piloter/ });
    await expect(piloter).toBeVisible();

    // ── 3. La télécommande s'ouvre — et le simple fait d'y arriver est
    // l'assertion : un plantage ici enlève tout recours à l'organisateur.
    await piloter.click();
    await expect(page).toHaveURL(new RegExp(`${SESSION_ID}/remote`));
    await expect(
      page.getByRole("button", { name: /Démarrer la session/i }),
    ).toBeVisible({ timeout: 30_000 });

    // ── 4. On ouvre le salon.
    await page.getByRole("button", { name: /Démarrer la session/i }).click();
    // `phaseLabel` (event-remote.tsx) : status `lobby` + phase `lobby` rend
    // « Salon d'attente ». Ce n'est PAS « Salon ouvert » — ça, c'est
    // `SESSION_STATUS_LABEL`, l'étiquette de la liste du panel.
    await expect(page.getByText(/Salon d'attente/)).toBeVisible({ timeout: 30_000 });

    // ── 5. CE QUI ÉTAIT FERMÉ EST MAINTENANT OUVERT — des deux côtés.
    expect((await page.request.get(`/event/${JOIN_CODE}/screen`)).status()).toBe(200);
    expect((await page.request.get(`/event/${JOIN_CODE}`)).status()).toBe(200);

    await page.goto(`/dashboard/events/${GAME_ID}`);
    for (
      let restants = await page.getByRole("button", { name: /Développer/ }).count();
      restants > 0;
      restants -= 1
    ) {
      await page.getByRole("button", { name: /Développer/ }).first().click();
    }
    const ligneOuverte = page.locator("li").filter({ hasText: LABEL });
    await expect(ligneOuverte.getByRole("link", { name: /Écran/ })).toBeVisible();
  });
});
