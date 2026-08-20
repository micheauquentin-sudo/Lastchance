import { expect, test } from "@playwright/test";

/**
 * Vitrine (VIT-1a / L10, VIT-1b / L11) : la chaîne publique bilingue, le
 * dashboard commerçant, la garde de rôle.
 *
 * Seed (`supabase/seed.sql`) : org « E2E Café » (owner/editor/cashier),
 * vitrine `e2e-comptoir` PUBLIÉE, deux cartes / trois rubriques / six fiches
 * dont une indisponible (« Curry de légumes grillés ») et une aux badges ET
 * allergènes vides (« Côtes-du-rhône »). Quatre traductions anglaises, dont
 * UNE PÉRIMÉE — « Chickpea hummus », qui ne doit JAMAIS s'afficher.
 *
 * ── LE DRAPEAU EST TOMBÉ, ET CE FICHIER L'A SUIVI CONSCIEMMENT ──
 *
 * Ce bloc portait pendant tout L10 l'assertion inverse : `/v/e2e-comptoir`
 * rendait 404 même publiée, parce que `VITRINE_PUBLIQUE_OUVERTE` valait faux —
 * la Vitrine n'ouvrait qu'AVEC l'anglais. Le test était écrit pour ROUGIR le
 * jour de la bascule, et il a rougi : c'est ce qui a forcé la relecture de ce
 * fichier plutôt qu'un `expect` retourné à la va-vite. L'anglais est livré,
 * l'adresse répond, et les tests ci-dessous parcourent la vraie chaîne.
 *
 * Le 404 n'a pas disparu pour autant — il a retrouvé ses seules raisons
 * légitimes : slug inconnu, vitrine non publiée, droit éteint, et langue
 * inconnue dans le chemin.
 */
test.describe("vitrine — la page publique, en français", () => {
  test("l'adresse publique répond et rend la carte du seed", async ({
    page,
  }) => {
    const reponse = await page.goto("/v/e2e-comptoir");
    expect(reponse?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "E2E Café" })).toBeVisible({
      timeout: 30_000,
    });

    // Une fiche DISPONIBLE de la carte ouverte par défaut (« Carte du midi »).
    // Volontairement pas « Velouté de potiron », qui est traduite : celle-ci
    // reste française dans les deux langues et ne prouverait rien plus bas.
    await expect(page.getByText("Tartare de bœuf")).toBeVisible();

    // LA FICHE ÉPUISÉE EST LÀ, ET ELLE EST DITE. La base la rend exprès avec
    // son drapeau : l'écran doit la GRISER, jamais la faire disparaître — un
    // plat qui s'évapore de la carte se lit comme une carte qui a changé.
    await expect(page.getByText("Curry de légumes grillés")).toBeVisible();
    await expect(page.getByText("Indisponible aujourd'hui")).toBeVisible();
  });

  test("une langue inconnue dans le chemin rend 404", async ({ page }) => {
    // PAS de repli silencieux sur le français : `/v/x/xx` servirait la même
    // page sous une adresse de plus, avec sa propre entrée de cache ISR.
    const reponse = await page.goto("/v/e2e-comptoir/xx");
    expect(reponse?.status()).toBe(404);
  });

  test("un slug inconnu rend 404, comme avant l'ouverture", async ({
    page,
  }) => {
    const reponse = await page.goto("/v/adresse-qui-nexiste-pas-e2e");
    expect(reponse?.status()).toBe(404);
  });
});

test.describe("vitrine — la variante anglaise", () => {
  test("/en répond et sert les champs traduits du seed", async ({ page }) => {
    const reponse = await page.goto("/v/e2e-comptoir/en");
    expect(reponse?.status()).toBe(200);

    // Les TROIS NIVEAUX du calque, tels que le seed les pose : l'accroche des
    // réglages, le nom d'une rubrique, le nom d'une fiche.
    await expect(
      page.getByText(
        "The neighbourhood coffee bar, roasting our own beans since 2019.",
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Starters" })).toBeVisible();
    await expect(page.getByText("Pumpkin velouté")).toBeVisible();

    // Le seed est à couverture COMPLÈTE (19/19 frais — condition du sélecteur,
    // voir plus bas) : plus aucune ligne périmée ici. La péremption — une
    // traduction plus vieille que sa cible redonne le français — reste prouvée
    // par pgTAP (§12, `supabase/tests/vitrine.test.sql`), qui la CRÉE par un
    // update plutôt que de la figer dans un jeu de données.
    await expect(page.getByText("Hummus of the day")).toBeVisible();
    await expect(page.getByText("Houmous du jour")).toHaveCount(0);

    // Le CHROME suit aussi, et il ne vient d'aucune table
    // (`src/components/vitrine/langue.ts`).
    await expect(page.getByText("Unavailable today")).toBeVisible();
  });

  test("badges et allergènes passent en libellé anglais", async ({ page }) => {
    await page.goto("/v/e2e-comptoir/en");
    const fiche = page.locator("article").filter({ hasText: "Pumpkin velouté" });
    await expect(fiche).toBeVisible({ timeout: 30_000 });

    // « Velouté de potiron » porte `vegetarien` et l'allergène `lait`. Le
    // vocabulaire de plateforme est traduit à la main, une fois pour toutes
    // (`BADGES_EN` / `ALLERGENES_EN` dans `src/lib/vitrine.ts`) — le calque de
    // traduction n'y touche jamais.
    await expect(fiche.getByText(/Vegetarian/i)).toBeVisible();
    await expect(fiche.getByText("🥗 Végétarien")).toHaveCount(0);

    await fiche.getByText("Allergens").click();
    await expect(fiche.getByText(/Milk/i)).toBeVisible();
  });

  test("le retour au français est TOUJOURS offert sur la variante anglaise", async ({
    page,
  }) => {
    await page.goto("/v/e2e-comptoir/en");
    const retour = page.getByRole("link", { name: "Français" });
    await expect(retour).toBeVisible({ timeout: 30_000 });
    await retour.click();
    await expect(page).toHaveURL(/\/v\/e2e-comptoir$/);
    await expect(page.getByText("Velouté de potiron")).toBeVisible();
  });
});

/**
 * LE SÉLECTEUR DE LANGUE — et pourquoi l'assertion est celle-ci.
 *
 * La page FRANÇAISE n'offre l'anglais que si `selecteurLangues` est vrai,
 * c'est-à-dire au-delà de 95 % de couverture : envoyer un visiteur étranger sur
 * une carte à moitié française est pire que ne rien lui offrir, parce qu'il a
 * fait la démarche.
 *
 * ── ÉTAT DU SEED, MESURÉ ET NON SUPPOSÉ ──
 *
 * `supabase/seed.sql` pose les DIX-NEUF champs traduisibles de `e2e-comptoir`
 * en anglais FRAIS (3 réglages + 2 cartes + 3 rubriques + 11 noms et
 * descriptions de fiches — « Limonade artisanale » n'a pas de description).
 * Couverture 100 %, au-dessus du seuil : le sélecteur est PRÉSENT sur la page
 * française, et c'est ce que ce test fige. Une seule ligne périmée aurait fait
 * 18/19 = 94,7 % — sous le seuil par accident : c'est pourquoi la péremption
 * vit en pgTAP et pas dans le seed.
 *
 * Le garde-fou inverse — sélecteur ABSENT sous le seuil — est prouvé par les
 * tests Vitest de `selecteurLanguesOuvert` aux deux bords du seuil ; le seed
 * n'a pas de seconde vitrine publiée à couverture nulle pour l'asserter ici.
 */
test.describe("vitrine — sélecteur de langue", () => {
  test("la page française offre l'anglais dès le seuil de couverture atteint", async ({
    page,
  }) => {
    await page.goto("/v/e2e-comptoir");
    await expect(page.getByRole("heading", { name: "E2E Café" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "English" })).toBeVisible();

    // L'adresse anglaise reste atteignable EN DIRECT : le sélecteur est une
    // porte d'entrée, pas une autorisation.
    const reponse = await page.goto("/v/e2e-comptoir/en");
    expect(reponse?.status()).toBe(200);
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

    // LA PHRASE D'ATTENTE EST MORTE AVEC L11. L'encart ne dit plus « n'imprimez
    // pas vos QR codes tout de suite » : il dit que la vitrine est en ligne et
    // donne l'adresse, cliquable, pour qu'elle soit ouverte avant d'être
    // imprimée.
    await expect(page.getByText(/Votre vitrine est en ligne/)).toBeVisible();
    await expect(
      page.getByText(/n'imprimez pas vos QR codes tout de suite/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /\/v\/e2e-comptoir$/ }),
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
    // `.last()` : les `li` sont imbriqués (carte > rubrique) et le filtre
    // par texte matche AUSSI le parent — le plus profond est le bon.
    const rubriqueLi = page
      .locator("li")
      .filter({ hasText: nomRubrique })
      .last();
    const nomFiche = "Plat E2E";
    await rubriqueLi.getByLabel("Nouveau plat").fill(nomFiche);
    await rubriqueLi.getByRole("button", { name: "Ajouter" }).click();

    const ficheLi = page.locator("li").filter({ hasText: nomFiche }).last();
    await expect(ficheLi).toBeVisible({ timeout: 20_000 });

    // Ouvrir le détail pour cocher badge + allergène. Le contrôle est un
    // <summary> natif (fiche-editeur.tsx) : Playwright l'expose en `generic`,
    // jamais en `button` — on le vise par sa balise ET son texte, car la
    // fiche porte un second <summary> (le pli « Allergènes » du rendu).
    await ficheLi
      .locator("summary")
      .filter({ hasText: /Modifier|Voir le détail/ })
      .first()
      .click();
    await ficheLi.getByLabel("🌱 Vegan").check();
    // Les allergènes vivent derrière un second pli DANS l'éditeur — l'ouvrir
    // avant de cocher, sinon la case existe mais n'est pas visible.
    await ficheLi
      .locator("summary")
      .filter({ hasText: "Allergènes" })
      .first()
      .click();
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
    // — même motif que `reserver.spec.ts` (« jeton inconnu »). Les tests
    // publics ci-dessus restent sur `status()` : leurs 404 sont, elles, au
    // TOUT premier niveau, avant tout layout.
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "Page introuvable" }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
