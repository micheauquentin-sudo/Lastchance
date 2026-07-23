import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Parcours joueur SUIVABLE du Jackpot collectif (seed supabase/seed.sql :
 * campagne « Jackpot E2E » de l'org « E2E Café », active, mode `threshold_draw`,
 * validation `staff`, seuil 5, montant d'affichage base 50 € (+2 €/participation),
 * stock fini 20, contenu commerçant). `public_slug` déterministe `e2e-jackpot` —
 * la page /jackpot/[id] résout indifféremment un UUID de campagne ou ce slug.
 *
 * Comme le passeport de fidélité, le mode `staff` n'expose PAS de jeton public
 * déterministe permettant à un anonyme de valider sa propre participation : la
 * couverture publique porte sur l'AFFICHAGE (jauge partagée, montant croissant,
 * récompense, contenu commerçant, carte à présenter au comptoir) et sur
 * l'accessibilité, pas sur l'incrément du compteur — un cycle de validation
 * complet relèverait d'une spec caisse authentifiée (hors de ce lot).
 *
 * La carte staff ne rend QU'UN jeton de check-in signé et éphémère, demandé
 * après hydratation (getJackpotCheckinToken, miroir de getLoyaltyCheckinToken) :
 * l'écran passe par un état « Préparation… » avant d'afficher le QR — d'où
 * l'attente d'état explicite sur l'image ci-dessous, sans laquelle le scan axe
 * analyserait le remplaçant de chargement au lieu de la carte réelle.
 *
 * Anonyme : la jauge part d'un cycle neuf (0 / 5, cagnotte à 50 €). Rejouable et
 * isolé entre projets/navigateurs (le cookie joueur est vierge).
 */
const JACKPOT_SLUG = "e2e-jackpot";

test.describe("jackpot collectif — affichage joueur suivable", () => {
  test("la page affiche jauge, montant, récompense et contenu commerçant sans violation axe", async ({
    page,
  }, testInfo) => {
    // Jauge de progression animée (transition de largeur) : mouvement réduit
    // fige l'affichage pour un scan a11y déterministe.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/jackpot/${JACKPOT_SLUG}`);

    // En-tête : le nom de la campagne est le repère public le plus stable
    // (rendu serveur, indépendant du cookie joueur).
    await expect(
      page.getByRole("heading", { name: "Jackpot E2E", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });

    // Jauge partagée : montant croissant (base 50 €, cycle neuf) et compteur
    // 0 / 5 — l'état d'un cycle sans participation. La barre porte un rôle
    // ARIA explicite (repère accessible, valeurs min/max/now).
    await expect(page.getByText("Le jackpot monte à")).toBeVisible();
    await expect(page.getByText(/50\s*€/)).toBeVisible();
    await expect(page.getByText("0 / 5")).toBeVisible();
    await expect(
      page.getByRole("progressbar", {
        name: "Progression du jackpot collectif",
      }),
    ).toBeVisible();

    // Récompense du seed : le label est rendu côté serveur dans la jauge.
    await expect(page.getByText("Le grand panier E2E")).toBeVisible();

    // Contenu commerçant : la section « Actualités du commerce » rend le texte
    // seedé — preuve que le champ `merchant_content` remonte à la page publique.
    await expect(
      page.getByText(/Soirée jackpot chaque vendredi/),
    ).toBeVisible();

    // Mode `staff` : la carte à présenter au comptoir (et non le formulaire de
    // code tournant) — preuve que le mode de validation seedé est bien rendu.
    await expect(
      page.getByRole("heading", { name: "Participer en caisse" }),
    ).toBeVisible();

    // Le QR de check-in finit par s'afficher : la Server Action a délivré un
    // jeton signé et le rendu client a remplacé « Préparation… ». Attente
    // d'état (pas de délai fixe) — elle stabilise aussi le scan axe qui suit.
    await expect(
      page.getByRole("img", {
        name: /QR de votre participation au jackpot/i,
      }),
    ).toBeVisible({ timeout: 30_000 });

    // Scan a11y de la surface publique complète (nouvelle route /jackpot).
    await expectNoA11yViolations(page, testInfo);
  });

  test("un jackpot inconnu renvoie une 404 @smoke", async ({ page }) => {
    // Réponse générique unique : aucun oracle sur le motif d'invalidité
    // (campagne inconnue, archivée, module coupé, abonnement inactif…).
    const response = await page.goto(
      "/jackpot/00000000-0000-4000-8000-000000000000",
    );
    expect(response?.status()).toBe(404);
  });
});
