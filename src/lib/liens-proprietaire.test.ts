import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHEMINS_PROPRIETAIRE,
  estReserveAuProprietaire,
  lienSelonRole,
} from "@/lib/liens-proprietaire";

/**
 * UN LIEN QUI NE MÈNE NULLE PART EST PIRE QU'UN LIEN ABSENT.
 *
 * Deux écrans du produit envoyaient un collègue « Campagnes et caisse »
 * (`editor`) vers des pages qui redirigent tout non-propriétaire en silence :
 * le bouton « Voir les offres » de « Découvrir » (et ses deux jumeaux dans la
 * galerie de modèles) le renvoyait sur « Vue d'ensemble », la tuile « Gains à
 * valider » sur « Caisse ». Dans les deux cas, aucun message : le clic paraît
 * mort, ou pire, déplace l'utilisateur sans raison.
 */
describe("lienSelonRole", () => {
  it("rend le lien au propriétaire", () => {
    expect(lienSelonRole("/dashboard/settings#subscription", "owner")).toBe(
      "/dashboard/settings#subscription",
    );
    expect(
      lienSelonRole("/dashboard/participations?statut=a-valider", "owner"),
    ).toBe("/dashboard/participations?statut=a-valider");
  });

  it("REFUSE le lien à l'éditeur sur une page qui le rejetterait", () => {
    expect(
      lienSelonRole("/dashboard/settings#subscription", "editor"),
    ).toBeNull();
    expect(
      lienSelonRole("/dashboard/participations?statut=a-valider", "editor"),
    ).toBeNull();
  });

  it("refuse aussi au caissier et à un rôle inconnu", () => {
    expect(lienSelonRole("/dashboard/settings", "cashier")).toBeNull();
    expect(lienSelonRole("/dashboard/settings", null)).toBeNull();
  });

  it("laisse passer ce qui n'est pas réservé", () => {
    // `/dashboard/settings/automations` est ouvert à l'éditeur : le préfixe ne
    // doit surtout pas suffire à le confondre avec `/dashboard/settings`.
    expect(
      lienSelonRole("/dashboard/settings/automations", "editor"),
    ).toBe("/dashboard/settings/automations");
    expect(lienSelonRole("/dashboard/campaigns", "editor")).toBe(
      "/dashboard/campaigns",
    );
  });

  it("ignore paramètres, ancres et barre finale", () => {
    expect(estReserveAuProprietaire("/dashboard/settings#subscription")).toBe(true);
    expect(estReserveAuProprietaire("/dashboard/participations?statut=x")).toBe(true);
    expect(estReserveAuProprietaire("/dashboard/settings/")).toBe(true);
  });
});

/**
 * LA LISTE EST DÉRIVÉE DU CODE, PAS RECOPIÉE.
 *
 * Une liste tenue à la main se périme au premier écran ajouté — et c'est
 * exactement la mécanique qui a produit le défaut : la garde existait par
 * écran, jamais par lien, donc chaque nouveau lien la manquait. Ce contrôle
 * relit les pages du tableau de bord et exige que toute page renvoyant un
 * non-propriétaire figure dans `CHEMINS_PROPRIETAIRE`.
 */
function pagesQuiRefusentLesNonProprietaires(): string[] {
  const racine = "src/app/dashboard";
  const trouvees: string[] = [];
  // `withFileTypes` plutôt qu'un `statSync` par entrée : le type vient de la
  // lecture du répertoire elle-même, il n'y a plus de second accès au chemin
  // entre le contrôle et l'usage. CodeQL signalait ici un `js/file-system-race`
  // (le fichier peut changer entre le `statSync` et le `readFileSync`) —
  // exploitation théorique dans un test qui lit l'arborescence du dépôt, mais
  // le motif se supprime en écrivant mieux plutôt qu'en dérogeant, et cette
  // forme fait aussi un appel système de moins par entrée.
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (entree.name !== "page.tsx") continue;
      const src = readFileSync(chemin, "utf8");
      // Le refus DOIT être un renvoi silencieux : `notFound()` affiche au moins
      // une page d'erreur, et les segments dynamiques ne sont pas des cibles de
      // lien statique.
      if (!/if \(role !== "owner"\)[\s\S]{0,80}redirect\(/.test(src)) continue;
      if (chemin.includes("[")) continue;
      trouvees.push(
        "/" +
          chemin
            .split(sep)
            .join("/")
            .replace(/^src\/app\//, "")
            .replace(/\/page\.tsx$/, ""),
      );
    }
  };
  parcourir(racine);
  return trouvees.sort();
}

describe("CHEMINS_PROPRIETAIRE", () => {
  it("recense exactement les pages qui renvoient un non-propriétaire", () => {
    expect(pagesQuiRefusentLesNonProprietaires()).toEqual(
      [...CHEMINS_PROPRIETAIRE].sort(),
    );
  });
});

/**
 * GARDE D'AFFICHAGE — les trois liens fautifs passent par la règle.
 */
describe("les écrans partagés avec l'éditeur ne posent plus de lien mort", () => {
  it("« Découvrir » et sa galerie filtrent le lien vers les offres", () => {
    const page = readFileSync("src/app/dashboard/discover/page.tsx", "utf8");
    expect(page).toMatch(
      /lienSelonRole\("\/dashboard\/settings#subscription", role\)/,
    );
    expect(page).toMatch(/role=\{role\}/);

    const galerie = readFileSync(
      "src/components/dashboard/experience-blueprint-gallery.tsx",
      "utf8",
    );
    // Deux liens dans ce fichier — la carte de modèle et la pastille grisée —
    // et donc deux dérivations, une par composant.
    expect(
      galerie.match(
        /lienSelonRole\("\/dashboard\/settings#subscription", role\)/g,
      ),
    ).toHaveLength(2);
    // Plus aucun lien en dur vers un écran qui rejetterait l'éditeur.
    expect(galerie).not.toMatch(/href="\/dashboard\/settings#subscription"/);
  });

  it("la tuile « Gains à valider » n'est un lien que pour le propriétaire", () => {
    const page = readFileSync("src/app/dashboard/page.tsx", "utf8");
    expect(page).toMatch(
      /lienSelonRole\(\s*"\/dashboard\/participations\?statut=a-valider",\s*role,?\s*\)/,
    );
    expect(page).not.toMatch(/href: "\/dashboard\/participations/);
  });
});
