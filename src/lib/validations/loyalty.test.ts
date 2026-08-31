import { describe, expect, it } from "vitest";
import { setLoyaltyIdentitySchema } from "@/lib/validations/loyalty";
import { AVATAR_IDS } from "@/lib/avatars";
import { isAllowedPlayerAlias } from "@/lib/player-alias";

/**
 * LE CLIENT NOMME SA CARTE (FID-8b) — ce que le zod doit tenir.
 *
 * Ce schéma est la SEULE garde d'appartenance au catalogue de figures : la base
 * ne valide que la forme de la clé (`^[a-z]{1,20}$`), et son commentaire de
 * colonne dit pourquoi. Un `refine` perdu ici ne casserait rien de visible — il
 * laisserait simplement s'écrire `avatar = 'licorne'`, qui s'afficherait en
 * renard. C'est le genre de régression qu'aucun typecheck ne rattrape.
 *
 * La borne de longueur est 24, celle d'`isAllowedPlayerAlias` et du CHECK SQL.
 * `nicknameSchema` de validations/pronostics.ts borne à 30 : c'est l'intrus du
 * dépôt, et s'aligner dessus ferait passer le zod pour laisser la base répondre
 * une 23514.
 */

const PROGRAM = "11111111-1111-4111-8111-111111111111";

const parse = (displayName: string, avatar = "") =>
  setLoyaltyIdentitySchema.safeParse({ programId: PROGRAM, displayName, avatar });

describe("setLoyaltyIdentitySchema — le surnom", () => {
  it("accepte un surnom ordinaire et rend sa forme normalisée", () => {
    const r = parse("  Marie   Claire ");
    expect(r.success).toBe(true);
    // `formatPlayerAlias` replie les espaces internes AVANT la mesure : c'est
    // la forme gravée qui doit tenir dans 24, pas la saisie brute.
    expect(r.success && r.data.displayName).toBe("Marie Claire");
  });

  it("REFUSE un surnom trop long (25 caractères une fois normalisé)", () => {
    const r = parse("A".repeat(25));
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toMatch(/24/);
  });

  it("accepte exactement 24 caractères — la borne est inclusive", () => {
    const r = parse("B".repeat(24));
    expect(r.success).toBe(true);
  });

  it("mesure la longueur APRÈS repli des espaces, pas avant", () => {
    // Brut : 27 caractères — refusé si l'on mesurait la saisie. Normalisé :
    // « Jean Pierre Marie Luc », 21 caractères, donc accepté.
    const brut = "Jean   Pierre   Marie   Luc";
    expect(brut.length).toBeGreaterThan(24);
    const r = parse(brut);
    expect(r.success).toBe(true);
    expect(r.success && r.data.displayName).toBe("Jean Pierre Marie Luc");
  });

  it("REFUSE un contenu que `isAllowedPlayerAlias` rejette", () => {
    // Le filtre applicatif fait autorité, et la base rejoue son jumeau SQL :
    // ce qui passe ici doit passer là-bas, et réciproquement.
    const injure = "connard";
    expect(isAllowedPlayerAlias(injure)).toBe(false);
    const r = parse(injure);
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toBe(
      "Choisissez un autre surnom",
    );
  });

  it("REFUSE un caractère de formatage invisible (bidi, largeur nulle)", () => {
    // Aucun risque XSS — React échappe — mais un U+202E permet d'usurper
    // visuellement le surnom d'un autre client sur l'écran de la caisse.
    // Écrits par leur point de code, jamais collés en littéral : un
    // caractère invisible dans un fichier source est indétectable à la
    // relecture d'un diff — et a déjà cassé des locators Playwright ici.
    const BIDI_OVERRIDE = String.fromCharCode(0x202e);
    const ESPACE_LARGEUR_NULLE = String.fromCharCode(0x200b);
    expect(parse(`Marie${BIDI_OVERRIDE}`).success).toBe(false);
    expect(parse(`Ma${ESPACE_LARGEUR_NULLE}rie`).success).toBe(false);
  });

  it("ACCEPTE le vide : c'est un effacement, jamais une saisie manquante", () => {
    for (const vide of ["", "   ", " "]) {
      const r = parse(vide);
      expect(r.success).toBe(true);
      expect(r.success && r.data.displayName).toBe("");
    }
  });

  it("ne réclame rien quand le champ est absent : le passeport reste utilisable", () => {
    const r = setLoyaltyIdentitySchema.safeParse({ programId: PROGRAM });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toMatchObject({ displayName: "", avatar: "" });
  });
});

describe("setLoyaltyIdentitySchema — la figure", () => {
  it("accepte une clé du catalogue", () => {
    const r = parse("Marie", AVATAR_IDS[0]);
    expect(r.success).toBe(true);
    expect(r.success && r.data.avatar).toBe(AVATAR_IDS[0]);
  });

  it("REFUSE une clé hors catalogue, même si sa FORME satisfait le CHECK SQL", () => {
    // `licorne` passe `^[a-z]{1,20}$` : la base l'écrirait sans broncher, et
    // l'affichage retomberait sur le renard. Seul ce zod l'arrête.
    expect(/^[a-z]{1,20}$/.test("licorne")).toBe(true);
    const r = parse("Marie", "licorne");
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toBe(
      "Figure inconnue",
    );
  });

  it("REFUSE une clé dont la forme elle-même sortirait du CHECK SQL", () => {
    for (const mauvais of ["Renard", "renard!", "a".repeat(21)]) {
      expect(parse("Marie", mauvais).success).toBe(false);
    }
  });

  it("ACCEPTE la figure vide — aucune figure choisie est un état normal", () => {
    const r = parse("Marie", "");
    expect(r.success).toBe(true);
    expect(r.success && r.data.avatar).toBe("");
  });
});

describe("setLoyaltyIdentitySchema — le programme", () => {
  it("REFUSE un identifiant de programme qui n'est pas un UUID", () => {
    const r = setLoyaltyIdentitySchema.safeParse({
      programId: "pas-un-uuid",
      displayName: "Marie",
      avatar: "",
    });
    expect(r.success).toBe(false);
  });
});
