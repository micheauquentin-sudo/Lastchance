// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
 * réellement les cinq étapes, donc montent les éditeurs ET l'aperçu — qui est
 * la vraie surface joueur. Aucune ne doit être APPELÉE par un rendu, mais toutes
 * doivent exister à l'import.
 *
 * Les trois actions du parcours JOUEUR sont ici pour une raison précise : c'est
 * sur elles que porte la garde de l'aperçu plus bas. Si `apercu` cessait de les
 * couper, l'aperçu irait lire — puis écrire — sous le cookie du COMMERÇANT.
 */
const { getPlayerProgression, getPlayerProgressionArchive, openProgressionChest } =
  vi.hoisted(() => ({
    // `vi.hoisted` et non trois `const` de module : la fabrique de `vi.mock` est
    // remontée en tête de fichier, elle ne peut donc pas fermer sur des
    // variables déclarées après elle — « Cannot access … before initialization ».
    getPlayerProgression: vi.fn(async () => null),
    getPlayerProgressionArchive: vi.fn(async () => null),
    openProgressionChest: vi.fn(async () => ({ ok: true, data: undefined })),
  }));
vi.mock("@/actions/meta-progression", () => ({
  createProgressionBadge: vi.fn(),
  createProgressionChest: vi.fn(),
  createProgressionCollection: vi.fn(),
  createProgressionCollectionItem: vi.fn(),
  createProgressionMission: vi.fn(),
  createProgressionSeason: vi.fn(),
  activateProgressionSeason: vi.fn(),
  archiveProgressionSeason: vi.fn(),
  endProgressionSeason: vi.fn(),
  deleteProgressionBadge: vi.fn(),
  deleteProgressionChest: vi.fn(),
  deleteProgressionCollection: vi.fn(),
  deleteProgressionCollectionItem: vi.fn(),
  deleteProgressionMission: vi.fn(),
  deleteProgressionSeason: vi.fn(),
  setProgressionChestEnabled: vi.fn(),
  setProgressionMissionEnabled: vi.fn(),
  updateProgressionBadge: vi.fn(),
  updateProgressionChest: vi.fn(),
  updateProgressionCollection: vi.fn(),
  updateProgressionCollectionItem: vi.fn(),
  updateProgressionMission: vi.fn(),
  getPlayerProgression,
  getPlayerProgressionArchive,
  openProgressionChest,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ProgressionStudio } = await import(
  "@/components/progression/progression-studio"
);

import {
  ETAPES_STUDIO_PROGRESSION,
  libelleEtapeStudioProgression,
  type EtapeStudioProgression,
} from "@/components/progression/studio/etapes";
import { etatApercuProgression } from "@/components/progression/studio/apercu";
import type { OrgProgressionSeason } from "@/lib/meta-progression";

/**
 * LE STUDIO DE LA MÉTA-PROGRESSION — LA CHARGE D'UNE ENTITÉ NE DÉPEND PAS DE
 * L'ÉTAPE.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-50) ──
 *
 * Ce studio n'a pas de formulaire de réglages d'organisation — il n'existe pas
 * de `updateProgressionSeason`. Le piège de l'écrasement en bloc existe pourtant,
 * un cran plus bas : `updateProgressionMission` réécrit ONZE colonnes et pousse
 * une NOUVELLE version de règle au journal immuable ; `updateProgressionChest`
 * REMPLACE intégralement le contenu du coffre.
 *
 * L'esquisse de découpage proposait « Vos missions », « Ce qui fait avancer une
 * mission » et « Les clés que rapporte chaque mission » en trois étapes. Réglé
 * ainsi, corriger un palier depuis la troisième aurait effacé le nom de la
 * mission, remis sa dotation à zéro et publié une règle v+1 amputée. Rien ne
 * l'aurait signalé : l'action aurait répondu « Enregistré. » en faisant autre
 * chose que ce qu'on croit.
 *
 * La parade retenue n'est pas un miroir caché, c'est le DÉCOUPAGE : aucune
 * étape ne coupe une entité en deux. Ce fichier le mesure sur le rendu RÉEL de
 * chaque étape, parce que « c'est structurel » reste une intention tant
 * qu'aucune garde ne la tient — et parce que rien n'empêche un futur lot de
 * rouvrir la découpe.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SAISON: OrgProgressionSeason = {
  id: "saison-1",
  name: "Saison d'automne",
  status: "draft",
  startsAt: "2026-09-01T08:00:00.000Z",
  // LOIN dans le futur : la condition « la fin n'est pas passée » de
  // `activate_progression_season` est réelle, et une date figée dans le passé
  // ferait rougir ces gardes le jour où on les rejoue.
  endsAt: "2099-12-01T08:00:00.000Z",
  badges: [
    {
      id: "badge-1",
      name: "Habitué du comptoir",
      description: "Dix passages",
      iconKey: "trophy",
      createdAt: null,
    },
  ],
  collections: [
    {
      id: "col-1",
      name: "Les cafés du monde",
      description: "Neuf tasses à réunir",
      items: [
        {
          id: "item-1",
          name: "Tasse éthiopienne",
          description: "La première",
          imageUrl: null,
          position: 1,
          createdAt: null,
        },
      ],
    },
  ],
  missions: [
    {
      id: "mission-1",
      name: "Cinq parties",
      description: "Jouez cinq fois",
      enabled: true,
      keyReward: 3,
      badgeId: "badge-1",
      collectionItemId: null,
      rule: {
        version: 2,
        eventName: "experience_completed",
        target: 5,
        experienceKinds: ["campaign"],
        source: null,
        distinctExperiences: false,
      },
    },
    {
      // DÉSACTIVÉE : c'est le cas qui porte la garde sur `enabled`.
      id: "mission-2",
      name: "Le tour du calendrier",
      description: "",
      enabled: false,
      keyReward: 0,
      badgeId: null,
      collectionItemId: "item-1",
      rule: {
        version: 1,
        eventName: "experience_started",
        target: 12,
        experienceKinds: ["calendar"],
        source: "qr",
        distinctExperiences: true,
      },
    },
  ],
  chests: [
    {
      id: "chest-1",
      name: "Coffre de bronze",
      description: "Trois clés",
      keyCost: 3,
      enabled: true,
      itemIds: ["item-1"],
    },
  ],
};

const ORGANISATION = { id: "org-1", name: "Le Comptoir" };

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient cinq fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: EtapeStudioProgression) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioProgression(cle) }),
  );
}

function rendre(
  patch: { seasons?: OrgProgressionSeason[]; peutRegler?: boolean } = {},
) {
  return render(
    <ProgressionStudio
      seasons={patch.seasons ?? [SAISON]}
      peutRegler={patch.peutRegler ?? true}
      organization={ORGANISATION}
    />,
  );
}

/** Le formulaire qui porte ce champ visible et cette valeur de départ. */
function formulairePortant(
  container: HTMLElement,
  champ: string,
  valeur?: string,
): HTMLFormElement {
  const trouve = [...container.querySelectorAll("form")].find((f) => {
    const controle = f.querySelector<HTMLInputElement>(`[name="${champ}"]`);
    if (!controle) return false;
    return valeur === undefined || controle.value === valeur;
  });
  expect(
    trouve,
    `aucun formulaire portant « ${champ} »${valeur ? ` = « ${valeur} »` : ""}`,
  ).toBeTruthy();
  return trouve!;
}

/**
 * LA CHARGE RÉELLEMENT POSTÉE, et non la liste des `name` du DOM.
 *
 * C'est la différence qui fait toute la valeur de la garde sur `enabled` : une
 * case DÉCOCHÉE porte bien `name="enabled"` dans le DOM, mais le navigateur ne
 * l'envoie PAS — et `MissionForm` lit exactement cette absence
 * (`data.get("enabled") === "on"`). Une garde qui compterait les attributs
 * verrait « enabled présent » partout et ne distinguerait plus une mission
 * arrêtée d'une mission active.
 */
function nomsDe(formulaire: HTMLFormElement): string[] {
  return [...new FormData(formulaire).keys()];
}

describe("studio progression — le fil des étapes", () => {
  /**
   * CINQ, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou en
   * perdre une — laisserait cette suite verte en couvrant une étape de moins :
   * elle est paramétrée PAR la liste qu'elle vérifie.
   */
  it("le studio compte cinq étapes, et non les dix de l'esquisse", () => {
    expect(ETAPES_STUDIO_PROGRESSION).toHaveLength(5);
  });

  it.each(["declencheurs", "cles", "pieces", "passeport", "saison", "lancer"])(
    "aucune étape ne s'appelle « %s » — elle n'aurait aucun réglage à elle",
    (cle) => {
      /**
       * Les six étapes de l'esquisse qui sont tombées, et chacune pour une
       * raison mécanique (ADR-160) :
       *  · `declencheurs` et `cles` sont des CHAMPS de la mission —
       *    `updateProgressionMission` réécrit ses onze colonnes en bloc ;
       *  · `pieces` n'est pas disjointe de `collections` : un objet n'existe que
       *    dans sa collection, et y est déjà rendu ;
       *  · `passeport` n'a aucune colonne à régler — c'est l'aperçu ;
       *  · `saison` non plus : il n'existe pas de `updateProgressionSeason` ;
       *  · `lancer` a fusionné dans `verification`, qui ne publie pas.
       *
       * Si l'une revient, c'est qu'une migration l'a rendue vraie — et cette
       * garde doit alors être retirée sciemment.
       */
      expect(ETAPES_STUDIO_PROGRESSION.map((e) => e.cle as string)).not.toContain(
        cle,
      );
    },
  );

  it("le fil rend un bouton par étape, nommé pour un lecteur d'écran", () => {
    rendre();
    for (const e of ETAPES_STUDIO_PROGRESSION) {
      expect(
        screen.getByRole("button", {
          name: libelleEtapeStudioProgression(e.cle),
        }),
      ).toBeTruthy();
    }
  });

  it("badges et collections précèdent les missions, qui précèdent les coffres", () => {
    // L'ORDRE EST UNE DÉPENDANCE, PAS UN GOÛT : une mission octroie un badge ou
    // une pièce, et `ChestForm` refuse de se rendre sans pièce. Inverser le fil
    // ferait tomber le commerçant sur des `select` vides.
    const ordre = ETAPES_STUDIO_PROGRESSION.map((e) => e.cle as string);
    expect(ordre.indexOf("badges")).toBeLessThan(ordre.indexOf("missions"));
    expect(ordre.indexOf("collections")).toBeLessThan(ordre.indexOf("missions"));
    expect(ordre.indexOf("missions")).toBeLessThan(ordre.indexOf("coffres"));
  });
});

/**
 * LA CHARGE COMPLÈTE, ÉTAPE PAR ÉTAPE.
 *
 * Chaque entrée : l'étape, le champ visible qui identifie le formulaire, et
 * TOUS les champs que l'action lit dans la `FormData`. La liste des champs est
 * celle des `data.get(…)` de `progression-season-card.tsx` — le point de vérité.
 */
const CHARGES = [
  {
    etape: "badges" as const,
    // Formulaire de CRÉATION : toujours visible sur son étape.
    ancre: { champ: "iconKey" },
    champs: ["name", "description", "iconKey"],
  },
  {
    etape: "collections" as const,
    ancre: { champ: "name", valeur: "" },
    champs: ["name", "description"],
  },
  {
    etape: "missions" as const,
    ancre: { champ: "eventName" },
    champs: [
      "name",
      "description",
      "eventName",
      "target",
      "keyReward",
      "source",
      "badgeId",
      "collectionItemId",
    ],
  },
  {
    etape: "coffres" as const,
    ancre: { champ: "keyCost" },
    champs: ["name", "description", "keyCost"],
  },
];

describe("studio progression — chaque formulaire porte la charge entière de son action", () => {
  it.each(CHARGES)(
    "étape « $etape » : le formulaire de création porte tous les champs lus",
    ({ etape, ancre, champs }) => {
      const { container } = rendre();
      allerA(etape);

      const formulaire = formulairePortant(container, ancre.champ, ancre.valeur);
      const noms = nomsDe(formulaire);
      for (const champ of champs) {
        expect(
          noms,
          `champ absent sur l'étape « ${etape} » : ${champ}`,
        ).toContain(champ);
      }
    },
  );

  it("étape « missions » : l'édition d'une mission porte ses ONZE champs, avec leurs valeurs", () => {
    /**
     * LA GARDE QUI COMPTE LE PLUS DU FICHIER.
     *
     * `updateProgressionMission` réécrit toutes ces colonnes en bloc et publie
     * une nouvelle version de règle. Un champ absent — ou présent et vide — ne
     * laisse pas la colonne intacte : il l'ÉCRASE, et grave l'écrasement dans un
     * journal immuable qu'aucune correction ne rembobine.
     */
    const { container } = rendre();
    allerA("missions");
    fireEvent.click(
      screen.getByRole("button", { name: "Modifier la mission Cinq parties" }),
    );

    const formulaire = formulairePortant(container, "name", "Cinq parties");
    const charge = new FormData(formulaire);

    // LES VALEURS, ET PAS SEULEMENT LES CLÉS. Un formulaire vide passerait une
    // garde de présence et effacerait quand même toutes les colonnes.
    expect(charge.get("name")).toBe("Cinq parties");
    expect(charge.get("description")).toBe("Jouez cinq fois");
    expect(charge.get("eventName")).toBe("experience_completed");
    expect(charge.get("target")).toBe("5");
    expect(charge.get("keyReward")).toBe("3");
    expect(charge.get("badgeId")).toBe("badge-1");
    // `source` et `collectionItemId` sont vides sur cette mission : présents,
    // et vides — c'est ce que l'action relit comme « aucun ».
    expect(charge.has("source")).toBe(true);
    expect(charge.get("collectionItemId")).toBe("");
    // Cochée : `distinctExperiences` est à `false` ici, donc ABSENTE (lue par
    // présence). `enabled`, elle, est à `true` : elle doit être là.
    expect(charge.has("distinctExperiences")).toBe(false);
    expect(charge.has("enabled")).toBe(true);
  });

  it("une mission ARRÊTÉE n'envoie jamais `enabled` — sinon la rouvrir la rallume", () => {
    /**
     * `MissionForm` lit `data.get("enabled") === "on"` : l'ABSENCE est
     * l'information. Une case décochée porte bien son `name` dans le DOM mais
     * n'envoie rien — c'est pourquoi cette garde lit la `FormData` réelle.
     *
     * Sans elle, un `defaultChecked` mal posé rallumerait en silence chaque
     * mission qu'un commerçant a délibérément coupée, à la première correction
     * de son libellé. L'interrupteur d'arrêt est le SEUL geste autorisé sur une
     * saison lancée : le défaire par mégarde est le plus coûteux de ce module.
     */
    const { container } = rendre();
    allerA("missions");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Modifier la mission Le tour du calendrier",
      }),
    );

    const formulaire = formulairePortant(
      container,
      "name",
      "Le tour du calendrier",
    );
    expect(nomsDe(formulaire)).not.toContain("enabled");
    // Et son anti-garde : `distinctExperiences` est COCHÉE sur cette
    // mission-ci. Sans elle, un miroir SUPPRIMÉ par erreur passerait au vert —
    // « absent partout » satisferait l'assertion ci-dessus.
    expect(nomsDe(formulaire)).toContain("distinctExperiences");
  });

  it.each(ETAPES_STUDIO_PROGRESSION.map((e) => [e.cle] as const))(
    "étape « %s » : aucun formulaire imbriqué dans un autre",
    (cle) => {
      // Un `<form>` dans un `<form>` est du HTML invalide : le navigateur déplie
      // en silence et l'hydratation de TOUTE la page meurt (défaut VIT-16). Le
      // formulaire de la coquille est un VOISIN de la mise en page, jamais son
      // parent — et ce studio en a plusieurs par étape.
      const { container } = rendre();
      allerA(cle);
      for (const formulaire of container.querySelectorAll("form")) {
        expect(
          formulaire.querySelector("form"),
          `formulaire imbriqué sur l'étape « ${cle} »`,
        ).toBeNull();
      }
    },
  );
});

describe("studio progression — l'autorité est `canConfigure`, pas le rôle", () => {
  /**
   * `org_progression_snapshot` réserve sa branche `seasons` aux éditeurs depuis
   * `20260805220000`, et rend `canConfigure: false` AUSSI quand l'agrégat est
   * illisible — ce qu'un rôle local ne peut pas savoir. Un studio qui se
   * garderait sur `role` proposerait donc des formulaires d'édition sur une
   * liste que la RPC a refusé de remplir, et sur une configuration qu'elle n'a
   * pas su lire.
   */
  it("sans le droit, aucune étape n'offre de formulaire d'édition", () => {
    for (const e of ETAPES_STUDIO_PROGRESSION) {
      const { container } = rendre({ peutRegler: false });
      allerA(e.cle);
      expect(
        container.querySelectorAll("form:not([id])").length,
        `l'étape « ${e.cle} » offre un formulaire sans le droit d'écrire`,
      ).toBe(0);
      cleanup();
    }
  });

  it("avec le droit, les quatre étapes de réglage en offrent un — sinon la garde est vacante", () => {
    // Sans elle, un studio qui n'afficherait JAMAIS de formulaire passerait la
    // garde ci-dessus au vert en n'ayant rien prouvé.
    for (const { etape } of CHARGES) {
      const { container } = rendre({ peutRegler: true });
      allerA(etape);
      expect(
        container.querySelectorAll("form:not([id])").length,
        `l'étape « ${etape} » n'offre aucun formulaire`,
      ).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("le bandeau ne promet AUCUN enregistrement automatique", () => {
    // ADR-160 : ce studio n'a pas de charge utile d'organisation — il n'existe
    // pas de `updateProgressionSeason`. `peutEditer={false}` sur la coquille.
    // Annoncer l'automatisme aurait été un écran qui raconte le contraire de ce
    // qu'il fait, et le bouton « Enregistrer » posterait un formulaire VIDE.
    rendre({ peutRegler: true });
    expect(screen.queryByText("Enregistrement automatique")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });
});

describe("studio progression — l'aperçu ne parle jamais au serveur", () => {
  /**
   * Les trois actions du parcours joueur LISENT ou ÉCRIVENT sous le cookie
   * `lc-player` — qui, dans un studio, est celui du COMMERÇANT. Les laisser
   * tourner afficherait sa progression personnelle à la place de l'état de
   * départ de sa saison, et ouvrir un coffre débiterait ses clés.
   */
  it("aucune des trois actions joueur n'est appelée par un rendu du studio", () => {
    for (const e of ETAPES_STUDIO_PROGRESSION) {
      const { unmount } = rendre();
      allerA(e.cle);
      unmount();
    }
    expect(getPlayerProgression).not.toHaveBeenCalled();
    expect(getPlayerProgressionArchive).not.toHaveBeenCalled();
    expect(openProgressionChest).not.toHaveBeenCalled();
  });

  it("l'état de départ n'invente aucun chiffre de progression", () => {
    /**
     * ADR-159 : le passeport de fidélité a refusé de reprendre les « 42 points »
     * de sa maquette. Régler des paliers et des coûts en clés sur un joueur qui
     * n'existe pas n'a pas de sens — ce qu'il faut voir, c'est l'écran du
     * PREMIER joueur, le jour de l'ouverture.
     */
    const etat = etatApercuProgression(SAISON, ORGANISATION);
    expect(etat.keys).toBe(0);
    expect(etat.keysEarned).toBe(0);
    expect(etat.keysSpent).toBe(0);
    expect(etat.missions.every((m) => m.current === 0)).toBe(true);
    expect(etat.missions.every((m) => m.completedAt === null)).toBe(true);
    expect(etat.badges.every((b) => !b.earned)).toBe(true);
    expect(etat.collections.every((c) => c.items.every((i) => !i.owned))).toBe(
      true,
    );
  });

  it("l'état de départ cache ce qu'un interrupteur a coupé", () => {
    // `player_progression_snapshot` filtre sur `enabled` : un aperçu qui
    // montrerait la mission arrêtée ferait croire que l'interrupteur n'a rien
    // coupé — le contraire de ce que le geste vient de faire.
    const etat = etatApercuProgression(SAISON, ORGANISATION);
    expect(etat.missions.map((m) => m.id)).toEqual(["mission-1"]);
    expect(etat.chests.map((c) => c.id)).toEqual(["chest-1"]);
  });
});

describe("studio progression — sans saison, l'écran le dit", () => {
  it("aucune saison : pas de fil d'étapes, mais une invitation à en créer une", () => {
    // Un studio qui afficherait cinq étapes vides ferait chercher au commerçant
    // ce qui ne s'y trouve pas. La saison est le SUJET de ce studio, pas une
    // étape : sans elle, il n'y a rien à régler.
    rendre({ seasons: [] });
    expect(screen.getByText("Aucune saison à régler")).toBeTruthy();
    for (const e of ETAPES_STUDIO_PROGRESSION) {
      expect(
        screen.queryByRole("button", {
          name: libelleEtapeStudioProgression(e.cle),
        }),
      ).toBeNull();
    }
  });
});
