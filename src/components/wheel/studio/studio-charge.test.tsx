// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions RENDENT un succès : l'enregistrement automatique lit leur verdict
 * pour afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait
 * `undefined`, que `useActionForm` traiterait comme une réponse illisible.
 *
 * TOUTES les actions des modules montés, et c'est nécessaire : ces gardes
 * visitent réellement les neuf étapes, donc montent l'éditeur de lots, les
 * réglages de campagne, le parrainage ET l'étape de vérification (qui monte
 * `WheelPreviewTest`, seul aperçu du module qui touche le serveur). Aucune
 * n'est APPELÉE par un simple rendu, mais toutes doivent exister à l'import.
 */
/**
 * LES DEUX PARAMÈTRES SONT DÉCLARÉS, MÊME INUTILISÉS ICI.
 *
 * Sans eux, `mock.calls` est un tableau de tuples VIDES et lire `[1]` ne
 * compile pas — mais surtout, plusieurs de ces gardes n'existent QUE pour
 * inspecter cette `FormData` : c'est là que vivent la charge complète, le
 * style fusionné et la liste des jours. Un mock sans paramètres les rendrait
 * inécrivables, et on se rabattrait sur « l'action a été appelée », qui ne
 * prouve rien sur ce qui est parti.
 */
type ActionRoue = (
  prev: unknown,
  formData: FormData,
) => Promise<{ ok: true; data: undefined }>;

const reussite: ActionRoue = async () => ({ ok: true as const, data: undefined });

const updateWheel = vi.fn(reussite);
const updateWheelStyle = vi.fn(reussite);
const updateWheelSchedule = vi.fn(reussite);
vi.mock("@/actions/prizes", () => ({
  updateWheel,
  updateWheelStyle,
  updateWheelSchedule,
  addPrize: vi.fn(),
  updatePrize: vi.fn(),
  deletePrize: vi.fn(),
  createWheel: vi.fn(),
  deleteWheel: vi.fn(),
}));
vi.mock("@/actions/campaigns", () => ({
  updateCampaignPrejeuInvitation: vi.fn(),
  updateCampaignShareInvite: vi.fn(),
  updateCampaignClaim: vi.fn(),
}));
vi.mock("@/actions/referral", () => ({ saveReferralProgram: vi.fn() }));
vi.mock("@/actions/preview", () => ({ previewSpin: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { RoueStudio } = await import("@/components/wheel/roue-studio");

import {
  ETAPES_STUDIO_ROUE,
  libelleEtapeStudioRoue,
} from "@/components/wheel/studio/etapes";
import type { RoueDuStudio } from "@/components/wheel/roue-studio";
import type { Campaign, Prize, Wheel } from "@/types/database";

/**
 * LA CHARGE UTILE DU STUDIO DE LA ROUE EST COMPLÈTE, SUR SES NEUF ÉTAPES.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-46) ──
 *
 * `updateWheelSchema` exige `id`, `game_type` ET `play_limit` ensemble : un
 * champ requis non rendu arrive en `null` et l'action refuse. C'est écrit noir
 * sur blanc dans `wheel-settings.tsx` — « Les scinder aurait obligé à reposter
 * en caché ce qu'une autre étape règle » — et c'est la raison pour laquelle
 * l'atelier n'a jamais séparé la mécanique de la limite de participation.
 *
 * Le découper en neuf rouvre ce piège : une étape qu'on quitte est DÉMONTÉE,
 * donc ses champs disparaissent du formulaire. La parade est structurelle —
 * aucun contrôle visible ne porte de `name`, et `ChampsCachesRoue` rend la
 * charge EN ENTIER depuis l'état. Ce fichier le vérifie sur le rendu RÉEL de
 * chaque étape, parce que « c'est structurel » est une intention tant qu'aucune
 * garde ne la tient.
 */

const CAMPAGNE = {
  id: "camp-1",
  organization_id: "org-1",
  name: "Roue du comptoir",
  status: "draft",
  starts_at: null,
  ends_at: null,
  auto_schedule: false,
  budget_cents: null,
  paused_reason: null,
  prejeu_invitation: false,
  share_enabled: false,
  collect_email: false,
  collect_phone: false,
  code_ttl_days: null,
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
  // unsafe-cast-justification: fixture partielle — seuls les champs lus par le studio sont posés
} as unknown as Campaign;

function lot(patch: Partial<Prize> & { id: string }): Prize {
  return {
    organization_id: "org-1",
    wheel_id: "roue-1",
    label: "Café offert",
    description: null,
    color: "#f59e0b",
    weight: 40,
    stock: null,
    is_losing: false,
    is_active: true,
    position: 0,
    icon: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...patch,
    // unsafe-cast-justification: fixture partielle — seuls les champs lus par l'éditeur de lots sont posés
  } as unknown as Prize;
}

function roue(patch: Partial<Wheel> & { id: string; name: string }): Wheel {
  return {
    organization_id: "org-1",
    campaign_id: "camp-1",
    game_type: "wheel",
    play_limit: "once",
    skill_config: null,
    style: {},
    position: 0,
    schedule_start_hour: null,
    schedule_end_hour: null,
    schedule_days: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...patch,
    // unsafe-cast-justification: fixture partielle — seuls les champs lus par le studio sont posés
  } as unknown as Wheel;
}

const ROUES: RoueDuStudio[] = [
  {
    roue: roue({ id: "roue-1", name: "Roue du midi" }),
    lots: [
      lot({ id: "lot-1" }),
      lot({ id: "lot-2", label: "Perdu", is_losing: true, weight: 60, position: 1 }),
    ],
  },
];

/** Les QUATRE champs que `updateWheel` lit dans le `FormData`. */
const CHAMPS_ATTENDUS = ["id", "game_type", "play_limit", "skill_config"];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient neuf fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO_ROUE)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioRoue(cle) }),
  );
}

function rendre(
  patch: { peutEditer?: boolean; roues?: RoueDuStudio[] } = {},
) {
  return render(
    <RoueStudio
      campagne={CAMPAGNE}
      roues={patch.roues ?? ROUES}
      aDesLiens
      programmeParrainage={null}
      parrainageDisponible
      qrExistant
      organizationName="Le Comptoir"
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

function formulaireReglages(container: HTMLElement): HTMLFormElement {
  return container.querySelector<HTMLFormElement>("form#studio-roue-reglages")!;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("studio roue — la charge utile ne dépend pas de l'étape ouverte", () => {
  // NEUF, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou en
  // perdre une — laisserait cette suite verte en couvrant une étape de moins :
  // elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte neuf étapes", () => {
    expect(ETAPES_STUDIO_ROUE).toHaveLength(9);
  });

  it.each(ETAPES_STUDIO_ROUE.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les quatre champs de l'action",
    (cle, titre) => {
      const { container } = rendre();
      allerA(cle);

      const noms = new Set(
        [...formulaireReglages(container).querySelectorAll("[name]")].map((n) =>
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

  it.each(ETAPES_STUDIO_ROUE.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // partirait amputé sans que rien ne le signale.
      const { container } = rendre();
      allerA(cle);

      const visibles = [
        ...formulaireReglages(container).querySelectorAll("[name]"),
      ].filter((n) => n.getAttribute("type") !== "hidden");

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde suivante ne prouve rien", () => {
    // L'étape « Les gains » en apporte un PAR LOT, plus celui d'ajout. Sans
    // cette assertion, « aucun formulaire imbriqué » serait trivialement vrai
    // sur un écran qui n'en aurait qu'un.
    const { container } = rendre();
    allerA("lots");
    expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
  });

  it.each(ETAPES_STUDIO_ROUE.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne CONTIENT aucun autre formulaire",
    (cle) => {
      // Un `<form>` dans un `<form>` fait échouer l'hydratation et tue toute
      // l'interactivité de l'écran — défaut livré en VIT-16. C'est la raison
      // pour laquelle la colonne de réglages n'est JAMAIS enveloppée dans un
      // formulaire : l'éditeur de lots en pose un par ligne.
      const { container } = rendre();
      allerA(cle);
      expect(container.querySelectorAll("form form")).toHaveLength(0);
    },
  );

  it("le bouton Enregistrer vise le formulaire des réglages par son identifiant", () => {
    const { container } = rendre();
    const bouton = screen.getByRole("button", { name: "Enregistrer" });
    const cible = bouton.getAttribute("form");
    expect(cible).toBe("studio-roue-reglages");
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });

  it("le sélecteur multi-roues n'apparaît QUE s'il y a plusieurs jeux", () => {
    rendre();
    expect(screen.queryByLabelText("Le jeu que je règle")).toBeNull();

    cleanup();
    rendre({
      roues: [
        ...ROUES,
        { roue: roue({ id: "roue-2", name: "Roue du soir" }), lots: [] },
      ],
    });
    expect(screen.getByLabelText("Le jeu que je règle")).toBeTruthy();
  });
});

/**
 * L'HABILLAGE COUPÉ EN DEUX ÉTAPES NE S'EFFACE PAS LUI-MÊME.
 *
 * `updateWheelStyle` REMPLACE la colonne `style` : l'éditeur lui envoie l'objet
 * entier en JSON. Deux étapes d'habillage rendues avec deux formulaires — ou
 * construisant chacune leur charge — et la seconde efface la première, en
 * silence, sur une action qui répond « Enregistré ».
 *
 * C'est le motif de `composerTheme` en VIT-19 : la FUSION se fait dans l'ÉTAT,
 * jamais à la reconstruction. Cette garde le prouve sur le rendu réel — un fond
 * choisi sur « L'habillage », une ambiance changée sur « Les couleurs », et les
 * DEUX doivent se retrouver dans le MÊME envoi.
 */
describe("studio roue — deux étapes d'habillage, un seul style", () => {
  it("un fond posé à l'étape « L'habillage » survit à un réglage de « Les couleurs »", async () => {
    vi.useFakeTimers();
    try {
      rendre();

      allerA("allure");
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Football"));
      });

      allerA("couleurs");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Ambiance"), {
          target: { value: "kermesse" },
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(updateWheelStyle).toHaveBeenCalled();
      const donnees = updateWheelStyle.mock.calls.at(-1)![1];
      const style = JSON.parse(String(donnees.get("style"))) as {
        fond?: string;
        pageTheme?: string;
      };

      expect(
        style.pageTheme,
        "l'ambiance réglée sur « Les couleurs » n'est pas partie",
      ).toBe("kermesse");
      expect(
        style.fond,
        "le fond choisi sur « L'habillage » a été EFFACÉ par l'étape suivante — c'est exactement le défaut que cette garde existe pour fermer",
      ).toBe("football");
    } finally {
      vi.useRealTimers();
    }
  });

  it("le style envoyé porte l'objet COMPLET, pas seulement ce qui a changé", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("couleurs");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Ambiance"), {
          target: { value: "kermesse" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      const donnees = updateWheelStyle.mock.calls.at(-1)![1];
      const style = JSON.parse(String(donnees.get("style"))) as Record<
        string,
        unknown
      >;
      // Les couleurs de la roue vivent sur la MÊME étape, mais rien ne les a
      // touchées : elles doivent quand même partir, sinon `updateWheelStyle`
      // les remettrait à leur défaut au premier réglage de page.
      for (const cle of ["ring", "pointer", "hub", "bgFrom", "buttonFrom"]) {
        expect(style, `réglage absent de la charge : ${cle}`).toHaveProperty(cle);
      }
      expect(donnees.get("id")).toBe("roue-1");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * L'ENREGISTREMENT AUTOMATIQUE, ET LES TROIS CANAUX QU'IL PILOTE.
 */
describe("studio roue — l'enregistrement automatique", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateWheel,
        "le simple affichage a écrit en base la mécanique et la limite",
      ).not.toHaveBeenCalled();
      expect(updateWheelStyle).not.toHaveBeenCalled();
      expect(updateWheelSchedule).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer la limite de participation enregistre TOUT SEUL, avec la mécanique", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Chaque client peut jouer"), {
          target: { value: "daily" },
        });
      });
      // Avant le délai, rien n'est parti : partir à chaque frappe rendrait
      // l'écran inutilisable.
      expect(updateWheel).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(updateWheel).toHaveBeenCalled();
      const donnees = updateWheel.mock.calls.at(-1)![1];
      expect(donnees.get("play_limit")).toBe("daily");
      // LA MÉCANIQUE PART AVEC, alors que personne ne l'a touchée : le schéma
      // les exige ENSEMBLE, et une charge amputée serait refusée.
      expect(donnees.get("game_type")).toBe("wheel");
      expect(donnees.get("id")).toBe("roue-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer de mécanique pour un jeu à secret retire « Illimité » avant le refus serveur", async () => {
    vi.useFakeTimers();
    try {
      rendre({
        roues: [
          {
            roue: roue({
              id: "roue-1",
              name: "Roue du midi",
              play_limit: "unlimited",
            }),
            lots: [],
          },
        ],
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("radio", { name: /Mot mystère/ }));
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      const donnees = updateWheel.mock.calls.at(-1)![1];
      expect(donnees.get("game_type")).toBe("mystery_word");
      expect(
        donnees.get("play_limit"),
        "« Illimité » est parti sur un jeu à secret : le serveur l'aurait refusé APRÈS coup",
      ).toBe("once");
    } finally {
      vi.useRealTimers();
    }
  });

  it("le créneau ne part pas tant qu'une seule borne est posée", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("creneau");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Début"), {
          target: { value: "17" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateWheelSchedule,
        "une écriture vouée au refus est partie entre les deux clics du commerçant",
      ).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.change(screen.getByLabelText("Fin"), {
          target: { value: "19" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(updateWheelSchedule).toHaveBeenCalled();
      const donnees = updateWheelSchedule.mock.calls.at(-1)![1];
      expect(donnees.get("schedule_start_hour")).toBe("17");
      expect(donnees.get("schedule_end_hour")).toBe("19");
    } finally {
      vi.useRealTimers();
    }
  });

  it("les jours cochés partent en LISTE — l'action les lit par `getAll`", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("creneau");
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Sam"));
      });
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Dim"));
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      const donnees = updateWheelSchedule.mock.calls.at(-1)![1];
      // 0 = dimanche, 6 = samedi ; triés, parce que la signature l'est.
      expect(donnees.getAll("schedule_days")).toEqual(["0", "6"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sans droit d'édition, rien ne part et le bouton disparaît", async () => {
    vi.useFakeTimers();
    try {
      rendre({ peutEditer: false });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(updateWheel).not.toHaveBeenCalled();
      expect(updateWheelStyle).not.toHaveBeenCalled();
      expect(updateWheelSchedule).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
