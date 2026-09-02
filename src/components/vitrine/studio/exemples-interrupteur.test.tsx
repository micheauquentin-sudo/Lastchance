// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/vitrine", () => ({
  saveVitrineSettings: vi.fn(),
  setVitrinePhoto: vi.fn(),
  deleteVitrinePhoto: vi.fn(),
}));
vi.mock("@/actions/branding", () => ({
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { VitrineStudio } = await import("@/components/vitrine/vitrine-studio");

import { cartesExemple } from "@/components/vitrine/studio/exemples";

/**
 * L'INTERRUPTEUR D'EXEMPLES NE TOUCHE PAS À CE QUI PART EN BASE (VIT-28).
 *
 * ── CE QUE CE FICHIER GARDE, ET POURQUOI ÇA COMPTE ──
 *
 * Ces fiches sont de la DÉMONSTRATION. La demande initiale était « préchargé
 * par thème » ; les semer dans `vitrine_cartes` aurait donné un commerçant qui
 * publie « Tartare de bœuf » sans l'avoir écrit, et une suppression à faire à
 * la main sur chaque vitrine créée (voir l'en-tête d'`exemples.ts`).
 *
 * La variante retenue est un interrupteur d'APERÇU. Toute la promesse tient
 * donc en une phrase : elles ne sortent jamais de l'écran. Le studio sérialise
 * son état EN ENTIER à chaque rendu (`ChampsCachesStudio`) — si l'interrupteur
 * entrait dans `EtatStudio`, ou si les cartes d'exemple touchaient la charge,
 * elles partiraient au serveur sans que personne l'ait demandé.
 *
 * ── ET LE BANDEAU N'EST PAS DÉCORATIF ──
 *
 * Un aperçu rempli de plats qu'on n'a pas écrits se lit comme une vitrine déjà
 * publiée. Sans la mention, le commerçant peut croire sa carte faite — et
 * imprimer ses QR. C'est la différence entre une démonstration et un
 * malentendu, d'où une assertion à part.
 */

afterEach(cleanup);

const IDENTITE = {
  nom: "Le Comptoir",
  logoUrl: null,
  coverPath: null,
  coverAlt: null,
  accroche: "Bistrot de quartier",
  histoire: "",
  horaires: "",
  badge: "",
  secteur: "fleuriste" as const,
  horairesStructures: null,
};

function rendre() {
  return render(
    <VitrineStudio
      slug="le-comptoir"
      identiteInitiale={IDENTITE}
      themeInitial={{ ordre_blocs: ["accroche", "cartes"] }}
      cartes={[]}
      contenus={[]}
      liens={{
        google_review_url: null,
        instagram_url: null,
        tiktok_url: null,
      }}
      duoPossede={false}
      bandePossede={false}
      nbFichesDuo={0}
      timezone="Europe/Paris"
      peutEditer
    />,
  );
}

/** La charge réellement postée : le formulaire des réglages, et lui seul. */
function chargeUtile(container: HTMLElement): string {
  const form = container.querySelector("form#studio-reglages")!;
  return [...form.querySelectorAll("[name]")]
    .map((n) => `${n.getAttribute("name")}=${n.getAttribute("value") ?? ""}`)
    .join("\n");
}

describe("interrupteur d'exemples — il remplit l'aperçu, jamais le formulaire", () => {
  it("éteint : l'aperçu ne montre aucun exemple", () => {
    const { container } = rendre();

    const premier = cartesExemple("fleuriste")[0];
    expect(container.textContent ?? "").not.toContain(premier.nom);
  });

  it("allumé : l'aperçu se remplit des exemples DU MÉTIER choisi", () => {
    const { container } = rendre();

    screen.getByRole("checkbox", { name: /Voir avec des exemples/ }).click();

    const premier = cartesExemple("fleuriste")[0];
    expect(container.textContent ?? "").toContain(premier.nom);
    // Et pas ceux d'un autre métier : le secteur décide, pas un tirage.
    expect(container.textContent ?? "").not.toContain(
      cartesExemple("restaurant")[0].nom,
    );
  });

  it("allumé : la charge postée est INCHANGÉE, au caractère près", () => {
    // L'assertion qui porte la promesse. Le studio sérialise son état en
    // entier à chaque rendu : la seule preuve qu'une démonstration ne
    // s'enregistre pas est que le formulaire ne bouge pas.
    const { container } = rendre();
    const avant = chargeUtile(container);

    screen.getByRole("checkbox", { name: /Voir avec des exemples/ }).click();

    expect(chargeUtile(container)).toBe(avant);
  });

  it("allumé : l'écran DIT que ce ne sont pas les fiches du commerçant", () => {
    // Sans cette mention, un aperçu rempli de plats qu'on n'a pas écrits se lit
    // comme une vitrine déjà publiée — et on imprime ses QR.
    const { container } = rendre();
    expect(container.textContent ?? "").not.toContain("Exemples —");

    screen.getByRole("checkbox", { name: /Voir avec des exemples/ }).click();

    expect(container.textContent ?? "").toContain("Exemples —");
  });
});
