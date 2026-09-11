// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tirerTicketOr = vi.fn();
vi.mock("@/actions/ticket-or", () => ({
  tirerTicketOr: (code: string, nonce: string) => tirerTicketOr(code, nonce),
}));

import { TicketExperience } from "@/components/ticket/ticket-experience";
import {
  cleMemoireTicket,
  cleNonceTicket,
  type TirageGagnant,
} from "@/lib/ticket-or";

/**
 * L'ÉCRAN NE DOIT PLUS PROMETTRE UN RETRAIT QUE LA CAISSE REFUSERA.
 *
 * Rien ici ne relève de la fraude : `redeem_by_code` vérifie l'expiration en
 * base et refuse au-delà. Ce qui était cassé, c'est l'INTERFACE — elle
 * affichait le lot en grand et « À retirer avant le … » sans jamais comparer
 * cette date à aujourd'hui. Le client se déplaçait, et se faisait refuser au
 * comptoir avec un écran qui lui donnait raison.
 *
 * Les deux CONTRE-ÉPREUVES comptent autant que la correction : un ticket
 * valide doit continuer de s'afficher exactement comme avant, et le refus
 * `deja_tire` doit rester celui où la copie locale a le dernier mot.
 */

const JOUR_MS = 86_400_000;

/** Chaque cas repart d'un code neuf : le cache de module est indexé dessus. */
let compteur = 0;
function codeNeuf(): string {
  compteur += 1;
  return `TICKET${String(compteur).padStart(3, "0")}`.slice(0, 10);
}

function memoriser(code: string, tirage: TirageGagnant): void {
  window.localStorage.setItem(cleMemoireTicket(code), JSON.stringify(tirage));
}

function gain(expireLe: string | null): TirageGagnant {
  return { state: "ok", lot: "Un café offert", codeRetrait: "TICKET-ABCD2345", expireLe };
}

beforeEach(() => {
  tirerTicketOr.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TicketExperience — l'expiration du retrait", () => {
  it("CONTRE-ÉPREUVE : un retrait encore valide s'affiche comme avant", () => {
    const code = codeNeuf();
    const demain = new Date(Date.now() + 3 * JOUR_MS).toISOString();
    memoriser(code, gain(demain));

    render(<TicketExperience code={code} />);

    expect(screen.getByText("Un café offert")).toBeTruthy();
    expect(screen.getByText("TICKET-ABCD2345")).toBeTruthy();
    expect(screen.getByText(/Montrez ce code au comptoir/)).toBeTruthy();
    expect(screen.queryByText(/délai de retrait est passé/)).toBeNull();
  });

  it("un retrait dont la date est passée bascule sur un écran « expiré » qui dit quoi faire", () => {
    const code = codeNeuf();
    const avantHier = new Date(Date.now() - 2 * JOUR_MS).toISOString();
    memoriser(code, gain(avantHier));

    render(<TicketExperience code={code} />);

    expect(screen.getByText("Le délai de retrait est passé")).toBeTruthy();
    // Le lot reste nommé, mais il n'est plus le titre plein écran qui invite
    // à se déplacer.
    expect(screen.getByText("Un café offert")).toBeTruthy();
    expect(screen.getByText(/Parlez-en au comptoir/)).toBeTruthy();
    expect(screen.queryByText(/Montrez ce code au comptoir/)).toBeNull();
    // Le code reste lisible pour le registre du commerçant, ANNONCÉ comme périmé.
    expect(screen.getByText(/TICKET-ABCD2345 · périmé/)).toBeTruthy();
  });

  it("une date de retrait illisible ne périme rien : la caisse reste seule juge", () => {
    const code = codeNeuf();
    memoriser(code, gain("pas-une-date"));

    render(<TicketExperience code={code} />);

    expect(screen.getByText(/Montrez ce code au comptoir/)).toBeTruthy();
  });
});

describe("TicketExperience — qui, du serveur ou de la copie locale, a le dernier mot", () => {
  it("CONTRE-ÉPREUVE : `deja_tire` continue de rendre le gain mémorisé", () => {
    const code = codeNeuf();
    const demain = new Date(Date.now() + 3 * JOUR_MS).toISOString();
    memoriser(code, gain(demain));
    tirerTicketOr.mockResolvedValue({ state: "deja_tire" });

    render(<TicketExperience code={code} />);

    // La mémoire prime AVANT même tout appel : c'est le même ticket, et l'un
    // des deux porte le lot. Aucun bouton n'est proposé.
    expect(screen.getByText("Un café offert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ouvrir mon ticket" })).toBeNull();
    expect(tirerTicketOr).not.toHaveBeenCalled();
  });

  it("un refus EXPLICITE du serveur (`sans_lot`) n'est plus recouvert par la copie locale", async () => {
    const code = codeNeuf();
    tirerTicketOr.mockResolvedValue({ state: "sans_lot" });

    render(<TicketExperience code={code} />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon ticket" }));

    await waitFor(() =>
      expect(screen.getByText(/plus rien à gagner pour le moment/)).toBeTruthy(),
    );
    expect(screen.queryByText("Un café offert")).toBeNull();
  });

  it("une coupure réseau conserve le nonce et rejoue exactement la même tentative", async () => {
    const code = codeNeuf();
    tirerTicketOr
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(gain(new Date(Date.now() + JOUR_MS).toISOString()));

    render(<TicketExperience code={code} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Ouvrir mon ticket" }),
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/nous ne savons pas si l'ouverture a abouti/i)).toBeTruthy();
    const premierNonce = tirerTicketOr.mock.calls[0]?.[1];
    expect(premierNonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(window.localStorage.getItem(cleNonceTicket(code))).toBe(premierNonce);

    fireEvent.click(
      await screen.findByRole("button", { name: "Ouvrir mon ticket" }),
    );
    await waitFor(() => expect(screen.getByText("Un café offert")).toBeTruthy());

    expect(tirerTicketOr).toHaveBeenNthCalledWith(2, code, premierNonce);
    expect(window.localStorage.getItem(cleNonceTicket(code))).toBeNull();
  });

  it("n'appelle jamais le serveur si le nonce ne peut pas être persisté", async () => {
    const code = codeNeuf();
    const setItem = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    render(<TicketExperience code={code} />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon ticket" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/ne permet pas de sécuriser le tirage/i)).toBeTruthy();
    expect(tirerTicketOr).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
