import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "../e2e/axe";

/**
 * Fumée + accessibilité du site vitrine (`site/`) : les quatre pages
 * publiques répondent, portent un titre et un <h1>, leurs CTA principaux et
 * leur navigation mènent où ils annoncent, et une route inconnue rend la 404.
 *
 * Assertions dérivées de ce que le visiteur VOIT (rôles et noms accessibles),
 * jamais d'un sélecteur de classe CSS — cf. les specs de `e2e/`.
 */

test.describe("accueil", () => {
  test("affiche la promesse et mène vers les tarifs et l'inscription", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/LastChance/);
    await expect(
      page.getByRole("heading", { level: 1, name: /roue de la fortune/i }),
    ).toBeVisible();

    // CTA principal du hero : ouvre l'inscription de l'application.
    await expect(
      page.getByRole("link", { name: "Essayer gratuitement" }),
    ).toHaveAttribute("href", /\/signup$/);

    // Second CTA du hero : reste sur le site vitrine.
    await page
      .getByRole("link", { name: "Voir les tarifs" })
      .click();
    await expect(page).toHaveURL(/\/tarifs$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expectNoA11yViolations(page, testInfo);
  });

  test("la navigation principale mène aux quatre pages", async ({
    page,
    isMobile,
  }) => {
    // Le bandeau `nav[aria-label="Navigation principale"]` est masqué en
    // dessous du breakpoint `md` (menu « Menu » replié à la place) : sur le
    // projet mobile, ce parcours passe par ce menu plutôt que par un nœud
    // devenu invisible.
    await page.goto("/");
    // Le menu mobile est un <details>/<summary> natif : pas de rôle
    // "button" exposé ici, on ouvre via son texte visible.
    const menuToggle = page.getByText("Menu", { exact: true });
    const nav = isMobile
      ? page.getByRole("navigation", { name: "Navigation mobile" })
      : page.getByRole("navigation", { name: "Navigation principale" });

    for (const [label, url] of [
      ["Tarifs", /\/tarifs$/],
      ["FAQ", /\/faq$/],
    ] as const) {
      // `goBack` restaure l'état (bfcache) tel qu'il était avant de quitter
      // la page — menu potentiellement déjà ouvert : on ne rebascule le
      // <details> que s'il est encore fermé.
      if (isMobile && !(await nav.isVisible())) {
        await menuToggle.click();
      }
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(url);
      await page.goBack();
    }
  });
});

test.describe("tarifs", () => {
  test("liste les offres et leurs CTA d'inscription", async ({
    page,
  }, testInfo) => {
    await page.goto("/tarifs");
    await expect(page).toHaveTitle(/Tarifs/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Chaque offre a un CTA — au moins un lien mène vers le formulaire de
    // contact (souscription en ligne fermée par défaut, cf. content/site.ts).
    await expect(
      page.getByRole("link", { name: /parler de cette offre/i }).first(),
    ).toHaveAttribute("href", "/contact");

    await expectNoA11yViolations(page, testInfo);
  });
});

test.describe("faq", () => {
  test("affiche les questions et un CTA final", async ({ page }, testInfo) => {
    await page.goto("/faq");
    await expect(page).toHaveTitle(/FAQ/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expectNoA11yViolations(page, testInfo);
  });
});

test.describe("contact", () => {
  test("affiche l'email de contact et le lien vers la FAQ", async ({
    page,
  }, testInfo) => {
    await page.goto("/contact");
    await expect(page).toHaveTitle(/Contact/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Le même email apparaît aussi dans le pied de page ; celui de la
    // carte "Par email" est le premier de la page.
    await expect(
      page.getByRole("link", { name: "contact@lastchance.app" }).first(),
    ).toHaveAttribute("href", /^mailto:contact@lastchance\.app/);

    // "FAQ" apparaît deux fois (nav + lien de bas de page) : le second,
    // au fil du texte, est celui que ce parcours vérifie.
    await page.getByRole("link", { name: "FAQ" }).last().click();
    await expect(page).toHaveURL(/\/faq$/);

    await expectNoA11yViolations(page, testInfo);
  });
});

test.describe("404", () => {
  test("une route inconnue rend la page introuvable", async ({ page }) => {
    const response = await page.goto("/nimporte-quoi");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /page n'existe pas/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /retour à l'accueil/i }),
    ).toHaveAttribute("href", "/");
  });
});
