// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/calendar", () => ({
  getCalendarState: vi.fn(),
  joinCalendar: vi.fn(),
  openCalendarBox: vi.fn(),
}));
vi.mock("@/actions/loyalty", () => ({ invitationPasseport: vi.fn() }));
vi.mock("@/actions/jackpot", () => ({ invitationJackpot: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const { invitationPasseport } = await import("@/actions/loyalty");
const { invitationJackpot } = await import("@/actions/jackpot");
const { CalendarTracker } = await import("./calendar-tracker");

import type { CalendarPublicDay, CalendarPublicState } from "@/lib/calendar";

/**
 * « CASE VIDE = PERDU » DOIT SE VOIR, ET SE VOIR COMME UNE DÉFAITE.
 *
 * Une case `content` sans texte est LÉGALE depuis que la publication ne
 * l'exige plus : le commerçant n'a plus à garnir 24 cases pour ouvrir. Le
 * joueur, lui, lisait alors « 💬 Le mot du jour » suivi d'un « Bonne
 * journée ! » que PERSONNE n'avait écrit — un message de remplissage
 * indiscernable d'un vrai, qui faisait passer une case sans gain pour une
 * attention du commerçant.
 *
 * Rien d'autre dans la suite ne regarde ce rendu : le module d'activation
 * (`src/lib/activation/calendar.ts`) prouve que la case ne bloque plus, l'E2E
 * n'ouvre que des cases AVEC texte (le seed les garnit). L'issue perdante
 * n'existe donc qu'ici.
 */

afterEach(cleanup);

function jour(over: Partial<CalendarPublicDay> = {}): CalendarPublicDay {
  return {
    dayIndex: 1,
    unlockAt: null,
    status: "opened",
    isSpecial: false,
    contentType: "content",
    contentText: null,
    rewardLabel: null,
    rewardDetails: null,
    code: null,
    spinGrantToken: null,
    targetWheelId: null,
    resultingSpinId: null,
    outOfStock: false,
    ...over,
  };
}

function etat(days: CalendarPublicDay[], openedCount = 1): CalendarPublicState {
  return {
    state: "ok",
    calendar: {
      id: "cal-1",
      name: "Calendrier de test",
      theme: "noel",
      status: "active",
      dayCount: 4,
      merchantContent: null,
      completionRewardLabel: "",
      completionRewardDetails: null,
    },
    days,
    progression: { openedCount, dayCount: 4 },
    completionReward: null,
  };
}

function rendre(
  state: CalendarPublicState,
  extra: Partial<React.ComponentProps<typeof CalendarTracker>> = {},
) {
  return render(
    <CalendarTracker
      calendarId="cal-1"
      publicSlug="test"
      organizationName="Café des Sports"
      logoUrl={null}
      theme="noel"
      merchantContent={null}
      initialState={state}
      dayIds={{ 1: "day-1" }}
      spinBundles={{}}
      {...extra}
    />,
  );
}

describe("CalendarTracker — case sans gain", () => {
  it("révèle une DÉFAITE, jamais un « mot du jour » de remplissage", () => {
    rendre(etat([jour({ contentText: null })]));
    fireEvent.click(screen.getByRole("button", { name: "Revoir la case 1" }));

    const dialog = screen.getByRole("dialog");
    expect(
      screen.getByRole("heading", { name: /Pas de chance aujourd'hui/ }),
    ).toBeTruthy();
    // Le fallback menteur a disparu, et le titre du « mot du jour » avec lui.
    expect(dialog.textContent).not.toContain("Bonne journée");
    expect(dialog.textContent).not.toContain("Le mot du jour");
  });

  it("consolle avec l'assiduité RESTANTE, chiffrée", () => {
    // 1 case ouverte sur 4 → il en reste 3 à découvrir.
    rendre(etat([jour({ contentText: "   " })], 1));
    fireEvent.click(screen.getByRole("button", { name: "Revoir la case 1" }));

    expect(screen.getByRole("dialog").textContent).toContain(
      "Il reste 3 cases à ouvrir",
    );
  });

  it("laisse INTACTE une case message garnie", () => {
    rendre(etat([jour({ contentText: "Joyeuses fêtes !" })]));
    fireEvent.click(screen.getByRole("button", { name: "Revoir la case 1" }));

    const dialog = screen.getByRole("dialog");
    expect(
      screen.getByRole("heading", { name: "Le mot du jour" }),
    ).toBeTruthy();
    expect(dialog.textContent).toContain("Joyeuses fêtes !");
    expect(dialog.textContent).not.toContain("Pas de chance");
  });

  it("distingue les deux cases dans la GRILLE, avant même de les rouvrir", () => {
    const { container } = rendre(etat([jour({ contentText: null })]));
    // 🍀 (pas de chance) plutôt que 💬 (mot du jour) sur la tuile ouverte.
    // Le trèfle et non la feuille morte : sur une grille qu'on rouvre
    // demain, 🍂 disait la fin de quelque chose.
    expect(container.textContent).toContain("🍀");
    expect(container.textContent).not.toContain("💬");
    expect(container.textContent).not.toContain("🍂");
  });
});

/**
 * LE BAS DU CALENDRIER — QUATRE PORTES, ET AUCUNE N'EST UNE CONDITION.
 *
 * Un client qui ouvrait sa case arrivait au bout de la page et n'avait plus
 * rien : le commerce cessait d'exister à l'écran au moment précis où il vient
 * de jouer. Les quatre chemins (Vitrine, réseaux, Passeport, Jackpot)
 * existaient déjà dans le produit mais n'étaient atteignables que par leur
 * propre QR.
 *
 * Trois propriétés sont gardées ici, aucune n'est visible au diff :
 *
 *  · le SILENCE par défaut — sans Vitrine, sans réseaux, sans programme et
 *    sans jackpot, le bas de page ne rend RIEN, pas même un cadre vide ;
 *    c'est le cas de la majorité des commerçants ;
 *  · les liens sont des LIENS — jamais un bouton, jamais une écriture : rien
 *    dans ce bloc ne tamponne, ne fait participer, ni ne pose de cookie ;
 *  · le Passeport est rendu HORS de la carte de fin, donc lu dès la première
 *    case — c'est tout l'objet de son déplacement.
 */
describe("CalendarTracker — bas de page « garder le lien »", () => {
  beforeEach(() => {
    vi.mocked(invitationPasseport).mockReset();
    vi.mocked(invitationJackpot).mockReset();
    vi.mocked(invitationPasseport).mockResolvedValue(null);
    vi.mocked(invitationJackpot).mockResolvedValue(null);
  });

  it("ne rend RIEN quand le commerce n'a ni vitrine, ni réseaux, ni module", async () => {
    rendre(etat([jour({ contentText: null })]), {
      organizationId: "org-1",
      sortie: null,
    });

    await waitFor(() =>
      expect(vi.mocked(invitationJackpot)).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByRole("region", { name: "Garder le lien avec le lieu" }),
    ).toBeNull();
    expect(screen.queryByText("Passeport de fidélité")).toBeNull();
    expect(screen.queryByText("Jackpot collectif")).toBeNull();
  });

  it("ouvre la Vitrine et les réseaux quand le commerce en a", () => {
    rendre(etat([jour({ contentText: null })]), {
      organizationId: "org-1",
      sortie: {
        vitrine: "cafe-des-sports",
        instagram: "https://instagram.com/cafedessports",
      },
    });

    const carte = screen.getByRole("link", { name: /Revenir à la carte/ });
    expect(carte.getAttribute("href")).toBe("/v/cafe-des-sports");

    const insta = screen.getByRole("link", { name: /Suivez-nous/ });
    expect(insta.getAttribute("href")).toBe(
      "https://instagram.com/cafedessports",
    );
    // Une adresse posée par le commerçant : la page ne lui prête aucune
    // autorité et ne l'ouvre pas dans l'onglet du jeu.
    expect(insta.getAttribute("rel")).toContain("nofollow");
    expect(insta.getAttribute("target")).toBe("_blank");
  });

  /**
   * Le Passeport vivait dans `CompletionCard` : visible du seul joueur ayant
   * ouvert TOUTES les cases, c'est-à-dire au moment où le calendrier est
   * fini. Proposer de commencer une habitude à sa fin n'a pas de sens — il
   * est lu ici sur une grille à peine entamée (1 case sur 4).
   */
  it("propose le Passeport dès la PREMIÈRE case, hors de la carte de fin", async () => {
    vi.mocked(invitationPasseport).mockResolvedValue({
      programId: "prog-1",
      programName: "Café des Sports",
    });
    rendre(etat([jour({ contentText: null })], 1), {
      organizationId: "org-1",
    });

    const lien = await screen.findByRole("link", {
      name: /Mon Passeport de fidélité/,
    });
    expect(lien.getAttribute("href")).toBe("/passeport/prog-1");
    // Le calendrier n'est PAS terminé : la carte de fin n'est pas rendue.
    expect(screen.queryByText(/Toutes les cases sont ouvertes/)).toBeNull();
    // Et la note dit QUAND le passeport commence à compter.
    expect(
      screen.getByText(/prend effet au premier scan de commande/),
    ).toBeTruthy();
  });

  it("propose de rejoindre le jackpot par un LIEN, qui ne fait participer à rien", async () => {
    vi.mocked(invitationJackpot).mockResolvedValue({
      publicSlug: "cagnotte-de-noel",
      campaignName: "Cagnotte de Noël",
    });
    rendre(etat([jour({ contentText: null })]), {
      organizationId: "org-1",
    });

    const lien = await screen.findByRole("link", {
      name: /Rejoindre le jackpot/,
    });
    expect(lien.getAttribute("href")).toBe("/jackpot/cagnotte-de-noel");
    expect(lien.tagName).toBe("A");
  });

  /**
   * `organizationId` est facultatif sur ce composant. Sans lui, aucune des
   * deux actions n'a de quoi être appelée — et surtout, aucune ne doit être
   * appelée avec une valeur bricolée.
   */
  it("n'interroge aucune invitation sans organisation", async () => {
    rendre(etat([jour({ contentText: null })]));
    await Promise.resolve();
    expect(vi.mocked(invitationPasseport)).not.toHaveBeenCalled();
    expect(vi.mocked(invitationJackpot)).not.toHaveBeenCalled();
  });
});
