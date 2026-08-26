// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorSession } from "@/components/dashboard/event-editor";

/**
 * CE QUE CE FICHIER PROTÈGE — DEUX DÉFAUTS VUS EN PRODUCTION, PAS DES IDÉES.
 *
 * 1. **« Écran » menait à « Page introuvable ».** Le bouton était rendu sur
 *    TOUTE session, y compris une session fraîchement créée — statut `draft`
 *    par défaut de `event_sessions`. Or `/event/[code]/screen` passe par
 *    `loadEventPublicContext`, qui refuse `draft` et `archived`. Le commerçant
 *    cliquait, un onglet s'ouvrait sur un 404, à tous les coups.
 *    « Piloter » reste TOUJOURS affiché : c'est par là qu'on ouvre le salon.
 *    Le masquer fermerait la seule porte, et rendrait la session inutilisable.
 *
 * 2. **Enregistrer rechargeait la page entière.** `window.location.reload()`
 *    était délibéré (il compensait un `router.refresh()` mesuré défaillant
 *    ~5 % du temps) mais coûtait un saut complet à chaque validation. Il est
 *    remplacé par DEUX garanties qui doivent tenir ensemble : un toast, et la
 *    ligne créée affichée localement jusqu'au retour du serveur. Si l'une des
 *    deux saute, on revient au défaut d'origine — le commerçant ne voit rien,
 *    ressaisit, et des sessions fantômes s'accumulent.
 */

const creerSession = vi.fn(async () => ({ ok: true as const, data: { id: "s-neuve" } }));
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh } as never) }));
vi.mock("@/actions/events", () => ({
  createEventSession: (...args: unknown[]) => creerSession(...(args as [])),
  createEventQuestion: vi.fn(),
  deleteEventGame: vi.fn(),
  deleteEventQuestion: vi.fn(),
  deleteEventSession: vi.fn(),
  setEventGameStatus: vi.fn(),
  updateEventGame: vi.fn(),
  updateEventQuestion: vi.fn(),
  updateEventSession: vi.fn(),
}));

const { EventSessionsPrepareSection, EventSessionsSection } = await import(
  "@/components/dashboard/event-editor"
);
const { lireToasts, viderToasts } = await import("@/lib/toast-bus");

const session = (over: Partial<EditorSession> = {}): EditorSession => ({
  id: "s-1",
  label: "Vendredi 20h",
  joinCode: "HD53GZ",
  publicUrl: "https://exemple.test/event/HD53GZ",
  openCount: 0,
  status: "draft",
  rewardLabel: "Café",
  rewardDetails: null,
  rewardStock: 5,
  rewardClaimedCount: 0,
  codeTtlDays: null,
  ...over,
});

beforeEach(() => {
  viderToasts();
  creerSession.mockClear();
  refresh.mockClear();
});
afterEach(cleanup);

describe("« Écran » ne s'affiche que sur une salle ouverte", () => {
  it("est absent sur un brouillon — la page joueur y répondrait 404", () => {
    render(<EventSessionsSection sessions={[session({ status: "draft" })]} />);
    expect(screen.queryByRole("link", { name: /Écran/ })).toBeNull();
    // La porte du salon, elle, reste ouverte : sans « Piloter », la session
    // créée ne pourrait JAMAIS être démarrée.
    expect(screen.getByRole("link", { name: /Piloter/ })).toBeTruthy();
  });

  it("est absent sur une session archivée", () => {
    render(<EventSessionsSection sessions={[session({ status: "archived" })]} />);
    expect(screen.queryByRole("link", { name: /Écran/ })).toBeNull();
  });

  it.each(["lobby", "live", "ended"] as const)(
    "est présent dès que la salle est joignable (%s)",
    (statut) => {
      render(<EventSessionsSection sessions={[session({ status: statut })]} />);
      expect(screen.getByRole("link", { name: /Écran/ })).toBeTruthy();
    },
  );
});

describe("créer une session : accusé de réception, sans rechargement", () => {
  it("annonce un toast ET affiche la ligne, sans recharger la page", async () => {
    // ESPION RÉEL sur `window.location.reload`, et non un `vi.fn()` détaché :
    // une assertion sur une fonction que personne n'appelle passe toujours, et
    // elle aurait laissé revenir le rechargement sans un mot.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<EventSessionsPrepareSection gameId="g-1" gameActive sessions={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Nouvelle session" }));
    fireEvent.change(screen.getByLabelText(/Étiquette/), {
      target: { value: "Samedi 21h" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Créer la session" }));

    await waitFor(() => expect(creerSession).toHaveBeenCalledTimes(1));

    // 1 · L'accusé de réception, indépendant de tout rendu serveur.
    await waitFor(() =>
      expect(lireToasts().map((t) => t.message)).toContain("Session créée."),
    );
    // 2 · La ligne, visible tout de suite — c'est elle qui remplace l'encart
    //     « Aucune session », dont le retour faisait ressaisir.
    expect(screen.getByText("Samedi 21h")).toBeTruthy();
    expect(screen.queryByText(/Aucune session/)).toBeNull();
    // 3 · Le rafraîchissement est demandé, mais la page n'est PAS rechargée.
    expect(refresh).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
