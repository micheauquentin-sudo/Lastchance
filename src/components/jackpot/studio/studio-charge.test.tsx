// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * L'action REND un succès : l'enregistrement automatique lit son verdict pour
 * afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait `undefined`,
 * que `useActionForm` traiterait comme une réponse illisible.
 *
 * TOUTES les actions du module sont doublées, et c'est nécessaire : ces gardes
 * visitent réellement les huit étapes, donc montent l'aperçu — qui est la vraie
 * page du joueur. Aucune n'est APPELÉE par un rendu, mais toutes doivent exister
 * à l'import.
 */
type ActionFormData = (
  prev: unknown,
  formData: FormData,
) => Promise<{ ok: true; data: undefined }>;

const updateJackpotCampaign = vi.fn<ActionFormData>(async () => ({
  ok: true as const,
  data: undefined,
}));

/**
 * LES TROIS ACTIONS QUE LA PAGE JOUEUR APPELLE, NOMMÉES POUR ÊTRE SURVEILLÉES.
 *
 * L'aperçu monte les VRAIS blocs de `jackpot-tracker.tsx`. La question qui
 * décide si cette réutilisation est saine ou catastrophique est donc : un studio
 * ouvert interroge-t-il la jauge en boucle, ou pire, participe-t-il ? Les
 * garder sous la main permet d'y répondre par une mesure plutôt que par une
 * lecture de code (voir la garde en fin de fichier).
 */
const getJackpotState = vi.fn();
const participateJackpot = vi.fn();
const getJackpotCheckinToken = vi.fn();

vi.mock("@/actions/jackpot", () => ({
  updateJackpotCampaign,
  getJackpotState,
  participateJackpot,
  getJackpotCheckinToken,
  createJackpotCampaign: vi.fn(),
  deleteJackpotCampaign: vi.fn(),
  setJackpotCampaignStatus: vi.fn(),
  getJackpotCounterCode: vi.fn(),
  participateJackpotStaff: vi.fn(),
  redeemJackpotCode: vi.fn(),
  invitationJackpot: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CagnotteStudio } = await import(
  "@/components/jackpot/cagnotte-studio"
);

import {
  ETAPES_STUDIO_CAGNOTTE,
  libelleEtapeStudioCagnotte,
} from "@/components/jackpot/studio/etapes";
import type { JackpotCampaign } from "@/types/database";

/**
 * LA CHARGE UTILE DU STUDIO DE LA CAGNOTTE EST COMPLÈTE, SUR SES HUIT ÉTAPES.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-44) ──
 *
 * `updateJackpotCampaign` fait un `.update(campaignFieldsForMode(...))` de
 * TOUTES ses colonnes. Un champ non rendu n'y est pas « absent » : il prend le
 * DÉFAUT de son schéma, et l'action l'écrit. Trois de ces défauts sont muets, et
 * ce sont les plus coûteux du programme :
 *
 *  · `public_slug` → `null` (`.nullable().default(null)`) : tous les QR déjà
 *    imprimés et collés en vitrine cessent de mener quelque part ;
 *  · `reward_label` → `""` (`texteOptionnel`) : le lot s'efface et l'activation
 *    se bloque ;
 *  · `display_base` / `display_increment` → `0` (`nonRenduVaut(…, 0)`).
 *
 * Rien ne rougit dans les trois cas : le schéma accepte, l'action répond
 * « Enregistré », et elle dit vrai. C'est écrit noir sur blanc dans
 * `atelier-jackpot-etapes.ts`, et c'est la raison pour laquelle la carte de
 * réglages de l'atelier — quinze champs d'un bloc — n'a jamais été découpée.
 *
 * La parade du socle est structurelle : un seul état, aucun contrôle visible
 * portant de `name`, `ChampsCachesCagnotte` qui rend la charge EN ENTIER. Ce
 * fichier le vérifie sur le rendu RÉEL de chaque étape, parce que « c'est
 * structurel » est une intention tant qu'aucune garde ne la tient — et il
 * vérifie AUSSI qu'il n'existe qu'UN SEUL porteur par colonne, ce qui est la
 * mesure exacte du défaut qu'on vient de fermer.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CAMPAGNE = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  organization_id: "bbbbbbbb-0000-4000-8000-000000000001",
  name: "La cagnotte du comptoir",
  status: "draft",
  public_slug: "cagnotte-du-comptoir",
  validation_mode: "rotating_code",
  rotating_period_seconds: 60,
  min_participation_interval_seconds: 900,
  draw_mode: "threshold_draw",
  threshold: 50,
  win_probability: null,
  draw_at: null,
  reward_label: "Un magnum de champagne",
  reward_details: "À retirer au comptoir",
  reward_stock: 3,
  reward_claimed_count: 0,
  display_base_cents: 5000,
  display_increment_cents: 250,
  merchant_content: "Soirée jeudi",
  current_count: 0,
  cycle: 1,
  code_ttl_days: null,
  created_at: "2026-01-01T00:00:00.000Z",
  // unsafe-cast-justification: fixture de test, colonnes serveur (rotating_secret) hors du littéral
} as unknown as JackpotCampaign;

/**
 * LES DIX-SEPT CHAMPS QUE `updateJackpotCampaign` LIT DANS LE `FormData`.
 *
 * La liste est celle du `safeParse` de l'action, dans son ordre, et non celle
 * des colonnes : `display_base` et `display_increment` s'appellent
 * `display_base_cents` / `display_increment_cents` en base, et `code_ttl_days`
 * n'est écrit que si le formulaire le PORTE. C'est le nom de FORMULAIRE qui
 * décide de ce qui arrive au schéma, donc c'est lui qu'on garde.
 */
const CHAMPS_REGLAGES = [
  "id",
  "name",
  "public_slug",
  "validation_mode",
  "rotating_period_seconds",
  "min_participation_interval_seconds",
  "draw_mode",
  "threshold",
  "win_probability",
  "draw_at",
  "reward_label",
  "reward_details",
  "reward_stock",
  "display_base",
  "display_increment",
  "merchant_content",
  "code_ttl_days",
];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient huit fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO_CAGNOTTE)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioCagnotte(cle) }),
  );
}

function rendre(patch: { peutEditer?: boolean } = {}) {
  return render(
    <CagnotteStudio
      campaign={CAMPAGNE}
      entreeVerification={{
        draw_mode: CAMPAGNE.draw_mode,
        threshold: CAMPAGNE.threshold,
        draw_at: CAMPAGNE.draw_at,
        reward_stock: CAMPAGNE.reward_stock,
        reward_label: CAMPAGNE.reward_label,
        status: CAMPAGNE.status,
        validation_mode: CAMPAGNE.validation_mode,
        public_slug: CAMPAGNE.public_slug,
        code_ttl_days: CAMPAGNE.code_ttl_days,
      }}
      organizationName="Le Comptoir"
      logoUrl={null}
      timeZone="Europe/Paris"
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

const FORMULAIRE = "form#studio-cagnotte-reglages";

describe("studio cagnotte — la charge utile ne dépend pas de l'étape ouverte", () => {
  // HUIT, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou en
  // perdre une — laisserait cette suite verte en couvrant une étape de moins :
  // elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte huit étapes", () => {
    expect(ETAPES_STUDIO_CAGNOTTE).toHaveLength(8);
  });

  it.each(ETAPES_STUDIO_CAGNOTTE.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les dix-sept champs de l'action",
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

  it.each(ETAPES_STUDIO_CAGNOTTE.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // écrirait le défaut du schéma à sa place, sans que rien ne le signale.
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector(FORMULAIRE)!;
      const visibles = [...formulaire.querySelectorAll("[name]")].filter(
        (n) => n.getAttribute("type") !== "hidden",
      );

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it.each(ETAPES_STUDIO_CAGNOTTE.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : chaque colonne de la campagne n'a QU'UN SEUL porteur dans l'écran",
    (cle, titre) => {
      /**
       * LA GARDE DU PIÈGE CENTRAL — et elle vise l'écran ENTIER, pas le
       * formulaire.
       *
       * Un miroir caché ne se verrait pas dans le formulaire des réglages : il
       * vivrait dans le SIEN. Amener un bloc de l'atelier dans une étape ferait
       * donc réapparaître, quelque part sur l'écran, un second
       * `input[name="public_slug"]` — figé sur la valeur serveur, et vainqueur
       * si son formulaire poste en dernier.
       *
       * Compter les porteurs dans tout le document est la seule forme qui
       * l'attrape : elle rougit que le doublon soit dans le formulaire des
       * réglages ou dans un voisin.
       *
       * `id` EST EXCLU, ET C'EST LE SEUL. Ce n'est pas une colonne de la
       * campagne mais le nom générique que TOUT formulaire du dépôt donne à sa
       * clé ; l'y laisser ferait rougir la garde sur un doublon légitime, et la
       * première réaction serait de la désarmer — ce qui coûterait les seize
       * autres.
       */
      const { container } = rendre();
      allerA(cle);

      const colonnes = CHAMPS_REGLAGES.filter((c) => c !== "id");
      const doublons = colonnes.filter(
        (champ) => container.querySelectorAll(`[name="${champ}"]`).length > 1,
      );
      expect(
        doublons,
        `sur l'étape « ${titre} », ces colonnes ont deux écrivains : ${doublons.join(", ")}`,
      ).toEqual([]);
    },
  );

  it.each(ETAPES_STUDIO_CAGNOTTE.map((e) => [e.cle] as const))(
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
    expect(cible).toBe("studio-cagnotte-reglages");
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });

  it("« Comment on participe » rend l'échéance SANS son champ caché", () => {
    // `CodeTtlDaysField` pose par défaut un `<input hidden name="code_ttl_days">`
    // dans son propre bloc. Ici il vivrait dans une étape DÉMONTABLE, hors du
    // formulaire de réglages : il ne partirait jamais, et `formData.has()` serait
    // faux à chaque enregistrement — l'échéance deviendrait impossible à régler,
    // en silence. Le studio passe donc `champCache={false}` et le rend lui-même.
    const { container } = rendre();
    allerA("participation");
    const champs = [...container.querySelectorAll('input[name="code_ttl_days"]')];
    expect(champs).toHaveLength(1);
    expect(champs[0].closest("form")?.id).toBe("studio-cagnotte-reglages");
  });
});

/**
 * L'APERÇU EST LA VRAIE PAGE, ET IL NE TOUCHE AUCUN CHEMIN SERVEUR.
 *
 * C'est la contrepartie de la réutilisation. `JackpotTracker` importe TROIS
 * actions — `getJackpotState` (poll de la jauge toutes les 60 s),
 * `participateJackpot` (au clic) et `getJackpotCheckinToken` (jeton de caisse,
 * demandé au montage de `StaffCheckinCard`). Monter le composant racine dans un
 * studio aurait donc fait, depuis le tableau de bord, un second parcours joueur
 * avec ses écritures.
 *
 * L'aperçu ne monte que les quatre blocs présentationnels. « Ils ne touchent
 * rien » est une affirmation tant qu'on ne la mesure pas : cette garde la
 * mesure, sur les huit étapes et après le délai du poll.
 */
describe("studio cagnotte — l'aperçu ne parle jamais au serveur", () => {
  it.each(ETAPES_STUDIO_CAGNOTTE.map((e) => [e.cle] as const))(
    "étape « %s » : aucune des trois actions du parcours joueur n'est appelée",
    async (cle) => {
      vi.useFakeTimers();
      try {
        rendre();
        allerA(cle);
        // Bien au-delà des 60 s du `setInterval` de `JackpotTracker` : si le
        // composant racine se retrouvait monté un jour, le poll se déclencherait
        // ici.
        await act(async () => {
          vi.advanceTimersByTime(120_000);
        });
        expect(getJackpotState).not.toHaveBeenCalled();
        expect(participateJackpot).not.toHaveBeenCalled();
        expect(getJackpotCheckinToken).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

describe("studio cagnotte — l'enregistrement automatique", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateJackpotCampaign,
        "le simple affichage a écrit en base — sur une action qui réécrit toutes ses colonnes en bloc",
      ).not.toHaveBeenCalled();
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
      expect(updateJackpotCampaign).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * LE PIÈGE CENTRAL, PRIS PAR L'AUTRE BOUT : ce qui PART vraiment.
 *
 * Les gardes ci-dessous jouent le geste que l'atelier ne pouvait pas offrir —
 * régler le montant affiché sans repasser par l'écran du slug — et vérifient que
 * la charge envoyée porte QUAND MÊME tout le reste, depuis l'état unique.
 */
describe("studio cagnotte — une seule charge, quelle que soit l'étape", () => {
  it("depuis « Le montant qui s'affiche », l'adresse et le lot partent avec", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("montant");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Montant de départ (€)"), {
          target: { value: "80" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateJackpotCampaign).toHaveBeenCalledTimes(1);
      const charge = updateJackpotCampaign.mock.calls[0][1];
      for (const champ of CHAMPS_REGLAGES) {
        expect(
          charge.has(champ),
          `champ absent de la charge envoyée depuis « Le montant qui s'affiche » : ${champ}`,
        ).toBe(true);
      }
      expect(charge.get("display_base")).toBe("80");
      // LES TROIS CHAMPS MUETS, QUI VIVENT SUR D'AUTRES ÉTAPES, SONT PARTIS
      // AVEC. C'est toute la question : sans eux, l'action viderait l'adresse
      // publique (tous les QR imprimés meurent), effacerait le lot (activation
      // bloquée) et remettrait l'incrément à zéro — sans un mot.
      expect(charge.get("public_slug")).toBe("cagnotte-du-comptoir");
      expect(charge.get("reward_label")).toBe("Un magnum de champagne");
      expect(charge.get("display_increment")).toBe("2.5");
    } finally {
      vi.useRealTimers();
    }
  });

  it("depuis « Le nom de la cagnotte », le nom part avec l'objectif et le stock", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom de la cagnotte"), {
          target: { value: "La cagnotte du bar" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      const charge = updateJackpotCampaign.mock.calls[0][1];
      expect(charge.get("name")).toBe("La cagnotte du bar");
      // L'objectif et le stock vivent sur d'AUTRES étapes, démontées. Sans eux,
      // `thresholdSchema` (un `entierRequis`) refuserait tout enregistrement du
      // nom, et `refineCampaign` refuserait le stock nul : c'est-à-dire le
      // studio entier, sur son premier écran.
      expect(charge.get("threshold")).toBe("50");
      expect(charge.get("reward_stock")).toBe("3");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * L'ÉTAT PARTAGÉ CONTRÔLÉ — le plancher est corrigé dans la CHARGE, pas
   * seulement dans le `<select>`.
   *
   * `refineCampaign` impose `max(2 × rotation, 300 s)` au comptoir. Une
   * campagne réglée à 900 s avec une rotation de 60 s est valide ; porter la
   * rotation à 300 s fait monter le plancher à 600 s — toujours sous 900. On
   * joue donc le geste qui casse VRAIMENT : depuis une étape FERMÉE sur la
   * fréquence, une rotation à 300 s et une fréquence de 300 s.
   */
  it("changer la rotation relève la fréquence DANS la charge, pas seulement à l'écran", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("participation");
      await act(async () => {
        fireEvent.change(
          screen.getByLabelText("Fréquence de participation"),
          { target: { value: "300" } },
        );
      });
      await act(async () => {
        fireEvent.change(
          screen.getByLabelText("Rotation du code au comptoir"),
          { target: { value: "300" } },
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      const dernier = updateJackpotCampaign.mock.calls.at(-1)![1];
      expect(dernier.get("rotating_period_seconds")).toBe("300");
      // 2 × 300 = 600 : la fréquence de 300 s est REMONTÉE au plancher avant de
      // partir. Sans cette correction, le serveur refuserait toute la charge
      // avec un message parlant d'un réglage que l'étape ouverte ne montre pas
      // forcément — et l'écran resterait sur « Enregistrement… » puis une
      // erreur, sans que rien n'ait bougé.
      expect(dernier.get("min_participation_interval_seconds")).toBe("600");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * LE MODE DE TIRAGE MASQUE DEUX CHAMPS, IL NE LES RETIRE PAS DE LA CHARGE.
   *
   * `campaignFieldsForMode` écrase `win_probability` hors de `rescan_win` et
   * `draw_at` hors de `date_draw` : ils DOIVENT donc partir dans tous les cas,
   * sans quoi le schéma verrait un champ absent là où l'action attend une
   * valeur à normaliser.
   */
  it("les champs masqués par le mode de tirage partent quand même", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("tirage");
      // Mode « Tirage à l'objectif » : ni la probabilité ni la date ne sont à
      // l'écran.
      expect(screen.queryByLabelText("Probabilité de gain (0 à 1)")).toBeNull();
      expect(screen.queryByLabelText("Date et heure du tirage")).toBeNull();

      await act(async () => {
        fireEvent.click(
          screen.getByRole("radio", { name: /Gain instantané au rescan/ }),
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      const charge = updateJackpotCampaign.mock.calls[0][1];
      expect(charge.get("draw_mode")).toBe("rescan_win");
      expect(charge.has("win_probability")).toBe(true);
      expect(charge.has("draw_at")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
