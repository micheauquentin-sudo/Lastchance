import { expect, test, type Page } from "@playwright/test";

/**
 * PORTRAIT DE LA BANDE (L18) — la table nomme, et personne ne saura qui a voté.
 *
 * ── LE TEST DE CE LOT EST UNE ABSENCE ──
 *
 * Que le bulletin s'affiche, que les barres se peignent, que le récapitulatif
 * arrive : c'est de la mise en scène, et un rendu suffirait à la vérifier. Ce
 * qui justifie deux contextes navigateur tient en une assertion, et c'est LA
 * promesse du cahier : **à aucun moment une page ne dit qui a voté pour qui.**
 *
 * Concrètement : l'hôte nomme l'invité, l'invité passe. Après la révélation, le
 * pseudo de l'HÔTE — le seul votant qui ait nommé quelqu'un — ne doit se trouver
 * NULLE PART, sur aucune des deux pages. Pas masqué en CSS, pas dans un
 * attribut, pas dans une charge utile RSC : `page.content()` est le HTML
 * transmis, ce qu'un `view-source` verrait. La garde est en SQL —
 * `voter_token_hash` ne sort d'aucune RPC du lot — et ce test est ce qui empêche
 * qu'un futur écran la contourne en demandant « juste » le document complet.
 *
 * ── CHAQUE TEST CRÉE SA PROPRE SALLE ──
 *
 * Règle héritée de `lobby.spec.ts` : les deux projets Playwright tournent en
 * parallèle sur la MÊME base. Aucune salle « bande » n'est semée — elle se ferme
 * toute seule au récapitulatif, et en semer une aurait donné aux tests une
 * partie déjà à moitié jouée. Elles s'effacent seules (TTL 30 min).
 *
 * ── LE NOMBRE DE QUESTIONS N'EST PAS ÉCRIT ICI ──
 *
 * `bande_start` en tire entre 5 et 8 (`BANDE_QUESTIONS_MIN/MAX`), et le
 * recopier dans ce fichier en ferait une seconde source de vérité qui rougirait
 * le jour où le tirage bouge. Il est LU sur l'écran — « Question 1 sur N » — et
 * la boucle s'arrête sur ce N.
 */

/** Vitrine publiée d'« E2E Café », portant l'octroi `vitrine`. */
const SLUG = "e2e-comptoir";

/** Motif d'un code de partage, tel que la contrainte SQL l'écrit. */
const MOTIF_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Pseudo unique par exécution — deux projets écrivent en même temps. */
function pseudo(role: string): string {
  return `${role}${Date.now() % 100000}`;
}

/**
 * Ouvre un salon « bande » depuis la vitrine et rend son code de partage.
 *
 * LA CASE « À DEUX SEULEMENT » N'EST PAS COCHÉE, et c'est tout ce qu'il y a à
 * faire : `bande` est le format PAR DÉFAUT du formulaire de création. La
 * capacité est ramenée à deux pour que le verrou soit atteint dès l'entrée de
 * l'invité — le dénominateur du tour vaut alors deux, ce qui rend la révélation
 * automatique à la seconde voix.
 */
async function ouvrirSalonBande(page: Page, nom: string): Promise<string> {
  await page.goto(`/lobby/nouveau/${SLUG}`);
  await page.getByLabel(/prénom ou pseudo/i).fill(nom);
  await page.getByLabel(/combien serez-vous/i).selectOption("2");
  await page.getByRole("button", { name: /ouvrir le salon/i }).click();

  await page.waitForURL(/\/lobby\/[A-HJ-NP-Z2-9]{6}$/, { timeout: 15_000 });
  const code = page.url().split("/").pop() ?? "";
  expect(code).toMatch(MOTIF_CODE);
  return code;
}

/** Entre dans un salon déjà ouvert, par son code. */
async function rejoindreSalon(page: Page, code: string, nom: string) {
  await page.goto(`/lobby/${code}`);
  await page.getByLabel(/prénom ou pseudo/i).fill(nom);
  await page.getByRole("button", { name: /rejoindre le salon/i }).click();
}

/**
 * Ouvre une salle « bande » à deux, la verrouille, et rend les deux pages devant
 * la première question. L'appelant ferme le second contexte.
 */
async function partieBandePrete(
  hote: Page,
  invite: Page,
): Promise<{ pseudoHote: string; pseudoInvite: string }> {
  const pseudoHote = pseudo("Hote");
  const pseudoInvite = pseudo("Invite");

  const code = await ouvrirSalonBande(hote, pseudoHote);
  await rejoindreSalon(invite, code, pseudoInvite);

  await expect(hote.getByText("2/2", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await hote.getByRole("button", { name: /verrouiller et commencer/i }).click();

  // LE VERROU NE MÈNE PLUS À « LA PARTIE COMMENCE » : sur une salle « bande »,
  // il monte le jeu. C'est le branchement de ce lot, et les deux écrans le font
  // — celui qui a verrouillé tout de suite, celui d'en face au scrutin suivant.
  for (const ecran of [hote, invite]) {
    await expect(ecran.getByText(/question 1 sur \d+/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(ecran.getByText(/la partie commence/i)).toHaveCount(0);
  }
  return { pseudoHote, pseudoInvite };
}

/** Le nombre de questions de la partie, LU sur l'écran (« Question 1 sur 6 »). */
async function nombreDeQuestions(page: Page): Promise<number> {
  const texte = await page.getByText(/question \d+ sur \d+/i).innerText();
  const trouve = texte.match(/sur\s+(\d+)/i);
  expect(trouve).not.toBeNull();
  return Number(trouve?.[1]);
}

/** Combien de fois ce nom apparaît dans le HTML transmis. */
function occurrences(contenu: string, aiguille: string): number {
  return contenu.split(aiguille).length - 1;
}

test.describe("Portrait de la Bande (L18)", () => {
  test("la table découvre sa réponse, et jamais qui a voté", async ({
    page,
    browser,
  }) => {
    const contexteInvite = await browser.newContext();
    try {
      const invite = await contexteInvite.newPage();
      const { pseudoHote, pseudoInvite } = await partieBandePrete(page, invite);
      const total = await nombreDeQuestions(page);
      expect(total).toBeGreaterThanOrEqual(5);

      for (let position = 1; position <= total; position += 1) {
        await expect(
          page.getByText(new RegExp(`question ${position} sur ${total}`, "i")),
        ).toBeVisible({ timeout: 20_000 });

        // ── L'HÔTE NOMME L'INVITÉ ──
        await page
          .getByRole("button", { name: new RegExp(pseudoInvite, "i") })
          .click();

        // ── L'ATTENTE EST INVISIBLE : UN COMPTE, JAMAIS UN NOM ──
        //
        // « 1 sur 2 a répondu » est tout ce que l'hôte apprend. Ce qui compte
        // ici est ce qui N'EST PAS écrit — l'écran ne nomme pas celui qui
        // manque, et ne dit rien de ce qui a été voté.
        await expect(page.getByText(/votre vote est enregistré/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText(/1 sur 2/)).toBeVisible();
        await expect(page.getByText(/la réponse de la table/i)).toHaveCount(0);

        // ── L'INVITÉ PASSE — UN COUP JOUABLE, PAS UN RENONCEMENT ──
        await expect(
          invite.getByRole("button", { name: /je passe/i }),
        ).toBeVisible({ timeout: 20_000 });
        await invite.getByRole("button", { name: /je passe/i }).click();

        // ── LA RÉVÉLATION, DES DEUX CÔTÉS ──
        //
        // Le dernier vote attendu la déclenche DANS LA MÊME TRANSACTION : celui
        // qui l'a posé n'attend pas un sondage, l'autre l'apprend au tic suivant.
        for (const ecran of [invite, page]) {
          await expect(ecran.getByText(/la réponse de la table/i)).toBeVisible({
            timeout: 20_000,
          });
        }

        // Une voix sur un dénominateur de deux : le pourcentage vient du
        // SERVEUR et n'est jamais recalculé ici — on lit ce qu'il a écrit.
        await expect(page.getByText(/50\s*%/)).toBeVisible();
        await expect(page.getByText(/1 personne sur 2/i)).toBeVisible();

        // ── L'ASSERTION DU LOT ──
        //
        // Le seul votant qui ait NOMMÉ quelqu'un est l'hôte. Son pseudo ne doit
        // se trouver nulle part : ni sur sa propre page, ni sur celle de la
        // personne qu'il vient de nommer. Zéro occurrence, pas « une seule » —
        // contrairement à L17, aucun bouton légitime ne porte ce nom (le
        // bulletin exclut le votant de sa propre liste, et la révélation ne
        // peint aucun bulletin).
        for (const ecran of [page, invite]) {
          const contenu = await ecran.content();
          expect(occurrences(contenu, pseudoHote)).toBe(0);
          expect(contenu).not.toMatch(/a voté pour|voté pour|a nommé/i);
        }

        // ── L'HÔTE ENCHAÎNE — ET LUI SEUL ──
        await expect(
          invite.getByRole("button", {
            name: /question suivante|voir le portrait/i,
          }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: /question suivante|voir le portrait/i })
          .click();
      }

      // ── LE RÉCAPITULATIF, APRÈS LA DERNIÈRE ──
      //
      // Il FERME la salle, et ce n'est pas une panne : c'est pourquoi le
      // branchement de `SalonLobby` passe avant « expiré » et « refermé ».
      for (const ecran of [page, invite]) {
        await expect(ecran.getByText(/le portrait de la bande/i)).toBeVisible({
          timeout: 25_000,
        });
        await expect(ecran.getByText(/salon a pris fin/i)).toHaveCount(0);
        await expect(ecran.getByText(/salon a été refermé/i)).toHaveCount(0);
      }

      // La personne nommée à chaque question l'a été autant de fois qu'il y a
      // eu de questions — et le portrait le dit sans classer personne.
      await expect(
        page.getByText(new RegExp(`nommée? ${total} fois`, "i")),
      ).toBeVisible();
      await expect(
        page.getByText(/personne ne saura jamais qui a voté pour qui/i),
      ).toBeVisible();

      // ── PAS DE SCORE, PAS DE GAIN, ET C'EST LE CAHIER ──
      //
      // L'assertion est négative parce que c'est la seule forme qu'un
      // renoncement puisse prendre dans un test. Le pseudo de l'hôte reste
      // absent jusqu'au bout : le portrait ne nomme QUE les nommés.
      const fin = await page.content();
      expect(occurrences(fin, pseudoHote)).toBe(0);
      expect(fin).not.toMatch(/gagné|score|votre lot/i);
    } finally {
      await contexteInvite.close();
    }
  });
});
