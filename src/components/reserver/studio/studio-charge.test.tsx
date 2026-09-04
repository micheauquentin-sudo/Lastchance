// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * L'action REND un succès : l'enregistrement automatique lit son verdict pour
 * afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait
 * `undefined`, que `useActionForm` traiterait comme une réponse illisible.
 *
 * TOUTES les actions du module sont doublées, et c'est nécessaire : ces gardes
 * visitent réellement chaque étape des DEUX modes, donc montent les panneaux
 * réutilisés du tableau de bord (horaires, fermetures, salle, génération,
 * invitations) ET l'aperçu, qui est la vraie page du client. Aucune n'est
 * APPELÉE par un rendu, mais toutes doivent exister à l'import.
 */
type ActionFormData = (
  prev: unknown,
  formData: FormData,
) => Promise<{ ok: true; data: undefined }>;

const enregistrerReglagesRendezVous = vi.fn<ActionFormData>(async () => ({
  ok: true as const,
  data: undefined,
}));

/**
 * LES QUATRE ACTIONS QUE LA PAGE DU CLIENT APPELLE, NOMMÉES POUR ÊTRE
 * SURVEILLÉES.
 *
 * L'aperçu monte le VRAI `ReserverExperience`. La question qui décide si cette
 * réutilisation est saine ou catastrophique est donc : un studio ouvert
 * réserve-t-il ? Deux de ces actions prennent une place à un vrai client, et
 * une troisième annule sa réservation. Les garder sous la main permet de
 * répondre par une MESURE plutôt que par une lecture de code.
 */
const reserveSlot = vi.fn();
const reserverTable = vi.fn();
const rejoindreListeAttenteTable = vi.fn();
const cancelReservation = vi.fn();

vi.mock("@/actions/reserver", () => ({
  enregistrerReglagesRendezVous,
  reserveSlot,
  reserverTable,
  rejoindreListeAttenteTable,
  cancelReservation,
  updateReserverActivity: vi.fn(),
  ajouterPlageHoraire: vi.fn(),
  supprimerPlageHoraire: vi.fn(),
  ajouterFermeture: vi.fn(),
  supprimerFermeture: vi.fn(),
  genererCreneaux: vi.fn(),
  ajouterTableSalle: vi.fn(),
  modifierTableSalle: vi.fn(),
  supprimerTableSalle: vi.fn(),
  enregistrerDureeService: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  closeInvitation: vi.fn(),
  waitlistJoin: vi.fn(),
  waitlistLeave: vi.fn(),
  claimWaitlistOffer: vi.fn(),
}));
vi.mock("@/actions/qr-codes", () => ({
  createQrCode: vi.fn(),
  deleteQrCode: vi.fn(),
  updateQrStyle: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ReservationStudio } = await import(
  "@/components/reserver/reservation-studio"
);

import {
  etapesStudioReservation,
  libelleEtapeStudioReservation,
  replierEtape,
  type EtapeStudioReservation,
} from "@/components/reserver/studio/etapes";
import type { ModeReservation } from "@/components/reserver/studio/etat";
import type {
  ReserverActivityView,
  ReserverSlotDashboardView,
} from "@/lib/reserver-context";

/**
 * LE STUDIO DE RÉSERVATION — LA CHARGE UTILE NE DÉPEND NI DE L'ÉTAPE, NI DU
 * MODE (VIT-49).
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE ──
 *
 * `enregistrerReglagesRendezVous` construit son `TablesUpdate` avec
 * `booking_mode`, `booking_horizon_days`, `lead_time_minutes` et
 * `slot_capacity` SANS CONDITION. Une étape qu'on quitte est DÉMONTÉE : si ces
 * champs vivaient dans « Ce que le client peut réserver », l'enregistrement
 * automatique déclenché depuis « Vos horaires » les posterait ABSENTS, et
 * `slot_capacity` serait écrit `null` chez quelqu'un qui venait de régler sa
 * capacité. Rien ne le signalerait — l'action répondrait « enregistré », et
 * elle dirait vrai.
 *
 * Les deux autres se taisent moins bien mais coûtent autant :
 * `booking_horizon_days` et `lead_time_minutes` sont des `entierRequis`, et
 * leur absence fait échouer TOUT l'enregistrement, sur un message parlant d'un
 * réglage que l'étape ouverte ne montre pas.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesReservation` rend la charge EN ENTIER depuis l'état. Ce fichier
 * le vérifie sur le rendu RÉEL de chaque étape des DEUX modes, parce que
 * « c'est structurel » est une intention tant qu'aucune garde ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ID_FORMULAIRE = "form#studio-reservation-reglages";

/** Les SIX champs que `enregistrerReglagesRendezVous` lit dans le `FormData`. */
const CHAMPS_ATTENDUS = [
  "activity_id",
  "booking_mode",
  "duration_minutes",
  "slot_capacity",
  "booking_horizon_days",
  "lead_time_minutes",
];

const ACTIVITE = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "La table du comptoir",
  description: "Réservez votre table",
  active: true,
  waitQuizId: null,
  waitPauseCampaignId: null,
  kind: "standard",
  promise: null,
  durationMinutes: null,
  steps: [],
  preparation: null,
  // unsafe-cast-justification: fixture partielle — le studio ne lit que les champs ci-dessus
} as unknown as ReserverActivityView;

/**
 * UN CRÉNEAU OUVERT, À VENIR, AVEC DE LA PLACE — et il est INDISPENSABLE.
 *
 * Sans lui, l'aperçu ne rend AUCUNE carte réservable : `reserveSlot` devient
 * inatteignable, et la garde « l'aperçu ne parle jamais au serveur » passerait
 * au vert sans avoir rien regardé. C'est exactement la garde vacante d'ADR-161,
 * et elle a été trouvée en JOUANT la mutation — retirer le drapeau `apercu` de
 * `CreneauReservable` laissait la suite verte.
 */
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();
const CRENEAU = {
  id: "cccccccc-0000-4000-8000-000000000001",
  activityId: "aaaaaaaa-0000-4000-8000-000000000001",
  startsAt: DEMAIN,
  endsAt: new Date(Date.now() + 90_000_000).toISOString(),
  capacity: 10,
  status: "open",
  remaining: 6,
  pairesRestantes: null,
  waitlistOfferMinutes: null,
  reservations: [],
  vivantes: 0,
  personnes: 0,
  arrivees: 0,
  waitlist: [],
  enAttente: 0,
  placesTenues: 0,
  // unsafe-cast-justification: fixture partielle — l'aperçu ne lit que la part publique de la vue
} as unknown as ReserverSlotDashboardView;

function rendre(
  patch: {
    bookingMode?: string;
    dureeMinutes?: number | null;
    capacite?: number | null;
    peutEditer?: boolean;
  } = {},
) {
  return render(
    <ReservationStudio
      activite={ACTIVITE}
      activityId={ACTIVITE.id}
      plages={[
        { id: "plage-1", weekday: 1, debut: 540, fin: 750 },
        { id: "plage-2", weekday: 2, debut: 540, fin: 750 },
      ]}
      fermetures={[
        { id: "ferm-1", debut: "2026-08-01", fin: "2026-08-15", motif: "Congés" },
      ]}
      tables={[{ id: "t-1", nom: "Table 1", couverts: 4, active: true }]}
      dureeServiceMinutes={90}
      creneauxOuverts={0}
      creneauxApercu={[CRENEAU]}
      invitations={[]}
      creneaux={[]}
      organizationName="Le Comptoir"
      logoUrl={null}
      timeZone="Europe/Paris"
      url="https://exemple.test/reserver/aaaaaaaa-0000-4000-8000-000000000001"
      quiz={[]}
      campagnes={[]}
      bookingMode={patch.bookingMode ?? "rendez_vous"}
      dureeMinutes={patch.dureeMinutes === undefined ? 30 : patch.dureeMinutes}
      capacite={patch.capacite === undefined ? 4 : patch.capacite}
      horizonJours={30}
      delaiMinutes={60}
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient chaque fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(mode: ModeReservation, cle: EtapeStudioReservation) {
  fireEvent.click(
    screen.getByRole("button", {
      name: libelleEtapeStudioReservation(mode, cle),
    }),
  );
}

/**
 * ── LE FIL EST DÉRIVÉ DU MODE, ET C'EST LE CŒUR DE CE MODULE ──
 *
 * Une liste écrite en dur aurait affiché « Votre salle et vos tables » sur un
 * Moment : une étape annonçant un réglage qui n'existe pas — `SallePanneau` y
 * rend `null`, l'écran aurait été VIDE. C'est ce qu'ADR-160 a déjà tranché
 * ailleurs, et c'est la seule chose de ce studio qu'aucune autre garde ne
 * pourrait attraper : rien ne casserait, l'étape s'ouvrirait sur du vide.
 */
describe("le fil d'étapes est DÉRIVÉ du mode", () => {
  it("le Moment et la prise de rendez-vous n'ont pas le même fil", () => {
    expect(etapesStudioReservation("moment")).not.toEqual(
      etapesStudioReservation("rendez_vous"),
    );
  });

  it("le fil du Moment compte quatre étapes, celui du rendez-vous huit", () => {
    // LES CHIFFRES SONT ÉCRITS. Sans eux, découper une étape en deux — ou en
    // perdre une — laisserait cette suite verte en couvrant une étape de moins :
    // elle est paramétrée PAR la liste qu'elle vérifie.
    expect(etapesStudioReservation("moment")).toHaveLength(4);
    expect(etapesStudioReservation("rendez_vous")).toHaveLength(8);
  });

  it.each([
    ["horaires"],
    ["fermetures"],
    ["salle"],
    ["creneaux"],
  ] as const)(
    "« %s » existe en prise de rendez-vous et NULLE PART ailleurs",
    (cle) => {
      const cles = (mode: ModeReservation) =>
        etapesStudioReservation(mode).map((e) => e.cle);
      expect(cles("rendez_vous")).toContain(cle);
      expect(cles("moment")).not.toContain(cle);
    },
  );

  it("les quatre étapes communes gardent leur libellé, mot pour mot", () => {
    // Elles sont partagées PAR RÉFÉRENCE dans `etapes.ts` : recopier leur texte
    // aurait laissé les deux fils diverger au premier ajustement, et le
    // commerçant aurait lu deux noms pour le même réglage selon son mode.
    for (const cle of ["nom", "mode", "qr", "invitations"] as const) {
      const moment = etapesStudioReservation("moment").find(
        (e) => e.cle === cle,
      )!;
      const rdv = etapesStudioReservation("rendez_vous").find(
        (e) => e.cle === cle,
      )!;
      expect(moment).toBe(rdv);
    }
  });

  it("le RANG diffère : « Le QR » est 3ᵉ sur 4, puis 7ᵉ sur 8", () => {
    // C'est pourquoi `libelleEtape…` prend le mode en premier argument : une
    // signature sans lui aurait forcé à choisir un fil, donc à mentir sur
    // l'autre dans le nom accessible.
    expect(libelleEtapeStudioReservation("moment", "qr")).toBe(
      "Étape 3 sur 4 : Le QR à afficher",
    );
    expect(libelleEtapeStudioReservation("rendez_vous", "qr")).toBe(
      "Étape 7 sur 8 : Le QR à afficher",
    );
  });

  it("une étape qui disparaît du fil se replie sur « Ce que le client peut réserver »", () => {
    // Le cas que les salons n'ont pas : là-bas le fil est fixé par l'URL, ici
    // le mode est une donnée que le commerçant change DEPUIS le studio.
    expect(replierEtape("moment", "salle")).toBe("mode");
    expect(replierEtape("moment", "creneaux")).toBe("mode");
    // Une étape qui EXISTE dans le fil n'est jamais déplacée.
    expect(replierEtape("moment", "qr")).toBe("qr");
    expect(replierEtape("rendez_vous", "salle")).toBe("salle");
  });
});

describe.each([["moment"], ["rendez_vous"]] as const)(
  "studio réservation (%s) — la charge utile ne dépend pas de l'étape ouverte",
  (mode: ModeReservation) => {
    const etapes = etapesStudioReservation(mode);

    it.each(etapes.map((e) => [e.cle, e.titre] as const))(
      "étape « %s » : le formulaire porte les six champs de l'action",
      (cle, titre) => {
        const { container } = rendre({ bookingMode: mode });
        allerA(mode, cle);

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
        // automatique, écrirait le défaut du schéma à sa place.
        //
        // L'assertion vise le formulaire des RÉGLAGES et lui seul : ceux des
        // horaires, des fermetures, de la salle et des invitations ont bien des
        // champs visibles nommés, et c'est normal — ils appartiennent à leurs
        // propres actions, sur d'autres tables (ADR-156).
        const { container } = rendre({ bookingMode: mode });
        allerA(mode, cle);

        const formulaire = container.querySelector(ID_FORMULAIRE)!;
        const visibles = [...formulaire.querySelectorAll("[name]")].filter(
          (n) => n.getAttribute("type") !== "hidden",
        );

        expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
      },
    );

    it.each(etapes.map((e) => [e.cle, e.titre] as const))(
      "étape « %s » : chaque colonne de réglage n'a QU'UN SEUL porteur dans l'écran",
      (cle, titre) => {
        /**
         * LA GARDE DU PIÈGE CENTRAL DE CE MODULE — et elle vise l'écran
         * ENTIER, pas le formulaire.
         *
         * `HorairesPanneau` contient `ReglagesRendezVous`, qui poste la MÊME
         * action que la coquille avec ses propres champs nommés. Le monter ici
         * ferait réapparaître, quelque part sur l'écran, un second
         * `input[name="slot_capacity"]` — figé sur la valeur serveur, et
         * vainqueur si son formulaire poste en dernier. Le commerçant verrait
         * ses réglages revenir en arrière sans comprendre.
         *
         * Compter les porteurs dans tout le document est la seule forme qui
         * l'attrape.
         *
         * `activity_id` EST EXCLU, ET C'EST LE SEUL : ce n'est pas une colonne
         * de réglage mais la clé que TOUT formulaire du module porte — celui des
         * plages, des fermetures, des tables, de la génération. L'y laisser
         * ferait rougir la garde sur un doublon légitime, et la première
         * réaction serait de la désarmer, ce qui coûterait les cinq autres.
         */
        const { container } = rendre({ bookingMode: mode });
        allerA(mode, cle);

        const colonnes = CHAMPS_ATTENDUS.filter((c) => c !== "activity_id");
        const doublons = colonnes.filter(
          (champ) => container.querySelectorAll(`[name="${champ}"]`).length > 1,
        );
        expect(
          doublons,
          `sur l'étape « ${titre} », ces colonnes ont deux écrivains : ${doublons.join(", ")}`,
        ).toEqual([]);
      },
    );

    it.each(etapes.map((e) => [e.cle, e.titre] as const))(
      "étape « %s » : aucun formulaire n'est imbriqué dans un autre",
      (cle, titre) => {
        // Un `<form>` dans un `<form>` est du HTML invalide : le navigateur
        // déplie en silence et l'hydratation de toute la page meurt (VIT-16).
        const { container } = rendre({ bookingMode: mode });
        allerA(mode, cle);
        expect(
          container.querySelectorAll("form form"),
          `formulaire imbriqué sur l'étape « ${titre} »`,
        ).toHaveLength(0);
      },
    );

    it("la charge utile porte le MODE de l'écran, sur toutes les étapes", () => {
      // Sans ce champ, `booking_mode` serait absent d'un `z.enum` sans défaut :
      // chaque enregistrement automatique se ferait refuser, et le refus
      // parlerait d'un réglage que l'étape ouverte ne montre pas forcément.
      for (const e of etapes) {
        const { container, unmount } = rendre({ bookingMode: mode });
        allerA(mode, e.cle);
        const champ = container.querySelector<HTMLInputElement>(
          `${ID_FORMULAIRE} input[name="booking_mode"]`,
        )!;
        expect(champ.value, `étape « ${e.titre} »`).toBe(mode);
        unmount();
      }
    });
  },
);

/**
 * CE QUI PART VRAIMENT — le piège central pris par l'autre bout.
 *
 * Les gardes ci-dessus mesurent le DOM. Celles-ci jouent le geste et lisent la
 * `FormData` réellement envoyée : c'est la seule preuve que la charge est
 * complète, et non seulement que des `name` existent.
 */
describe("studio réservation — une seule charge, quelle que soit l'étape", () => {
  it("depuis « Vos horaires », la capacité et la durée partent avec", async () => {
    vi.useFakeTimers();
    try {
      rendre({ bookingMode: "rendez_vous" });
      allerA("rendez_vous", "mode");
      await act(async () => {
        fireEvent.change(
          screen.getByLabelText("Réservable jusqu'à (jours)"),
          { target: { value: "45" } },
        );
      });
      // On QUITTE l'étape des réglages avant que le minuteur ne parte : les
      // contrôles sont alors DÉMONTÉS, et c'est exactement la situation où une
      // charge portée par eux serait amputée.
      allerA("rendez_vous", "horaires");
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(enregistrerReglagesRendezVous).toHaveBeenCalled();
      const charge = enregistrerReglagesRendezVous.mock.calls.at(-1)![1];
      for (const champ of CHAMPS_ATTENDUS) {
        expect(
          charge.has(champ),
          `champ absent de la charge envoyée depuis « Vos horaires » : ${champ}`,
        ).toBe(true);
      }
      expect(charge.get("booking_horizon_days")).toBe("45");
      // LES DEUX CHAMPS SILENCIEUX SONT PARTIS AVEC. C'est toute la question :
      // sans eux, l'action écrirait `slot_capacity: null` — la capacité de
      // l'activité disparaîtrait — et le `superRefine` refuserait ensuite tout
      // enregistrement, sans un mot.
      expect(charge.get("slot_capacity")).toBe("4");
      expect(charge.get("duration_minutes")).toBe("30");
    } finally {
      vi.useRealTimers();
    }
  });

  it("basculer en prise de rendez-vous RÉSOUT la durée et la capacité dans la charge", async () => {
    vi.useFakeTimers();
    try {
      // Une activité en Moment n'a NI durée NI capacité : elles valent `null`.
      rendre({ bookingMode: "moment", dureeMinutes: null, capacite: null });
      allerA("moment", "mode");
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", {
            name: "Rendez-vous — horaires récurrents",
          }),
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      const charge = enregistrerReglagesRendezVous.mock.calls.at(-1)![1];
      expect(charge.get("booking_mode")).toBe("rendez_vous");
      // Sans cette résolution, `reglagesRendezVousSchema.superRefine` aurait
      // refusé toute la charge — « Indiquez la durée d'un rendez-vous. » — sur
      // un écran où le commerçant vient de cliquer sur un bouton de mode et n'a
      // rien saisi d'autre. Il aurait lu un reproche pour un champ qu'on ne lui
      // avait pas encore demandé.
      expect(charge.get("duration_minutes")).toBe("30");
      expect(charge.get("slot_capacity")).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("le fil GRANDIT quand le mode bascule, sans recharger la page", async () => {
    rendre({ bookingMode: "moment", dureeMinutes: null, capacite: null });
    expect(
      screen.queryByRole("button", {
        name: libelleEtapeStudioReservation("rendez_vous", "salle"),
      }),
    ).toBeNull();

    allerA("moment", "mode");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Rendez-vous — horaires récurrents",
        }),
      );
    });

    // Les quatre étapes de la prise de rendez-vous sont apparues dans le fil.
    for (const cle of ["horaires", "fermetures", "salle", "creneaux"] as const) {
      expect(
        screen.getByRole("button", {
          name: libelleEtapeStudioReservation("rendez_vous", cle),
        }),
        `l'étape « ${cle} » n'est pas apparue après la bascule`,
      ).toBeTruthy();
    }
  });

  it("revenir au Moment depuis « Votre salle » ne laisse PAS un écran vide", async () => {
    rendre({ bookingMode: "rendez_vous" });
    allerA("rendez_vous", "salle");
    expect(screen.getByText("Votre salle")).toBeTruthy();

    // Le fil perd quatre étapes d'un coup, dont celle qui est ouverte.
    allerA("rendez_vous", "mode");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Moment — créneaux à la main" }),
      );
    });

    // `replierEtape` a ramené sur « Ce que le client peut réserver » : le
    // commerçant reste sous sa main, et la colonne de gauche montre quelque
    // chose. Sans ce repli, elle serait VIDE — sans erreur, après un geste
    // parfaitement légitime.
    expect(
      screen.getByRole("heading", { name: "Ce que le client peut réserver" }),
    ).toBeTruthy();
  });
});

/**
 * L'APERÇU EST LA VRAIE PAGE, ET IL NE TOUCHE AUCUN CHEMIN SERVEUR.
 *
 * C'est la contrepartie de la réutilisation. `ReserverExperience` importe
 * QUATRE actions — deux d'entre elles prennent une place à un vrai client, une
 * troisième annule sa réservation. Les monter sans les couper aurait fait, du
 * tableau de bord, un second parcours joueur avec ses écritures.
 *
 * « Elles ne partent pas » est une affirmation tant qu'on ne la mesure pas :
 * cette garde la mesure, sur chaque étape des deux modes.
 */
describe("studio réservation — l'aperçu ne parle jamais au serveur", () => {
  /**
   * LA NON-VACANCE D'ABORD — sans elle, tout ce qui suit est décoratif.
   *
   * La première version de cette suite passait `creneauxApercu={[]}` : aucune
   * carte réservable n'était rendue, `reserveSlot` était INATTEIGNABLE, et la
   * mutation « retirer le drapeau `apercu` » laissait la suite VERTE. La garde
   * annonçait surveiller quatre portes serveur sans en approcher aucune.
   */
  it("l'aperçu rend bien un bouton de réservation — sinon la garde est vacante", () => {
    rendre({ bookingMode: "moment" });
    expect(
      screen.getByRole("button", { name: "Réserver ma place" }),
    ).toBeTruthy();
  });

  it("CLIQUER « Réserver ma place » dans l'aperçu n'appelle PAS `reserveSlot`", async () => {
    // Le geste que le commerçant fera forcément : il règle son écran, il voit
    // sa page, il clique pour vérifier. Sans le drapeau, ce clic graverait une
    // vraie réservation à son nom et prendrait une place à un vrai client.
    rendre({ bookingMode: "moment" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Réserver ma place" }));
    });
    expect(
      reserveSlot,
      "l'aperçu du studio a réservé pour de vrai",
    ).not.toHaveBeenCalled();
    // Et l'écran le DIT, plutôt que d'avaler le clic en silence.
    expect(
      screen.getByText(/Aperçu : la réservation ne part pas/),
    ).toBeTruthy();
  });

  it.each([["moment"], ["rendez_vous"]] as const)(
    "mode %s : aucune des quatre actions du parcours client n'est appelée",
    async (mode: ModeReservation) => {
      vi.useFakeTimers();
      try {
        rendre({ bookingMode: mode });
        for (const e of etapesStudioReservation(mode)) {
          allerA(mode, e.cle);
        }
        await act(async () => {
          vi.advanceTimersByTime(120_000);
        });
        expect(reserveSlot).not.toHaveBeenCalled();
        expect(reserverTable).not.toHaveBeenCalled();
        expect(rejoindreListeAttenteTable).not.toHaveBeenCalled();
        expect(cancelReservation).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

describe("studio réservation — l'enregistrement automatique", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        enregistrerReglagesRendezVous,
        "le simple affichage a écrit en base — sur une action qui réécrit cinq colonnes en bloc",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sans droit d'édition, rien ne part et le bouton de la coquille disparaît", async () => {
    /**
     * L'ASSERTION VISE LE BOUTON DE LA COQUILLE, ET C'EST UNE LIMITE CONNUE.
     *
     * `peutEditer` gèle ce que le socle gouverne : l'enregistrement automatique
     * et le bouton « Enregistrer » du bandeau. Il ne gèle PAS les boutons des
     * six panneaux réutilisés du tableau de bord — `ActiviteReglagesForm`,
     * `SemaineType`, `Fermetures`, `SallePanneau`, `Generation`,
     * `InvitationsPanneau` — parce qu'AUCUN d'eux n'accepte de prop
     * `peutEditer` : ils rendent leur bouton quel que soit le rôle, et laissent
     * leur action refuser après coup.
     *
     * Ce n'est pas un défaut introduit ici : c'est le comportement ACTUEL de
     * `/dashboard/reservations/[activityId]`, qui monte les mêmes panneaux pour
     * tout rôle passant `canExplore`. Le studio le reproduit à l'identique
     * plutôt que de faire diverger deux écrans sur la même donnée.
     *
     * L'écart avec le principe d'ADR-160 — « mieux vaut ne rien proposer que
     * laisser l'action refuser après coup » — est réel et reste ouvert. Le
     * fermer demande de porter `peutEditer` dans les six panneaux, ce qui change
     * AUSSI le tableau de bord : un lot à soi, pas un effet de bord de celui-ci.
     *
     * Ce que cette garde tient donc : le canal du socle est bien gelé. C'est le
     * seul que ce lot introduit, et le seul qui écrirait TOUT SEUL — les autres
     * demandent un clic délibéré.
     */
    vi.useFakeTimers();
    try {
      const { container } = rendre({ peutEditer: false });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      // LE PLUS IMPORTANT : l'enregistrement automatique ne part pas. C'est le
      // seul écrivain de cet écran qui n'a besoin d'aucun geste.
      expect(enregistrerReglagesRendezVous).not.toHaveBeenCalled();
      expect(
        container.querySelector('button[form="studio-reservation-reglages"]'),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
