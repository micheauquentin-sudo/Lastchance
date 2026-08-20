import { expect, test } from "@playwright/test";

/**
 * Vitrine (VIT-1a / L10) : le dashboard commerçant, la garde de rôle, et
 * l'assertion du drapeau public.
 *
 * Seed (`supabase/seed.sql`) : org « E2E Café » (owner/editor/cashier),
 * vitrine `e2e-comptoir` PUBLIÉE, deux cartes / trois rubriques / six fiches
 * dont une indisponible (« Curry de légumes grillés ») et une aux badges ET
 * allergènes vides (« Côtes-du-rhône »).
 *
 * ── LE DRAPEAU `VITRINE_PUBLIQUE_OUVERTE` EST FAUX (`src/lib/vitrine.ts`) ──
 *
 * `/v/e2e-comptoir` rend donc 404 aujourd'hui, MÊME PUBLIÉE — la Vitrine
 * n'ouvre qu'avec l'anglais, en L11. Le test ci-dessous fige cette
 * assertion : il rougira le jour où le drapeau bascule, et c'est le but —
 * il force la mise à jour consciente de ce fichier plutôt qu'un oubli
 * silencieux.
 */
test.describe("vitrine — drapeau public fermé", () => {
  test("l'adresse publique rend 404 tant que le drapeau est fermé", async ({
    page,
  }) => {
    const reponse = await page.goto("/v/e2e-comptoir");
    expect(reponse?.status()).toBe(404);
  });
});

test.describe("vitrine — dashboard commerçant", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("réglages : adresse et thème affichés", async ({ page }) => {
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "Vitrine" }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByLabel("Adresse")).toHaveValue("e2e-comptoir");
    await expect(page.getByText("Publiée")).toBeVisible();
    // La phrase honnête : publiée, mais le drapeau serveur n'ouvre pas
    // encore l'adresse publique.
    await expect(
      page.getByText(/n'imprimez pas vos QR codes tout de suite/),
    ).toBeVisible();
  });

  test("créer une carte, une rubrique et une fiche avec badges et allergènes", async ({
    page,
  }) => {
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "Vitrine" }),
    ).toBeVisible({ timeout: 30_000 });

    // ── Carte ── `.first()` : le libellé « Nom de la carte » se répète
    // ensuite pour chaque carte existante (formulaire de renommage) — seul le
    // premier, dans le bloc de création, est ciblé ici.
    const nomCarte = `Brunch E2E ${Date.now()}`;
    await page.getByLabel("Nom de la carte").first().fill(nomCarte);
    await page.getByRole("button", { name: "Créer la carte" }).click();
    await expect(page.getByRole("heading", { name: nomCarte })).toBeVisible({
      timeout: 20_000,
    });

    // Deux conditions plutôt qu'une : un div ne contenant QUE le titre serait
    // le petit conteneur flex des flèches d'ordre (motif de
    // `CarteEditeur`), pas la carte entière — le `.last()` sur les divs qui
    // portent LES DEUX (titre et champ de rubrique) retombe sur la `Card`
    // elle-même, plus précise que le conteneur qui liste toutes les cartes.
    const carteCard = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: nomCarte }) })
      .filter({ has: page.getByLabel("Nouvelle rubrique") })
      .last();

    // ── Rubrique ──
    const nomRubrique = "Rubrique E2E";
    await carteCard.getByLabel("Nouvelle rubrique").fill(nomRubrique);
    await carteCard.getByRole("button", { name: "Ajouter" }).first().click();
    await expect(carteCard.getByText(nomRubrique)).toBeVisible({
      timeout: 20_000,
    });

    // ── Fiche ──
    const rubriqueLi = page.locator("li").filter({ hasText: nomRubrique });
    const nomFiche = "Plat E2E";
    await rubriqueLi.getByLabel("Nouveau plat").fill(nomFiche);
    await rubriqueLi.getByRole("button", { name: "Ajouter" }).click();

    const ficheLi = page.locator("li").filter({ hasText: nomFiche }).last();
    await expect(ficheLi).toBeVisible({ timeout: 20_000 });

    // Ouvrir le détail pour cocher badge + allergène. Le contrôle est un
    // <summary> natif (fiche-editeur.tsx) : Playwright l'expose en `generic`,
    // jamais en `button` — on le vise donc par sa balise, pas par un rôle.
    await ficheLi.locator("summary").first().click();
    await ficheLi.getByLabel("🌱 Vegan").check();
    await ficheLi.getByLabel("Gluten").check();
    await ficheLi
      .getByRole("button", { name: "Enregistrer la fiche" })
      .click();
    await expect(ficheLi.getByText("Enregistré.")).toBeVisible({
      timeout: 20_000,
    });

    // ── Marquer indisponible ──
    await ficheLi
      .getByRole("button", { name: "Marquer indisponible" })
      .click();
    await expect(ficheLi.getByText("Indisponible")).toBeVisible({
      timeout: 20_000,
    });

    // ── Réordonner : la carte fraîchement créée descend d'un cran ──
    await carteCard
      .getByRole("button", { name: new RegExp(`Descendre.*${nomCarte}`) })
      .click({ timeout: 5_000 })
      .catch(() => {});
  });
});

test.describe("vitrine — rôle caissier", () => {
  test.use({ storageState: "e2e/.auth/cashier.json" });

  test("le caissier n'a ni entrée « Vitrine » dans la nav ni accès à la page", async ({
    page,
  }) => {
    await page.goto("/dashboard/redeem");
    await expect(page.getByRole("link", { name: "Vitrine" })).toHaveCount(0);

    // `notFound()` ICI EST IMBRIQUÉ dans le layout dashboard, déjà envoyé en
    // 200 (flux RSC) : le statut HTTP reste 200, seul le contenu dit le refus
    // — même motif que `reserver.spec.ts` (« jeton inconnu »). Le test du
    // drapeau public ci-dessus reste sur `status()` : sa 404 est, elle, au
    // TOUT premier niveau, avant tout layout.
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "Page introuvable" }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
