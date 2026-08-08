import { expect, test } from "@playwright/test";
import { ouvrirTuile } from "./helpers";

/**
 * Place de marché de campagnes — parcours MODÈLE → BROUILLON (session owner
 * seedée, org « E2E Café »).
 *
 * Ce que ce spec atteste, et qui est la promesse centrale du chantier :
 * appliquer un modèle du catalogue Lastchance crée une campagne ENTIÈREMENT
 * CONFIGURÉE mais INERTE. La preuve est prise sur l'éditeur, pas sur un
 * message de confirmation :
 *
 *   · le badge d'état de l'en-tête affiche « Brouillon » — jamais « Ouverte aux joueurs » ;
 *   · la programmation automatique est DÉCOCHÉE. Sans ça,
 *     `run_campaign_schedule()` (pg_cron, toutes les 10 min) ferait passer le
 *     brouillon en `active` dès que `starts_at <= now()` — donc tout de suite,
 *     puisque le modèle pose `starts_at = now()` ;
 *   · le seul geste de publication offert est le bouton « Ouvrir aux joueurs »
 *     du commerçant (et « Mettre en pause », réservé aux campagnes ouvertes,
 *     est absent) ;
 *   · le jeu du modèle est bien là (la machine à sous de l'happy hour) : le
 *     brouillon est configuré, pas vide.
 *
 * Locators : le badge est cherché à partir du TITRE (rôle heading) dont il est
 * le voisin immédiat — et non par « div.justify-between », une classe
 * utilitaire qui ne survivait pas au premier ajustement de mise en page ; la
 * vignette du catalogue par son aria-label complet.
 */

/** Modèle du catalogue Lastchance appliqué ici (src/lib/campaign-templates.ts). */
const TEMPLATE_LABEL = "Happy hour";
/** `blueprint.texts.campaignName` de ce modèle — nom de la campagne créée. */
const CAMPAIGN_NAME = "Happy hour";

const CAMPAIGN_URL = /\/dashboard\/campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.describe("place de marché — appliquer un modèle crée un BROUILLON", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("depuis la galerie, un modèle du catalogue mène à un brouillon configuré @smoke", async ({
    page,
  }) => {
    await page.goto("/dashboard/campaigns");

    // ── 1. La galerie, repliée (l'organisation seedée a déjà des campagnes).
    const gallery = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: /Partir d.un modèle/ }) });
    await expect(gallery).toHaveCount(1);
    await expect(gallery).toHaveJSProperty("open", false);

    await gallery.locator("summary").click();
    await expect(gallery).toHaveJSProperty("open", true);

    // La promesse est affichée AVANT tout clic, pas seulement après.
    await expect(
      gallery.getByText(/Appliquer un modèle crée une campagne en brouillon/),
    ).toBeVisible();
    await expect(
      gallery.getByRole("heading", { name: "Modèles Lastchance" }),
    ).toBeVisible();

    // ── 2. Appliquer le modèle « Happy hour » du catalogue.
    // aria-label de ApplyTemplateButton : « Utiliser le modèle {nom} — … ».
    const apply = gallery.getByRole("button", {
      name: new RegExp(`^Utiliser le modèle ${TEMPLATE_LABEL}\\b`),
    });
    await expect(apply).toBeVisible();
    await apply.click();

    // ── 3. Atterrissage sur l'éditeur de la campagne CRÉÉE (uuid en URL).
    await expect(page).toHaveURL(CAMPAIGN_URL, { timeout: 30_000 });
    const title = page.getByRole("heading", { level: 1, name: CAMPAIGN_NAME });
    await expect(title).toBeVisible({ timeout: 30_000 });

    // ── 4. La campagne est un BROUILLON — badge d'état voisin du titre.
    // Ancré sur le TITRE (rôle heading, stable) et non sur « div.justify-between » :
    // la pastille est son voisine immédiate, la classe utilitaire ne l'était que
    // jusqu'au prochain ajustement de mise en page.
    const statusBadge = title
      .locator("xpath=..")
      // Le vocabulaire de la pastille inclut désormais les deux états
      // DÉRIVÉS (`campaignDisplayStatus`) : une campagne active hors de sa
      // fenêtre se dit « Programmée » ou « Terminée ». Les lister ici n'est
      // pas cosmétique — sans eux, une pastille inattendue ferait échouer ce
      // test sur « élément introuvable » au lieu de nommer ce qu'elle dit.
      // Le localisateur doit trouver la pastille quoi qu'elle affiche ;
      // c'est l'assertion qui porte le sens.
      .getByText(/^(Brouillon|Ouverte aux joueurs|En pause|Programmée|Clôturée)$/);
    await expect(statusBadge).toHaveText("Brouillon");

    // ── 5. Rien ne la publiera toute seule : programmation auto DÉCOCHÉE.
    await ouvrirTuile(page, /Développer «.*Programmation et budget/);
    await expect(
      page.getByRole("checkbox", {
        name: /Activer\/mettre en pause automatiquement/,
      }),
    ).not.toBeChecked();

    // L'ouverture reste un geste explicite ; « Mettre en pause » n'existe
    // que sur une campagne ouverte — son absence confirme l'état brouillon.
    await expect(
      page.getByRole("button", { name: "Ouvrir aux joueurs", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mettre en pause", exact: true }),
    ).toHaveCount(0);

    // ── 6. Le brouillon est CONFIGURÉ : le jeu du modèle est en place.
    await expect(page.getByText(/La machine de l.happy hour/)).toBeVisible();
  });
});
