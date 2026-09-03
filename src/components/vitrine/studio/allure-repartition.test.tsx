// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Toutes les actions de l'écran : cette suite visite les neuf étapes, donc
// monte l'éditeur de catalogue, celui des jeux et « À la une ». Aucune n'est
// appelée par un rendu, mais toutes doivent exister à l'import.
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

import { VITRINE_ALLURE_CLES } from "@/lib/vitrine";
import {
  LIBELLES_ALLURE,
  REPARTITION_ALLURE,
  type CleAllure,
} from "@/components/vitrine/studio/allure-repartition";
import {
  ETAPES_STUDIO,
  libelleEtapeStudio,
} from "@/components/vitrine/studio/pages";
import type { BilanJeuxVitrine } from "@/lib/vitrine";

/**
 * LES VINGT-CINQ RÉGLAGES D'ALLURE SONT TOUS PLACÉS, ET CHACUN UNE SEULE FOIS.
 *
 * ── LES DEUX PANNES QUE CE FICHIER FERME ──
 *
 * VIT-35 a éclaté sur quatre étapes ce qui tenait dans une colonne unique. Ce
 * geste ouvre exactement deux défauts, et aucun ne se voit dans un diff :
 *
 * 1. UN RÉGLAGE OUBLIÉ. Il disparaît de l'écran, donc il n'est plus réglable,
 *    donc il est figé sur son défaut pour toujours — sur une vitrine où le
 *    commerçant l'avait peut-être changé, et qu'il ne peut plus remettre.
 *    Rien ne le signale : la charge utile continue de le poster (elle vient de
 *    `ChampsCachesStudio`, pas de l'écran), et l'enregistrement répond
 *    « Vitrine enregistrée. ».
 *
 * 2. UN RÉGLAGE DOUBLÉ. Deux contrôles pour une seule ligne en base. Les deux
 *    écrivent dans le même état, donc le dernier rendu gagne — et le
 *    commerçant lit deux réponses différentes à la même question selon l'étape
 *    ouverte. C'est la classe de dette exacte que ce dépôt paie ailleurs.
 *
 * ── DEUX GARDES, ET LA SECONDE EST LA VRAIE ──
 *
 * La première compare la TABLE à la liste blanche de la base : elle prouve que
 * la répartition est complète. Elle ne prouve pas qu'elle est RENDUE — une
 * table juste et un composant qui ignore la moitié de sa liste passeraient.
 *
 * La seconde monte le studio pour de bon, parcourt les neuf étapes en cliquant
 * comme un commerçant, et compte les contrôles par leur NOM ACCESSIBLE. C'est
 * le rendu réel qui est mesuré, pas l'intention.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("répartition de l'allure — la table", () => {
  it("place les vingt-cinq réglages, sans oubli", () => {
    const places = Object.values(REPARTITION_ALLURE).flat();
    // `VITRINE_ALLURE_CLES` est le miroir de la liste blanche SQL : c'est la
    // seule définition de « tous les réglages » qui ne soit pas un chiffre
    // recopié. Le jour où un vingt-sixième arrive, cette garde rougit tant
    // qu'aucune étape ne l'accueille.
    expect([...places].sort()).toEqual([...VITRINE_ALLURE_CLES].sort());
  });

  it("n'en place aucun deux fois", () => {
    const places = Object.values(REPARTITION_ALLURE).flat();
    expect(new Set(places).size).toBe(places.length);
  });

  it("donne un libellé à chacun", () => {
    // Un réglage sans libellé s'afficherait sous sa clé de base
    // (« hero_taille_nom »), ce qu'aucun commerçant n'a à lire.
    for (const cle of VITRINE_ALLURE_CLES as CleAllure[]) {
      expect(LIBELLES_ALLURE[cle], `libellé manquant : ${cle}`).toBeTruthy();
    }
  });
});

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

function rendre() {
  return render(
    <VitrineStudio
      slug="le-comptoir"
      identiteInitiale={{
        nom: "Le Comptoir",
        logoUrl: null,
        coverPath: null,
        coverAlt: null,
        accroche: "Bistrot de quartier",
        histoire: "Depuis 1997.",
        horaires: "Lundi 12h-14h",
        badge: "Ouvert · 12h–23h",
        secteur: "restaurant",
        horairesStructures: null,
      }}
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

/**
 * Combien de contrôles portent CE nom accessible, sur l'écran tel qu'il est.
 *
 * Le nom accessible et non un `data-` de test : c'est ce qu'un lecteur d'écran
 * annonce, donc la garde couvre aussi l'étiquetage. Les sept curseurs y sont
 * entrés à ce prix — ils portaient un `<span>` voisin, muet, jusqu'à VIT-35.
 */
function compter(libelle: string): number {
  return screen.queryAllByLabelText(libelle).length;
}

/**
 * Ouvrir une étape par son bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et cette suite mesurerait neuf fois
 * l'étape d'ouverture — verte, et aveugle. Constaté en écrivant : la première
 * version rendait zéro contrôle d'allure partout.
 */
function allerA(cle: (typeof ETAPES_STUDIO)[number]["cle"]) {
  fireEvent.click(screen.getByRole("button", { name: libelleEtapeStudio(cle) }));
}

describe("répartition de l'allure — le rendu réel des neuf étapes", () => {
  it("chaque réglage est atteignable, sur une étape et une seule", () => {
    // Ce que le studio règle en propre, au-delà de l'allure : les deux
    // couleurs, les deux polices et la présentation des fiches. Ce sont les
    // cinq autres sections de la charge utile — les oublier en déplaçant les
    // vingt-cinq aurait été le même défaut, hors du champ de la table.
    const LIBELLES_HORS_ALLURE = [
      "Couleur principale",
      "Couleur de fond",
      "Police des titres",
      "Police du texte",
      "Présentation des fiches",
    ];
    const attendus = [
      ...(VITRINE_ALLURE_CLES as CleAllure[]).map((c) => LIBELLES_ALLURE[c]),
      ...LIBELLES_HORS_ALLURE,
    ];

    const total = new Map<string, number>(attendus.map((l) => [l, 0]));

    for (const e of ETAPES_STUDIO) {
      cleanup();
      rendre();
      allerA(e.cle);
      for (const libelle of attendus) {
        total.set(libelle, (total.get(libelle) ?? 0) + compter(libelle));
      }
    }

    const manquants = attendus.filter((l) => total.get(l) === 0);
    const doubles = attendus.filter((l) => (total.get(l) ?? 0) > 1);

    expect(
      manquants,
      "réglages plus atteignables nulle part — donc figés sur leur défaut pour toujours",
    ).toEqual([]);
    expect(
      doubles,
      "réglages rendus par DEUX étapes — deux contrôles pour une seule ligne en base",
    ).toEqual([]);
  });

  it("les quatre étapes d'allure rendent exactement leur part", () => {
    // La garde ci-dessus prouve le total ; celle-ci prouve la RÉPARTITION.
    // Sans elle, une étape qui rendrait toute l'allure et trois qui n'en
    // rendraient rien passeraient — le mur de vingt-cinq contrôles serait
    // revenu sans que rien ne rougisse.
    for (const [etape, cles] of Object.entries(REPARTITION_ALLURE)) {
      cleanup();
      rendre();
      allerA(etape as (typeof ETAPES_STUDIO)[number]["cle"]);

      const rendus = (VITRINE_ALLURE_CLES as CleAllure[]).filter(
        (c) => compter(LIBELLES_ALLURE[c]) > 0,
      );
      expect([...rendus].sort(), `étape « ${etape} »`).toEqual(
        [...cles].sort(),
      );
    }
  });
});
