import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { CHEMINS_PROPRIETAIRE, estReserveAuProprietaire } from "@/lib/liens-proprietaire";
import { reportError } from "@/lib/monitoring";
import { createClient } from "@/lib/supabase/server";
import {
  chargerCentreAnimation,
  construireActionsEquipe,
} from "./centre-animation-server";

const ORG = "00000000-0000-4000-8000-000000000001";

const COMPTEURS_RPC = {
  drafts: 3,
  live_experiences: 2,
  qr_never_scanned: 1,
  low_stock_prizes: 4,
  rewards_to_hand_over: 5,
};

const TOUT_A_ZERO = {
  drafts: 0,
  qrToTest: 0,
  liveExperiences: 1,
  lowStockPrizes: 0,
  rewardsToHandOver: 0,
};

function monterRpc(reponse: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({
    data: reponse.data ?? null,
    error: reponse.error ?? null,
  });
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => vi.clearAllMocks());

describe("chargerCentreAnimation", () => {
  it("refuse la caisse SANS appeler la RPC", async () => {
    const rpc = monterRpc({ data: [COMPTEURS_RPC] });
    await expect(chargerCentreAnimation(ORG, "cashier")).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("transpose la ligne unique de la RPC, sans rattrapage défensif", async () => {
    const rpc = monterRpc({ data: [COMPTEURS_RPC] });
    const resultat = await chargerCentreAnimation(ORG, "owner");

    expect(rpc).toHaveBeenCalledWith("org_animation_center_counts", {
      p_organization_id: ORG,
    });
    expect(resultat?.compteurs).toMatchObject({
      drafts: 3,
      liveExperiences: 2,
      qrToTest: 1,
      lowStockPrizes: 4,
      rewardsToHandOver: 5,
    });
  });

  it("rend null (et le signale) sur erreur ou tableau vide", async () => {
    monterRpc({ error: { message: "not authorized" } });
    await expect(chargerCentreAnimation(ORG, "editor")).resolves.toBeNull();

    monterRpc({ data: [] });
    await expect(chargerCentreAnimation(ORG, "editor")).resolves.toBeNull();

    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it("teamTasks est DÉRIVÉ du nombre d'actions ready", async () => {
    monterRpc({ data: [COMPTEURS_RPC] });
    const resultat = await chargerCentreAnimation(ORG, "owner");
    const pretes = resultat?.actionsEquipe.filter((a) => a.status === "ready");
    expect(resultat?.compteurs.teamTasks).toBe(pretes?.length);
    expect(resultat?.compteurs.teamTasks).toBeGreaterThan(0);
  });

  it("tout à zéro : plus aucune tâche d'équipe", async () => {
    monterRpc({
      data: [
        {
          drafts: 0,
          live_experiences: 1,
          qr_never_scanned: 0,
          low_stock_prizes: 0,
          rewards_to_hand_over: 0,
        },
      ],
    });
    const resultat = await chargerCentreAnimation(ORG, "owner");
    expect(resultat?.compteurs.teamTasks).toBe(0);
    expect(resultat?.actionsEquipe.every((a) => a.status === "done")).toBe(true);
  });
});

describe("construireActionsEquipe", () => {
  it("passe à done quand le compteur retombe à zéro", () => {
    const actions = construireActionsEquipe(TOUT_A_ZERO, "owner");
    expect(actions.every((action) => action.status === "done")).toBe(true);

    const avecTravail = construireActionsEquipe(
      { ...TOUT_A_ZERO, lowStockPrizes: 2 },
      "owner",
    );
    const lots = avecTravail.find((a) => a.key === "recharger-les-lots");
    expect(lots?.status).toBe("ready");
    expect(lots?.href).toBe("/dashboard/campaigns");
  });

  it("aucune animation en ligne : l'action propriétaire s'allume", () => {
    const actions = construireActionsEquipe(
      { ...TOUT_A_ZERO, liveExperiences: 0 },
      "owner",
    );
    const modules = actions.find((a) => a.key === "verifier-les-modules");
    expect(modules?.status).toBe("ready");
    expect(modules?.assigneeRole).toBe("owner");
  });

  it("attribue les gains à remettre à la caisse, visible de tous", () => {
    const action = construireActionsEquipe(
      { ...TOUT_A_ZERO, rewardsToHandOver: 7 },
      "editor",
    ).find((a) => a.key === "remettre-les-gains");
    expect(action?.assigneeRole).toBe("cashier");
    expect(action?.availableTo).toContain("cashier");
    expect(action?.href).toBe("/dashboard/redeem");
  });

  it("AUCUN href ne contourne lienSelonRole", () => {
    for (const role of ["owner", "editor"] as const) {
      for (const action of construireActionsEquipe(
        {
          drafts: 1,
          qrToTest: 1,
          liveExperiences: 0,
          lowStockPrizes: 1,
          rewardsToHandOver: 1,
        },
        role,
      )) {
        if (action.href && estReserveAuProprietaire(action.href)) {
          expect(role).toBe("owner");
        }
      }
    }
  });

  /**
   * LE DOUBLON RETIRÉ, ET LA GARDE QUI L'EMPÊCHE DE REVENIR.
   *
   * « Vérifier les participations à valider » lisait EXACTEMENT le même
   * compteur que « Remettre les gains au comptoir » : deux lignes voisines,
   * allumées et éteintes ensemble, pour un seul fait. Un compteur ne doit
   * porter qu'une action.
   */
  it("aucun compteur ne porte deux actions différentes", () => {
    const compteurs = { ...TOUT_A_ZERO, rewardsToHandOver: 3 };
    const actions = construireActionsEquipe(compteurs, "owner");

    expect(actions.map((a) => a.key)).not.toContain(
      "verifier-les-participations",
    );
    // Un seul « à faire » alors que le seul compteur allumé est celui des gains.
    expect(actions.filter((a) => a.status === "ready").map((a) => a.key)).toEqual(
      ["remettre-les-gains"],
    );
    // Le registre des participations reste réservé au propriétaire : c'est la
    // tuile « Gains à remettre » de la page qui le filtre, plus une action.
    expect(CHEMINS_PROPRIETAIRE).toContain("/dashboard/participations");
    for (const action of actions) {
      if (action.href) expect(estReserveAuProprietaire(action.href)).toBe(false);
    }
  });
});
