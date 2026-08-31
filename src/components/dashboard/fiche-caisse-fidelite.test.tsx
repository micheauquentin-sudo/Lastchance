// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const stampLoyaltyVisitStaff = vi.fn();
vi.mock("@/actions/loyalty", () => ({ stampLoyaltyVisitStaff }));
// La caméra n'a rien à faire ici : le scanner monte `getUserMedia` et un import
// dynamique de jsQR, tous deux hors sujet pour ce que ce fichier garde.
vi.mock("@/components/dashboard/qr-scanner", () => ({ QrScanner: () => null }));

const { LoyaltyStaffStamp } = await import(
  "@/components/dashboard/loyalty-staff-stamp"
);

/**
 * LA FICHE CLIENT DE LA CAISSE (FID-6a).
 *
 * Quatre propriétés, dont aucune ne se voit au diff :
 *
 *  · les cadeaux À PORTÉE du solde sont nommés — c'est l'information qui
 *    déclenche une vente au comptoir, et la seule raison d'être de la fiche ;
 *  · un cadeau ÉPUISÉ n'est jamais proposé, même quand le solde le couvre :
 *    la base refuserait d'émettre le code, et le comptoir aurait promis ;
 *  · un cadeau épuisé ne devient pas non plus « le prochain palier » — sans
 *    quoi la caisse ferait viser au client un lot qui n'existe plus ;
 *  · AUCUN aller-retour n'est ajouté au tampon : le catalogue arrive en props
 *    et la fiche se peint avec la confirmation, sans second appel.
 */

const FICHE = "Ce que ce client peut prendre";

const PROGRAMME = {
  id: "prog-1",
  name: "Café des Sports",
  milestones: [
    { id: "m1", costPoints: 100, rewardLabel: "Café offert", rewardType: "lot" as const, soldOut: false },
    { id: "m2", costPoints: 200, rewardLabel: "Croissant offert", rewardType: "lot" as const, soldOut: true },
    { id: "m3", costPoints: 500, rewardLabel: "Menu offert", rewardType: "lot" as const, soldOut: false },
  ],
};

/** Un tampon réussi avec le solde voulu — le reste aux valeurs neutres. */
function tamponne(pointsBalance: number) {
  return {
    ok: true as const,
    data: {
      state: "stamped",
      program: { id: "prog-1", name: "Café des Sports", validationMode: "staff" },
      visitCount: 3,
      pointsBalance,
      pointsEarnedTotal: pointsBalance,
      tier: "bronze",
      tierThresholds: { silver: 500, gold: 1000 },
      isNewMember: false,
      milestonesReached: [],
      nextMilestone: null,
      retryInSeconds: null,
    },
  };
}

/**
 * Joue un scan par la saisie manuelle (le scanner est neutralisé) et rend la
 * fiche. L'`input` vit dans un `<details>` fermé, mais il est présent dans le
 * DOM : inutile de déplier pour le remplir.
 */
async function scanner(solde: number) {
  stampLoyaltyVisitStaff.mockResolvedValue(tamponne(solde));
  render(<LoyaltyStaffStamp programs={[PROGRAMME]} />);
  fireEvent.change(
    screen.getByLabelText("Code de validation affiché par le client"),
    { target: { value: "jeton-de-test" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Valider" }));
  return screen.findByRole("region", { name: FICHE });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("fiche client de la caisse fidélité", () => {
  it("nomme les cadeaux que le solde couvre, et le solde lui-même", async () => {
    const fiche = await scanner(250);

    expect(within(fiche).getByText("250")).toBeTruthy();
    expect(within(fiche).getByText("Café offert")).toBeTruthy();
  });

  it("ne propose jamais un cadeau épuisé, même couvert par le solde", async () => {
    const fiche = await scanner(250);

    // 200 points ≤ 250 : sans le filtre `soldOut`, la caisse l'annoncerait.
    expect(within(fiche).queryByText("Croissant offert")).toBeNull();
  });

  it("vise le prochain cadeau SERVABLE et chiffre ce qui manque", async () => {
    const fiche = await scanner(250);

    // Le suivant n'est pas le croissant (épuisé) mais le menu à 500 : il manque
    // donc 250 points, et non les 0 qu'un croissant déjà couvert aurait donnés.
    expect(fiche.textContent).toContain("Prochain cadeau à 500 points");
    expect(fiche.textContent).toContain("250 point");
  });

  it("n'ajoute aucun appel au geste de caisse", async () => {
    await scanner(250);

    // UN SEUL aller-retour : celui qui enregistre la visite. Le catalogue est
    // arrivé en props avec la page.
    expect(stampLoyaltyVisitStaff).toHaveBeenCalledTimes(1);
  });
});
