import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PHRASE_LIMITE_PAR_APPAREIL,
  mentionJeu,
  phraseLimiteParticipation,
} from "./limite-participation";
import { PHRASES_GARDE_LOT } from "./lot-forte-valeur";

const lire = (chemin: string) => readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");

describe("phraseLimiteParticipation", () => {
  it("dit « appareil » et jamais « personne » sur les trois limites réelles", () => {
    expect(phraseLimiteParticipation("once")).toBe("un seul jeu par appareil");
    expect(phraseLimiteParticipation("daily")).toBe("un jeu par jour et par appareil");
    expect(phraseLimiteParticipation("weekly")).toBe("un jeu par semaine et par appareil");
    for (const limit of ["once", "daily", "weekly"] as const) {
      expect(phraseLimiteParticipation(limit)).not.toMatch(/personne/);
      expect(phraseLimiteParticipation(limit)).toMatch(/appareil/);
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
      "Résultat calculé côté serveur · un jeu par jour et par appareil",
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
describe("PHRASE_LIMITE_PAR_APPAREIL", () => {
  it("reste mot pour mot celle de l'avertissement des lots de forte valeur", () => {
    expect(PHRASES_GARDE_LOT.limite_contournable).toContain(PHRASE_LIMITE_PAR_APPAREIL);
  });

  it("est bien celle affichée dans l'atelier de roue", () => {
    expect(lire("src/components/dashboard/atelier-roue-champs.tsx")).toContain(
      "{PHRASE_LIMITE_PAR_APPAREIL}",
    );
  });
});

/**
 * GARDE DE NON-RETOUR. La phrase « un jeu par personne » était écrite en dur
 * dans les quatre écrans de jeu, inconditionnelle : fausse sous « illimité »,
 * fausse sous « par jour », et fausse en tout temps sur le mot « personne »
 * (la limite porte sur `player_key`, dérivée d'un cookie de navigateur).
 */
describe("écrans de jeu — aucune promesse « par personne »", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? fichiers(`${dossier}/${e.name}`)
        : e.name.endsWith(".tsx")
          ? [`${dossier}/${e.name}`]
          : [],
    );

  it("ne promet « par personne » dans aucun composant du parcours de jeu", () => {
    const fautifs = fichiers("src/components/wheel").filter((f) =>
      /jeu par personne|par personne/.test(lire(f)),
    );
    expect(fautifs).toEqual([]);
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
