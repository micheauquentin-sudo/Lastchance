// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
// réellement les cinq étapes, donc montent l'éditeur de lots ET l'aperçu — qui
// est la vraie page joueur. Aucune ne doit être APPELÉE par un rendu, mais
// toutes doivent exister à l'import.
const creerLotTicketOr = vi.fn(async () => ({ ok: true, data: undefined }));
const modifierLotTicketOr = vi.fn(async () => ({ ok: true, data: undefined }));
const supprimerLotTicketOr = vi.fn(async () => ({ ok: true, data: undefined }));
const tirerTicketOr = vi.fn(async () => ({ state: "introuvable" }));
vi.mock("@/actions/ticket-or", () => ({
  creerLotTicketOr,
  modifierLotTicketOr,
  supprimerLotTicketOr,
  emettreTicketOr: vi.fn(),
  tirerTicketOr,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { TicketStudio } = await import("@/components/ticket/ticket-studio");

import {
  ETAPES_STUDIO_TICKET,
  libelleEtapeStudioTicket,
  type EtapeStudioTicket,
} from "@/components/ticket/studio/etapes";
import type { LotTicketOrView } from "@/lib/ticket-or";

/**
 * LE STUDIO DU TICKET D'OR — LA CHARGE UTILE D'UN LOT NE DÉPEND PAS DE L'ÉTAPE.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-45) ──
 *
 * Ce studio n'a pas de formulaire de réglages d'organisation — le Ticket d'Or
 * n'en a aucun. Le piège de l'écrasement en bloc existe pourtant, un cran plus
 * bas : `modifierLotTicketOr` lit QUATRE champs d'un seul `FormData` et réécrit
 * les quatre colonnes du lot.
 *
 * Découper la liste en quatre étapes — le nom, le poids, le stock, la case —
 * rouvre donc ce piège sous sa pire forme : régler un stock depuis « Le stock
 * disponible » effacerait le nom du lot, ramènerait son poids à 1 et le
 * décocherait. Rien ne le signalerait : l'action répondrait « Enregistré. » et
 * les lots changeraient tout seuls.
 *
 * La parade est dans `LotsTicket` (`champs`), qui rend en MIROIR CACHÉ tout ce
 * qu'elle ne montre pas. Ce fichier le vérifie sur le rendu RÉEL de chaque
 * étape, parce que « c'est structurel » est une intention tant qu'aucune garde
 * ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LOTS: LotTicketOrView[] = [
  {
    id: "lot-1",
    libelle: "Un café offert",
    poids: 3,
    stock: null,
    actif: true,
    ordre: 1,
  },
  {
    id: "lot-2",
    libelle: "Une part de tarte",
    poids: 1,
    // Stock ÉPUISÉ, et non illimité : c'est le zéro que `estLotTirable`
    // distingue de `null`.
    stock: 0,
    actif: true,
    ordre: 2,
  },
  {
    id: "lot-3",
    libelle: "Un bon de 10 €",
    poids: 1,
    stock: 5,
    actif: false,
    ordre: 3,
  },
];

/** Les étapes qui MONTRENT l'éditeur, et la colonne que chacune montre. */
const LENTILLES = [
  ["lots", "libelle"],
  ["chances", "poids"],
  ["stock", "stock"],
  ["actifs", "actif"],
] as const;

/** Les QUATRE champs que `modifierLotTicketOr` lit, plus `id`. */
const CHAMPS_ATTENDUS = ["id", "libelle", "poids", "stock"];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient cinq fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: EtapeStudioTicket) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioTicket(cle) }),
  );
}

function rendre(patch: { lots?: LotTicketOrView[]; peutRegler?: boolean } = {}) {
  return render(
    <TicketStudio
      lots={patch.lots ?? LOTS}
      peutRegler={patch.peutRegler ?? true}
    />,
  );
}

/** Le formulaire d'édition de ce lot — celui qui porte son `id`. */
function formulaireDuLot(container: HTMLElement, id: string): HTMLFormElement {
  const trouve = [...container.querySelectorAll("form")].find(
    (f) =>
      f.querySelector(`input[name="id"][value="${id}"]`) &&
      f.querySelector('[name="libelle"]'),
  );
  expect(trouve, `aucun formulaire d'édition pour ${id}`).toBeTruthy();
  return trouve!;
}

/**
 * LA CHARGE RÉELLEMENT POSTÉE, et non la liste des `name` du DOM.
 *
 * C'est la différence qui fait toute la valeur de ces gardes sur `actif` : une
 * case DÉCOCHÉE porte bien `name="actif"` dans le DOM, mais le navigateur ne
 * l'envoie PAS — c'est cette absence que l'action lit comme « décoché ». Une
 * garde qui compterait les attributs verrait « actif présent » partout et ne
 * distinguerait plus un lot coupé d'un lot allumé.
 */
function chargeDe(formulaire: HTMLFormElement): FormData {
  return new FormData(formulaire);
}

function nomsDe(formulaire: HTMLFormElement): string[] {
  return [...chargeDe(formulaire).keys()];
}

describe("studio ticket d'or — le fil des étapes", () => {
  // CINQ, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou
  // en perdre une — laisserait cette suite verte en couvrant une étape de
  // moins : elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte cinq étapes", () => {
    expect(ETAPES_STUDIO_TICKET).toHaveLength(5);
  });

  it("aucune étape ne s'appelle « le détail » — le lot n'a pas de description", () => {
    // La sixième étape proposée réglait « libellé, description ». La colonne
    // `description` n'existe pas dans `tickets_or_lots` : l'étape aurait promis
    // un réglage inexistant. Si elle revient, c'est qu'une migration l'a rendue
    // vraie — et cette garde doit alors être retirée sciemment.
    expect(
      ETAPES_STUDIO_TICKET.map((e) => e.cle as string),
    ).not.toContain("detail");
  });

  it("le fil rend un bouton par étape, nommé pour un lecteur d'écran", () => {
    rendre();
    for (const e of ETAPES_STUDIO_TICKET) {
      expect(
        screen.getByRole("button", { name: libelleEtapeStudioTicket(e.cle) }),
      ).toBeTruthy();
    }
  });
});

describe("studio ticket d'or — la charge d'un lot est complète sur chaque étape", () => {
  it.each(LENTILLES)(
    "étape « %s » : chaque lot porte les quatre champs de l'action",
    (cle) => {
      const { container } = rendre();
      allerA(cle);

      for (const lot of LOTS) {
        const charge = chargeDe(formulaireDuLot(container, lot.id));
        for (const champ of CHAMPS_ATTENDUS) {
          expect(
            charge.has(champ),
            `champ absent sur l'étape « ${cle} », lot ${lot.id} : ${champ}`,
          ).toBe(true);
        }
        // LES VALEURS, ET PAS SEULEMENT LES CLÉS. Un miroir vide passerait la
        // garde de présence et effacerait quand même la colonne.
        expect(charge.get("id")).toBe(lot.id);
        expect(charge.get("libelle")).toBe(lot.libelle);
        expect(charge.get("poids")).toBe(String(lot.poids));
        expect(charge.get("stock")).toBe(
          lot.stock === null ? "" : String(lot.stock),
        );
        // `actif` SE LIT PAR PRÉSENCE côté action (`valeur !== null`) : un
        // miroir rendu avec `value="false"` rallumerait un lot décoché. Son
        // absence de la CHARGE est l'information.
        expect(
          charge.has("actif"),
          `« actif » mal transmis sur l'étape « ${cle} », lot ${lot.id}`,
        ).toBe(lot.actif);
      }
    },
  );

  it.each(LENTILLES)(
    "étape « %s » : un seul champ est VISIBLE, les autres sont des miroirs",
    (cle, colonne) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse :
      // si un deuxième champ devenait visible, deux étapes montreraient le même
      // réglage et le fil ne découperait plus rien.
      const { container } = rendre();
      allerA(cle);

      const formulaire = formulaireDuLot(container, "lot-1");
      const visibles = [...formulaire.querySelectorAll("[name]")]
        .filter((n) => n.getAttribute("type") !== "hidden")
        .map((n) => n.getAttribute("name"));

      expect(visibles).toEqual([colonne]);
    },
  );

  it("un lot DÉCOCHÉ n'envoie jamais `actif`, sur aucune étape", () => {
    // La garde qui compte le plus du fichier : un miroir naïf
    // (`value={String(lot.actif)}`) passerait toutes les autres, et
    // rallumerait en silence chaque lot coupé dès qu'on touche à son stock.
    for (const [cle] of LENTILLES) {
      const { container } = rendre();
      allerA(cle);
      const noms = nomsDe(formulaireDuLot(container, "lot-3"));
      expect(noms, `étape « ${cle} »`).not.toContain("actif");
      cleanup();
    }
  });

  it("un lot COCHÉ l'envoie, sur chaque étape — sinon la garde précédente est vacante", () => {
    // Sans elle, un miroir SUPPRIMÉ par erreur passerait au vert : « absent
    // partout » satisferait la garde ci-dessus et couperait tous les lots au
    // premier enregistrement.
    for (const [cle] of LENTILLES) {
      const { container } = rendre();
      allerA(cle);
      const noms = nomsDe(formulaireDuLot(container, "lot-1"));
      expect(noms, `étape « ${cle} »`).toContain("actif");
      cleanup();
    }
  });

  it.each(ETAPES_STUDIO_TICKET.map((e) => [e.cle] as const))(
    "étape « %s » : aucun formulaire imbriqué dans un autre",
    (cle) => {
      // Un `<form>` dans un `<form>` fait échouer l'hydratation et tue toute
      // l'interactivité de l'écran — défaut livré en VIT-16. Les deux
      // formulaires frères d'une ligne (édition, suppression) plus celui,
      // vide, de la coquille sont exactement le piège que cette garde
      // surveille.
      const { container } = rendre();
      allerA(cle);
      expect(container.querySelectorAll("form form")).toHaveLength(0);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde précédente ne prouve rien", () => {
    const { container } = rendre();
    expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
  });
});

describe("studio ticket d'or — l'ajout et le retrait n'ont qu'un seul endroit", () => {
  it("« Mes lots » ajoute, et le formulaire d'ajout porte les QUATRE champs", () => {
    // Un ajout amputé créerait un lot sans `actif` — donc DÉCOCHÉ, donc jamais
    // tirable — sur un écran qui vient de dire « ajouté ».
    const { container } = rendre();
    const ajout = [...container.querySelectorAll("form")].find(
      (f) => f.textContent?.includes("Ajouter un lot"),
    );
    expect(ajout, "aucun formulaire d'ajout sur « Mes lots »").toBeTruthy();
    const noms = new Set(nomsDe(ajout!));
    for (const champ of ["libelle", "poids", "stock", "actif"]) {
      expect(noms, `champ absent du formulaire d'ajout : ${champ}`).toContain(
        champ,
      );
    }
  });

  it("les trois étapes de réglage n'ajoutent ni ne retirent", () => {
    for (const cle of ["chances", "stock", "actifs"] as const) {
      rendre();
      allerA(cle);
      expect(
        screen.queryByRole("button", { name: "Ajouter" }),
        `« Ajouter » rouvert sur l'étape « ${cle} »`,
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Retirer ce lot" }),
        `« Retirer ce lot » rouvert sur l'étape « ${cle} »`,
      ).toBeNull();
      cleanup();
    }
  });

  it("« Mes lots » garde bien les deux, sinon la garde précédente est vacante", () => {
    rendre();
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Retirer ce lot" }).length,
    ).toBe(LOTS.length);
  });

  it("sans le droit de régler, l'éditeur se tait et n'ouvre aucun formulaire", () => {
    const { container } = rendre({ peutRegler: false });
    expect(
      screen.getByText(/réservé au propriétaire et aux éditeurs/i),
    ).toBeTruthy();
    expect(container.querySelectorAll('[name="libelle"]')).toHaveLength(0);
  });
});

/**
 * LE BANDEAU NE PROMET PAS D'ENREGISTREMENT AUTOMATIQUE.
 *
 * Ce studio n'en a pas : il n'a aucun réglage d'organisation à porter, et
 * chaque lot s'enregistre par son propre bouton. Afficher « Enregistrement
 * automatique » aurait été un écran qui raconte le contraire de ce qu'il fait
 * (ADR-153), et le bouton « Enregistrer » de la coquille aurait posté un
 * `FormData` VIDE à `modifierLotTicketOr` — un « Identifiant invalide » rendu
 * pour avoir cliqué sur « Enregistrer ».
 */
describe("studio ticket d'or — le formulaire de la coquille reste vide", () => {
  it("il ne porte AUCUN champ, et aucun bouton ne le vise", () => {
    const { container } = rendre();
    const coquille = container.querySelector("form#studio-ticket-reglages");
    expect(coquille, "le formulaire de la coquille a disparu").toBeTruthy();
    expect(coquille!.querySelectorAll("[name]")).toHaveLength(0);
    // LE BOUTON DU BANDEAU, et lui seul : les lignes de lots gardent le leur,
    // qui vise leur propre formulaire. Celui de la coquille se reconnaît à son
    // attribut `form=`, puisqu'il vit HORS du formulaire qu'il soumet.
    expect(
      container.querySelectorAll('button[form="studio-ticket-reglages"]'),
      "le bandeau posterait un FormData VIDE à modifierLotTicketOr",
    ).toHaveLength(0);
    expect(screen.queryByText("Enregistrement automatique")).toBeNull();
  });

  it("la légende de l'aperçu dit comment on enregistre vraiment", () => {
    rendre();
    expect(
      screen.getByText(/Chaque lot s'enregistre avec son bouton/),
    ).toBeTruthy();
  });
});

/**
 * L'ÉTAPE DE VÉRIFICATION LIT LE PRÉDICAT PARTAGÉ.
 *
 * Qu'elle ne le RÉÉCRIVE pas est prouvé ailleurs, par `predicat-tirable.test.tsx`
 * qui remplace `estLotTirable` et regarde l'écran changer d'avis. Ici on vérifie
 * ce que le commerçant lit.
 */
describe("studio ticket d'or — vérifier qu'un lot peut sortir", () => {
  it("compte les lots tirables et nomme ce qui manque aux autres", () => {
    rendre();
    allerA("verification");

    expect(
      screen.getByText("1 lot peut sortir. Vos tickets donneront quelque chose."),
    ).toBeTruthy();
    expect(screen.getByText(/poids 3, stock illimité/)).toBeTruthy();
    expect(screen.getByText(/stock épuisé/)).toBeTruthy();
    expect(screen.getByText(/décoché/)).toBeTruthy();
  });

  it("sans aucun lot tirable, elle le dit au lieu d'annoncer « prêt »", () => {
    rendre({ lots: [LOTS[1], LOTS[2]] });
    allerA("verification");
    expect(screen.getByText(/Aucun lot ne peut sortir/)).toBeTruthy();
  });

  it("elle renvoie au comptoir sans absorber l'émission", () => {
    // « Remettre un ticket » est ouvert à TOUS les rôles, caisse comprise ;
    // régler les lots ne l'est pas. Le studio en montre le LIEN, jamais le
    // bouton — sinon il embarquerait une permission qui n'est pas la sienne.
    rendre();
    allerA("verification");
    const lien = screen.getByRole("link", { name: "Aller émettre un ticket" });
    expect(lien.getAttribute("href")).toBe("/dashboard/ticket-or");
    expect(
      screen.queryByRole("button", { name: /Émettre un ticket/ }),
      "le studio a absorbé le geste de comptoir",
    ).toBeNull();
  });
});

/**
 * L'APERÇU EST LA VRAIE PAGE, ET IL NE TIRE RIEN.
 *
 * `ticket-experience.tsx` n'importe qu'une action, `tirerTicketOr`, et elle est
 * ATTEIGNABLE dans l'aperçu : le bouton « Ouvrir mon ticket » est à l'écran.
 * C'est celle-là qu'on tient — et il le faut, car elle CONSOMME un lot du stock.
 */
describe("studio ticket d'or — l'aperçu ne tire rien", () => {
  it("« Ouvrir mon ticket » est bien à l'écran, et n'appelle pas l'action", async () => {
    rendre();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon ticket" }));
    });
    expect(
      tirerTicketOr,
      "l'aperçu a tiré : un lot du stock brûlé, et un retrait gravé que personne ne viendra chercher",
    ).not.toHaveBeenCalled();
  });

  it("il montre le premier lot TIRABLE, pas le premier lot", async () => {
    rendre();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon ticket" }));
    });
    expect(screen.getByText("Un café offert")).toBeTruthy();
    // Le code de retrait est un TEXTE, pas un code : il ne peut être présenté
    // à aucun comptoir.
    expect(screen.getByText("EXEMPLE")).toBeTruthy();
  });

  it("sans lot tirable, il montre le refus que le client verrait vraiment", async () => {
    rendre({ lots: [LOTS[1], LOTS[2]] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon ticket" }));
    });
    expect(
      screen.getByText(/Il n'y a plus rien à gagner pour le moment/),
    ).toBeTruthy();
  });

  it("il monte la coquille de `/ticket/[code]`, titre et chapeau compris", () => {
    rendre();
    expect(
      screen.getByRole("heading", { name: "Ticket d'Or", level: 1 }),
    ).toBeTruthy();
    expect(
      screen.getByText("Une visite d'hier, une bonne raison de revenir."),
    ).toBeTruthy();
  });
});
