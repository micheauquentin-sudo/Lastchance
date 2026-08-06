import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  absentSiNonRendu,
  caseACochee,
  entierOptionnel,
  entierRequis,
  nombreRequis,
  nonRenduVaut,
  texteOptionnel,
  videSiNonRendu,
} from "./champ-formulaire";

/* ════════════════════════════════════════════════════════════
 * LES PRIMITIVES DU CHAMP NON RENDU
 *
 * Chaque famille est éprouvée sur les TROIS entrées qui comptent, et jamais
 * sur une seule :
 *   1. `null`     — le champ n'était pas dans le formulaire soumis ;
 *   2. `undefined`— la clé n'était pas dans l'objet construit par l'appelant ;
 *   3. une valeur INVALIDE — le garde-fou anti-tolérance-excessive.
 *
 * Le troisième cas est le plus important des trois. Sans lui, on satisferait
 * les deux premiers avec un `.catch()` qui avale TOUT, y compris une vraie
 * faute de saisie — et la classe serait « fermée » en apparence pendant que
 * n'importe quelle donnée passerait.
 * ════════════════════════════════════════════════════════════ */

describe("texteOptionnel — le champ non rendu vaut la chaîne vide", () => {
  const schema = texteOptionnel(
    z.string().trim().max(10, "Texte trop long"),
  );

  it("null et undefined donnent EXACTEMENT la même valeur", () => {
    expect(schema.parse(null)).toBe("");
    expect(schema.parse(undefined)).toBe("");
    expect(schema.parse(null)).toBe(schema.parse(undefined));
  });

  it("une saisie normale traverse les bornes du schéma de base", () => {
    expect(schema.parse("  bonjour ")).toBe("bonjour");
  });

  it("une valeur INVALIDE reste refusée", () => {
    expect(schema.safeParse("beaucoup trop long").success).toBe(false);
  });

  it("un défaut autre que la chaîne vide est respecté", () => {
    const couleur = texteOptionnel(
      z.string().regex(/^#[0-9a-f]{6}$/, "Couleur invalide"),
      "#7c3aed",
    );
    expect(couleur.parse(null)).toBe("#7c3aed");
    expect(couleur.parse(undefined)).toBe("#7c3aed");
    expect(couleur.safeParse("bleu").success).toBe(false);
  });
});

describe("videSiNonRendu — l'union « vide OU valeur »", () => {
  const schema = videSiNonRendu(
    z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]),
  );

  it("null et undefined valent la chaîne vide, comme un champ laissé vide", () => {
    expect(schema.parse(null)).toBe("");
    expect(schema.parse(undefined)).toBe("");
    expect(schema.parse("")).toBe("");
  });

  it("une saisie chiffrée reste un nombre — le null ne devient JAMAIS 0", () => {
    expect(schema.parse("42")).toBe(42);
    // Le cœur du mode silencieux : avant correction, `null` rendait 0 ici, et
    // 0 est une réponse PARFAITEMENT VALIDE de ce champ. Rien ne distinguait
    // donc « il a répondu zéro » de « le champ n'était pas à l'écran ».
    expect(schema.parse(null)).not.toBe(0);
    expect(schema.parse("0")).toBe(0);
  });

  it("une valeur INVALIDE reste refusée", () => {
    expect(schema.safeParse("abc").success).toBe(false);
    expect(schema.safeParse("101").success).toBe(false);
  });
});

describe("entierOptionnel — vide = absent, jamais zéro", () => {
  it("null et undefined donnent null", () => {
    expect(entierOptionnel.parse(null)).toBeNull();
    expect(entierOptionnel.parse(undefined)).toBeNull();
    expect(entierOptionnel.parse("")).toBeNull();
  });

  it("une valeur INVALIDE reste refusée", () => {
    for (const mauvais of ["0", "-3", "3.5", "abc"]) {
      expect(entierOptionnel.safeParse(mauvais).success, mauvais).toBe(false);
    }
  });
});

describe("nombreRequis / entierRequis — la fermeture du mode SILENCIEUX", () => {
  const schema = entierRequis({
    absent: "CHAMP NON RENDU",
    nombre: "PAS UN NOMBRE",
    entier: "ENTIER REQUIS",
    min: [0, "MINIMUM 0"],
    max: [10, "MAXIMUM 10"],
  });

  it("null est REFUSÉ, avec le message métier — plus jamais 0", () => {
    const r = schema.safeParse(null);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("CHAMP NON RENDU");
  });

  it("le zéro SAISI reste accepté : c'est une décision, pas une absence", () => {
    expect(schema.parse("0")).toBe(0);
    expect(schema.parse(0)).toBe(0);
  });

  it("la borne basse ne masque plus rien", () => {
    // AVANT : `z.coerce.number().min(0)` acceptait `null` (Number(null) === 0)
    // et un `min(1)` le refusait par accident. La même faute était donc muette
    // ou bruyante selon une borne qui n'a rien à voir avec elle.
    const avecPlancher = entierRequis({
      absent: "CHAMP NON RENDU",
      nombre: "PAS UN NOMBRE",
      entier: "ENTIER REQUIS",
      min: [1, "MINIMUM 1"],
      max: [10, "MAXIMUM 10"],
    });
    const r = avecPlancher.safeParse(null);
    expect(r.success).toBe(false);
    // Le message est celui de l'ABSENCE, pas celui de la borne : le refus dit
    // enfin ce qui s'est passé.
    if (!r.success) expect(r.error.issues[0].message).toBe("CHAMP NON RENDU");
  });

  it("undefined est refusé aussi — un champ requis reste requis", () => {
    expect(schema.safeParse(undefined).success).toBe(false);
  });

  it("les valeurs INVALIDES gardent leurs propres messages", () => {
    const cas: Array<[string, string]> = [
      ["abc", "PAS UN NOMBRE"],
      ["3.5", "ENTIER REQUIS"],
      ["-1", "MINIMUM 0"],
      ["11", "MAXIMUM 10"],
    ];
    for (const [saisie, message] of cas) {
      const r = schema.safeParse(saisie);
      expect(r.success, saisie).toBe(false);
      if (!r.success) expect(r.error.issues[0].message, saisie).toBe(message);
    }
  });

  it("sans `entier`, les décimales sont admises (réponses chiffrées libres)", () => {
    const reel = nombreRequis({
      absent: "CHAMP NON RENDU",
      nombre: "PAS UN NOMBRE",
      min: [-100, "TROP PETIT"],
      max: [100, "TROP GRAND"],
    });
    expect(reel.parse("3.5")).toBe(3.5);
    expect(reel.safeParse(null).success).toBe(false);
  });
});

describe("absentSiNonRendu — mise à jour partielle", () => {
  const schema = z.object({
    id: z.string(),
    nom: absentSiNonRendu(z.string().trim().min(1, "Nom vide")),
  });

  it("null se lit comme l'absence, pas comme une valeur", () => {
    expect(schema.parse({ id: "x", nom: null }).nom).toBeUndefined();
    expect(schema.parse({ id: "x" }).nom).toBeUndefined();
  });

  it("une valeur INVALIDE reste refusée", () => {
    expect(schema.safeParse({ id: "x", nom: "" }).success).toBe(false);
  });
});

describe("caseACochee — le panneau qui n'affiche pas l'option ne l'active pas", () => {
  it("null et undefined valent « décochée »", () => {
    expect(caseACochee.parse(null)).toBe(false);
    expect(caseACochee.parse(undefined)).toBe(false);
  });

  it("les deux littéraux se lisent normalement", () => {
    expect(caseACochee.parse("true")).toBe(true);
    expect(caseACochee.parse("false")).toBe(false);
  });

  it("une valeur hors des deux littéraux reste refusée", () => {
    for (const mauvais of ["oui", "1", "on", ""]) {
      expect(caseACochee.safeParse(mauvais).success, mauvais).toBe(false);
    }
  });
});

describe("nonRenduVaut — l'invariant que le test de couverture vérifie", () => {
  it("quelle que soit la base, parse(null) === parse(undefined)", () => {
    const cas = [
      nonRenduVaut(z.string(), "vide"),
      nonRenduVaut(z.coerce.number(), 7),
      nonRenduVaut(z.enum(["a", "b"]), "a"),
      nonRenduVaut(z.array(z.string()), []),
    ];
    for (const schema of cas) {
      expect(schema.parse(null)).toEqual(schema.parse(undefined));
    }
  });
});
