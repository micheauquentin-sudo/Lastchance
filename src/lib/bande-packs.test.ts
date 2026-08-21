import { describe, expect, it } from "vitest";

import {
  BANDE_PACKS,
  BANDE_PACK_CLES,
  BANDE_PACK_DEFAUT,
  BANDE_QUESTIONS_MAX,
  BANDE_QUESTIONS_MIN,
  packBande,
  questionBande,
} from "@/lib/bande-packs";

/**
 * LA GARDE DU CONTENU (L18).
 *
 * Ce fichier ne juge pas le goût — aucun test ne sait le faire. Il tient les
 * règles que le cahier a posées et qu'une relecture distraite laisserait
 * passer : les huit familles de sujets exclues, l'unicité des clés (une clé
 * réutilisée pour un autre texte réécrirait le passé d'une partie déjà jouée),
 * et la tonalité par défaut.
 *
 * Il est écrit pour rougir le jour où quelqu'un ajoutera une question de trop —
 * pas pour prouver que celles d'aujourd'hui sont bonnes.
 */

/**
 * LES MOTS QUI N'ENTRENT PAS. Un par famille exclue du cahier : corps, santé,
 * âge, sexualité, religion, politique, argent, humiliation.
 *
 * ── MOT À MOT, ET NON PAR SOUS-CHAÎNE ──
 *
 * La première version cherchait la sous-chaîne, et elle a immédiatement accusé
 * « dans » de contenir « ans » et « marchera » de contenir « cher ». Une garde
 * qui crie au loup à chaque phrase française finit désactivée, ce qui est pire
 * que pas de garde du tout. Le texte est donc découpé en MOTS — accents
 * compris, d'où `\p{L}` — et comparé terme à terme.
 *
 * Les RACINES existent pour les familles qui se déclinent (« dépress » couvre
 * dépressif et dépression) : elles se comparent en DÉBUT de mot, jamais au
 * milieu.
 */
const MOTS_INTERDITS = [
  // Corps et apparence
  "gros", "grosse", "maigre", "moche", "beau", "belle", "laid", "laide",
  "poids", "kilo", "kilos", "corps", "physique", "sexy",
  // Santé
  "malade", "maladie", "médicament", "santé", "alcool", "ivre", "bourré",
  // Âge
  "vieux", "vieille", "jeune", "âge", "ans",
  // Sexualité et vie privée
  "sexe", "sexuel", "sexuelle", "couple", "célibataire", "ex",
  // Religion
  "dieu", "religion", "croyant", "prière", "église", "mosquée", "synagogue",
  // Politique
  "politique", "élection", "élections", "gauche", "droite", "parti",
  // Argent
  "riche", "pauvre", "salaire", "cher", "chère", "coûteux", "euros", "prix",
  // Humiliation directe
  "nul", "nulle", "insupportable", "déteste", "ridicule", "honte", "pire",
];

/** Les familles qui se déclinent — comparées en DÉBUT de mot. */
const RACINES_INTERDITES = ["dépress", "divorc", "handicap"];

/**
 * « pire » est dans la liste et le pack taquin en a besoin (« le pire sens de
 * l'orientation », « le pire guide touristique ») : ces deux-là moquent une
 * COMPÉTENCE qu'on n'a pas, ce que le cahier autorise, là où « la pire
 * personne » viserait quelqu'un pour ce qu'il est. L'exception est nommée ici,
 * question par question, pour qu'ajouter un « pire » de plus soit un geste
 * délibéré et non un oubli.
 */
const EXCEPTIONS_ASSUMEES = new Set([
  "taquin-orientation",
  "taquin-guide",
]);

function motsDe(texte: string): string[] {
  return texte
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

describe("packs du Portrait de la Bande — les règles du cahier", () => {
  it("cinq packs, dont quatre positifs et un seul taquin", () => {
    expect(BANDE_PACKS).toHaveLength(5);
    expect(BANDE_PACKS.filter((p) => p.tonalite === "taquin")).toHaveLength(1);
    // Le taquin est DERNIER : l'ordre de cette liste est celui que le
    // commerçant lit, et le pack qui demande une décision ne se propose pas en
    // premier.
    expect(BANDE_PACKS[BANDE_PACKS.length - 1]?.cle).toBe("taquin");
  });

  it("le pack par défaut existe et il est positif", () => {
    const defaut = packBande(BANDE_PACK_DEFAUT);
    expect(defaut).not.toBeNull();
    expect(defaut?.tonalite).toBe("positif");
  });

  it("douze questions par pack — de quoi tirer cinq à huit sans répéter", () => {
    for (const pack of BANDE_PACKS) {
      expect(pack.questions.length, pack.cle).toBeGreaterThanOrEqual(
        BANDE_QUESTIONS_MAX,
      );
      expect(pack.questions.length, pack.cle).toBe(12);
    }
    expect(BANDE_QUESTIONS_MIN).toBeLessThan(BANDE_QUESTIONS_MAX);
  });

  it("aucune clé n'est réutilisée — une partie jouée garde son texte", () => {
    // Deux questions qui partagent une clé feraient relire au récapitulatif
    // d'hier la question d'aujourd'hui.
    const cles = BANDE_PACKS.flatMap((p) => p.questions.map((q) => q.cle));
    expect(new Set(cles).size).toBe(cles.length);
    expect(new Set(BANDE_PACK_CLES).size).toBe(BANDE_PACK_CLES.length);
  });

  it("chaque question est une VRAIE question, courte et lisible sur un téléphone", () => {
    for (const pack of BANDE_PACKS) {
      for (const q of pack.questions) {
        expect(q.texte.endsWith("?"), `${q.cle} : « ${q.texte} »`).toBe(true);
        expect(q.texte.startsWith("Qui "), q.cle).toBe(true);
        expect(q.texte.length, q.cle).toBeLessThanOrEqual(80);
      }
    }
  });

  it("AUCUNE question ne touche aux huit familles exclues par le cahier", () => {
    const fautes: string[] = [];
    for (const pack of BANDE_PACKS) {
      for (const q of pack.questions) {
        if (EXCEPTIONS_ASSUMEES.has(q.cle)) continue;
        for (const mot of motsDe(q.texte)) {
          if (MOTS_INTERDITS.includes(mot)) {
            fautes.push(`${q.cle} : le mot « ${mot} »`);
          }
          for (const racine of RACINES_INTERDITES) {
            if (mot.startsWith(racine)) {
              fautes.push(`${q.cle} : la racine « ${racine} »`);
            }
          }
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it("les exceptions assumées existent encore, et elles restent des exceptions", () => {
    // Une exception qui survit à la question qu'elle couvrait deviendrait un
    // trou permanent dans la garde.
    const cles = new Set(
      BANDE_PACKS.flatMap((p) => p.questions.map((q) => q.cle)),
    );
    for (const exception of EXCEPTIONS_ASSUMEES) {
      expect(cles.has(exception), `exception orpheline : ${exception}`).toBe(
        true,
      );
    }
    expect(EXCEPTIONS_ASSUMEES.size).toBeLessThanOrEqual(3);
  });

  it("les descriptions disent au commerçant ce qu'il choisit", () => {
    for (const pack of BANDE_PACKS) {
      expect(pack.nom.length, pack.cle).toBeGreaterThan(2);
      expect(pack.description.length, pack.cle).toBeGreaterThan(30);
    }
    // Le taquin s'annonce comme tel dans sa propre description : le commerçant
    // qui le choisit ne doit pas pouvoir dire qu'il ne savait pas.
    const taquin = packBande("taquin");
    expect(taquin?.description.toLowerCase()).toContain("connaissance de cause");
  });

  it("une clé inconnue rend null, jamais une exception", () => {
    // Une partie peut porter la clé d'un pack retiré depuis : la lecture du
    // récapitulatif ne doit pas tomber pour autant.
    expect(packBande("pack-qui-n-existe-plus")).toBeNull();
    expect(questionBande("question-retiree")).toBeNull();
    expect(questionBande("amis-histoires")?.texte).toContain("histoires");
  });
});
