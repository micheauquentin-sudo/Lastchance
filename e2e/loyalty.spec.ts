import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Parcours joueur du Passeport de fidélité (seed supabase/seed.sql :
 * programme « Passeport E2E » de l'org E2E Café, actif, validation `staff`,
 * seuils argent 2 / or 3, deux paliers — lot « Café fidélité E2E » à la 2ᵉ
 * visite (stock fini de 25), puis tour de roue offert à la 3ᵉ (stock fini de
 * 25 lui aussi : sur un palier `spin` le stock compte les TOURS OFFERTS ÉMIS).
 *
 * Les rangs et les stocks de ces paliers sont imposés par les VERROUS
 * ÉCONOMIQUES de la base, et un seed qui les enfreint échoue à s'appliquer —
 * ce qui casse TOUTE la suite, pas seulement ce fichier (global-setup seede
 * avant les specs) :
 *   · `loyalty_milestones_visit_count_check` (20260725190000) interdit tout
 *     palier avant la visite 2 — un passeport neuf ne vaut rien ;
 *   · `loyalty_milestones_reward_stock_check`, RÉÉCRIT par 20260725200000,
 *     impose un stock fini sur TOUT palier, `spin` compris (la version de
 *     20260725190000 ne l'exigeait que sur `lot` et l'INTERDISAIT sur `spin`).
 *
 * La roue ciblée par le palier `spin` porte elle aussi un stock FINI sur son
 * lot gagnant (5000 dans le seed) : depuis 20260725200000,
 * `consume_loyalty_spin_grant` exclut du tirage les lots à stock illimité, et
 * une roue sans lot tirable répondrait `no_prize`.
 *
 * Limite assumée du seed : le programme est en mode `staff` (le commerçant
 * tamponne depuis la caisse). Contrairement à la chasse, il n'existe PAS de
 * jeton public déterministe permettant à un joueur anonyme de valider sa
 * propre visite depuis l'URL — le tampon exige une session staff + le scan du
 * QR du passeport. La couverture publique porte donc sur l'AFFICHAGE du
 * passeport (niveau, carte de tampons, paliers, carte à présenter) et sur
 * l'accessibilité, pas sur l'incrément du compteur. Un parcours de tampon
 * complet relèverait d'une spec caisse authentifiée (hors de ce lot).
 *
 * Depuis le durcissement du module, la carte staff n'est plus rendue côté
 * serveur : le QR ne porte QU'UN jeton de check-in signé et éphémère, demandé
 * après hydratation (getLoyaltyCheckinToken). L'écran passe donc par un état
 * « Préparation… » avant d'afficher le QR — d'où l'attente d'état explicite
 * sur l'image ci-dessous, sans laquelle le scan axe analyserait le
 * remplaçant de chargement au lieu de la carte réelle.
 *
 * Anonyme : le passeport part d'un cookie joueur vierge (0 visite, niveau
 * bronze). Rejouable et isolé entre projets/navigateurs.
 */
const PROGRAM_ID = "e2eb0000-0000-4000-8000-000000000001";

test.describe("passeport de fidélité — affichage joueur", () => {
  test("le passeport affiche niveau, tampons et paliers sans violation axe", async ({
    page,
  }, testInfo) => {
    // Jauges de progression animées (transition de largeur) : mouvement réduit
    // fige l'affichage pour un scan a11y déterministe.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/passeport/${PROGRAM_ID}`);

    // En-tête : le nom du programme est le repère public le plus stable
    // (rendu serveur, indépendant du cookie joueur).
    await expect(
      page.getByRole("heading", { name: "Passeport E2E", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });

    // Niveau + carte de tampons : l'état d'un joueur neuf (bronze, 0 visite).
    await expect(page.getByText("Votre niveau")).toBeVisible();
    await expect(page.getByText("Ma carte de fidélité")).toBeVisible();

    // Mode `staff` : la carte à présenter au comptoir (et non le formulaire de
    // code tournant) — preuve que le mode de validation seedé est bien rendu.
    await expect(
      page.getByRole("heading", { name: "Ma carte à présenter" }),
    ).toBeVisible();

    // Le QR de check-in finit par s'afficher : la Server Action a délivré un
    // jeton signé et le rendu client a remplacé « Préparation… ». Attente
    // d'état (pas de délai fixe) — elle stabilise aussi le scan axe qui suit.
    await expect(
      page.getByRole("img", { name: /QR de votre passeport de fidélité/i }),
    ).toBeVisible({ timeout: 30_000 });

    // Aperçu des paliers : le lot de la 2ᵉ visite est listé (aucun palier ne
    // peut exister avant la visite 2 depuis les verrous économiques).
    await expect(
      page.getByRole("heading", { name: "Les paliers à débloquer" }),
    ).toBeVisible();
    await expect(page.getByText("Café fidélité E2E")).toBeVisible();

    // Scan a11y de la surface publique complète (nouvelle route /passeport).
    await expectNoA11yViolations(page, testInfo);
  });

  test("un programme inconnu renvoie une 404 @smoke", async ({ page }) => {
    // Réponse générique unique : aucun oracle sur le motif d'invalidité
    // (programme inconnu, archivé, module coupé, abonnement inactif…).
    const response = await page.goto(
      "/passeport/00000000-0000-4000-8000-000000000000",
    );
    expect(response?.status()).toBe(404);
  });
});
