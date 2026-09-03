// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// L'action REND un succès : l'enregistrement automatique lit son verdict pour
// afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait
// `undefined`, que `useActionForm` traiterait comme une réponse illisible.
//
// TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
// réellement les huit étapes, donc montent l'éditeur de cases, les contrôles
// de statut ET l'aperçu — qui est la vraie page joueur. Aucune n'est APPELÉE
// par un rendu, mais toutes doivent exister à l'import.
const updateCalendar = vi.fn(async () => ({
  ok: true as const,
  data: undefined,
}));
vi.mock("@/actions/calendar", () => ({
  updateCalendar,
  updateCalendarDay: vi.fn(),
  setCalendarStatus: vi.fn(),
  deleteCalendar: vi.fn(),
  getCalendarState: vi.fn(),
  joinCalendar: vi.fn(),
  openCalendarBox: vi.fn(),
  consumeCalendarSpin: vi.fn(),
}));
vi.mock("@/actions/loyalty", () => ({ invitationPasseport: vi.fn() }));
vi.mock("@/actions/jackpot", () => ({ invitationJackpot: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CalendrierStudio } = await import(
  "@/components/calendar/calendrier-studio"
);

import {
  ETAPES_STUDIO_CALENDRIER,
  libelleEtapeStudioCalendrier,
} from "@/components/calendar/studio/etapes";
import type { Calendar, CalendarDay } from "@/types/database";

/**
 * LA CHARGE UTILE DU STUDIO DU CALENDRIER EST COMPLÈTE, SUR SES HUIT ÉTAPES.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-39) ──
 *
 * `updateCalendar` lit TREIZE champs d'un seul `FormData` et réécrit la ligne
 * en bloc : un champ absent est ÉCRASÉ. C'est écrit noir sur blanc dans
 * `atelier-calendar-etapes.ts` — « Les réglages est INDIVISIBLE » — et c'est
 * la raison pour laquelle cet écran n'a jamais eu que trois étapes.
 *
 * Le découper en huit rouvre ce piège sous sa pire forme : une étape qu'on
 * quitte est DÉMONTÉE, donc ses champs disparaissent du formulaire, donc
 * enregistrer depuis « Le cadeau de fin » effacerait le thème réglé sur
 * « L'allure ». Rien ne le signalerait — l'action répondrait « Enregistré. »
 * et le calendrier changerait d'apparence sans qu'on sache pourquoi.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesCalendrier` rend la charge EN ENTIER depuis l'état. Ce fichier
 * le vérifie sur le rendu RÉEL de chaque étape, parce que « c'est structurel »
 * est une intention tant qu'aucune garde ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CALENDRIER = {
  id: "cal-1",
  organization_id: "org-1",
  name: "Avent",
  theme: "advent",
  status: "draft",
  start_date: "2026-12-01",
  timezone: "Europe/Paris",
  day_count: 24,
  public_slug: "mon-avent",
  merchant_content: null,
  fond_key: null,
  completion_reward_label: "",
  completion_reward_details: null,
  completion_reward_stock: 0,
  completion_reward_claimed_count: 0,
  code_ttl_days: null,
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
  // unsafe-cast-justification: fixture partielle — seuls les champs lus par le studio sont posés
} as unknown as Calendar;

const JOURS: CalendarDay[] = [
  {
    id: "day-1",
    calendar_id: "cal-1",
    organization_id: "org-1",
    day_index: 1,
    unlock_at: "2026-12-01T00:00:00.000Z",
    content_type: "content",
    content_text: "Bonne journée",
    reward_label: "",
    reward_details: null,
    reward_stock: null,
    reward_claimed_count: 0,
    target_wheel_id: null,
    is_special: false,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
  },
];

/** Les TREIZE champs que `updateCalendar` lit dans le `FormData`. */
const CHAMPS_ATTENDUS = [
  "id",
  "name",
  "theme",
  "fond_key",
  "start_date",
  "timezone",
  "day_count",
  "public_slug",
  "merchant_content",
  "completion_reward_label",
  "completion_reward_details",
  "completion_reward_stock",
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
function allerA(cle: (typeof ETAPES_STUDIO_CALENDRIER)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioCalendrier(cle) }),
  );
}

function rendre(patch: { peutEditer?: boolean } = {}) {
  return render(
    <CalendrierStudio
      calendar={CALENDRIER}
      jours={JOURS}
      roues={[]}
      entreeVerification={{
        dayCount: 24,
        cases: [],
        completionRewardLabel: "",
        completionRewardStock: 0,
      }}
      garnies={1}
      organizationName="Le Comptoir"
      organizationId="org-1"
      logoUrl={null}
      publicUrl={null}
      sortie={null}
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

describe("studio calendrier — la charge utile ne dépend pas de l'étape ouverte", () => {
  // HUIT, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou
  // en perdre une — laisserait cette suite verte en couvrant une étape de
  // moins : elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte huit étapes", () => {
    expect(ETAPES_STUDIO_CALENDRIER).toHaveLength(8);
  });

  it.each(ETAPES_STUDIO_CALENDRIER.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les treize champs de l'action",
    (cle, titre) => {
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector(
        "form#studio-calendrier-reglages",
      )!;
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

  it.each(ETAPES_STUDIO_CALENDRIER.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // effacerait la colonne sans que rien ne le signale.
      //
      // L'assertion vise le formulaire des RÉGLAGES et lui seul : ceux des
      // cases et du statut ont bien des champs visibles nommés, et c'est
      // normal — ils appartiennent à leurs propres actions, atomiques.
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector(
        "form#studio-calendrier-reglages",
      )!;
      const visibles = [...formulaire.querySelectorAll("[name]")].filter(
        (n) => n.getAttribute("type") !== "hidden",
      );

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde suivante ne prouve rien", () => {
    // L'étape de vérification apporte les siens : publier, archiver,
    // supprimer. Sans cette assertion, « aucun formulaire imbriqué » serait
    // trivialement vrai sur un écran qui n'en aurait qu'un.
    const { container } = rendre();
    allerA("verification");
    expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
  });

  it.each(ETAPES_STUDIO_CALENDRIER.map((e) => [e.cle] as const))(
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
    expect(cible).toBe("studio-calendrier-reglages");
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });
});

/**
 * L'ENREGISTREMENT AUTOMATIQUE, ET LA SEULE CHOSE QU'IL NE DOIT PAS FAIRE.
 *
 * Réduire `day_count` DÉTRUIT : les dernières cases partent avec leur contenu
 * et les codes CADEAU- qu'elles ont distribués. L'action refuse une première
 * fois, et ce refus fait apparaître la confirmation. Un enregistrement
 * automatique rendrait cette réduction IMPOSSIBLE : chaque frappe reposterait
 * sans la confirmation, ferait retomber `state`, et la case s'effacerait avant
 * même d'être cochable.
 *
 * La règle est donc ÉTROITE — suspendue tant que le champ diffère de la valeur
 * en base, reprise dès qu'il y revient — et c'est cette étroitesse qu'on tient
 * ici : le reste du studio continue de s'enregistrer seul.
 */
describe("studio calendrier — l'enregistrement automatique et sa suspension", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(
        updateCalendar,
        "le simple affichage a écrit en base — sur une action qui réécrit treize colonnes en bloc",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer un réglage ordinaire enregistre TOUT SEUL", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du calendrier"), {
          target: { value: "Avent 2027" },
        });
      });
      // Avant le délai, rien n'est parti : partir à chaque frappe rendrait
      // l'écran inutilisable.
      expect(updateCalendar).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(updateCalendar).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("SUSPEND tout dès que le nombre de cases diffère de la valeur en base", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("dates");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nombre de cases"), {
          target: { value: "12" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateCalendar,
        "la réduction est partie toute seule : la confirmation `confirm_day_loss` serait devenue impossible à cocher",
      ).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          /Le changement du nombre de cases s'enregistre avec le bouton/,
        ),
      ).toBeTruthy();

      // Et une frappe AILLEURS ne rouvre pas la porte : elle reposterait le
      // nouveau nombre de cases sans la confirmation.
      allerA("nom");
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du calendrier"), {
          target: { value: "Avent court" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(updateCalendar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("revenir à la valeur en base rend la main à l'enregistrement automatique", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("dates");
      const cases = screen.getByLabelText("Nombre de cases");
      await act(async () => {
        fireEvent.change(cases, { target: { value: "12" } });
      });
      await act(async () => {
        fireEvent.change(cases, { target: { value: "24" } });
      });
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(updateCalendar).toHaveBeenCalled();
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
      expect(updateCalendar).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
