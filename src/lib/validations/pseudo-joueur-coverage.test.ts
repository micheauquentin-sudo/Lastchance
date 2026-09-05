// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { registerPlayerSchema, updatePlayerSchema } from "./pronostics";

/* ════════════════════════════════════════════════════════════
 * TOUT PSEUDO JOUEUR PASSE PAR LE MÊME FILTRE
 *
 * ── LE DÉFAUT QUI JUSTIFIE CETTE GARDE ──────────────────────
 *
 * Trois surfaces sur quatre passaient par `formatPlayerAlias` puis
 * `isAllowedPlayerAlias` ; les pronostics se contentaient de
 * `.trim().min(1).max(30)`. Or `isAllowedPlayerAlias` ne borne pas seulement
 * la longueur : il refuse les caractères de CONTRÔLE et de FORMAT, et une
 * liste d'injures.
 *
 * Le classement des pronostics est PUBLIC. C'était donc la seule surface du
 * produit où un joueur pouvait inscrire une insulte, ou glisser un caractère
 * bidirectionnel pour brouiller l'affichage et usurper visuellement le pseudo
 * d'un autre — exactement ce que le commentaire de `validations/events.ts`
 * annonce vouloir empêcher.
 *
 * Le dépôt le SAVAIT : `validations/loyalty.ts` écrit noir sur blanc que 30
 * est « l'intrus du dépôt, pas la référence ». La roadmap, elle, n'en retenait
 * que l'écart de borne et le classait « décision produit à prendre ». Un
 * défaut connu, écrit, et jamais gardé, reste un défaut.
 *
 * ── POURQUOI UNE GARDE DÉRIVÉE PLUTÔT QU'UNE LISTE ──────────
 *
 * Aucun module n'est recopié ici. L'ensemble est dérivé du MESSAGE que ces
 * schémas rendent au joueur — « Votre pseudo est requis » —, qui est le
 * marqueur le plus fidèle de « ceci est un pseudo public obligatoire ». Une
 * cinquième surface écrite demain arrive donc dans ce test AVEC son exigence
 * de filtre, sans que personne ait à penser à l'y inscrire. C'est très
 * exactement ce qui a manqué ici.
 *
 * La garde est TEXTUELLE (ADR-074) sur la partie « le filtre est câblé », et
 * COMPORTEMENTALE sur les pronostics, dont c'est le défaut réparé.
 * ════════════════════════════════════════════════════════════ */

const DOSSIER = "src/lib/validations";
const MARQUEUR = "Votre pseudo est requis";

const lire = (f: string) => readFileSync(join(DOSSIER, f), "utf8").replace(/\r\n/g, "\n");

/** Les fichiers de validation qui portent un pseudo joueur OBLIGATOIRE. */
function fichiersAPseudo(): string[] {
  return readdirSync(DOSSIER)
    .filter((n) => n.endsWith(".ts") && !n.includes(".test."))
    .filter((n) => lire(n).includes(MARQUEUR));
}

describe("pseudo joueur — un seul filtre pour toutes les surfaces", () => {
  it("la garde regarde bien quelque chose", () => {
    // Une garde qui n'énumère plus rien passe verte POUR CETTE RAISON. Trois
    // surfaces au moins portent un pseudo obligatoire : événement live, salons,
    // pronostics. En dessous, c'est le marqueur qui a bougé, pas le dépôt.
    expect(fichiersAPseudo().length).toBeGreaterThanOrEqual(3);
  });

  it.each(fichiersAPseudo())("%s normalise ET filtre le pseudo", (fichier) => {
    // LE CÂBLAGE, PAS L'IMPORT. Première écriture de ce test : `toContain(
    // "formatPlayerAlias")`. La mutation qui rendait son ancien schéma aux
    // pronostics l'a laissé VERT — l'import restait en haut du fichier, plus
    // utilisé par personne. Une garde qui reconnaît une DÉCLARATION laisse
    // passer le débranchement ; c'est le défaut réparé en VIT-52/ADR-168,
    // refait à l'identique dans le test censé le prévenir.
    const src = lire(fichier);
    expect(src).toContain(".transform(formatPlayerAlias)");
    expect(src).toContain(".refine(isAllowedPlayerAlias");
  });

  it("aucune surface ne borne le pseudo ailleurs qu'à 24", () => {
    // 24 est la borne de `isAllowedPlayerAlias` lui-même, et celle que la base
    // rejoue en SQL (`player_alias_is_allowed`). Une borne applicative plus
    // LARGE promet au joueur une saisie que le filtre refusera ensuite.
    const fautifs: string[] = [];
    for (const f of readdirSync(DOSSIER).filter((n) => n.endsWith(".ts") && !n.includes(".test."))) {
      for (const m of lire(f).matchAll(/Pseudo trop long \((\d+) caractères max\)/g)) {
        if (m[1] !== "24") fautifs.push(`${f} borne à ${m[1]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe("pronostics — le pseudo se comporte comme les autres", () => {
  const base = {
    slug: "concours",
    avatar: "",
    email: "",
    phone: "",
    accepted_terms: true as const,
    tiebreaker_guess: "",
  };

  it("accepte un pseudo ordinaire", () => {
    const r = registerPlayerSchema.safeParse({ ...base, first_name: "Camille" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.first_name).toBe("Camille");
  });

  it("refuse au-delà de 24 caractères, là où 30 passait", () => {
    // Vingt-cinq caractères : accepté avant ce lot, refusé partout ailleurs.
    const r = registerPlayerSchema.safeParse({ ...base, first_name: "a".repeat(25) });
    expect(r.success).toBe(false);
  });

  it("refuse un caractère bidirectionnel invisible", () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE : inversait l'affichage du classement
    // public et permettait d'imiter le pseudo d'un autre joueur.
    const rlo = String.fromCharCode(0x202e);
    const r = registerPlayerSchema.safeParse({ ...base, first_name: "Cam" + rlo + "ille" });
    expect(r.success).toBe(false);
  });

  it("normalise la saisie avant de la mesurer", () => {
    // Espaces multiples réduits, bords coupés : la longueur porte sur la forme
    // qui sera AFFICHÉE, jamais sur la frappe.
    const r = registerPlayerSchema.safeParse({ ...base, first_name: "  Jean   Luc  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.first_name).toBe("Jean Luc");
  });

  it("la modification de profil applique le MÊME filtre que l'inscription", () => {
    // Les deux schémas partagent `nicknameSchema`. Sans ce test, l'un des deux
    // pourrait retrouver une borne à lui sans que rien ne rougisse.
    const rlo = String.fromCharCode(0x202e);
    expect(
      updatePlayerSchema.safeParse({ slug: "c", first_name: "a".repeat(25), avatar: "" }).success,
    ).toBe(false);
    expect(
      updatePlayerSchema.safeParse({ slug: "c", first_name: "Cam" + rlo, avatar: "" }).success,
    ).toBe(false);
  });
});
