// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  creerLotTicketOr: vi.fn(),
  modifierLotTicketOr: vi.fn(),
  supprimerLotTicketOr: vi.fn(),
}));
const useActionForm = vi.hoisted(() => vi.fn());

vi.mock("@/actions/ticket-or", () => actions);
vi.mock("@/lib/use-action-form", () => ({ useActionForm }));

import { LotsTicket } from "@/components/ticket/lots-ticket";

afterEach(() => {
  cleanup();
  useActionForm.mockReset();
});

describe("LotsTicket — création de lot", () => {
  it("réinitialise puis recharge après un succès pour rendre le lot créé", () => {
    useActionForm.mockReturnValue({
      state: null,
      pending: false,
      onSubmit: vi.fn(),
    });

    render(<LotsTicket lots={[]} peutRegler />);

    expect(useActionForm).toHaveBeenCalledTimes(1);
    expect(useActionForm).toHaveBeenCalledWith(
      actions.creerLotTicketOr,
      expect.objectContaining({
        resetOnSuccess: true,
        reloadOnSuccess: true,
      }),
    );
  });
});
