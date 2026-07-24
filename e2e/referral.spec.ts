import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Parrainage ludique (seed supabase/seed.sql) — module greffé au parcours roue
 * de la campagne GARANTIE GAGNANTE E2EWIN01 (org « E2E Café », addon_referral).
 * Programme activé (referral_programs) : seuil coffre 3, parrain = tour offert
 * (spin), filleul = rien (none), coffre = lot à stock fini. Parrain DÉTERMINISTE
 * seedé : referral_code PR-E2E2TEST. Lot de coffre PARRAIN-E2ECHEST seedé pour
 * la caisse.
 *
 * Cinq surfaces couvertes :
 *   (a) éditeur commerçant — la section « Parrainage ludique » s'affiche et
 *       sauvegarde ;
 *   (b) roue publique, côté PARRAIN — après un spin réel, le CTA « Parraine tes
 *       amis » crée un parrain et produit un lien de partage ?ref=PR-… ;
 *   (c) roue publique, côté FILLEUL — via ?ref=PR-E2E2TEST, la validation
 *       n'intervient QU'APRÈS un spin réel (jamais sur simple clic) ;
 *   (d) caisse — un lot PARRAIN-… se valide UNE fois puis refuse le double
 *       retrait (redeem_referral_reward, autorité serveur) ;
 *   (e) scan a11y de la surface parrainage de /play.
 *
 * Locators rigoureux : getByRole + nom exact, regex ciblées, jamais un getByText
 * ambigu susceptible de matcher deux éléments.
 */

const SLUG = "E2EWIN01";
const CAMPAIGN_ID = "e2e20000-0000-4000-8000-000000000001";
const SEED_SPONSOR_CODE = "PR-E2E2TEST";
const SEED_CHEST_CODE = "PARRAIN-E2ECHEST";

/** Spin gagnant déterministe (E2EWIN01, 100 % gagnante) → écran de gain. */
async function spinAndWin(page: Page) {
  await expect(
    page.getByRole("button", { name: "Lancer la roue" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Lancer la roue" }).click();
  await expect(page.getByText("✦ GAGNÉ ✦")).toBeVisible({ timeout: 30_000 });
}

// ════════════════════════════════════════════════════════════
// Roue publique — parrain & filleul (joueur ANONYME, device vierge)
// ════════════════════════════════════════════════════════════
test.describe("parrainage — roue publique (parrain / filleul)", () => {
  // Device vierge par test (aucune session) : clé anonyme aléatoire — jamais le
  // parrain seedé (pas d'auto-parrainage), un filleul distinct à chaque run.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("après un spin, le CTA parrain produit un lien ?ref=PR-… (+ scan a11y)", async ({
    page,
  }, testInfo) => {
    // Mouvement réduit : spin écourté + jauge figée → scan a11y déterministe.
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Capture browser-agnostic du presse-papiers (WebKit n'accorde pas
    // clipboard-read) : on masque navigator.clipboard.writeText avant chargement.
    await page.addInitScript(() => {
      const store: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = store;
      try {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: (text: string) => {
              store.push(String(text));
              return Promise.resolve();
            },
            readText: () => Promise.resolve(store.at(-1) ?? ""),
          },
        });
      } catch {
        // Navigateur refusant l'override — l'assertion de lien le révélera.
      }
    });

    await page.goto(`/play/${SLUG}`);
    await spinAndWin(page);

    // Le CTA parrain s'affiche après la partie (sans réclamer le gain).
    await expect(
      page.getByText("Parraine tes amis et gagne plus"),
    ).toBeVisible();
    const becomeSponsor = page.getByRole("button", {
      name: "Obtenir mon lien de parrainage",
    });
    await expect(becomeSponsor).toBeVisible();
    await becomeSponsor.click();

    // Devenu parrain : l'équipe suivable apparaît (jauge collective vers le coffre).
    await expect(page.getByText("Ton équipe de parrainage")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("progressbar", {
        name: "Progression de l'équipe vers le coffre",
      }),
    ).toBeVisible();

    // (e) Scan a11y de la surface parrainage de /play, sur l'état stable.
    await expectNoA11yViolations(page, testInfo);

    // « Copier le lien » écrit le lien de partage : il porte bien ?ref=PR-….
    const copyLink = page.getByRole("button", {
      name: "Copier le lien",
      exact: true,
    });
    await copyLink.click();
    await expect(
      page.getByRole("button", { name: "Lien copié ✓" }),
    ).toBeVisible();
    const copied = await page.evaluate(
      () => (window as unknown as { __copied?: string[] }).__copied ?? [],
    );
    expect(
      copied.some((c) =>
        new RegExp(`/play/${SLUG}\\?ref=PR-[A-HJ-NP-Z2-9]{8}`).test(c),
      ),
    ).toBe(true);
  });

  test("le filleul n'est validé QU'APRÈS un spin réel (jamais sur simple clic)", async ({
    page,
  }) => {
    await page.goto(`/play/${SLUG}?ref=${SEED_SPONSOR_CODE}`);

    // AVANT tout spin : la roue est à l'écran d'accueil et AUCUNE surface
    // parrainage n'est montée (le panneau n'existe qu'en phase gagné/perdu) —
    // validateReferral est donc INATTEIGNABLE. Le simple clic sur le lien ?ref=
    // ne déclenche aucune validation ni récompense.
    await expect(
      page.getByRole("button", { name: "Lancer la roue" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/BIENVENUE DANS/)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Tu as rejoint/ }),
    ).toHaveCount(0);

    // APRÈS un spin réel (preuve de participation), la validation s'exécute côté
    // serveur et le filleul rejoint l'équipe.
    await page.getByRole("button", { name: "Lancer la roue" }).click();
    await expect(page.getByText("✦ GAGNÉ ✦")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: /Tu as rejoint/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/BIENVENUE DANS/)).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════
// Éditeur commerçant + caisse (session owner seedée)
// ════════════════════════════════════════════════════════════
test.describe("parrainage — éditeur & caisse (owner)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("l'éditeur affiche la section Parrainage et l'enregistre", async ({
    page,
  }) => {
    await page.goto(`/dashboard/campaigns/${CAMPAIGN_ID}`);

    // Section scopée à sa carte (évite tout « Enregistrer » d'une autre section).
    const section = page
      .locator("div.mb-6")
      .filter({
        has: page.getByRole("heading", { name: "Parrainage ludique" }),
      });
    await expect(
      section.getByRole("heading", { name: "Parrainage ludique" }),
    ).toBeVisible({ timeout: 30_000 });
    // Activation reflétant le seed (programme activé sur E2EWIN01).
    await expect(
      section.getByRole("checkbox", { name: /Activer le parrainage/ }),
    ).toBeChecked();

    // Enregistrement (valeurs inchangées → idempotent) : confirmation « Enregistré. ».
    await section.getByRole("button", { name: "Enregistrer" }).click();
    await expect(section.getByText("Enregistré.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("un lot PARRAIN-… se valide une seule fois en caisse", async ({
    page,
  }, testInfo) => {
    // Ressource à USAGE UNIQUE seedée : un seul navigateur la consomme (sinon les
    // deux projets mobiles se disputeraient le même code de retrait).
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "retrait à usage unique — exécuté sur un seul navigateur",
    );

    // 1re vérification : le lot de coffre seedé s'affiche.
    await page.goto(
      `/dashboard/redeem?code=${encodeURIComponent(SEED_CHEST_CODE)}`,
    );
    await expect(page.getByText(SEED_CHEST_CODE)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Le panier du parrain")).toBeVisible();

    // Validation (si pas déjà consommé par une reprise) : la carte passe en
    // « déjà remis ». Le rafraîchissement RSC qui suit l'action peut traîner —
    // à défaut, un reload relit l'état serveur, l'autorité.
    const validate = page.getByRole("button", { name: "Valider la remise" });
    if (await validate.isVisible().catch(() => false)) {
      await validate.click();
      try {
        await expect(page.getByText(/Déjà remis/)).toBeVisible({
          timeout: 20_000,
        });
      } catch {
        await page.reload();
        await expect(page.getByText(/Déjà remis/)).toBeVisible({
          timeout: 20_000,
        });
      }
    }

    // Double retrait refusé : re-vérification du même code — « déjà remis »,
    // plus aucun bouton de validation.
    await page.goto(
      `/dashboard/redeem?code=${encodeURIComponent(SEED_CHEST_CODE)}`,
    );
    await expect(page.getByText(/Déjà remis/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider la remise" }),
    ).toHaveCount(0);
  });
});
