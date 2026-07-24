import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Jeux de DÉFI *skill-gated* (vague 2) : le joueur AGIT (phase défi), le
 * SERVEUR évalue puis matérialise le tirage — réussite → tirage normal,
 * échec → spin PERDANT forcé (participation consommée dans les DEUX cas).
 * Deux démos seedées sur E2E Café (supabase/seed.sql) :
 *
 *   E2ERPS   pierre-feuille-ciseaux, roue 100 % gagnante, illimitée. Le
 *            coup adverse dérive d'un seed HMAC server-only : GAGNÉ (défi
 *            réussi) et « Pas cette fois » (défaite/égalité, ~2 coups sur
 *            3) sont TOUS DEUX des issues légitimes — le spec ne fige pas
 *            le résultat, il exige un écran terminal.
 *   E2EWORD  mot mystère (« MERINGUE », indice sans le mot), roue 100 %
 *            gagnante, play_limit daily. Bon mot → gagné déterministe ;
 *            le secret ne fuit jamais dans le HTML servi (non-fuite) ;
 *            une 2e participation du même device est bloquée.
 */

test.describe("jeux de défi skill-gated — parcours joueur", () => {
  test("pierre-feuille-ciseaux : idle → défi → issue terminale @smoke", async ({
    page,
  }, testInfo) => {
    await page.goto("/play/E2ERPS");
    // Idle : le bouton porte l'aria-label du jeu.
    const start = page.getByRole("button", {
      name: "Jouer à pierre-feuille-ciseaux",
    });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await start.click();

    // Phase de défi : les 3 coups du chifoumi (groupe accessible).
    await expect(
      page.getByRole("heading", { name: "Pierre, feuille, ciseaux" }),
    ).toBeVisible({ timeout: 30_000 });
    const moves = page
      .getByRole("group", { name: "Choisissez votre coup" })
      .getByRole("button");
    await expect(moves).toHaveCount(3);

    // Scan a11y de l'écran de DÉFI — l'état nouveau de la vague 2.
    await expectNoA11yViolations(page, testInfo);

    // Jouer un coup : le SERVEUR tranche (coup adverse non calculable côté
    // client). Les deux issues sont valides — on exige un écran terminal.
    await page.getByRole("button", { name: "Jouer Pierre" }).click();
    await expect(
      page
        .getByText("✦ GAGNÉ ✦")
        .or(page.getByRole("heading", { name: /Pas cette fois/ })),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("mot mystère : bon mot → gagné, sans fuite du secret @smoke", async ({
    page,
  }) => {
    await page.goto("/play/E2EWORD");
    const start = page.getByRole("button", { name: "Deviner le mot" });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await start.click();

    // Phase de défi : indice public + masque à la longueur du mot secret.
    await expect(
      page.getByRole("heading", { name: "Le mot mystère" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Indice/)).toBeVisible();
    await expect(page.getByText("Mot de 8 lettres")).toBeVisible();

    // NON-FUITE : le champ ne pré-contient JAMAIS le mot, et le secret
    // n'apparaît nulle part dans le document servi (seuls la longueur et
    // l'indice sont publics — vérifié AVANT toute saisie).
    const input = page.getByLabel("Votre proposition");
    await expect(input).toHaveValue("");
    expect(await page.content()).not.toMatch(/MERINGUE/i);

    // Le bon mot (accents/casse ignorés par le moteur serveur) → défi
    // réussi → tirage sur roue 100 % gagnante : issue déterministe.
    await input.fill("méringue");
    await page.getByRole("button", { name: "Proposer ce mot" }).click();
    await expect(page.getByText("✦ GAGNÉ ✦")).toBeVisible({ timeout: 30_000 });
  });

  test("mot mystère : une seule participation par device (play_limit) @smoke", async ({
    page,
  }) => {
    // 1er tour : mot FAUX → défi raté → spin PERDANT forcé — la
    // participation est CONSOMMÉE (issue déterministe, aucun gain à
    // recouvrer au rechargement).
    await page.goto("/play/E2EWORD");
    await page.getByRole("button", { name: "Deviner le mot" }).click();
    const input = page.getByLabel("Votre proposition");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("CHOUQUETTE");
    await page.getByRole("button", { name: "Proposer ce mot" }).click();
    await expect(
      page.getByRole("heading", { name: /Pas cette fois/ }),
    ).toBeVisible({ timeout: 30_000 });

    // 2e tentative, MÊME device : le start re-présente le défi (il ne
    // consomme rien), mais la soumission est refusée par le play_limit
    // (daily) appliqué DANS la RPC. Le submit partage le seau anti-rafale
    // du spin (1 / 4 s / device, ADR-032) : un enchaînement trop rapide
    // répond « Trop de tentatives » au lieu du blocage — toPass() relance
    // alors le parcours complet (état serveur inchangé : le play_limit
    // reste atteint), jamais d'attente en dur.
    await expect(async () => {
      await page.goto("/play/E2EWORD");
      await page.getByRole("button", { name: "Deviner le mot" }).click();
      const retry = page.getByLabel("Votre proposition");
      await expect(retry).toBeVisible({ timeout: 10_000 });
      await retry.fill("CHOUQUETTE");
      await page.getByRole("button", { name: "Proposer ce mot" }).click();
      await expect(
        page.getByRole("heading", { name: "Impossible de jouer" }),
      ).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByText("Vous avez déjà participé.")).toBeVisible();
  });
});
