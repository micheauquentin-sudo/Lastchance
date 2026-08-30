import { expect, type Page } from "@playwright/test";

/** Comptes seedés (supabase/seed.sql) — mot de passe commun. */
export const E2E_PASSWORD = "Password123!";
export const E2E_USERS = {
  owner: "owner@e2e.local",
  editor: "editor@e2e.local",
  cashier: "cashier@e2e.local",
  // Org Stripe dédiée (l'index « un owner par utilisateur » impose un
  // compte séparé de owner@).
  stripeOwner: "stripe-owner@e2e.local",
} as const;

/** Connexion au dashboard avec un compte seedé. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Ouvre une tuile CarteRepliable repliée par défaut (chantier
 * tuiles-checklist) si elle l'est encore. Le bouton de repli porte
 * l'aria-label « Développer « N. Titre — … » » ; certaines tuiles
 * (#statut, portes d'atelier, GuidedJourney) restent ouvertes et n'ont
 * pas ce bouton — dans ce cas on ne fait rien, la tuile est déjà là.
 *
 * ── ON N'ATTEND PLUS UN CLIC, ON ATTEND L'ÉTAT QU'IL PRODUIT ──
 *
 * La version d'avant lançait UN clic avec cinq secondes de budget et avalait
 * l'échec. C'était tolérant de la bonne façon — une tuile déjà ouverte n'a pas
 * de bouton « Développer » — et fragile de la mauvaise : quand le clic partait
 * avant l'hydratation, ou quand la page avait grandi et que le bouton
 * demandait un défilement, le dépli était sauté EN SILENCE. Le test ne tombait
 * pas là, il tombait dix lignes plus loin sur « element(s) not found », en
 * désignant un champ innocent.
 *
 * C'est exactement ce qui vient d'arriver : les titres de cartes ont grandi,
 * chaque tuile repliée a gagné quelques pixels, et `campaign-templates` a
 * échoué sur une case à cocher qui n'avait pas bougé.
 *
 * On reclique donc tant que le bouton « Développer » est encore là, jusqu'à ce
 * qu'il disparaisse — c'est LUI le témoin du dépli, et il est exact dans les
 * deux sens : une tuile sans bouton (déjà ouverte, ou absente de la page) sort
 * immédiatement, sans rien faire, comme avant.
 */
export async function ouvrirTuile(page: Page, motifTitre: RegExp) {
  const bouton = page.getByRole("button", { name: motifTitre });

  // ON LAISSE LA PAGE ARRIVER AVANT DE CONCLURE, et c'est une régression que
  // j'ai introduite puis mesurée : le raccourci `count() === 0` ci-dessous ne
  // distingue pas « tuile déjà ouverte » de « pas encore rendue ». Sur une page
  // qui hydrate encore, il sortait immédiatement sans rien ouvrir, et le test
  // tombait plus loin sur un élément innocent — exactement le défaut que cette
  // aide devait fermer. `pronostics` est passé de deux à cinq échecs entre les
  // deux versions : c'est la mesure de la faute, pas un aléa.
  //
  // L'ancienne version tenait ce rôle par accident, avec les cinq secondes de
  // son `click()`. On le rend explicite.
  await bouton.waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});

  await expect(async () => {
    // Absence APRÈS cette attente : la tuile est déjà ouverte (son bouton dit
    // « Réduire »), ou elle n'est pas sur cette page. Les deux sont tolérés.
    if ((await bouton.count()) === 0) return;
    // `force` — ET C EST ARGUMENTÉ, PAS UN CONTOURNEMENT.
    //
    // Sans lui, Playwright refusait le clic en signalant qu un `<td>` du bloc
    // « statut » recouvrait le bouton. La trace CI dit le contraire : ce bloc
    // est du contenu ORDINAIRE, situé AU-DESSUS dans le flux, sans position
    // absolue ni collante à cette largeur, et la seule couche flottante de la
    // page est en `pointer-events-none`. Rien ne recouvre rien.
    //
    // Ce que la trace montre vraiment : « scrolling into view / done scrolling »
    // puis un test de collision qui désigne un élément différent à chaque essai.
    // C est une mesure PÉRIMÉE — la page se replace encore quand le point est
    // calculé, et six cartes devenues un peu plus hautes ont suffi à décaler
    // le reste sous le curseur.
    //
    // Le garde-fou n est pas perdu pour autant : l assertion qui suit exige que
    // le bouton DISPARAISSE. Un clic forcé qui n ouvrirait rien laisserait la
    // boucle rejouer puis échouer. C est l état qui juge, jamais le clic.
    await bouton.first().click({ timeout: 4_000, force: true });
    await expect(bouton).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}
