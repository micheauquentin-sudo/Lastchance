// @vitest-environment node
import { describe, expect, it } from "vitest";

import { composerSortie, type LiensOrganisation } from "@/lib/sortie-apres-jeu";

/**
 * VIT-11 — ce que la sortie d'après-jeu a le droit de peindre.
 *
 * Le cœur testé est PUR : `composerSortie` ne lit pas la base. Les deux
 * fonctions qui l'entourent ne font que chercher ses deux arguments, et leur
 * seul comportement propre — rendre `null` plutôt que de faire échouer un
 * écran terminal — se lit dans leur `catch`.
 *
 * CE QUI EST VÉRIFIÉ ICI, ET POURQUOI. La revalidation de forme est déjà
 * imposée à l'écriture ; la refaire à la lecture est une défense en
 * profondeur, donc un comportement qu'un test doit tenir : sans lui, retirer
 * le filtre ne casserait rien de visible tant qu'aucune valeur douteuse n'est
 * en base — et le jour où il y en a une, elle atteint l'écran d'un joueur
 * anonyme.
 */

const AUCUN: LiensOrganisation = {
  google_review_url: null,
  instagram_url: null,
  tiktok_url: null,
};

describe("composerSortie", () => {
  it("rend null quand il n'y a ni Vitrine publiée ni lien", () => {
    expect(composerSortie(AUCUN, null)).toBeNull();
  });

  it("rend la seule Vitrine quand le commerce n'a posé aucun lien", () => {
    expect(composerSortie(AUCUN, "chez-marcel")).toEqual({
      vitrine: "chez-marcel",
    });
  });

  it("garde les trois liens valides et le slug", () => {
    const sortie = composerSortie(
      {
        google_review_url: "https://g.page/chez-marcel",
        instagram_url: "https://www.instagram.com/chezmarcel",
        tiktok_url: "https://www.tiktok.com/@chezmarcel",
      },
      "chez-marcel",
    );

    expect(sortie).toEqual({
      vitrine: "chez-marcel",
      google: "https://g.page/chez-marcel",
      instagram: "https://www.instagram.com/chezmarcel",
      tiktok: "https://www.tiktok.com/@chezmarcel",
    });
  });

  it("écarte silencieusement un lien qui ne passe pas la liste blanche", () => {
    const sortie = composerSortie(
      {
        google_review_url: "https://evil.example.com/avis",
        instagram_url: "http://www.instagram.com/chezmarcel",
        tiktok_url: "https://www.tiktok.com/@chezmarcel",
      },
      null,
    );

    // Ni `google` ni `instagram` : hôte hors liste pour l'un, protocole non
    // chiffré pour l'autre. Aucune clé posée à `undefined` — l'écran teste la
    // présence, pas la valeur.
    expect(sortie).toEqual({ tiktok: "https://www.tiktok.com/@chezmarcel" });
  });

  it("traite la chaîne vide comme « non renseigné », jamais comme un lien", () => {
    expect(
      composerSortie(
        { google_review_url: "", instagram_url: "", tiktok_url: "" },
        "",
      ),
    ).toBeNull();
  });

  it("ne propose pas la carte quand la Vitrine n'est pas publiée", () => {
    // L'appelant traduit « non publiée » par `null` : le slug existe en base,
    // mais la page publique le refuserait. Une porte fermée est pire que pas
    // de porte.
    const sortie = composerSortie(
      {
        google_review_url: null,
        instagram_url: "https://www.instagram.com/chezmarcel",
        tiktok_url: null,
      },
      null,
    );

    expect(sortie).toEqual({ instagram: "https://www.instagram.com/chezmarcel" });
    expect(sortie).not.toHaveProperty("vitrine");
  });
});
