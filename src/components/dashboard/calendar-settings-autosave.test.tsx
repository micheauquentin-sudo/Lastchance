// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateCalendar = vi.fn(async () => ({ ok: true as const, data: undefined }));
vi.mock("@/actions/calendar", () => ({
  updateCalendar,
  updateCalendarDay: vi.fn(),
  setCalendarStatus: vi.fn(),
  deleteCalendar: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { CalendarSettings } = await import(
  "@/components/dashboard/calendar-editor"
);

import { DELAI_AUTO_SAVE_MS } from "@/lib/use-auto-save";
import type { Calendar } from "@/types/database";

/**
 * LE NOMBRE DE CASES NE S'ENREGISTRE PAS TOUT SEUL — et c'est la seule
 * exception du formulaire.
 *
 * Réduire `day_count` DÉTRUIT : les dernières cases partent avec leur contenu
 * et les codes CADEAU- qu'elles ont distribués. L'action refuse donc une
 * première fois, et ce refus fait apparaître la case « je comprends »
 * (`confirm_day_loss`) — qui n'existe dans le DOM qu'après le refus et
 * disparaît à la soumission suivante, `state` repartant à `null`.
 *
 * Sans la règle éprouvée ici, l'enregistrement automatique rendrait cette
 * réduction IMPOSSIBLE : chaque frappe reposterait sans la confirmation et
 * ferait disparaître la case avant qu'on puisse la cocher. La règle est donc
 * étroite — suspendu tant que le champ diffère de sa valeur d'origine, repris
 * dès qu'il y revient — et c'est cette étroitesse qu'on tient ici : le reste du
 * formulaire continue de s'enregistrer seul.
 */
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
  completion_reward_label: "",
  completion_reward_details: null,
  completion_reward_stock: 0,
  code_ttl_days: null,
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
  // unsafe-cast-justification: fixture partielle — seuls les champs lus par le formulaire de réglages sont posés
} as unknown as Calendar;

const BANDEAU = /Le changement du nombre de cases s'enregistre avec le bouton/;

function avancer(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

async function atterrir() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  updateCalendar.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CalendarSettings — enregistrement automatique", () => {
  it("enregistre seul une modification ordinaire", async () => {
    render(<CalendarSettings calendar={CALENDRIER} />);
    fireEvent.input(screen.getByLabelText("Nom du calendrier"), {
      target: { value: "Avent 2027" },
    });
    expect(updateCalendar).not.toHaveBeenCalled();
    avancer(DELAI_AUTO_SAVE_MS);
    await atterrir();
    expect(updateCalendar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(BANDEAU)).toBeNull();
  });

  it("SUSPEND tout dès que le nombre de cases diffère de sa valeur d'origine", async () => {
    render(<CalendarSettings calendar={CALENDRIER} />);
    fireEvent.input(screen.getByLabelText("Nombre de cases"), {
      target: { value: "12" },
    });
    avancer(DELAI_AUTO_SAVE_MS * 4);
    await atterrir();
    expect(updateCalendar).not.toHaveBeenCalled();
    expect(screen.getByText(BANDEAU)).toBeTruthy();

    // Et une frappe AILLEURS ne rouvre pas la porte : elle reposterait le
    // nouveau nombre de cases sans la confirmation.
    fireEvent.input(screen.getByLabelText("Nom du calendrier"), {
      target: { value: "Avent court" },
    });
    avancer(DELAI_AUTO_SAVE_MS * 4);
    await atterrir();
    expect(updateCalendar).not.toHaveBeenCalled();
  });

  it("le bouton, lui, poste toujours — c'est le chemin de la confirmation", async () => {
    render(<CalendarSettings calendar={CALENDRIER} />);
    fireEvent.input(screen.getByLabelText("Nombre de cases"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await atterrir();
    expect(updateCalendar).toHaveBeenCalledTimes(1);
  });

  it("revenir à la valeur d'origine rend la main à l'enregistrement automatique", async () => {
    render(<CalendarSettings calendar={CALENDRIER} />);
    const cases = screen.getByLabelText("Nombre de cases");
    fireEvent.input(cases, { target: { value: "12" } });
    expect(screen.getByText(BANDEAU)).toBeTruthy();

    fireEvent.input(cases, { target: { value: "24" } });
    expect(screen.queryByText(BANDEAU)).toBeNull();

    fireEvent.input(screen.getByLabelText("Nom du calendrier"), {
      target: { value: "Avent 2028" },
    });
    avancer(DELAI_AUTO_SAVE_MS);
    await atterrir();
    expect(updateCalendar).toHaveBeenCalledTimes(1);
  });
});
