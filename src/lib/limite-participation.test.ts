import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PHRASE_LIMITE_PAR_NAVIGATEUR,
  mentionJeu,
  phraseLimiteParticipation,
} from "./limite-participation";
import { PHRASES_GARDE_LOT } from "./lot-forte-valeur";

const lire = (chemin: string) => readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");

describe("phraseLimiteParticipation", () => {
  it("dit « navigateur » — ni « personne », ni « appareil » — sur les trois limites réelles", () => {
    expect(phraseLimiteParticipation("once")).toBe("un seul jeu par navigateur");
    expect(phraseLimiteParticipation("daily")).toBe("un jeu par jour et par navigateur");
    expect(phraseLimiteParticipation("weekly")).toBe("un jeu par semaine et par navigateur");
    for (const limit of ["once", "daily", "weekly"] as const) {
      // « appareil » surpromet comme « personne », en plus petit : le cookie
      // `lc-anonymous-player` est de portée NAVIGATEUR (second navigateur,
      // fenêtre privée, second profil du même téléphone = trois identités).
      expect(phraseLimiteParticipation(limit)).not.toMatch(/personne|appareil/);
      expect(phraseLimiteParticipation(limit)).toMatch(/navigateur/);
    }
  });

  it("ne promet AUCUNE limite sous « illimité »", () => {
    expect(phraseLimiteParticipation("unlimited")).toBeNull();
  });

  it("retombe sur aucune promesse quand la limite est inconnue", () => {
    expect(phraseLimiteParticipation(null)).toBeNull();
    expect(phraseLimiteParticipation(undefined)).toBeNull();
  });
});

describe("mentionJeu", () => {
  it("compose le préfixe et la limite quand elle existe", () => {
    expect(mentionJeu("Résultat calculé côté serveur", "daily")).toBe(
      "Résultat calculé côté serveur · un jeu par jour et par navigateur",
    );
  });

  it("rend le préfixe SEUL sous « illimité » — pas de séparateur orphelin", () => {
    expect(mentionJeu("Résultat calculé côté serveur", "unlimited")).toBe(
      "Résultat calculé côté serveur",
    );
    expect(mentionJeu("Résultat calculé côté serveur", "unlimited")).not.toContain("·");
  });
});

/**
 * Le commerçant lit la portée de la limite à DEUX endroits (l'atelier de roue,
 * et l'avertissement des lots de forte valeur). Deux formulations divergentes
 * de la même mécanique lui diraient deux choses différentes du même réglage.
 */
describe("PHRASE_LIMITE_PAR_NAVIGATEUR", () => {
  it("reste mot pour mot celle de l'avertissement des lots de forte valeur", () => {
    expect(PHRASES_GARDE_LOT.limite_contournable).toContain(PHRASE_LIMITE_PAR_NAVIGATEUR);
  });

  it("est bien celle affichée dans l'atelier de roue", () => {
    expect(lire("src/components/dashboard/atelier-roue-champs.tsx")).toContain(
      "{PHRASE_LIMITE_PAR_NAVIGATEUR}",
    );
  });
});

/**
 * GARDE DE NON-RETOUR. La phrase « un jeu par personne » était écrite en dur
 * dans les quatre écrans de jeu, inconditionnelle : fausse sous « illimité »,
 * fausse sous « par jour », et fausse en tout temps sur le mot « personne »
 * (la limite porte sur `player_key`, dérivée d'un cookie de navigateur).
 *
 * ── POURQUOI ELLE BALAIE MAINTENANT TOUT `src/` ──
 *
 * Elle ne regardait que `src/components/wheel`, et seulement les `.tsx`. Deux
 * promesses « par personne » lui ont donc échappé PAR CONSTRUCTION et ont
 * survécu au premier chantier : la description d'un lot de modèle
 * (`src/lib/campaign-templates.ts`, persistée puis rendue au gagnant) et l'aide
 * du formulaire de conservation (`src/components/dashboard/`). Une garde qui ne
 * regarde qu'un dossier ne prouve rien du reste du dépôt.
 *
 * ── CE QU'ELLE CHERCHE, ET POURQUOI PAS « par personne » TOUT COURT ──
 *
 * « par personne » est aussi la tournure française de « par aucun » (« n'est lu
 * par personne ») : elle apparaît dans des dizaines de commentaires du dépôt,
 * et un motif nu les ferait toutes rougir — une garde bruyante finit désarmée.
 * Ce qui est interdit, c'est la PROMESSE : un quantifieur de participation
 * suivi de « par personne ». Les « par personne » LÉGITIMES de la mécanique
 * RÉSERVER (`perPlayerLimit` : « Limite par personne », « Jusqu'à N par
 * personne ») ne portent aucun de ces quantifieurs et ne matchent donc pas —
 * c'est une autre identité, sans rapport avec `play_limit`.
 */
describe("aucune promesse de limite « par personne » dans src/", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? fichiers(`${dossier}/${e.name}`)
        : e.name.endsWith(".ts") || e.name.endsWith(".tsx")
          ? [`${dossier}/${e.name}`]
          : [],
    );

  /** Une participation comptée, puis « par personne ». « un jeu par jour et par personne » compte aussi. */
  const PROMESSE = /(fois|jeux?|participations?|parties?|tours?|jour|semaine|ouvertures?|cartes?|tentatives?|essais?)\s*(?:et\s+)?par personne/i;

  /**
   * Exclusions EXPLICITES, une raison chacune. Toute autre exclusion doit être
   * justifiée ici : élargir cette liste, c'est rouvrir le trou qu'on ferme.
   */
  const AUTORISES = [
    // Ce module et son test PORTENT la faute citée : ils l'expliquent.
    "src/lib/limite-participation.ts",
    "src/lib/limite-participation.test.ts",
    // Commentaire d'implémentation du skill-gate : décrit le mécanisme SQL
    // (« une seule tentative par personne »), n'est affiché nulle part.
    "src/lib/skill.ts",
  ];

  it("ne promet « par personne » nulle part dans src/", () => {
    const fautifs = fichiers("src")
      .filter((f) => !AUTORISES.includes(f))
      .filter((f) => PROMESSE.test(lire(f)));
    expect(fautifs).toEqual([]);
  });

  it("laisse passer les « par personne » de RÉSERVER, qui parlent d'autre chose", () => {
    // `perPlayerLimit` borne un stock d'offre par identité de réservation :
    // rien à voir avec `play_limit`. Si la garde les faisait rougir, elle
    // serait désarmée dans la semaine.
    expect(PROMESSE.test("Limite par personne")).toBe(false);
    expect(PROMESSE.test("Jusqu'à 3 par personne.")).toBe(false);
    // Et la tournure « par aucun », omniprésente en commentaire.
    expect(PROMESSE.test("cette place n'est prenable par personne")).toBe(false);
  });

  it("mord bien sur les formulations réellement fautives", () => {
    expect(PROMESSE.test("une fois par personne")).toBe(true);
    expect(PROMESSE.test("un jeu par personne")).toBe(true);
    expect(PROMESSE.test("une seule fois par personne")).toBe(true);
    expect(PROMESSE.test("un jeu par jour et par personne")).toBe(true);
    expect(PROMESSE.test("1 participation par personne")).toBe(true);
  });

  it("fait passer les quatre pieds d'écran par le libellé partagé", () => {
    for (const fichier of [
      "src/components/wheel/play-experience.tsx",
      "src/components/wheel/scratch-experience.tsx",
      "src/components/wheel/game-shell.tsx",
      "src/components/wheel/skill-game-shell.tsx",
    ]) {
      expect(lire(fichier)).toContain("mentionJeu(");
    }
  });
});
