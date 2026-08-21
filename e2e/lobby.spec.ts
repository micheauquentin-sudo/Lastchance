import { expect, test, type Page } from "@playwright/test";

/**
 * Socle des salons joueurs (L16) — créer, rejoindre, attendre, verrouiller.
 *
 * ── CE QUE LE SEED POSE, ET CE QU'ON A LE DROIT D'EN FAIRE ──
 *
 * `supabase/seed.sql` sème deux lobbies sur « E2E Café », avec des codes FIXES
 * (un code tiré par le trigger ne serait pas rejouable) :
 *
 *   · `E2EBND` — VIVANT, capacité 6, DEUX membres déjà présents (« Hôte E2E »,
 *     « Invité E2E »), il reste quatre places ;
 *   · `E2EXPD` — MORT il y a dix minutes, et il n'est là que pour ça.
 *
 * **RÈGLE DE CE FICHIER : chaque test crée SES PROPRES lobbies par l'interface,
 * avec des pseudos horodatés.** Les deux projets Playwright (`mobile-chrome`,
 * `mobile-safari`) tournent en parallèle sur la MÊME base : un test qui
 * rejoindrait `E2EBND` pour de bon y laisserait un membre que l'autre projet
 * compterait, et l'assertion « 2/6 » deviendrait « 3/6 » une fois sur deux.
 * `E2EBND` n'est donc utilisé qu'en LECTURE, et `E2EXPD` — qui ne peut pas
 * changer d'état, aucune RPC n'écrivant l'expiration (ADR-111) — l'est par
 * nature.
 *
 * Le quota est de vingt lobbies actifs par organisation et le TTL de trente
 * minutes : les quelques salons créés ici s'effacent seuls, sans nettoyage.
 */

/** Vitrine publiée d'« E2E Café », portant l'octroi `vitrine`. */
const SLUG = "e2e-comptoir";

/** Le lobby MORT du seed. Son code est bien formé — c'est tout l'intérêt. */
const CODE_EXPIRE = "E2EXPD";

/**
 * Code parfaitement bien formé (alphabet sans I/O/0/1) mais jamais attribué.
 * `join_player_lobby` doit lui rendre EXACTEMENT ce qu'il rend à `E2EXPD`.
 */
const CODE_INVENTE = "ZZZZZZ";

/** Motif d'un code de partage, tel que la contrainte SQL l'écrit. */
const MOTIF_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * Le message unique des refus indistincts. Fragment sans tiret cadratin ni
 * apostrophe typographique : ce qui est asserté doit survivre à une reformulation
 * de la ponctuation, pas à un changement de sens.
 */
const REFUS_INDISTINCT = /ne mène nulle part/i;

/** Pseudo unique par exécution — deux projets écrivent en même temps. */
function pseudo(role: string): string {
  return `${role} ${Date.now() % 100000}`;
}

/** Ouvre un salon depuis la vitrine et rend son code de partage. */
async function ouvrirSalon(page: Page, nom: string): Promise<string> {
  await page.goto(`/lobby/nouveau/${SLUG}`);
  await page.getByLabel(/prénom ou pseudo/i).fill(nom);
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

test.describe("salons joueurs — socle (L16)", () => {
  test("ouvrir un salon, le rejoindre à deux, le verrouiller", async ({
    page,
    browser,
  }) => {
    const nomHote = pseudo("Hote");
    const code = await ouvrirSalon(page, nomHote);

    // L'HÔTE, ET LUI SEUL, voit le code : `lobby_state` ne rend `join_code`
    // qu'au créateur. C'est la moitié « montrez-le » de l'écran.
    await expect(page.getByText(/montrez-le/i)).toBeVisible();
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByText(nomHote)).toBeVisible();
    // `exact` : la jauge est doublée d'une phrase pour lecteur d'écran (« 1
    // personne sur 6 ») dans le même paragraphe. Sans lui, le locator
    // remonterait aussi sur le parent et violerait le mode strict.
    await expect(page.getByText("1/6", { exact: true })).toBeVisible();

    // Seul dans la salle : le verrou est refusé À L'ÉCRAN aussi, pas seulement
    // par la RPC.
    const verrou = page.getByRole("button", {
      name: /verrouiller et commencer/i,
    });
    await expect(verrou).toBeDisabled();

    // Deuxième contexte = deuxième téléphone : cookies et mémoire d'onglet
    // distincts, donc une identité de salon distincte.
    const contexteInvite = await browser.newContext();
    const invite = await contexteInvite.newPage();
    try {
      const nomInvite = pseudo("Invite");
      await rejoindreSalon(invite, code, nomInvite);

      // L'invité n'est PAS l'hôte : pas de code, pas de bouton de verrou.
      await expect(invite.getByText("2/6", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(invite.getByText(/montrez-le/i)).toHaveCount(0);
      await expect(
        invite.getByRole("button", { name: /verrouiller et commencer/i }),
      ).toHaveCount(0);
      await expect(invite.getByText(nomHote)).toBeVisible();

      // L'écran de l'hôte se met à jour SANS RECHARGEMENT : c'est le scrutin de
      // trois secondes qui le fait, et c'est ce que ce délai vérifie.
      await expect(page.getByText("2/6", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(nomInvite)).toBeVisible();
      await expect(verrou).toBeEnabled();

      // Le verrouillage bascule LES DEUX écrans — celui qui l'a demandé
      // immédiatement, celui d'en face au scrutin suivant.
      await verrou.click();
      await expect(page.getByText(/la partie commence/i)).toBeVisible({
        timeout: 15_000,
      });
      await expect(invite.getByText(/la partie commence/i)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await contexteInvite.close();
    }
  });

  test("un code jamais attribué ne mène nulle part — dès l'ouverture", async ({
    page,
  }) => {
    // LE REFUS EST RENDU PAR LE SERVEUR, avant tout formulaire : la page résout
    // le code, ne trouve rien, et peint l'écran de refus. Il n'y a donc AUCUN
    // champ « pseudo » à remplir ici — c'est la différence visible d'avec le
    // socle initial, où l'écran demandait un prénom avant de pouvoir dire non.
    await page.goto(`/lobby/${CODE_INVENTE}`);
    await expect(page.getByText(REFUS_INDISTINCT)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel(/prénom ou pseudo/i)).toHaveCount(0);
  });

  test("un salon expiré rend EXACTEMENT le même refus", async ({ page }) => {
    // C'EST L'INDISTINCTION QUI EST TESTÉE, pas le refus. `E2EXPD` a existé,
    // il a un hôte, il est mort il y a dix minutes — et l'écran n'en dit rien
    // de plus que pour `ZZZZZZ`. Toute différence ici — message, formulaire
    // présent d'un côté et pas de l'autre, code HTTP — rendrait à qui sonde
    // l'oracle que la base ferme délibérément.
    await page.goto(`/lobby/${CODE_EXPIRE}`);
    await expect(page.getByText(REFUS_INDISTINCT)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel(/prénom ou pseudo/i)).toHaveCount(0);

    // Et rien du salon mort ne transparaît : ni son hôte, ni sa jauge.
    await expect(page.getByText("Hôte Périmé")).toHaveCount(0);
    await expect(page.getByText(/montrez-le/i)).toHaveCount(0);
  });

  test("le salon survit au partage du lien et au rechargement", async ({
    page,
    browser,
  }) => {
    // LA PROPRIÉTÉ QUE LA RÉSOLUTION SERVEUR ACHÈTE. L'appartenance vivait dans
    // le `sessionStorage` de l'onglet qui avait créé ou rejoint le salon : un
    // lien recopié dans un AUTRE onglet du même navigateur retombait sur
    // « rejoindre » alors que le cookie disait le contraire. Le cookie voyage
    // avec chaque requête, la mémoire d'onglet non.
    const code = await ouvrirSalon(page, pseudo("Hote"));
    await expect(page.getByText(/montrez-le/i)).toBeVisible();

    // Rechargement : même onglet, même cookie, la salle d'attente revient.
    await page.reload();
    await expect(page.getByText(/montrez-le/i)).toBeVisible({
      timeout: 15_000,
    });

    // Second ONGLET du même contexte : cookies partagés, `sessionStorage` non.
    const jumeau = await page.context().newPage();
    try {
      await jumeau.goto(`/lobby/${code}`);
      await expect(jumeau.getByText(/montrez-le/i)).toBeVisible({
        timeout: 15_000,
      });
      await expect(jumeau.getByLabel(/prénom ou pseudo/i)).toHaveCount(0);
    } finally {
      await jumeau.close();
    }

    // Et un NAVIGATEUR distinct, lui, n'a pas ce cookie : il doit se présenter.
    const inconnu = await browser.newContext();
    try {
      const page2 = await inconnu.newPage();
      await page2.goto(`/lobby/${code}`);
      await expect(page2.getByLabel(/prénom ou pseudo/i)).toBeVisible({
        timeout: 15_000,
      });
      await expect(page2.getByText(/montrez-le/i)).toHaveCount(0);
    } finally {
      await inconnu.close();
    }
  });

  test("quitter le salon ramène à l'écran « rejoindre »", async ({
    page,
    browser,
  }) => {
    // La sortie s'écrit des DEUX côtés : le membre est retiré ET le cookie de la
    // salle est effacé par la même action. Sans cet effacement, la page relirait
    // un cookie survivant et repeindrait une salle d'attente où `lobby_state` ne
    // reconnaît plus personne — l'impasse exacte que ce lot ferme.
    //
    // C'est l'INVITÉ qui part, pas l'hôte : un hôte qui s'en va ferme la salle
    // (contrat de `leave_player_lobby`), et le refus qu'il verrait ensuite ne
    // prouverait rien du cookie — la salle n'existe plus de toute façon.
    const code = await ouvrirSalon(page, pseudo("Hote"));
    const contexteInvite = await browser.newContext();
    try {
      const invite = await contexteInvite.newPage();
      await rejoindreSalon(invite, code, pseudo("Passant"));
      await expect(invite.getByText("2/6", { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      await invite.getByRole("button", { name: /quitter le salon/i }).click();

      await expect(invite.getByLabel(/prénom ou pseudo/i)).toBeVisible({
        timeout: 15_000,
      });
      await expect(invite.getByText(/dans le salon/i)).toHaveCount(0);
      expect(invite.url()).toContain(`/lobby/${code}`);
    } finally {
      await contexteInvite.close();
    }
  });

  test("l'hôte retire une place — et la personne retirée PEUT revenir", async ({
    page,
    browser,
  }) => {
    // ── CE QUE CE TEST FIXE : L'ARBITRAGE, PAS LE BOUTON ──
    //
    // `kick_player_lobby` SUPPRIME la ligne du membre et n'écrit rien d'autre.
    // C'est un retrait de PLACE, pas un bannissement : la personne ne revient
    // pas toute seule (son cookie ne la désigne plus comme membre, et
    // `lobby_state` lui rend le refus muet), mais elle peut rejoindre à neuf
    // tant qu'il reste une place. Empêcher le retour demanderait une table
    // d'empreintes exclues, sa durée de vie et sa purge — un autre lot, à
    // décider comme tel plutôt qu'à subir en effet de bord d'un bouton.
    // C'est ce dernier aller-retour qui est vérifié ici ; le reste (la place
    // libérée, l'écran d'en face qui bascule) n'en est que la mise en scène.
    const nomHote = pseudo("Hote");
    const code = await ouvrirSalon(page, nomHote);

    const contexteInvite = await browser.newContext();
    try {
      const invite = await contexteInvite.newPage();
      const nomInvite = pseudo("Retire");
      await rejoindreSalon(invite, code, nomInvite);

      await expect(page.getByText("2/6", { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      // LE BOUTON N'EXISTE QUE CHEZ L'HÔTE, ET JAMAIS SUR SA PROPRE LIGNE.
      // L'invité voit la même liste sans aucun bouton de retrait : `lobby_state`
      // ne lui rend pas `join_code`, donc l'écran ne le prend pas pour l'hôte.
      await expect(
        invite.getByRole("button", { name: /^Retirer/i }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: new RegExp(`Retirer ${nomHote}`, "i") }),
      ).toHaveCount(0);

      // La confirmation est native : Playwright REFUSE les dialogues par défaut,
      // donc sans ce gestionnaire le clic ci-dessous ne retirerait personne et
      // le test échouerait sur une assertion parfaitement juste.
      page.on("dialog", (dialogue) => {
        void dialogue.accept();
      });
      await page
        .getByRole("button", { name: new RegExp(`Retirer ${nomInvite}`, "i") })
        .click();

      // LA PLACE EST LIBRE, et l'écran de l'hôte le dit sans rechargement :
      // l'action relit `lobby_state` avant de rendre la main — c'est ce qui
      // empêche un second retrait sur des rangs périmés, puisqu'ils SE DÉCALENT
      // (retirer le 2 fait remonter le 3 en 2).
      await expect(page.getByText("1/6", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(nomInvite)).toHaveCount(0);

      // Côté retiré : le scrutin suivant ne le reconnaît plus, et l'écran rend
      // le refus INDISTINCT — le même que pour un code inventé. Il n'apprend pas
      // qu'on l'a retiré, il apprend que ce salon ne lui répond plus.
      await expect(invite.getByText(REFUS_INDISTINCT)).toBeVisible({
        timeout: 15_000,
      });

      // Son cookie de salle est mort : c'est le serveur qui le lui retire, sur
      // ce bouton — un simple rechargement repeindrait la même impasse, cookie
      // périmé en main.
      await invite
        .getByRole("button", { name: /réessayer avec ce code/i })
        .click();
      await expect(invite.getByLabel(/prénom ou pseudo/i)).toBeVisible({
        timeout: 15_000,
      });

      // ET IL REVIENT. Voilà l'arbitrage, rendu visible : rien n'a été écrit
      // contre lui, la salle est ouverte, il reste une place.
      await invite.getByLabel(/prénom ou pseudo/i).fill(nomInvite);
      await invite.getByRole("button", { name: /rejoindre le salon/i }).click();
      await expect(invite.getByText("2/6", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("2/6", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await contexteInvite.close();
    }
  });
});
