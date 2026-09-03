// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions RENDENT un succès : l'enregistrement automatique lit leur verdict
 * pour afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait
 * `undefined`, que `useActionForm` traiterait comme une réponse illisible.
 *
 * TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
 * réellement les huit étapes, donc montent l'éditeur de paliers, les cartes de
 * commande ET l'aperçu — qui est la vraie carte du joueur. Aucune n'est APPELÉE
 * par un rendu, mais toutes doivent exister à l'import.
 *
 * Les trois signatures qui comptent sont DÉCLARÉES et non déduites : c'est ce
 * qui rend `mock.calls[0][1]` typé, donc les assertions sur la charge utile
 * lisibles sans conversion.
 */
type ActionFormData = (
  prev: unknown,
  formData: FormData,
) => Promise<{ ok: true; data: undefined }>;

const ok = async () => ({ ok: true as const, data: undefined });

const updateLoyaltyProgram = vi.fn<ActionFormData>(ok);
const updateLoyaltyProgramStyle = vi.fn<ActionFormData>(ok);
const updateLoyaltyProgramReferral = vi.fn<ActionFormData>(ok);

vi.mock("@/actions/loyalty", () => ({
  updateLoyaltyProgram,
  updateLoyaltyProgramStyle,
  updateLoyaltyProgramReferral,
  createLoyaltyProgram: vi.fn(),
  deleteLoyaltyProgram: vi.fn(),
  setLoyaltyProgramStatus: vi.fn(),
  createLoyaltyMilestone: vi.fn(),
  updateLoyaltyMilestone: vi.fn(),
  deleteLoyaltyMilestone: vi.fn(),
  createLoyaltyOrderCodes: vi.fn(),
  getLoyaltyCounterCode: vi.fn(),
  stampLoyaltyVisitStaff: vi.fn(),
  getLoyaltyCheckinToken: vi.fn(),
  stampLoyaltyVisit: vi.fn(),
  stampLoyaltyOrder: vi.fn(),
  spendLoyaltyPoints: vi.fn(),
  consumeLoyaltySpin: vi.fn(),
  obtenirCodeParrainage: vi.fn(),
  reclamerParrainagePasseport: vi.fn(),
  invitationPasseport: vi.fn(),
  enregistrerIdentitePasseport: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { PasseportStudio } = await import(
  "@/components/loyalty/passeport-studio"
);

import {
  ETAPES_STUDIO_FIDELITE,
  libelleEtapeStudioFidelite,
} from "@/components/loyalty/studio/etapes";
import type { LoyaltyMilestone, LoyaltyProgram } from "@/types/database";

/**
 * LA CHARGE UTILE DU STUDIO DU PASSEPORT EST COMPLÈTE, SUR SES HUIT ÉTAPES.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-42) ──
 *
 * `updateLoyaltyProgram` fait un `.update()` de TOUTES les colonnes de son
 * schéma : un champ absent du formulaire arrive à `null`, ce que
 * `tierThresholdSchema` refuse — et qu'une borne plus permissive aurait écrasé
 * à 0 en silence.
 *
 * C'est exactement pour cela que l'atelier fait poster à `LoyaltySettings` les
 * seuils qu'il n'affiche pas, et à `LoyaltyTiersForm` le nom, le mode, la
 * rotation, la fréquence et le jackpot qu'il n'affiche pas non plus. DEUX
 * MIROIRS, tenus d'accord par une seule phrase écrite dans le code : « ils
 * vivent sur des étapes différentes, jamais à l'écran ensemble ».
 *
 * Un studio les met sur le MÊME écran, avec enregistrement automatique : les
 * miroirs deviendraient deux ÉCRIVAINS CONCURRENTS sur les mêmes colonnes,
 * chacun postant une copie figée de la part de l'autre, et le dernier arrivé
 * gagnerait — sans un mot, sur un écran affichant « Modifications
 * enregistrées ».
 *
 * La parade est structurelle : un seul état, aucun contrôle visible portant de
 * `name`, `ChampsCachesFidelite` qui rend la charge EN ENTIER. Ce fichier le
 * vérifie sur le rendu RÉEL de chaque étape, parce que « c'est structurel » est
 * une intention tant qu'aucune garde ne la tient — et il vérifie AUSSI qu'il
 * n'existe qu'UN SEUL porteur par colonne, ce qui est la mesure exacte du
 * défaut qu'on vient de fermer.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PROGRAMME = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  organization_id: "bbbbbbbb-0000-4000-8000-000000000001",
  jackpot_campaign_id: null,
  name: "La carte du comptoir",
  status: "draft",
  validation_mode: "rotating_code",
  rotating_secret: null,
  rotating_period_seconds: 60,
  min_stamp_interval_seconds: 900,
  silver_threshold: 500,
  gold_threshold: 1500,
  code_ttl_days: null,
  style: null,
  referral_enabled: true,
  referral_sponsor_points: 300,
  referral_filleul_points: 100,
  referral_max_filleuls: 10,
  referral_window_days: 30,
  created_at: "2026-01-01T00:00:00.000Z",
  // unsafe-cast-justification: fixture de test, colonnes serveur (rotating_secret) hors du littéral
} as unknown as LoyaltyProgram;

const PALIERS = [
  {
    id: "cccccccc-0000-4000-8000-000000000001",
    organization_id: PROGRAMME.organization_id,
    program_id: PROGRAMME.id,
    visit_count: 5,
    cost_points: 500,
    reward_type: "lot",
    reward_label: "Un café offert",
    reward_details: null,
    reward_stock: 20,
    reward_claimed_count: 0,
    target_wheel_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  // unsafe-cast-justification: fixture de test, colonnes dérivées du trigger hors du littéral
] as unknown as LoyaltyMilestone[];

/** Les NEUF champs que `updateLoyaltyProgram` lit dans le `FormData`. */
const CHAMPS_REGLAGES = [
  "id",
  "name",
  "validation_mode",
  "rotating_period_seconds",
  "min_stamp_interval_seconds",
  "silver_threshold",
  "gold_threshold",
  "jackpot_campaign_id",
  "code_ttl_days",
];

/** Les CINQ colonnes qu'`updateLoyaltyProgramReferral` écrit en bloc, plus l'id. */
const CHAMPS_PARRAINAGE = [
  "id",
  "referral_enabled",
  "referral_sponsor_points",
  "referral_filleul_points",
  "referral_max_filleuls",
  "referral_window_days",
];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient huit fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO_FIDELITE)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioFidelite(cle) }),
  );
}

function rendre(patch: { peutEditer?: boolean } = {}) {
  return render(
    <PasseportStudio
      program={PROGRAMME}
      paliers={PALIERS}
      paliersVue={PALIERS.map((m) => ({
        id: m.id,
        visitCount: m.visit_count,
        costPoints: m.cost_points ?? 0,
        rewardType: m.reward_type,
        rewardLabel: m.reward_label,
        rewardDetails: m.reward_details,
        targetWheelId: m.target_wheel_id,
        soldOut: false,
      }))}
      roues={[]}
      jackpots={[]}
      cartes={[]}
      plafondCartes={200}
      entreeVerification={{
        programId: PROGRAMME.id,
        paliers: PALIERS.map((m) => ({
          id: m.id,
          visitCount: m.visit_count,
          rewardType: m.reward_type,
          rewardLabel: m.reward_label,
          rewardStock: m.reward_stock,
          targetWheelId: m.target_wheel_id,
        })),
        roues: [],
      }}
      organizationName="Le Comptoir"
      logoUrl={null}
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

const FORMULAIRE = "form#studio-fidelite-reglages";

describe("studio passeport — la charge utile ne dépend pas de l'étape ouverte", () => {
  // HUIT, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou en
  // perdre une — laisserait cette suite verte en couvrant une étape de moins :
  // elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte huit étapes", () => {
    expect(ETAPES_STUDIO_FIDELITE).toHaveLength(8);
  });

  it.each(ETAPES_STUDIO_FIDELITE.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les neuf champs de l'action",
    (cle, titre) => {
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector(FORMULAIRE)!;
      const noms = new Set(
        [...formulaire.querySelectorAll("[name]")].map((n) =>
          n.getAttribute("name"),
        ),
      );
      for (const champ of CHAMPS_REGLAGES) {
        expect(
          noms,
          `champ absent sur l'étape « ${titre} » : ${champ}`,
        ).toContain(champ);
      }
    },
  );

  it.each(ETAPES_STUDIO_FIDELITE.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // effacerait la colonne sans que rien ne le signale.
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector(FORMULAIRE)!;
      const visibles = [...formulaire.querySelectorAll("[name]")].filter(
        (n) => n.getAttribute("type") !== "hidden",
      );

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it.each(ETAPES_STUDIO_FIDELITE.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : chaque colonne du programme n'a QU'UN SEUL porteur dans l'écran",
    (cle, titre) => {
      /**
       * LA GARDE DU PIÈGE CENTRAL — et elle vise l'écran ENTIER, pas le
       * formulaire.
       *
       * Les miroirs cachés de l'atelier (`LoyaltySettings` reposte les seuils,
       * `LoyaltyTiersForm` reposte le nom et le mode) ne se voient pas dans le
       * formulaire des réglages : ils vivraient dans les LEURS. Monter l'un
       * d'eux dans une étape ferait donc réapparaître, quelque part sur l'écran,
       * un SECOND `input[name="silver_threshold"]` — figé sur la valeur serveur,
       * et vainqueur si son formulaire poste en dernier.
       *
       * Compter les porteurs dans tout le document est la seule forme qui
       * l'attrape : elle rougit que le doublon soit dans le formulaire des
       * réglages ou dans un voisin.
       *
       * `id` EST EXCLU, ET C'EST LE SEUL. Ce n'est pas une colonne du programme
       * mais le nom générique que TOUT formulaire du dépôt donne à sa clé : sur
       * l'étape des cadeaux, chaque ligne de palier poste LE SIEN. L'y laisser
       * ferait rougir la garde sur un doublon légitime, et la première réaction
       * serait de la désarmer — ce qui coûterait les huit autres.
       */
      const { container } = rendre();
      allerA(cle);

      const colonnes = CHAMPS_REGLAGES.filter((c) => c !== "id");
      const doublons = colonnes.filter(
        (champ) =>
          container.querySelectorAll(`[name="${champ}"]`).length > 1,
      );
      expect(
        doublons,
        `sur l'étape « ${titre} », ces colonnes ont deux écrivains : ${doublons.join(", ")}`,
      ).toEqual([]);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde suivante ne prouve rien", () => {
    // L'étape des cadeaux apporte les siens : un par palier, plus l'ajout.
    // Sans cette assertion, « aucun formulaire imbriqué » serait trivialement
    // vrai sur un écran qui n'en aurait qu'un.
    const { container } = rendre();
    allerA("cadeaux");
    expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
  });

  it.each(ETAPES_STUDIO_FIDELITE.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne CONTIENT aucun autre formulaire",
    (cle) => {
      // Un `<form>` dans un `<form>` fait échouer l'hydratation et tue toute
      // l'interactivité de l'écran — défaut livré en VIT-16.
      const { container } = rendre();
      allerA(cle);
      expect(container.querySelectorAll("form form")).toHaveLength(0);
    },
  );

  it("le bouton Enregistrer vise le formulaire des réglages par son identifiant", () => {
    const { container } = rendre();
    const bouton = screen.getByRole("button", { name: "Enregistrer" });
    const cible = bouton.getAttribute("form");
    expect(cible).toBe("studio-fidelite-reglages");
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });

  it("« Comment le client valide sa visite » rend l'échéance SANS son champ caché", () => {
    // `CodeTtlDaysField` pose par défaut un `<input hidden name="code_ttl_days">`
    // dans son propre bloc. Ici il vivrait dans une étape DÉMONTABLE, hors du
    // formulaire de réglages : il ne partirait jamais, et `formData.has()` serait
    // faux à chaque enregistrement — l'échéance deviendrait impossible à régler,
    // en silence. Le studio passe donc `champCache={false}` et le rend lui-même.
    const { container } = rendre();
    allerA("validation");
    const champs = [...container.querySelectorAll('input[name="code_ttl_days"]')];
    expect(champs).toHaveLength(1);
    expect(champs[0].closest("form")?.id).toBe("studio-fidelite-reglages");
  });
});

/**
 * LES TROIS CANAUX D'ENREGISTREMENT, ET CE QU'ILS N'EMPORTENT PAS.
 */
describe("studio passeport — l'enregistrement automatique", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateLoyaltyProgram,
        "le simple affichage a écrit en base — sur une action qui réécrit huit colonnes en bloc",
      ).not.toHaveBeenCalled();
      expect(updateLoyaltyProgramStyle).not.toHaveBeenCalled();
      expect(
        updateLoyaltyProgramReferral,
        "le simple affichage a réécrit le barème de parrainage, que le commerçant n'a pas touché",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer le nom enregistre TOUT SEUL, et n'emporte ni l'habillage ni le parrainage", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du programme"), {
          target: { value: "La carte du bar" },
        });
      });
      // Avant le délai, rien n'est parti : partir à chaque frappe rendrait
      // l'écran inutilisable.
      expect(updateLoyaltyProgram).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(updateLoyaltyProgram).toHaveBeenCalledTimes(1);
      expect(updateLoyaltyProgramStyle).not.toHaveBeenCalled();
      expect(updateLoyaltyProgramReferral).not.toHaveBeenCalled();
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
      expect(updateLoyaltyProgram).not.toHaveBeenCalled();
      expect(updateLoyaltyProgramStyle).not.toHaveBeenCalled();
      expect(updateLoyaltyProgramReferral).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * LE PIÈGE CENTRAL, PRIS PAR L'AUTRE BOUT : ce qui PART vraiment.
 *
 * Les deux gardes ci-dessous jouent le geste que l'atelier ne pouvait pas
 * offrir — régler un seuil de niveau sans repasser par l'écran du nom — et
 * vérifient que la charge envoyée porte QUAND MÊME tout le reste, depuis l'état
 * unique. Sans cela, `updateLoyaltyProgram` recevrait un nom nul.
 */
describe("studio passeport — une seule charge, quelle que soit l'étape", () => {
  it("depuis « Les niveaux », le seuil part avec le nom, le mode et la fréquence", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("niveaux");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Seuil argent 🥈 (points)"), {
          target: { value: "800" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateLoyaltyProgram).toHaveBeenCalledTimes(1);
      const charge = updateLoyaltyProgram.mock.calls[0][1];
      for (const champ of CHAMPS_REGLAGES) {
        expect(
          charge.has(champ),
          `champ absent de la charge envoyée depuis « Les niveaux » : ${champ}`,
        ).toBe(true);
      }
      expect(charge.get("silver_threshold")).toBe("800");
      // LE NOM ET LE MODE, QUI VIVENT SUR D'AUTRES ÉTAPES, SONT PARTIS AVEC :
      // c'est toute la question. Sans eux, l'action réécrirait la ligne avec un
      // nom nul, et `programNameSchema` refuserait — ou pire, une borne plus
      // permissive l'aurait vidé.
      expect(charge.get("name")).toBe("La carte du comptoir");
      expect(charge.get("validation_mode")).toBe("rotating_code");
      expect(charge.get("rotating_period_seconds")).toBe("60");
    } finally {
      vi.useRealTimers();
    }
  });

  it("depuis « Le nom du programme », le nom part avec les DEUX seuils de niveau", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du programme"), {
          target: { value: "La carte du bar" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      const charge = updateLoyaltyProgram.mock.calls[0][1];
      expect(charge.get("name")).toBe("La carte du bar");
      // Les seuils vivent sur une AUTRE étape, démontée. Sans eux, l'action les
      // recevrait nuls et `tierThresholdSchema` refuserait tout enregistrement
      // du nom — c'est-à-dire le studio entier, sur son premier écran.
      expect(charge.get("silver_threshold")).toBe("500");
      expect(charge.get("gold_threshold")).toBe("1500");
    } finally {
      vi.useRealTimers();
    }
  });

  it("le parrainage part par SON action, avec ses cinq colonnes", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("parrainage");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Points au parrain"), {
          target: { value: "450" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateLoyaltyProgramReferral).toHaveBeenCalledTimes(1);
      const charge = updateLoyaltyProgramReferral.mock.calls[0][1];
      for (const champ of CHAMPS_PARRAINAGE) {
        expect(
          charge.has(champ),
          `champ absent de la charge de parrainage : ${champ}`,
        ).toBe(true);
      }
      expect(charge.get("referral_sponsor_points")).toBe("450");
      // Les quatre autres colonnes partent avec : `updateLoyaltyProgramReferral`
      // les réécrit en bloc, un barème amputé remettrait les autres à zéro.
      expect(charge.get("referral_filleul_points")).toBe("100");
      expect(charge.get("referral_max_filleuls")).toBe("10");
      expect(charge.get("referral_window_days")).toBe("30");
      expect(charge.get("referral_enabled")).toBe("true");
      // ET SURTOUT : les réglages du programme n'ont pas bougé. Les faire
      // repartir ici rejouerait huit colonnes que personne n'était en train de
      // régler.
      expect(updateLoyaltyProgram).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("choisir un fond part par l'action de l'habillage, et rien d'autre", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("allure");
      const groupe = screen.getByRole("group", {
        name: "Fond d'écran du passeport",
      });
      const fonds = [...groupe.querySelectorAll('input[type="radio"]')];
      // La première tuile est « Aucun » : on prend la suivante, qui est un vrai
      // fond — sinon le clic ne changerait rien et rien ne partirait.
      await act(async () => {
        fireEvent.click(fonds[1]);
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateLoyaltyProgramStyle).toHaveBeenCalledTimes(1);
      const charge = updateLoyaltyProgramStyle.mock.calls[0][1];
      expect(charge.get("id")).toBe(PROGRAMME.id);
      const style = JSON.parse(String(charge.get("style")));
      expect(typeof style.fond).toBe("string");
      // L'habillage a sa propre action PARCE QUE `updateLoyaltyProgram` écrase :
      // les faire partir ensemble annulerait la protection pour laquelle elle a
      // été écrite.
      expect(updateLoyaltyProgram).not.toHaveBeenCalled();
      expect(updateLoyaltyProgramReferral).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
