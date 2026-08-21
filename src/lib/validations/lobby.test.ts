import { describe, expect, it } from "vitest";

import {
  createLobbySchema,
  joinLobbySchema,
  lobbyIdSchema,
  lobbyJoinCodeSchema,
  lobbyPseudoSchema,
  lobbySlugSchema,
} from "@/lib/validations/lobby";

/**
 * LA PARITÉ AVEC LE SQL EST L'OBJET DE CE FICHIER, DANS LES DEUX SENS.
 *
 * Un schéma plus PERMISSIF que le `check` de la migration 20261017120000
 * produirait une 22023 illisible sur un formulaire correctement rempli ; un
 * schéma plus STRICT refuserait ici ce que la base accepte, et le joueur n'aurait
 * aucun moyen de le savoir. Chaque test ci-dessous nomme le `check` qu'il double.
 */

describe("lobbyJoinCodeSchema", () => {
  it("accepte le code tel qu'on le dicte : casse et espaces tolérés", () => {
    // `join_player_lobby` applique `upper` + `btrim` en tête. Refuser « abc 234 »
    // ici imposerait au joueur une exigence que la base ne pose pas — et ce code
    // se dicte à voix haute, à une table de café.
    expect(lobbyJoinCodeSchema.parse("  abc234 ")).toBe("ABC234");
  });

  it.each(["ABC23O", "ABC23I", "ABC230", "ABC231"])(
    "refuse %s — l'alphabet exclut I, O, 0 et 1",
    (code) => {
      // Miroir du `check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$')`. « zéro » contre
      // « O » est la faute qui coûte le plus quand on épelle un code à voix haute.
      expect(lobbyJoinCodeSchema.safeParse(code).success).toBe(false);
    },
  );

  it.each(["ABC23", "ABC2345", ""])("refuse %s — six caractères, ni plus ni moins", (code) => {
    expect(lobbyJoinCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("lobbySlugSchema", () => {
  it("normalise comme la base : minuscules et espaces détourés", () => {
    expect(lobbySlugSchema.parse("  Le-Comptoir  ")).toBe("le-comptoir");
  });

  it.each(["ab", "le_comptoir", "le comptoir", "a".repeat(61)])(
    "refuse %s — miroir du check ^[a-z0-9-]{3,60}$",
    (slug) => {
      expect(lobbySlugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe("lobbyPseudoSchema", () => {
  it("détoure les espaces multiples sans refuser la saisie", () => {
    expect(lobbyPseudoSchema.parse("  Ana   Bo  ")).toBe("Ana Bo");
  });

  it("refuse 25 caractères — REFUSÉ, JAMAIS TRONQUÉ", () => {
    // C'est le choix explicite de `create_player_lobby` : la personne est devant
    // un clavier et peut corriger, là où la file d'attente tronque parce que son
    // utilisateur est debout dans le magasin.
    expect(lobbyPseudoSchema.safeParse("a".repeat(25)).success).toBe(false);
    expect(lobbyPseudoSchema.safeParse("a".repeat(24)).success).toBe(true);
  });

  it.each(["", "   "])("refuse un pseudo vide (%s)", (saisie) => {
    expect(lobbyPseudoSchema.safeParse(saisie).success).toBe(false);
  });

  it("refuse les caractères de formatage Unicode", () => {
    // U+202E (bidi override) permettrait d'usurper VISUELLEMENT le pseudo d'un
    // autre membre — et une salle est précisément l'endroit où l'on se reconnaît
    // par son pseudo. Aucun risque XSS ici (React échappe) : c'est l'usurpation
    // qui est visée.
    expect(lobbyPseudoSchema.safeParse("Ana‮Bo").success).toBe(false);
  });
});

describe("createLobbySchema", () => {
  const base = { slug: "le-comptoir", pseudo: "Ana" };

  it("un duo IGNORE la capacité au lieu de la contester", () => {
    // `create_player_lobby` fait exactement cela (`case when p_kind = 'duo' then
    // 2 else p_capacite end`). Valider la capacité d'un duo aurait refusé un
    // formulaire dont le champ « combien serez-vous » n'est même pas rendu : le
    // joueur aurait lu un message sur un champ qu'il n'a jamais vu.
    expect(
      createLobbySchema.parse({ ...base, kind: "duo", capacite: null }),
    ).toMatchObject({ kind: "duo", capacite: 2 });
    expect(
      createLobbySchema.parse({ ...base, kind: "duo", capacite: "9" }),
    ).toMatchObject({ capacite: 2 });
  });

  it("une bande EXIGE sa capacité, et le dit sur le bon champ", () => {
    const verdict = createLobbySchema.safeParse({
      ...base,
      kind: "bande",
      capacite: null,
    });
    expect(verdict.success).toBe(false);
    if (!verdict.success) {
      expect(verdict.error.issues[0].path).toEqual(["capacite"]);
      expect(verdict.error.issues[0].message).toBe("Indiquez combien vous serez");
    }
  });

  it.each([1, 13])("refuse une bande de %s — miroir du check between 2 and 12", (n) => {
    expect(
      createLobbySchema.safeParse({ ...base, kind: "bande", capacite: String(n) }).success,
    ).toBe(false);
  });

  it.each([2, 12])("accepte une bande de %s — les bornes SQL sont incluses", (n) => {
    expect(
      createLobbySchema.parse({ ...base, kind: "bande", capacite: String(n) }),
    ).toMatchObject({ capacite: n });
  });

  it("refuse un troisième format — la liste est FERMÉE, comme le check", () => {
    // « duo » est L17, « bande » est L18. Un troisième format ne peut pas
    // apparaître sans que le `check` SQL et ce schéma l'apprennent ensemble.
    expect(
      createLobbySchema.safeParse({ ...base, kind: "trio", capacite: "3" }).success,
    ).toBe(false);
  });

  it("un slug malformé sort par le chemin `slug` — l'appelant en fait un refus muet", () => {
    // Le message importe peu ici ; ce que ce test fixe, c'est le CHEMIN de
    // l'issue, sur lequel `createLobby` s'appuie pour replier le refus sur la
    // phrase indistincte plutôt que de dire au visiteur ce qui n'allait pas.
    const verdict = createLobbySchema.safeParse({ ...base, slug: "x", kind: "duo" });
    expect(verdict.success).toBe(false);
    if (!verdict.success) expect(verdict.error.issues[0].path[0]).toBe("slug");
  });
});

describe("joinLobbySchema", () => {
  it("normalise le code et le pseudo ensemble", () => {
    expect(joinLobbySchema.parse({ code: " abc234 ", pseudo: "  Bo " })).toEqual({
      code: "ABC234",
      pseudo: "Bo",
    });
  });

  it("un code malformé sort par le chemin `code`", () => {
    const verdict = joinLobbySchema.safeParse({ code: "ABC230", pseudo: "Bo" });
    expect(verdict.success).toBe(false);
    if (!verdict.success) expect(verdict.error.issues[0].path[0]).toBe("code");
  });
});

describe("lobbyIdSchema", () => {
  it("n'accepte qu'un UUID", () => {
    expect(
      lobbyIdSchema.safeParse({ lobbyId: "11111111-1111-4111-8111-111111111111" })
        .success,
    ).toBe(true);
    expect(lobbyIdSchema.safeParse({ lobbyId: "pas-un-uuid" }).success).toBe(false);
  });
});
