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

import {
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS_CLES,
} from "@/lib/vitrine";
import { PAGES_STUDIO } from "@/components/vitrine/studio/pages";

/**
 * LA CHARGE UTILE DU STUDIO EST COMPLÈTE, SUR TOUTES SES PAGES (VIT-20).
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE ──
 *
 * VIT-19 a fermé la moitié SERVEUR du problème : `composerTheme` ne touche
 * plus une section sans témoin. Passer le studio en plusieurs pages rouvrait
 * la moitié CLIENT, sous une forme neuve et pire — une page qu'on quitte est
 * démontée, donc ses champs disparaissent du formulaire, donc enregistrer
 * depuis « La carte » aurait effacé l'accroche réglée sur « Identité ».
 *
 * Rien ne l'aurait signalé. L'action aurait répondu « Vitrine enregistrée. »
 * et l'accroche serait partie — un enregistrement qui réussit en faisant autre
 * chose que ce qu'on croit, c'est-à-dire la panne que ce dépôt paie le plus
 * cher.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesStudio` rend la charge EN ENTIER depuis l'état. Ce test le
 * vérifie sur le rendu réel de CHAQUE page, parce que « c'est structurel » est
 * une intention tant qu'aucune garde ne la tient.
 */

afterEach(cleanup);

const IDENTITE = {
  nom: "Le Comptoir",
  logoUrl: null,
  coverPath: null,
  coverAlt: null,
  accroche: "Bistrot de quartier",
  histoire: "Depuis 1997.",
  horaires: "Lundi 12h-14h",
  badge: "Ouvert · 12h–23h",
  secteur: "restaurant" as const,
};

/** Tout ce que `saveVitrineSettings` lit dans le `FormData`, sauf les cases. */
const CHAMPS_ATTENDUS = [
  "secteur",
  "accroche",
  "histoire",
  "horaires_texte",
  "badge_ouverture",
  "couleurs_rendues",
  "couleur_primary",
  "couleur_secondary",
  "polices_rendues",
  "police_heading",
  "police_body",
  "style_cartes_rendu",
  "style_cartes",
  "blocs_rendus",
  "ordre_blocs",
  "allure_rendue",
  ...VITRINE_ALLURE_ENUMS_CLES,
  ...VITRINE_ALLURE_CHIFFRES,
];

function rendre() {
  return render(
    <VitrineStudio
      slug="le-comptoir"
      identiteInitiale={IDENTITE}
      themeInitial={{ ordre_blocs: ["accroche", "cartes", "experiences"] }}
      cartes={[]}
      contenus={[]}
      duoPossede
      bandePossede
      nbFichesDuo={0}
      liens={{
        google_review_url: null,
        instagram_url: null,
        tiktok_url: null,
      }}
      peutEditer
    />,
  );
}

describe("studio — la charge utile ne dépend pas de la page ouverte", () => {
  it.each(PAGES_STUDIO.map((p) => [p.cle, p.titre] as const))(
    "page « %s » : le formulaire porte tous les champs de l'action",
    async (_cle, titre) => {
      const { container } = rendre();

      // On change de page comme un commerçant le ferait — par le bouton.
      screen.getByRole("button", { name: titre }).click();

      const noms = new Set(
        [...container.querySelectorAll("[name]")].map((n) =>
          n.getAttribute("name"),
        ),
      );
      for (const champ of CHAMPS_ATTENDUS) {
        expect(noms, `champ absent sur la page « ${titre} » : ${champ}`).toContain(
          champ,
        );
      }
    },
  );

  it("le formulaire des réglages ne porte QUE des champs cachés", () => {
    // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
    // Un contrôle VISIBLE portant un `name` vivrait dans une page, donc
    // disparaîtrait avec elle.
    //
    // L'assertion vise le formulaire des RÉGLAGES et lui seul : les autres —
    // logo, bannière — ont bien des champs visibles nommés (`logo`, `alt`), et
    // c'est normal, ils appartiennent à leurs propres actions. Une garde qui
    // aurait interdit tout `name` visible sur l'écran entier aurait été fausse
    // dès le premier envoi de photo, et se serait fait desserrer.
    const { container } = rendre();

    const formulaire = container.querySelector("form#studio-reglages")!;
    const visibles = [...formulaire.querySelectorAll("[name]")].filter(
      (n) => n.getAttribute("type") !== "hidden",
    );

    expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
  });

  it("le formulaire de réglages ne CONTIENT aucun autre formulaire", () => {
    // Un `<form>` dans un `<form>` fait échouer l'hydratation et tue toute
    // l'interactivité de l'écran — défaut livré en VIT-16. Le studio héberge
    // les formulaires du logo et de la bannière : la seule façon de les tenir
    // hors du sien est que le sien soit leur VOISIN.
    const { container } = rendre();

    expect(container.querySelectorAll("form").length).toBeGreaterThan(2);
    expect(container.querySelectorAll("form form")).toHaveLength(0);
  });

  it("le bouton Enregistrer vise le formulaire des réglages par son identifiant", () => {
    // Sans cet attribut, le bouton serait hors de tout formulaire et ne
    // soumettrait rien : l'écran aurait l'air de fonctionner et n'écrirait
    // jamais.
    const { container } = rendre();

    // Nom EXACT : l'écran porte aussi « Enregistrer le logo » et le bouton de
    // la bannière, qui visent d'autres actions.
    const bouton = screen.getByRole("button", { name: "Enregistrer" });
    const cible = bouton.getAttribute("form");
    expect(cible).toBeTruthy();
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });
});
