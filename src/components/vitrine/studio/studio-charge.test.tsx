// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// L'action REND un succès : l'enregistrement automatique lit son verdict pour
// afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait `undefined`,
// que `useActionForm` traiterait comme une réponse illisible.
// TOUTES LES ACTIONS DE L'ÉCRAN, ET C'EST NÉCESSAIRE DEPUIS VIT-35 : ces
// gardes visitent réellement les neuf étapes, donc montent l'éditeur de
// catalogue, celui des jeux et « À la une ». Aucune n'est APPELÉE par un rendu
// — `useActionForm` ne les touche qu'à la soumission — mais elles doivent
// exister à l'import du module.
vi.mock("@/actions/vitrine", () => ({
  saveVitrineSettings: vi.fn(async () => ({ ok: true, data: undefined })),
  setVitrinePhoto: vi.fn(),
  deleteVitrinePhoto: vi.fn(),
  setVitrineJeux: vi.fn(),
  setVitrineContenu: vi.fn(),
  deleteVitrineContenu: vi.fn(),
  createVitrineCarte: vi.fn(),
  updateVitrineCarte: vi.fn(),
  deleteVitrineCarte: vi.fn(),
  createVitrineRubrique: vi.fn(),
  updateVitrineRubrique: vi.fn(),
  deleteVitrineRubrique: vi.fn(),
  createVitrineFiche: vi.fn(),
  updateVitrineFiche: vi.fn(),
  deleteVitrineFiche: vi.fn(),
  toggleVitrineFicheDisponibilite: vi.fn(),
  reorderVitrineCartes: vi.fn(),
  reorderVitrineRubriques: vi.fn(),
  reorderVitrineFiches: vi.fn(),
  importVitrineCarte: vi.fn(),
}));
vi.mock("@/actions/organizations", () => ({
  updateOrganizationSocialLinks: vi.fn(),
}));
vi.mock("@/actions/branding", () => ({
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { VitrineStudio } = await import("@/components/vitrine/vitrine-studio");
const { saveVitrineSettings } = await import("@/actions/vitrine");

import {
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS_CLES,
} from "@/lib/vitrine";
import {
  ETAPES_STUDIO,
  libelleEtapeStudio,
} from "@/components/vitrine/studio/pages";
import type { BilanJeuxVitrine } from "@/lib/vitrine";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
  horairesStructures: null,
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


/**
 * LE BILAN DES JEUX, TOUT À FAUX (VIT-32).
 *
 * Ce que ces tests mesurent — la charge utile, l'interrupteur d'exemples — ne
 * dépend pas de ce que le commerce possède. Un bilan vide est le cas le plus
 * simple à lire, et le seul qui ne change pas le jour où une offre bouge.
 */
const BILAN_JEUX: BilanJeuxVitrine = {
  possede: {
    duo: false,
    bande: false,
    quiz: false,
    calendars: false,
    pronostics: false,
    loyalty: false,
  },
  compte: { duo: 0, quiz: 0, calendars: 0, pronostics: 0, loyalty: 0 },
};

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient neuf fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO)[number]["cle"]) {
  fireEvent.click(screen.getByRole("button", { name: libelleEtapeStudio(cle) }));
}

function rendre() {
  return render(
    <VitrineStudio
      slug="le-comptoir"
      identiteInitiale={IDENTITE}
      themeInitial={{ ordre_blocs: ["accroche", "cartes", "experiences"] }}
      cartes={[]}
      contenus={[]}
      bilanJeux={BILAN_JEUX}
      liens={{
        google_review_url: null,
        instagram_url: null,
        tiktok_url: null,
      }}
      timezone="Europe/Paris"
      peutEditer
    />,
  );
}

describe("studio — la charge utile ne dépend pas de l'étape ouverte", () => {
  // NEUF, ET LE CHIFFRE EST ÉCRIT (VIT-35). Sans lui, découper une étape en
  // deux — ou en perdre une — laisserait cette suite verte en couvrant une
  // étape de moins : elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte neuf étapes", () => {
    expect(ETAPES_STUDIO).toHaveLength(9);
  });

  it.each(ETAPES_STUDIO.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte tous les champs de l'action",
    async (cle, titre) => {
      const { container } = rendre();

      // On change d'étape comme un commerçant le ferait — par le bouton.
      allerA(cle);

      const noms = new Set(
        [...container.querySelectorAll("[name]")].map((n) =>
          n.getAttribute("name"),
        ),
      );
      for (const champ of CHAMPS_ATTENDUS) {
        expect(
          noms,
          `champ absent sur l'étape « ${titre} » : ${champ}`,
        ).toContain(champ);
      }
    },
  );

  it.each(ETAPES_STUDIO.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire des réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // effacerait le réglage sans que rien ne le signale.
      //
      // ELLE PARCOURT LES NEUF ÉTAPES DEPUIS VIT-35 : une seule suffisait
      // quand les contrôles d'allure vivaient dans une colonne toujours
      // montée. Ils sont maintenant répartis sur quatre écrans démontables,
      // c'est-à-dire quatre endroits où un `name` posé par distraction ne se
      // verrait sur aucun autre.
      //
      // L'assertion vise le formulaire des RÉGLAGES et lui seul : les autres —
      // logo, bannière — ont bien des champs visibles nommés (`logo`, `alt`),
      // et c'est normal, ils appartiennent à leurs propres actions. Une garde
      // qui aurait interdit tout `name` visible sur l'écran entier aurait été
      // fausse dès le premier envoi de photo, et se serait fait desserrer.
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector("form#studio-reglages")!;
      const visibles = [...formulaire.querySelectorAll("[name]")].filter(
        (n) => n.getAttribute("type") !== "hidden",
      );

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde suivante ne prouve rien", () => {
    // Sur l'étape d'ouverture, le logo et la bannière apportent les leurs. Sans
    // cette assertion, « aucun formulaire imbriqué » serait trivialement vrai
    // sur un écran qui n'en aurait qu'un.
    const { container } = rendre();
    expect(container.querySelectorAll("form").length).toBeGreaterThan(2);
  });

  it.each(ETAPES_STUDIO.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire de réglages ne CONTIENT aucun autre formulaire",
    (cle) => {
      // Un `<form>` dans un `<form>` fait échouer l'hydratation et tue toute
      // l'interactivité de l'écran — défaut livré en VIT-16. Le studio héberge
      // les formulaires du logo, de la bannière, de l'import et du catalogue :
      // la seule façon de les tenir hors du sien est que le sien soit leur
      // VOISIN, vide de mise en page.
      const { container } = rendre();
      allerA(cle);

      expect(container.querySelectorAll("form form")).toHaveLength(0);
    },
  );

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

/**
 * L'ENREGISTREMENT AUTOMATIQUE (VIT-30) — et surtout ce qu'il NE fait pas.
 *
 * ── LE RENVERSEMENT, ET SON DANGER PROPRE ──
 *
 * ADR-137 posait « rien n'est enregistré tant qu'on n'a pas enregistré ». Le
 * propriétaire l'a renversé : « il faut un enregistrement automatique à chaque
 * changement afin de ne rien perdre ». C'est la bonne décision — on ne règle
 * pas une vitrine d'un trait — mais elle ouvre un risque que la version
 * manuelle n'avait pas : écrire SANS QUE PERSONNE N'AIT RIEN DEMANDÉ.
 *
 * Le cas précis est l'OUVERTURE. Le studio résout l'état au montage : les
 * vingt-cinq réglages d'allure y prennent leur valeur par défaut, et
 * `ChampsCachesStudio` les sérialise tous. Un effet qui partirait au premier
 * rendu graverait donc en base vingt-cinq décisions que le commerçant n'a pas
 * prises — sur une vitrine qu'il a seulement REGARDÉE.
 *
 * C'est exactement le piège que VIT-19 a passé un lot entier à défaire, et il
 * reviendrait par une autre porte. D'où la garde du milieu, qui est la plus
 * importante des trois.
 */
describe("studio — l'enregistrement est automatique, et l'ouverture n'écrit rien", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(
        saveVitrineSettings,
        "le simple affichage a écrit en base — les vingt-cinq défauts d'allure seraient gravés sur une vitrine que personne n'a réglée",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer un réglage enregistre TOUT SEUL, sans clic sur Enregistrer", async () => {
    vi.useFakeTimers();
    try {
      const { container } = rendre();
      // LE CONTRÔLE VISIBLE, ET C'EST UNE PRÉCISION NÉCESSAIRE : le champ
      // CACHÉ de la charge porte la même valeur et vient AVANT dans le DOM.
      // Une première version l'attrapait, y déclenchait un `change` — qui ne
      // fait rien, puisqu'aucun `onChange` de React n'y est branché — et
      // concluait que l'enregistrement automatique ne partait pas.
      const accroche = [...container.querySelectorAll("input")].find(
        (i) =>
          (i as HTMLInputElement).type !== "hidden" &&
          (i as HTMLInputElement).value === "Bistrot de quartier",
      ) as HTMLInputElement;
      expect(accroche, "le champ Accroche est introuvable").toBeTruthy();

      await act(async () => {
        fireEvent.change(accroche, { target: { value: "Cuisine du marché" } });
      });
      // Avant le délai, rien n'est parti : un curseur émet une valeur par
      // pixel parcouru, et partir à chaque frappe rendrait l'écran inutilisable.
      expect(saveVitrineSettings).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(saveVitrineSettings).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("le bandeau annonce l'automatisme, et le bouton reste", () => {
    // Le bouton n'est pas redondant : il sert à qui veut partir tout de suite,
    // sans attendre le délai. Et la ligne d'état remplace le toast, qui à
    // chaque frappe aurait rendu l'écran inutilisable.
    const { container } = rendre();
    expect(container.textContent ?? "").toContain("Enregistrement automatique");
    expect(
      screen.getByRole("button", { name: "Enregistrer" }),
    ).toBeTruthy();
  });
});
