import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { CODE_CONSOMME } from "./redeem-card";
import { ouvrirTuile } from "./helpers";

/**
 * Championnat de pronostics seedé (E2EPRONO) : un match futur (pronos
 * ouverts) et un match passé (verrouillé, résultat + points saisis).
 * Couvre : inscription pseudo+avatar → saisie d'un prono → verrouillage
 * au coup d'envoi → résultats/points → classement général.
 * (Turnstile est désactivé en E2E : aucune clé configurée.)
 */
const SLUG = "E2EPRONO";

test.describe("pronostics — parcours joueur complet", () => {
  test("inscription, prono, verrouillage, résultats et classement", async ({
    page,
  }, testInfo) => {
    await page.goto(`/pronos/${SLUG}`);

    // ── Inscription : pseudo unique par projet (les deux mobiles tournent
    // en parallèle sur le même championnat seedé).
    const pseudo = `E2E ${testInfo.project.name}`.slice(0, 30);
    // #id direct : getByLabel("Pseudo") matcherait AUSSI la checkbox de
    // consentement (son libellé contient « Mon pseudo et mon avatar… »).
    await page.locator("#prono-first-name").fill(pseudo);
    // Avatar : on prend un drapeau pour couvrir l'onglet Nations.
    await page.getByRole("tab", { name: "Nations" }).click();
    await page.getByRole("button", { name: "France" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "C'est parti 🎉" }).click();

    // ── Mini espace joueur : en-tête profil + onglets.
    await expect(page.getByText(pseudo).first()).toBeVisible({ timeout: 10_000 });

    // ── Match futur : saisie d'un pronostic.
    const homeInput = page.getByRole("spinbutton").first();
    const awayInput = page.getByRole("spinbutton").nth(1);
    await homeInput.fill("2");
    await awayInput.fill("1");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("button", { name: /Enregistré|Modifier/ })).toBeVisible({
      timeout: 10_000,
    });

    // ── Match passé : verrouillé, résultat affiché.
    await expect(page.getByText(/Terminé \d+ – \d+/)).toBeVisible();
    // Ses inputs sont désactivés (pronostics fermés au coup d'envoi).
    const disabledInputs = page.locator("input[type=number][disabled]");
    await expect(disabledInputs.first()).toBeVisible();

    // ── Classement général : l'onglet liste le joueur et ses points.
    // (.first() : au retry CI, un homonyme d'un run précédent peut exister.)
    await page.getByRole("tab", { name: /Classement/ }).click();
    await expect(page.getByText("Classement").first()).toBeVisible();
    await expect(page.getByText(pseudo).first()).toBeVisible();
    await expect(page.getByText(/\d+ pts?/).first()).toBeVisible();

    // ── Profil : modification du pseudo depuis l'onglet dédié.
    await page.getByRole("tab", { name: /Profil/ }).click();
    const edited = `${pseudo} ✎`.slice(0, 30);
    await page.locator("#prono-edit-nickname").fill(edited);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(edited).first()).toBeVisible({ timeout: 10_000 });

    // ── Scan a11y de l'espace joueur en fin de parcours (onglet Profil).
    await expectNoA11yViolations(page, testInfo);
  });

  test("un championnat inconnu affiche un message clair @smoke", async ({ page }) => {
    await page.goto("/pronos/INCONNU9");
    await expect(page.getByText("Oups")).toBeVisible();
  });
});

/**
 * Clôture des récompenses (audit #5) : le propriétaire fige le
 * classement du championnat seedé E2EPRONO2 (tous matchs joués, Zoe
 * devant Yann au nombre de scores exacts), le palmarès attribue le lot
 * du rang 1 avec un code de retrait, et le public voit le classement
 * final. Mono-projet : la clôture est définitive — un seul projet la
 * déclenche, et le test reste rejouable (déjà clôturé → assertions
 * directes).
 */
test.describe("pronostics — clôture des récompenses", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : la clôture mute définitivement le championnat",
    );
  });

  test("clôturer → palmarès avec code, classement final public @smoke", async ({
    page,
  }) => {
    await page.goto("/dashboard/pronostics/e2e60000-0000-4000-8000-000000000002");

    // ATTENDRE le rendu AVANT d'interroger la présence du bouton.
    // `isVisible()` est une vérification INSTANTANÉE, sans attente automatique
    // — contrairement à `click()` ou `toBeVisible()`. Interrogé trop tôt sur une
    // page React encore en cours de rendu, il répond `false`, le bloc ci-dessous
    // est sauté EN SILENCE, et le test affirme ensuite une clôture qui n'a
    // jamais eu lieu. C'était la cause de son intermittence.
    // Le titre de niveau 1 est présent dans les deux états — championnat en
    // cours comme déjà clôturé — donc l'attente reste valable à la relance.
    await expect(
      page.getByRole("heading", { name: "Clôture E2E", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });

    // La tuile de clôture est repliée par défaut (chantier tuiles-checklist) :
    // sans ce dépli, isVisible() ci-dessous répond `false` (élément hors DOM)
    // et le bloc conditionnel est sauté EN SILENCE — la clôture n'a jamais lieu.
    await ouvrirTuile(page, /Développer «.*Clôturer le championnat/);

    // Premier passage : clôture. Retry/relance : déjà clôturé, la carte
    // de clôture a disparu — on passe directement aux assertions.
    const finalizeButton = page.getByRole("button", {
      name: "Clôturer et attribuer les récompenses",
    });
    if (await finalizeButton.isVisible().catch(() => false)) {
      await finalizeButton.click();
      await page
        .getByRole("button", { name: "Confirmer la clôture" })
        .click();
    }

    // Palmarès : le lot du rang 1 revient à Zoe (2 scores exacts contre
    // 1), avec un code de retrait au format maison et le statut initial.
    await ouvrirTuile(page, /Développer «.*Le palmarès/);
    await expect(page.getByText("Récompenses attribuées")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Zoe E2E").first()).toBeVisible();
    await expect(page.getByText("Coupe du patron").first()).toBeVisible();
    await expect(page.getByText(/PRONO-[A-HJ-NP-Z2-9]{8}/)).toBeVisible();

    // Le règlement est figé : les éditeurs l'affichent clairement. Le
    // LockedNotice vit dans la porte de l'atelier, repliée par défaut
    // depuis V1.51.1 — on la déplie d'abord.
    await ouvrirTuile(page, /Développer «.*L'atelier/);
    await expect(
      page.getByText(/Championnat clôturé : règlement et classement/).first(),
    ).toBeVisible();

    // Côté public : classement final, rangs uniques, gagnante en tête.
    await page.goto("/pronos/E2EPRONO2");
    await expect(page.getByText("🏅 Classement final")).toBeVisible();
    await expect(page.getByText("Zoe E2E")).toBeVisible();
    await expect(page.getByText("Championnat terminé — merci d'avoir joué !")).toBeVisible();
  });
});

/**
 * Récupération d'identité par lien magique (audit #6) : demande par
 * email (réponse neutre), lecture du lien dans le stub Resend (boîte
 * mail de test, GET /_last), confirmation explicite — le jeton
 * appareil tourne et la grille revient sur le navigateur. Yann garde
 * son email seedé exprès pour ce parcours.
 */
test.describe("pronostics — retrouver mes pronostics", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : la rotation déconnecte les autres appareils du joueur",
    );
  });

  test("lien magique : demande, email, confirmation, grille récupérée @smoke", async ({
    page,
    request,
  }) => {
    // Boîte mail de test indisponible (run local sans stubs) : on saute.
    const inbox = await request
      .get("http://127.0.0.1:12112/_last")
      .catch(() => null);
    test.skip(!inbox || !inbox.ok(), "Stub Resend absent (e2e/api-stubs.mjs)");

    await page.goto("/pronos/E2EPRONO2");
    await page
      .getByRole("button", { name: "Retrouver mes pronostics" })
      .click();
    await page.locator("#prono-recover-email").fill("yann@e2e.local");
    await page.getByRole("button", { name: "Recevoir le lien" }).click();

    // Réponse TOUJOURS neutre — jamais d'oracle d'inscription.
    await expect(
      page.getByText(/Si cet email est inscrit à ce championnat/),
    ).toBeVisible({ timeout: 15_000 });

    // Le lien magique est dans la boîte de test du stub.
    const emails = (await (
      await request.get("http://127.0.0.1:12112/_last")
    ).json()) as Array<{ to: string | null; html: string | null }>;
    const mail = [...emails]
      .reverse()
      .find((m) => m.to === "yann@e2e.local" && m.html?.includes("/recover?token="));
    expect(mail, "email de récupération reçu par le stub").toBeTruthy();
    const link = mail!.html!.match(
      /\/pronos\/E2EPRONO2\/recover\?token=[A-Za-z0-9_-]+/,
    )![0];

    // Confirmation explicite (le chargement seul ne consomme rien).
    await page.goto(link);
    await page
      .getByRole("button", { name: "Récupérer mes pronostics" })
      .click();

    // La grille revient : espace joueur au pseudo de Yann.
    await expect(page.getByText("Yann E2E").first()).toBeVisible({
      timeout: 15_000,
    });

    // Le lien est à usage unique : re-confirmer échoue proprement.
    await page.goto(link);
    await page
      .getByRole("button", { name: "Récupérer mes pronostics" })
      .click();
    await expect(page.getByText(/Lien invalide ou expiré/)).toBeVisible({
      timeout: 10_000,
    });
  });
});

/** Forme d'un code de retrait de pronostics (alphabet de caisse, sans I/O/0/1). */
const CONTEST_CODE = /^PRONO-[A-HJ-NP-Z2-9]{8}$/;

/**
 * ENCAISSEMENT EN CAISSE d'un lot de pronostics — 9e source du moteur de
 * codes. Avant ce chantier, `finalize_contest` émettait un PRONO-… que l'UI
 * disait « à présenter en caisse », mais aucun caissier ne pouvait le remettre :
 * le routage ne connaissait que 8 sources. La spec tient la boucle ENTIÈRE, sur
 * le championnat seedé E2EPRONO2 (Zoe gagne le rang 1, « Coupe du patron ») :
 *
 *   gain → le JOUEUR lit son code → saisie en CAISSE → remise validée →
 *   SECONDE TENTATIVE REFUSÉE
 *
 * Le dernier maillon est l'invariant central du chantier (idempotence de
 * `redeem_contest_award`) : il est asserté, pas seulement le chemin nominal —
 * un double retrait est une perte sèche pour le commerçant.
 *
 * Rejouable : la clôture comme la remise sont idempotentes côté serveur, et la
 * spec n'agit que si l'interface propose encore l'action (retry CI compris).
 *
 * NON couverts ici, faute de fixture : le refus d'un code EXPIRÉ (le seed ne
 * pose aucun `contests.code_ttl_seconds`, donc `redeem_expires_at` est null) et
 * celui d'un lot ANNULÉ (E2EPRONO2 n'attribue qu'UN lot, l'annuler priverait la
 * spec de son objet). Les deux restent tenus par les tests unitaires de
 * `lookupRedeemCode`/`redeemContestAward` et par `contest_awards.test.sql`.
 */
test.describe("pronostics — encaissement du code PRONO- en caisse", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : la remise d'un lot est à usage unique",
    );
  });

  test("gain → code au joueur → remise en caisse → seconde tentative refusée @smoke", async ({
    page,
    browser,
    baseURL,
    request,
  }, testInfo) => {
    // Parcours long : clôture + reprise d'identité + double passage en caisse.
    test.slow();

    // ── 1. Clôture (idempotente) et lecture du code au palmarès ──────
    await page.goto(
      "/dashboard/pronostics/e2e60000-0000-4000-8000-000000000002",
    );
    // Même précaution qu'au test de clôture plus haut : `isVisible()` ne patiente
    // pas, et interrogé sur une page encore en rendu il répond `false` — le bloc
    // conditionnel serait sauté sans bruit.
    await expect(
      page.getByRole("heading", { name: "Clôture E2E", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await ouvrirTuile(page, /Développer «.*Clôturer le championnat/);
    const finalizeButton = page.getByRole("button", {
      name: "Clôturer et attribuer les récompenses",
    });
    if (await finalizeButton.isVisible().catch(() => false)) {
      await finalizeButton.click();
      await page.getByRole("button", { name: "Confirmer la clôture" }).click();
    }
    await ouvrirTuile(page, /Développer «.*Le palmarès/);
    await expect(page.getByText("Récompenses attribuées")).toBeVisible({
      timeout: 15_000,
    });

    // Le code occupe un <code> dédié : la regex ANCRÉE ne peut matcher que
    // lui (jamais un ancêtre qui le contiendrait).
    const code = (
      await page.getByText(CONTEST_CODE).first().innerText()
    ).trim();
    expect(code, "code de retrait au format maison").toMatch(CONTEST_CODE);

    // ── 2. Le GAGNANT lit son code dans son espace joueur ────────────
    // L'identité seedée de Zoe n'est pas rejouable telle quelle (token_hash
    // non inversible) : on la reprend par le lien magique, qui transite par
    // le stub Resend. Stub absent (run local sans `e2e/api-stubs.mjs`) →
    // SEULE cette étape est sautée, et l'annotation le dit ; l'invariant de
    // la caisse ci-dessous reste couvert dans tous les cas.
    const inbox = await request
      .get("http://127.0.0.1:12112/_last")
      .catch(() => null);
    const mailbox = !!inbox && inbox.ok();

    const player = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });
    const playerPage = await player.newPage();
    try {
      if (mailbox) {
        await playerPage.goto("/pronos/E2EPRONO2");
        await playerPage
          .getByRole("button", { name: "Retrouver mes pronostics" })
          .click();
        await playerPage.locator("#prono-recover-email").fill("zoe@e2e.local");
        await playerPage
          .getByRole("button", { name: "Recevoir le lien" })
          .click();
        await expect(
          playerPage.getByText(/Si cet email est inscrit à ce championnat/),
        ).toBeVisible({ timeout: 15_000 });

        const emails = (await (
          await request.get("http://127.0.0.1:12112/_last")
        ).json()) as Array<{ to: string | null; html: string | null }>;
        const mail = [...emails]
          .reverse()
          .find(
            (m) =>
              m.to === "zoe@e2e.local" && m.html?.includes("/recover?token="),
          );
        expect(mail, "email de récupération reçu par le stub").toBeTruthy();
        const link = mail!.html!.match(
          /\/pronos\/E2EPRONO2\/recover\?token=[A-Za-z0-9_-]+/,
        )![0];

        await playerPage.goto(link);
        await playerPage
          .getByRole("button", { name: "Récupérer mes pronostics" })
          .click();
        await expect(playerPage.getByText("Zoe E2E").first()).toBeVisible({
          timeout: 15_000,
        });

        // Le lot, et le code que le joueur note avant de se déplacer.
        await expect(
          playerPage.getByText("🎁 Vous avez gagné : Coupe du patron"),
        ).toBeVisible();
        await expect(
          playerPage.getByText("Présentez ce code en caisse :"),
        ).toBeVisible();
        // C'est BIEN le code du palmarès : joueur et commerçant lisent la
        // même vérité, sinon le client se présente avec un code mort.
        await expect(playerPage.getByText(code)).toBeVisible();
      } else {
        testInfo.annotations.push({
          type: "non couvert",
          description:
            "Stub Resend absent : affichage du code côté joueur non vérifié.",
        });
      }

      // ── 3. Caisse : le code est reconnu et la remise validée ─────────
      await page.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
      await expect(page.getByText(code)).toBeVisible({ timeout: 30_000 });
      // Le code est routé vers la BONNE source (9e branche), pas vers le
      // repli roue : le badge et le rang le prouvent à l'écran.
      await expect(page.getByText(/⚽ Pronostics/)).toBeVisible();
      await expect(page.getByText("Coupe du patron")).toBeVisible();
      await expect(page.getByText(/Zoe E2E/)).toBeVisible();

      const redeem = page.getByRole("button", { name: "Valider la remise" });
      if (await redeem.isVisible().catch(() => false)) {
        // Panier facultatif : couvre le revenu attribuable (basket_cents).
        await page.getByLabel("Montant du panier (facultatif)").fill("12,50");
        await redeem.click();
        // Le rafraîchissement RSC qui suit l'action peut traîner — à défaut,
        // un reload relit l'état serveur, seule autorité (redeem_contest_award).
        try {
          await expect(page.getByText(CODE_CONSOMME)).toBeVisible({
            timeout: 20_000,
          });
        } catch {
          await page.reload();
          await expect(page.getByText(CODE_CONSOMME)).toBeVisible({
            timeout: 20_000,
          });
        }
        // Le panier saisi est retenu AVEC la remise (une remise sans montant
        // ne se distinguerait pas d'un montant perdu).
        await expect(page.getByText(/panier/)).toBeVisible();
      }

      // ── 4. INVARIANT : la SECONDE tentative est refusée ──────────────
      // Nouvelle saisie du MÊME code : la caisse annonce le refus AVANT tout
      // clic et n'offre plus aucun bouton de remise. C'est ce maillon qui
      // rend le double retrait impossible.
      await page.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
      await expect(page.getByText(CODE_CONSOMME)).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: "Valider la remise" }),
      ).toHaveCount(0);

      // ── 5. Les deux autres vues suivent la même vérité ───────────────
      // Palmarès commerçant : statut « Remis », plus d'action d'éditeur —
      // la remise faite en CAISSE (service_role) est bien celle que voit le
      // dashboard (is_org_editor), sans second horodatage divergent.
      await page.goto(
        "/dashboard/pronostics/e2e60000-0000-4000-8000-000000000002",
      );
      // Sans dépli, la tuile repliée retire ses enfants du DOM : le
      // `toHaveCount(0)` ci-dessous passerait à vide sans rien prouver.
      // Déplier D'ABORD, puis compter.
      await ouvrirTuile(page, /Développer «.*Le palmarès/);
      await expect(
        page.getByText("Remis", { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: "Marquer remis" }),
      ).toHaveCount(0);

      // Espace joueur : le lot n'invite plus à se déplacer, et le code a
      // disparu de l'écran (plus rien à photographier).
      if (mailbox) {
        await playerPage.goto("/pronos/E2EPRONO2");
        await expect(
          playerPage.getByText("Lot remis — merci d'avoir joué !"),
        ).toBeVisible({ timeout: 15_000 });
        await expect(playerPage.getByText(code)).toHaveCount(0);
      }
    } finally {
      await player.close();
    }
  });
});
