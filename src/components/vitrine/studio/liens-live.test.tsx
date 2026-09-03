// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LES TROIS LIENS SE VOIENT ET S'ENREGISTRENT COMME LE RESTE (VIT-37).
 *
 * ── LE DÉFAUT, TEL QUE LE PROPRIÉTAIRE L'A RENCONTRÉ ──
 *
 * « Je viens de mettre ma page Insta et le logo Instagram ne s'affiche pas sur
 * l'aperçu. » Deux causes distinctes se tenaient derrière, et la seconde est
 * la grave :
 *
 *  1. L'aperçu recevait les liens du SERVEUR (`liens={liens}`), jamais la
 *     saisie en cours. Tous les autres réglages du studio s'y reflètent à la
 *     frappe ; ces trois-là seuls restaient muets.
 *  2. Le formulaire des liens avait son propre bouton « Enregistrer », plus
 *     bas que le pli, pendant que l'en-tête affichait « Modifications
 *     enregistrées » pour les AUTRES réglages. On tapait, on lisait
 *     « enregistrées », on partait — et le lien n'avait jamais été envoyé.
 *
 * Le second point ne se voit pas : rien ne casse, l'écran dit oui, et la perte
 * ne se découvre qu'en revenant. C'est pourquoi les gardes portent d'abord sur
 * l'ENVOI, et pas seulement sur l'affichage.
 */

vi.mock("@/actions/vitrine", () => ({
  saveVitrineSettings: vi.fn(async () => ({ ok: true, data: undefined })),
  setVitrinePhoto: vi.fn(),
  deleteVitrinePhoto: vi.fn(),
  setVitrineJeux: vi.fn(),
  setVitrineContenu: vi.fn(),
  deleteVitrineContenu: vi.fn(),
  createVitrineCarte: vi.fn(),
  updateVitrineCarte: vi.fn(),
  deleteVitrineCarte: vi.fn(),
  createVitrineRubrique: vi.fn(),
  updateVitrineRubrique: vi.fn(),
  deleteVitrineRubrique: vi.fn(),
  createVitrineFiche: vi.fn(),
  updateVitrineFiche: vi.fn(),
  deleteVitrineFiche: vi.fn(),
  toggleVitrineFicheDisponibilite: vi.fn(),
  reorderVitrineCartes: vi.fn(),
  reorderVitrineRubriques: vi.fn(),
  reorderVitrineFiches: vi.fn(),
  importVitrineCarte: vi.fn(),
}));
vi.mock("@/actions/organizations", () => ({
  updateOrganizationSocialLinks: vi.fn(async () => ({
    ok: true,
    data: undefined,
  })),
}));
vi.mock("@/actions/branding", () => ({ uploadLogo: vi.fn(), removeLogo: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { VitrineStudio } = await import("@/components/vitrine/vitrine-studio");
const { updateOrganizationSocialLinks } = await import("@/actions/organizations");

import { libelleEtapeStudio } from "@/components/vitrine/studio/pages";
import type { BilanJeuxVitrine } from "@/lib/vitrine";

const INSTA = "https://www.instagram.com/astra_club_orleans";

const BILAN_JEUX: BilanJeuxVitrine = {
  possede: {
    duo: false,
    bande: false,
    quiz: false,
    calendars: false,
    pronostics: false,
    loyalty: false,
  },
  compte: { duo: 0, quiz: 0, calendars: 0, pronostics: 0, loyalty: 0 },
};

function rendre() {
  return render(
    <VitrineStudio
      slug="le-comptoir"
      identiteInitiale={{
        nom: "Le Comptoir",
        logoUrl: null,
        coverPath: null,
        coverAlt: null,
        accroche: "Bistrot de quartier",
        histoire: "Depuis 1997.",
        horaires: "Lundi 12h-14h",
        badge: "Ouvert · 12h–23h",
        secteur: "restaurant" as const,
        horairesStructures: null,
      }}
      // `social` DOIT être dans l'ordre : masquer un bloc, c'est l'omettre
      // (VIT-3). Sans lui, l'aperçu ne rendrait aucun lien et ces gardes
      // mesureraient l'absence de la case, pas celle de la saisie.
      themeInitial={{ ordre_blocs: ["accroche", "social"] }}
      cartes={[]}
      contenus={[]}
      bilanJeux={BILAN_JEUX}
      liens={{ google_review_url: null, instagram_url: null, tiktok_url: null }}
      timezone="Europe/Paris"
      peutEditer
    />,
  );
}

/** Ouvrir « Ce qui paraît » et taper une adresse dans le champ Instagram. */
function saisirInstagram(valeur: string) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudio("parait") }),
  );
  fireEvent.change(screen.getByLabelText("Instagram"), {
    target: { value: valeur },
  });
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("studio — les liens sociaux", () => {
  it("l'aperçu montre l'Instagram DÈS LA FRAPPE, sans attendre un enregistrement", () => {
    // Le défaut signalé. L'aperçu lisait la valeur du serveur : taper ne
    // produisait rien, et rien n'expliquait pourquoi.
    const { container } = rendre();
    expect(container.querySelector(`a[href="${INSTA}"]`)).toBeNull();

    saisirInstagram(INSTA);

    expect(container.querySelector(`a[href="${INSTA}"]`)).not.toBeNull();
  });

  it("l'adresse part toute seule, sans bouton à trouver", () => {
    // LA garde du lot : c'est l'envoi, pas l'affichage, qui était perdu.
    rendre();
    saisirInstagram(INSTA);
    expect(updateOrganizationSocialLinks).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1300));

    expect(updateOrganizationSocialLinks).toHaveBeenCalledTimes(1);
    const donnees = vi.mocked(updateOrganizationSocialLinks).mock
      .calls[0][1] as FormData;
    expect(donnees.get("instagram_url")).toBe(INSTA);
    // Les trois champs partent TOUJOURS : l'action traite un champ absent
    // comme un champ vidé, et n'en poster qu'un effacerait les deux autres.
    expect(donnees.get("google_review_url")).toBe("");
    expect(donnees.get("tiktok_url")).toBe("");
  });

  it("une adresse encore incomplète n'est pas envoyée, et le dit", () => {
    // Sans cette garde, chaque frappe d'une URL en cours enverrait une
    // écriture vouée au refus — et le refus s'afficherait pendant la saisie.
    rendre();
    saisirInstagram("https://www.inst");

    act(() => void vi.advanceTimersByTime(1300));

    expect(updateOrganizationSocialLinks).not.toHaveBeenCalled();
    expect(screen.getByText(/Lien non accepté/)).toBeTruthy();
  });

  it("le studio ne propose PAS un second « Enregistrer » pour ces trois champs", () => {
    // Deux boutons d'enregistrement sur un même écran, c'est la confusion
    // d'origine : celui du haut disait « enregistrées » sans couvrir ces
    // champs. Le studio enregistre pour tout le monde, ou pour personne.
    rendre();
    fireEvent.click(
      screen.getByRole("button", { name: libelleEtapeStudio("parait") }),
    );

    const enregistrer = screen
      .getAllByRole("button")
      .filter((b) => (b.textContent ?? "").trim() === "Enregistrer");
    expect(enregistrer).toHaveLength(1);
  });
});
