import { expect, test, type Page } from "@playwright/test";

/**
 * DUO MIROIR (L17) — deux choix scellés, une révélation simultanée.
 *
 * ── LE TEST DE CE LOT EST UNE ABSENCE ──
 *
 * Tout le reste (le plateau s'affiche, le choix se scelle, la révélation montre
 * deux cartes) est de la mise en scène. Ce qui est réellement vérifié ici, et ce
 * qui justifie deux contextes navigateur plutôt qu'un, tient en une assertion :
 * **avant que le second ait choisi, le nom de la fiche du second n'est NULLE
 * PART dans la page du premier.** Pas caché en CSS, pas dans un attribut, pas
 * dans une charge utile RSC : `page.content()` est le HTML transmis, et c'est ce
 * qu'un onglet « réseau » ou un `view-source` verrait. La garde est en SQL —
 * `duo_state` ne calcule `autre_choix` que dans la branche `revelee` — et ce test
 * est ce qui empêche qu'un futur écran la contourne en demandant « juste » le
 * document complet.
 *
 * ── CE QUE LE SEED POSE ──
 *
 * Quatre options sur « E2E Café » — Velouté de potiron, Houmous du jour, Tartare
 * de bœuf, Côtes-du-rhône — et une suggestion HORS plateau, « Limonade
 * artisanale ». Deux fiches de la carte restent volontairement hors plateau.
 *
 * ── CHAQUE TEST CRÉE SA PROPRE SALLE ──
 *
 * Règle héritée de `lobby.spec.ts` : les deux projets Playwright tournent en
 * parallèle sur la MÊME base. Aucune salle « duo » n'est semée — une salle Duo
 * Miroir se FERME toute seule à la révélation, et en semer une aurait donné aux
 * tests une partie déjà à moitié jouée. Elles s'effacent seules (TTL 30 min).
 */

/** Vitrine publiée d'« E2E Café », portant l'octroi `vitrine`. */
const SLUG = "e2e-comptoir";

/** Motif d'un code de partage, tel que la contrainte SQL l'écrit. */
const MOTIF_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * Deux fiches du plateau semé, et elles doivent être DIFFÉRENTES pour le test
 * central : c'est le nom de la seconde qui ne doit apparaître nulle part chez le
 * premier joueur.
 */
const FICHE_A = "Velouté de potiron";
const FICHE_B = "Tartare de bœuf";

/** La suggestion de la maison — hors plateau, montrée APRÈS la révélation. */
const SUGGESTION = "Limonade artisanale";

/** Pseudo unique par exécution — deux projets écrivent en même temps. */
function pseudo(role: string): string {
  return `${role} ${Date.now() % 100000}`;
}

/** Ouvre un salon DUO depuis la vitrine et rend son code de partage. */
async function ouvrirSalonDuo(page: Page, nom: string): Promise<string> {
  await page.goto(`/lobby/nouveau/${SLUG}`);
  await page.getByLabel(/prénom ou pseudo/i).fill(nom);
  // LE FORMAT SE COCHE : `kind` part à « duo » et la capacité est figée à deux
  // (`player_lobbies_duo_fige`). Le sélecteur de capacité disparaît, ce qui est
  // la preuve visible que la case a bien basculé le format.
  await page.getByLabel(/à deux seulement/i).check();
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
 * Ouvre une salle duo à deux, la verrouille, et rend les deux pages devant le
 * plateau. L'appelant ferme le second contexte.
 */
async function partieDuoPrete(
  page: Page,
  invite: Page,
): Promise<{ code: string }> {
  const code = await ouvrirSalonDuo(page, pseudo("Hote"));
  await rejoindreSalon(invite, code, pseudo("Binome"));

  await expect(page.getByText("2/2", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /verrouiller et commencer/i }).click();

  // LE VERROU NE MÈNE PLUS À « LA PARTIE COMMENCE » : sur une salle duo, il
  // monte le jeu. C'est le branchement de ce lot, et les deux écrans le font —
  // celui qui a verrouillé tout de suite, celui d'en face au scrutin suivant.
  for (const ecran of [page, invite]) {
    await expect(
      ecran.getByRole("button", { name: new RegExp(FICHE_A, "i") }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(ecran.getByText(/la partie commence/i)).toHaveCount(0);
  }
  return { code };
}

test.describe("Duo Miroir (L17)", () => {
  test("le choix de l'autre n'existe NULLE PART avant la révélation", async ({
    page,
    browser,
  }) => {
    const contexteInvite = await browser.newContext();
    try {
      const invite = await contexteInvite.newPage();
      await partieDuoPrete(page, invite);

      // ── LE PREMIER SCELLE ──
      await page.getByRole("button", { name: new RegExp(FICHE_A, "i") }).click();
      await expect(page.getByText(/votre choix est scellé/i)).toBeVisible({
        timeout: 15_000,
      });
      // Le plateau se FIGE, il ne disparaît pas : les autres cartes deviennent
      // inertes parce qu'elles le sont — `duo_choose` refuse un second item.
      await expect(
        page.getByRole("button", { name: new RegExp(FICHE_B, "i") }),
      ).toBeDisabled();

      // ── ET LE SECOND N'A PAS ENCORE CHOISI ──
      //
      // C'EST ICI QUE TOUT SE JOUE. La page du premier a été sondée au moins une
      // fois depuis son sceau ; elle sait donc que l'autre n'a pas encore
      // répondu. Elle ne doit RIEN savoir de plus.
      await expect(page.getByText(/en attente de votre binôme/i)).toBeVisible({
        timeout: 15_000,
      });

      // ── L'ASSERTION DU LOT, ET POURQUOI ELLE COMPTE LES OCCURRENCES ──
      //
      // « Le nom de l'autre fiche est absent de la page » serait FAUX et le test
      // rougirait toujours : le plateau porte les quatre fiches, l'autre choix
      // est forcément l'une d'elles. Ce qui doit être absent n'est pas le NOM,
      // c'est la seconde occurrence — celle qui l'ATTRIBUE à quelqu'un. Un écran
      // qui fuiterait peindrait un panneau « son choix » en plus de la carte du
      // plateau, donc deux occurrences ; tant que la manche est ouverte, il doit
      // y en avoir exactement une, celle du bouton.
      //
      // `page.content()` est le HTML transmis — attributs et nœuds masqués
      // compris. C'est ce qu'un `view-source` verrait, pas ce que l'œil voit.
      const contenuAvant = await page.content();
      expect(occurrences(contenuAvant, FICHE_B)).toBe(1);
      // Et aucun des marqueurs de la révélation n'est peint.
      await expect(page.getByText(/la révélation/i)).toHaveCount(0);
      await expect(page.getByText(/son choix/i)).toHaveCount(0);
      await expect(page.getByText(/la maison propose/i)).toHaveCount(0);
      await expect(page.getByText(SUGGESTION)).toHaveCount(0);

      await invite
        .getByRole("button", { name: new RegExp(FICHE_B, "i") })
        .click();

      // ── LA RÉVÉLATION, DES DEUX CÔTÉS ──
      //
      // Celui qui a posé le SECOND sceau l'apprend dans la même transaction ;
      // le premier l'apprend au scrutin suivant, sans rien recharger.
      for (const ecran of [invite, page]) {
        await expect(ecran.getByText(/la révélation/i)).toBeVisible({
          timeout: 20_000,
        });
        await expect(ecran.getByText(FICHE_A, { exact: true })).toBeVisible();
        await expect(ecran.getByText(FICHE_B, { exact: true })).toBeVisible();
      }

      // Deux choix DIFFÉRENTS : aucune mention d'accord.
      await expect(
        page.getByText(/vous avez pensé à la même chose/i),
      ).toHaveCount(0);

      // LA SUGGESTION ARRIVE ICI, ET SEULEMENT ICI. Elle n'est pas sur le
      // plateau — c'est le cas le plus intéressant du jeu, et c'est aussi ce qui
      // prouve qu'une suggestion ne se choisit pas.
      await expect(page.getByText(/la maison propose/i)).toBeVisible();
      await expect(page.getByText(SUGGESTION, { exact: true })).toBeVisible();

      // ET LA SALLE FERMÉE N'EST PAS UNE PANNE : la révélation la ferme et ramène
      // sa date de mort à l'instant même. Un rechargement doit rendre le
      // résultat, pas « ce salon a pris fin ».
      await page.reload();
      await expect(page.getByText(/la révélation/i)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/salon a pris fin/i)).toHaveCount(0);
      await expect(page.getByText(/salon a été refermé/i)).toHaveCount(0);
    } finally {
      await contexteInvite.close();
    }
  });

  test("deux fois la même fiche : la mention d'accord, et rien d'autre", async ({
    page,
    browser,
  }) => {
    const contexteInvite = await browser.newContext();
    try {
      const invite = await contexteInvite.newPage();
      await partieDuoPrete(page, invite);

      await page.getByRole("button", { name: new RegExp(FICHE_A, "i") }).click();
      await expect(page.getByText(/votre choix est scellé/i)).toBeVisible({
        timeout: 15_000,
      });
      await invite
        .getByRole("button", { name: new RegExp(FICHE_A, "i") })
        .click();

      for (const ecran of [invite, page]) {
        await expect(
          ecran.getByText(/vous avez pensé à la même chose/i),
        ).toBeVisible({ timeout: 20_000 });
      }

      // ── PAS DE SCORE, PAS DE GAIN, ET C'EST LE CAHIER ──
      //
      // Ce jeu n'a pas de gagnant. Lui en fabriquer un — des points, un badge,
      // un lot — transformerait une complicité en résultat, et promettrait une
      // récompense que rien ne délivre. L'assertion est négative parce que c'est
      // la seule forme qu'un renoncement puisse prendre dans un test.
      const contenu = await page.content();
      expect(contenu).not.toMatch(/gagné|point[s]?\b|score|votre lot/i);
    } finally {
      await contexteInvite.close();
    }
  });
});

/**
 * Combien de fois ce nom apparaît dans le HTML transmis.
 *
 * `split` plutôt qu'une expression régulière : le nom d'une fiche vient du
 * seed et peut porter n'importe quel caractère — « Côtes-du-rhône » n'aurait
 * pas à être échappé pour être compté.
 */
function occurrences(contenu: string, aiguille: string): number {
  return contenu.split(aiguille).length - 1;
}
