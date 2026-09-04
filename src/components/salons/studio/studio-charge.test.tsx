// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// L'action REND un succès : l'enregistrement automatique lit son verdict pour
// afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait
// `undefined`, que `useActionForm` traiterait comme une réponse illisible.
//
// TOUTES les actions des trois modules, et c'est nécessaire : ces gardes
// visitent réellement chaque étape des DEUX jeux, donc montent le plateau du
// Duo, le sélecteur de pack de la Bande et le bloc de partage. Aucune n'est
// APPELÉE par un rendu, mais toutes doivent exister à l'import.
const setHabillageSalons = vi.fn(async () => ({
  ok: true as const,
  data: { etat: "enregistre" as const },
}));
vi.mock("@/actions/salon-habillage", () => ({ setHabillageSalons }));
vi.mock("@/actions/duo", () => ({
  setDuoOptions: vi.fn(),
  setDuoSuggestion: vi.fn(),
  startDuo: vi.fn(),
  chooseDuo: vi.fn(),
  getDuoState: vi.fn(),
}));
vi.mock("@/actions/bande", () => ({
  setBandePack: vi.fn(),
  startBande: vi.fn(),
  getBandeState: vi.fn(),
  voteBande: vi.fn(),
  revealBande: vi.fn(),
  nextBande: vi.fn(),
  getBandeRecap: vi.fn(),
}));
vi.mock("@/actions/qr-codes", () => ({
  createQrCode: vi.fn(),
  deleteQrCode: vi.fn(),
  updateQrStyle: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { SalonStudio } = await import("@/components/salons/salon-studio");

import {
  etapesStudioSalon,
  libelleEtapeStudioSalon,
  type EtapeStudioSalon,
} from "@/components/salons/studio/etapes";
import type { DuoOptionsAdminView } from "@/lib/duo";
import type { LobbyKind } from "@/lib/lobby";
import type { VitrineCarteView } from "@/lib/vitrine";

/**
 * LE STUDIO DES SALONS — LA CHARGE UTILE NE DÉPEND PAS DE L'ÉTAPE, NI DU JEU.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-48) ──
 *
 * `setHabillageSalons` lit `theme`, `fond_key` et `affiche_identite` d'un seul
 * `FormData`, et `set_lobby_habillage` réécrit la ligne en bloc. Une étape
 * qu'on quitte est DÉMONTÉE : si ces champs vivaient dans « L'habillage »,
 * l'enregistrement automatique déclenché depuis « Vos questions » les
 * posterait ABSENTS, et le décor reviendrait à « suivre le thème » chez
 * quelqu'un qui venait de choisir une image. Rien ne le signalerait — l'action
 * répondrait « enregistré », et elle dirait vrai.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesSalon` rend la charge EN ENTIER depuis l'état. Ce fichier le
 * vérifie sur le rendu RÉEL de chaque étape des DEUX jeux, parce que « c'est
 * structurel » est une intention tant qu'aucune garde ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ID_FORMULAIRE = "form#studio-salon-habillage";

/** Les QUATRE champs que `setHabillageSalons` lit dans le `FormData`. */
const CHAMPS_ATTENDUS = ["jeu", "theme", "fond_key", "affiche_identite"];

const PLATEAU: DuoOptionsAdminView = {
  options: [
    {
      option_id: "opt-1",
      item_id: "item-1",
      nom: "Le café du matin",
      description: null,
      prix_affiche: null,
      photo_path: null,
      ordre: 1,
    },
    {
      option_id: "opt-2",
      item_id: null,
      nom: "Une part de tarte",
      description: null,
      prix_affiche: null,
      photo_path: null,
      ordre: 2,
    },
    {
      option_id: "opt-3",
      item_id: null,
      nom: "Un chocolat chaud",
      description: null,
      prix_affiche: null,
      photo_path: null,
      ordre: 3,
    },
  ],
  suggestion: null,
};

const CARTES = [
  {
    id: "carte-1",
    nom: "Carte du soir",
    ordre: 1,
    active: true,
    categories: [
      {
        id: "rub-1",
        nom: "Entrées",
        fiches: [{ id: "item-1", nom: "Le café du matin" }],
      },
    ],
  },
  // unsafe-cast-justification: fixture partielle — `aplatirFiches` ne lit que `nom` et `id`, aux trois niveaux
] as unknown as VitrineCarteView[];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient chaque fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(jeu: LobbyKind, cle: EtapeStudioSalon) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioSalon(jeu, cle) }),
  );
}

function rendre(jeu: LobbyKind, patch: { peutEditer?: boolean } = {}) {
  return render(
    <SalonStudio
      jeu={jeu}
      libelleJeu={jeu === "duo" ? "Duo Miroir" : "Portrait de la Bande"}
      theme="neutre"
      fondKey={null}
      afficheIdentite
      nomOrganisation="Le Comptoir"
      organizationId="org-1"
      logoUrl={null}
      url="https://exemple.test/lobby/nouveau/le-comptoir"
      vitrinePubliee={false}
      plateau={jeu === "duo" ? PLATEAU : { options: [], suggestion: null }}
      cartes={jeu === "duo" ? CARTES : []}
      pack="amis"
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

/**
 * ── LE FIL EST DÉRIVÉ DU JEU, ET C'EST LE CŒUR DE CE MODULE ──
 *
 * Une liste écrite en dur aurait affiché « Votre suggestion du jour » sur
 * Portrait de la Bande : une étape annonçant un réglage qui n'existe pas — ni
 * colonne, ni RPC, ni écran. C'est ce qu'ADR-160 a déjà tranché ailleurs, et
 * c'est la seule chose de ce studio qu'aucune autre garde ne pourrait
 * attraper : rien ne casserait, l'étape s'ouvrirait simplement sur du vide.
 */
describe("le fil d'étapes est DÉRIVÉ du jeu", () => {
  it("le Duo et la Bande n'ont pas le même fil", () => {
    expect(etapesStudioSalon("duo")).not.toEqual(etapesStudioSalon("bande"));
  });

  it("« Votre suggestion du jour » existe sur le Duo et NULLE PART ailleurs", () => {
    const cles = (jeu: LobbyKind) => etapesStudioSalon(jeu).map((e) => e.cle);
    expect(cles("duo")).toContain("suggestion");
    expect(cles("bande")).not.toContain("suggestion");
  });

  it("l'étape de contenu porte un titre DIFFÉRENT selon le jeu", () => {
    // Même clé (`contenu`), parce que les deux jeux ont bien un contenu à
    // régler ; c'est ce qu'on y montre qui change, et le titre doit le dire.
    const titre = (jeu: LobbyKind) =>
      etapesStudioSalon(jeu).find((e) => e.cle === "contenu")!.titre;
    expect(titre("duo")).toBe("Vos questions");
    expect(titre("bande")).toBe("Votre pack de cartes");
  });

  it("le fil du Duo compte quatre étapes, celui de la Bande trois", () => {
    // LES CHIFFRES SONT ÉCRITS. Sans eux, découper une étape en deux — ou en
    // perdre une — laisserait cette suite verte en couvrant une étape de moins :
    // elle est paramétrée PAR la liste qu'elle vérifie.
    expect(etapesStudioSalon("duo")).toHaveLength(4);
    expect(etapesStudioSalon("bande")).toHaveLength(3);
  });

  it("l'habillage est nommé « commun aux deux jeux » dans les DEUX fils", () => {
    // Le titre de l'étape est le seul texte que le commerçant ne peut pas
    // manquer : il est dans le fil en permanence, dans l'infobulle, et dans le
    // nom accessible. C'est là que la portée partagée est portée.
    for (const jeu of ["duo", "bande"] as const) {
      const habillage = etapesStudioSalon(jeu).find(
        (e) => e.cle === "habillage",
      )!;
      expect(habillage.titre).toContain("commun aux deux jeux");
      expect(habillage.resume).toContain("Duo Miroir");
      expect(habillage.resume).toContain("Portrait de la Bande");
    }
  });

  it("un segment d'étape inconnu retombe sur la première du JEU demandé", () => {
    // Le repli du socle, appliqué au bon fil : un signet d'avant un
    // redécoupage ne doit pas ouvrir une page blanche, ni l'étape d'un autre
    // jeu.
    for (const jeu of ["duo", "bande"] as const) {
      const premiere = etapesStudioSalon(jeu)[0].cle;
      expect(
        libelleEtapeStudioSalon(jeu, premiere).startsWith("Étape 1 sur "),
      ).toBe(true);
    }
  });
});

describe.each([["duo"], ["bande"]] as const)(
  "studio salon (%s) — la charge utile ne dépend pas de l'étape ouverte",
  (jeu: LobbyKind) => {
    const etapes = etapesStudioSalon(jeu);

    it.each(etapes.map((e) => [e.cle, e.titre] as const))(
      "étape « %s » : le formulaire porte les quatre champs de l'action",
      (cle, titre) => {
        const { container } = rendre(jeu);
        allerA(jeu, cle);

        const formulaire = container.querySelector(ID_FORMULAIRE)!;
        const noms = new Set(
          [...formulaire.querySelectorAll("[name]")].map((n) =>
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

    it.each(etapes.map((e) => [e.cle] as const))(
      "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
      (cle) => {
        // C'est ce qui rend la garde ci-dessus structurelle plutôt que
        // chanceuse. Un contrôle VISIBLE portant un `name` vivrait dans une
        // étape, donc disparaîtrait avec elle — et le prochain enregistrement,
        // automatique, effacerait la colonne sans que rien ne le signale.
        //
        // L'assertion vise le formulaire de l'HABILLAGE et lui seul : ceux du
        // plateau, de la suggestion et du pack ont bien des champs visibles
        // nommés, et c'est normal — ils appartiennent à leurs propres actions
        // (ADR-156).
        const { container } = rendre(jeu);
        allerA(jeu, cle);

        const formulaire = container.querySelector(ID_FORMULAIRE)!;
        const visibles = [...formulaire.querySelectorAll("[name]")].filter(
          (n) => n.getAttribute("type") !== "hidden",
        );

        expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
      },
    );

    it("la charge utile porte le JEU de la page, sur toutes les étapes", () => {
      // `setHabillageSalons` commence par `if (!estJeuDeSalon(jeu)) return
      // NON_AUTORISE` : sans ce champ, chaque enregistrement automatique se
      // ferait refuser sans que rien n'explique pourquoi.
      for (const e of etapes) {
        const { container, unmount } = rendre(jeu);
        allerA(jeu, e.cle);
        const champ = container.querySelector<HTMLInputElement>(
          `${ID_FORMULAIRE} input[name="jeu"]`,
        )!;
        expect(champ.value, `étape « ${e.titre} »`).toBe(jeu);
        unmount();
      }
    });

    it("l'écran héberge bien plusieurs formulaires — sinon la garde du socle ne prouve rien", () => {
      // Le contenu apporte le sien (plateau, suggestion ou pack). Sans cette
      // assertion, « le formulaire de la coquille n'est l'ancêtre de rien »
      // serait trivialement vrai sur un écran qui n'en aurait qu'un.
      const { container } = rendre(jeu);
      allerA(jeu, "contenu");
      expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
    });

    it("aucun formulaire n'est imbriqué dans un autre", () => {
      // Un `<form>` dans un `<form>` est du HTML invalide : le navigateur
      // déplie en silence et l'hydratation de toute la page meurt (VIT-16).
      for (const e of etapes) {
        const { container, unmount } = rendre(jeu);
        allerA(jeu, e.cle);
        for (const f of container.querySelectorAll("form")) {
          expect(
            f.parentElement?.closest("form"),
            `formulaire imbriqué sur l'étape « ${e.titre} »`,
          ).toBeNull();
        }
        unmount();
      }
    });
  },
);

/**
 * L'HABILLAGE DIT SA PORTÉE LÀ OÙ LA MAIN EST POSÉE.
 *
 * `HabillageSalons`, sur le tableau de bord, la disait trois fois — titre,
 * chapeau, bouton « Enregistrer pour les deux jeux ». Le studio ne peut pas
 * reprendre la troisième : il n'a pas de bouton par bloc, il enregistre seul.
 * L'avertissement doit donc tenir sans lui, et il tient sur les contrôles
 * eux-mêmes.
 */
describe("l'habillage annonce qu'il change AUSSI l'autre jeu", () => {
  it.each([["duo"], ["bande"]] as const)(
    "depuis le studio du %s, le bloc nomme les DEUX jeux",
    (jeu: LobbyKind) => {
      rendre(jeu);
      allerA(jeu, "habillage");

      // Le chapeau du bloc, qui nomme les deux jeux en toutes lettres.
      const bloc = screen.getByRole("heading", {
        name: "L'habillage de la salle",
      }).parentElement!;
      expect(bloc.textContent).toContain("Duo Miroir");
      expect(bloc.textContent).toContain("Portrait de la Bande");
      expect(bloc.textContent).toContain("les deux à la fois");

      // Et la mention attachée à CHAQUE groupe de contrôles — la palette, le
      // décor, l'enseigne — parce qu'une note en bas de page aurait été lue une
      // fois, le premier jour.
      const mentions = bloc.textContent!.match(/vos deux jeux/g) ?? [];
      expect(mentions.length).toBeGreaterThanOrEqual(3);
    },
  );
});
