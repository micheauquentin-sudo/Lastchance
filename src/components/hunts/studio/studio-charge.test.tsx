// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// L'action REND un succès : l'enregistrement automatique lit son verdict pour
// afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait
// `undefined`, que `useActionForm` traiterait comme une réponse illisible.
//
// TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
// réellement les sept étapes, donc montent l'éditeur d'étapes, les affiches,
// les contrôles de statut ET l'aperçu — qui est la vraie page joueur. Aucune
// n'est APPELÉE par un rendu, mais toutes doivent exister à l'import.
// La signature est celle de l'action — deux arguments — et pas un `vi.fn()`
// nu : c'est ce qui rend `mock.calls[0][1]` typé, donc la garde sur la CHARGE
// UTILE écrite plus bas possible.
const updateHunt = vi.fn<
  (prev: unknown, formData: FormData) => Promise<{
    ok: true;
    data: undefined;
  }>
>(async () => ({ ok: true, data: undefined }));
vi.mock("@/actions/hunts", () => ({
  updateHunt,
  createHuntStep: vi.fn(),
  updateHuntStep: vi.fn(),
  deleteHuntStep: vi.fn(),
  reorderHuntSteps: vi.fn(),
  setHuntStatus: vi.fn(),
  deleteHunt: vi.fn(),
  stampHuntStep: vi.fn(),
  claimHuntReward: vi.fn(),
}));
vi.mock("@/actions/qr-distribution", () => ({
  ensureQrDistributionAsset: vi.fn(),
  getQrDistributionAsset: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("@/actions/loyalty", () => ({ invitationPasseport: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ChasseStudio } = await import("@/components/hunts/chasse-studio");

import {
  ETAPES_STUDIO_CHASSE,
  libelleEtapeStudioChasse,
} from "@/components/hunts/studio/etapes";
import type { Hunt, HuntStep } from "@/types/database";

/**
 * LA CHARGE UTILE DU STUDIO DE LA CHASSE EST COMPLÈTE, SUR SES SEPT ÉTAPES.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-40) ──
 *
 * `updateHunt` lit NEUF champs d'un seul `FormData` et réécrit la ligne en
 * bloc : un champ absent est ÉCRASÉ. C'est la raison pour laquelle l'atelier
 * historique empile le nom, l'ordre, le délai, la fenêtre de jeu et le lot
 * final sur une seule étape — « La chasse et son lot ».
 *
 * Le découper en sept rouvre ce piège sous sa pire forme : une étape qu'on
 * quitte est DÉMONTÉE, donc ses champs disparaissent du formulaire, donc
 * enregistrer depuis « Le lot final » effacerait l'ordre réglé sur « Dans quel
 * ordre on joue ». Rien ne le signalerait — l'action répondrait
 * « Enregistré. » et la chasse changerait de règle sans qu'on sache pourquoi.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name` de
 * réglage, et `ChampsCachesChasse` rend la charge EN ENTIER depuis l'état. Ce
 * fichier le vérifie sur le rendu RÉEL de chaque étape, parce que « c'est
 * structurel » est une intention tant qu'aucune garde ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CHASSE = {
  id: "hunt-1",
  organization_id: "org-1",
  name: "La chasse du quartier",
  status: "draft",
  starts_at: null,
  ends_at: null,
  order_mode: "free",
  min_scan_interval_seconds: 30,
  reward_label: "Un dessert offert",
  reward_details: null,
  reward_stock: null,
  reward_claimed_count: 0,
  code_ttl_days: null,
  created_at: "2026-08-01T10:00:00.000Z",
  // unsafe-cast-justification: fixture partielle — seuls les champs lus par le studio sont posés
} as unknown as Hunt;

const ETAPES: HuntStep[] = [
  {
    id: "step-1",
    hunt_id: "hunt-1",
    organization_id: "org-1",
    position: 1,
    label: "Le comptoir",
    hint_text: "Cherche près de la vitrine…",
    token: "aaaaaaaaaaaaaaaa",
    created_at: "2026-08-01T10:00:00.000Z",
    // unsafe-cast-justification: fixture partielle — seuls les champs lus par le studio sont posés
  } as unknown as HuntStep,
  {
    id: "step-2",
    hunt_id: "hunt-1",
    organization_id: "org-1",
    position: 2,
    label: "La terrasse",
    hint_text: null,
    token: "bbbbbbbbbbbbbbbb",
    created_at: "2026-08-01T10:00:00.000Z",
    // unsafe-cast-justification: fixture partielle — seuls les champs lus par le studio sont posés
  } as unknown as HuntStep,
];

/** Les NEUF champs que `updateHunt` lit dans le `FormData`, plus `id`. */
const CHAMPS_ATTENDUS = [
  "id",
  "name",
  "order_mode",
  "min_scan_interval_seconds",
  "reward_label",
  "reward_details",
  "reward_stock",
  "starts_at",
  "ends_at",
  "code_ttl_days",
];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient sept fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO_CHASSE)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioChasse(cle) }),
  );
}

function rendre(patch: { peutEditer?: boolean } = {}) {
  return render(
    <ChasseStudio
      hunt={CHASSE}
      steps={ETAPES}
      posterSteps={ETAPES.map((e) => ({
        id: e.id,
        position: e.position,
        label: e.label,
        token: e.token,
        url: `https://exemple.test/hunt/${e.token}`,
        opens: 0,
      }))}
      entreeVerification={{
        huntId: "hunt-1",
        rewardLabel: "Un dessert offert",
        rewardStock: null,
        rewardClaimedCount: 0,
        stepCount: ETAPES.length,
        endsAt: null,
      }}
      timeZone="Europe/Paris"
      organizationName="Le Comptoir"
      organizationId="org-1"
      logoUrl={null}
      publicUrl="https://exemple.test/hunt/aaaaaaaaaaaaaaaa"
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

describe("studio chasse — la charge utile ne dépend pas de l'étape ouverte", () => {
  // SEPT, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou
  // en perdre une — laisserait cette suite verte en couvrant une étape de
  // moins : elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte sept étapes", () => {
    expect(ETAPES_STUDIO_CHASSE).toHaveLength(7);
  });

  it.each(ETAPES_STUDIO_CHASSE.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les neuf champs de l'action",
    (cle, titre) => {
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector("form#studio-chasse-reglages")!;
      const noms = new Set(
        [...formulaire.querySelectorAll("[name]")].map((n) =>
          n.getAttribute("name"),
        ),
      );
      for (const champ of CHAMPS_ATTENDUS) {
        expect(noms, `champ absent sur l'étape « ${titre} » : ${champ}`).toContain(
          champ,
        );
      }
    },
  );

  it.each(ETAPES_STUDIO_CHASSE.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // effacerait la colonne sans que rien ne le signale.
      //
      // L'assertion vise le formulaire des RÉGLAGES et lui seul : ceux des
      // étapes de la chasse et du statut ont bien des champs visibles nommés,
      // et c'est normal — ils appartiennent à leurs propres actions, atomiques.
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector("form#studio-chasse-reglages")!;
      const visibles = [...formulaire.querySelectorAll("[name]")].filter(
        (n) => n.getAttribute("type") !== "hidden",
      );

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde suivante ne prouve rien", () => {
    // L'étape des libellés apporte les siens : un formulaire d'édition ET un de
    // suppression PAR étape, plus celui d'ajout. Sans cette assertion, « aucun
    // formulaire imbriqué » serait trivialement vrai sur un écran qui n'en
    // aurait qu'un.
    const { container } = rendre();
    allerA("etapes");
    expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
  });

  it.each(ETAPES_STUDIO_CHASSE.map((e) => [e.cle] as const))(
    "étape « %s » : aucun formulaire imbriqué dans un autre",
    (cle) => {
      // Un `<form>` dans un `<form>` fait échouer l'hydratation et tue toute
      // l'interactivité de l'écran — défaut livré en VIT-16. Les deux
      // formulaires frères d'une ligne d'étape (édition, suppression) sont
      // exactement le piège que cette garde surveille.
      const { container } = rendre();
      allerA(cle);
      expect(container.querySelectorAll("form form")).toHaveLength(0);
    },
  );

  it("le bouton Enregistrer vise le formulaire des réglages par son identifiant", () => {
    const { container } = rendre();
    const bouton = screen.getByRole("button", { name: "Enregistrer" });
    const cible = bouton.getAttribute("form");
    expect(cible).toBe("studio-chasse-reglages");
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });
});

/**
 * LES DEUX VISAGES DE L'ÉDITEUR D'ÉTAPES, ET LE CHAMP QU'ON NE VOIT PAS.
 *
 * `updateHuntStep` écrit `label` ET `hint_text` en bloc, un cran plus bas que
 * `updateHunt`. Séparer les libellés des indices en deux étapes du studio
 * rouvre donc le MÊME piège : renommer une étape depuis « Mes étapes »
 * effacerait son indice si le formulaire ne portait plus que `label`.
 */
describe("studio chasse — libellés et indices, sans effacement croisé", () => {
  it("« Mes étapes » montre le libellé et envoie quand même l'indice", () => {
    const { container } = rendre();
    allerA("etapes");

    const ligne = container.querySelector("form#studio-chasse-reglages")
      ? [...container.querySelectorAll("form")].find((f) =>
          f.querySelector('input[name="label"]'),
        )
      : null;
    expect(ligne, "aucun formulaire d'étape trouvé").toBeTruthy();

    const label = ligne!.querySelector('input[name="label"]')!;
    const hint = ligne!.querySelector('input[name="hint"]')!;
    expect(label.getAttribute("type")).not.toBe("hidden");
    expect(hint.getAttribute("type"), "l'indice ne partirait pas").toBe("hidden");
    expect(hint.getAttribute("value")).toBe("Cherche près de la vitrine…");
  });

  it("« Les indices » montre l'indice et envoie quand même le libellé", () => {
    const { container } = rendre();
    allerA("indices");

    const ligne = [...container.querySelectorAll("form")].find((f) =>
      f.querySelector('input[name="hint"]'),
    );
    expect(ligne, "aucun formulaire d'étape trouvé").toBeTruthy();

    const label = ligne!.querySelector('input[name="label"]')!;
    const hint = ligne!.querySelector('input[name="hint"]')!;
    expect(label.getAttribute("type"), "le libellé ne partirait pas").toBe(
      "hidden",
    );
    expect(label.getAttribute("value")).toBe("Le comptoir");
    expect(hint.getAttribute("type")).not.toBe("hidden");
  });

  it("« Les indices » ne rouvre pas l'ordre ni la suppression", () => {
    // Deux endroits pour un même geste, ce sont deux endroits à corriger — et
    // l'ordre optimiste ne vit que dans l'écran qui porte les flèches.
    rendre();
    allerA("indices");
    expect(screen.queryByRole("button", { name: "Monter l'étape 2" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Supprimer l'étape 1" }),
    ).toBeNull();

    cleanup();
    rendre();
    allerA("etapes");
    expect(
      screen.getByRole("button", { name: "Monter l'étape 2" }),
    ).toBeTruthy();
  });
});

/**
 * L'ENREGISTREMENT AUTOMATIQUE, ET SES DEUX GARDES.
 *
 * Le calendrier en a une troisième, propre à sa réduction destructrice de
 * grille. La chasse n'en a pas besoin : `updateHunt` ne détruit rien, et les
 * deux gestes destructeurs du module vivent dans leurs propres formulaires.
 */
describe("studio chasse — l'enregistrement automatique", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(
        updateHunt,
        "le simple affichage a écrit en base — sur une action qui réécrit neuf colonnes en bloc",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer un réglage enregistre TOUT SEUL, après le délai et pas avant", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom de la Chasse au QR"), {
          target: { value: "La chasse du port" },
        });
      });
      // Avant le délai, rien n'est parti : partir à chaque frappe rendrait
      // l'écran inutilisable.
      expect(updateHunt).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(updateHunt).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("un réglage saisi sur une AUTRE étape part avec toute la charge", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("ordre");
      await act(async () => {
        fireEvent.click(screen.getByRole("radio", { name: /Imposé/ }));
      });
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(updateHunt).toHaveBeenCalled();

      // C'EST L'ASSERTION QUI COMPTE : la charge reçue par l'action porte le
      // NOM, réglé sur une étape qui n'est même plus à l'écran. Sans les champs
      // cachés, `name` manquerait et la colonne serait écrasée.
      const formData = updateHunt.mock.calls[0][1];
      expect(formData.get("order_mode")).toBe("ordered");
      expect(formData.get("name")).toBe("La chasse du quartier");
      expect(formData.get("reward_label")).toBe("Un dessert offert");
      expect(formData.has("code_ttl_days")).toBe(true);
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
      expect(updateHunt).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * L'APERÇU EST LA VRAIE PAGE, ET IL NE PARLE PAS AU SERVEUR.
 *
 * `hunt-journey.tsx` n'importe que deux actions — `stampHuntStep` et
 * `claimHuntReward`. La première est atteignable dans l'aperçu (le bouton
 * « Valider mon passage » est à l'écran) ; c'est celle-ci qu'on tient. La
 * seconde n'existe qu'avec un code gagné, donc jamais ici.
 */
describe("studio chasse — l'aperçu ne tamponne rien", () => {
  it("« Valider mon passage » est bien à l'écran, et n'appelle pas l'action", async () => {
    const { stampHuntStep } = await import("@/actions/hunts");
    rendre();

    const bouton = screen.getByRole("button", { name: "Valider mon passage" });
    await act(async () => {
      fireEvent.click(bouton);
    });

    expect(
      stampHuntStep,
      "l'aperçu a tamponné : un passage gravé, et le dernier de la série brûlerait un lot du stock",
    ).not.toHaveBeenCalled();
  });

  it("l'aperçu montre l'étape choisie dans le sélecteur", async () => {
    rendre();
    // La première étape par défaut…
    expect(screen.getByText("Le comptoir")).toBeTruthy();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("L'étape que je regarde"), {
        target: { value: "2" },
      });
    });
    expect(screen.getByText("La terrasse")).toBeTruthy();
  });

  it("la progression de l'aperçu part de zéro tampon", () => {
    rendre();
    // Deux étapes, aucune tamponnée : la carte de fidélité le dit, et aucun
    // code de retrait n'est fabriqué.
    expect(
      screen.getByLabelText("Progression : 0 étape sur 2"),
    ).toBeTruthy();
    expect(screen.queryByText("Votre code de retrait")).toBeNull();
  });
});
