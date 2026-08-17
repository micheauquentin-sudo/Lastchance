// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const participateJackpotStaff = vi.fn();
vi.mock("@/actions/jackpot", () => ({ participateJackpotStaff }));
// Le scanner demande la caméra et charge jsQR : hors sujet ici. Seule sa
// PRÉSENCE et son libellé — distinct de celui de la fidélité — nous intéressent.
vi.mock("@/components/dashboard/qr-scanner", () => ({
  QrScanner: ({ label }: { label: string }) => <div>{label}</div>,
}));

const { JackpotStaffCheckin } = await import(
  "@/components/dashboard/jackpot-staff-checkin"
);

/**
 * L'ÉCRAN DE CAISSE DU JACKPOT EN MODE STAFF — CE QU'IL DOIT TENIR.
 *
 * Le mode `staff` était vendu au commerçant, la page joueur affichait son code,
 * `participateJackpotStaff` existait complète et gardée — et aucune surface de
 * caisse ne l'appelait. Ce test tient les propriétés de la surface neuve :
 *
 *  1. PAS DE JACKPOT STAFF, PAS DE SECTION. Un commerçant qui n'en a aucun ne
 *     doit pas lire un écran de caisse pour un mode qu'il n'utilise pas.
 *  2. RIEN NE PART AU CHARGEMENT — une participation est un geste, jamais un
 *     effet de bord du rendu de la page.
 *  3. LES TROIS ISSUES PARLENT (enregistrée, code invalide, trop tôt), dans les
 *     mots de `messageForJackpotParticipation` — ceux que lit aussi le client.
 *  4. LE DÉCOMPTE NE COMPTE QUE LE RÉEL : un refus ne gonfle aucun compteur.
 *  5. LE RÉSEAU COUPÉ NE FIGE PAS LA CAISSE (le rejet de promesse est enveloppé
 *     dès le premier jour, contrairement au modèle fidélité d'origine).
 */

const CAMPAIGNS = [{ id: "j1", name: "Cagnotte du Café des Sports" }];

const recorded = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    state: "recorded",
    campaign: { id: "j1", name: "Cagnotte du Café des Sports", drawMode: "threshold_draw" },
    currentCount: 7,
    threshold: 20,
    cycle: 1,
    isNewPlayer: false,
    isWinner: false,
    code: null,
    outOfStock: false,
    armed: false,
    ...extra,
  },
});

function valider(token = "abcdefghijklmnopqrstuvwx.signature") {
  fireEvent.change(screen.getByLabelText("Code jackpot affiché par le client"), {
    target: { value: token },
  });
  fireEvent.click(screen.getByRole("button", { name: "Valider" }));
}

// LES ACCOLADES SONT OBLIGATOIRES ICI. `mockReset()` RENVOIE le mock, qui est
// une fonction : un `beforeEach(() => mock.mockReset())` la rend donc à Vitest,
// qui prend toute fonction retournée par un hook pour un DÉMONTAGE et l'appelle
// après le test. L'action partait ainsi une fois de plus, hors de tout `await` —
// une promesse rejetée que personne n'attrape, signalée en erreur non gérée sur
// un test dont les assertions passaient. Une heure pour le voir.
beforeEach(() => {
  participateJackpotStaff.mockReset();
});
afterEach(cleanup);

describe("JackpotStaffCheckin", () => {
  it("aucun jackpot staff : la section n'existe pas", () => {
    const { container } = render(<JackpotStaffCheckin campaigns={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("ne valide RIEN au chargement, et son scanner se distingue de la fidélité", () => {
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    expect(participateJackpotStaff).not.toHaveBeenCalled();
    // Libellé DISTINCT de « Scanner le passeport du client » : les deux
    // sections cohabitent sur la page caisse.
    expect(screen.getByText("🎰 Scanner le code jackpot du client")).toBeTruthy();
  });

  it("un seul jackpot : pas de sélecteur inutile", () => {
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    expect(screen.queryByLabelText("Jackpot")).toBeNull();
  });

  it("plusieurs jackpots : le staff choisit lequel", () => {
    render(
      <JackpotStaffCheckin
        campaigns={[...CAMPAIGNS, { id: "j2", name: "Cagnotte de Noël" }]}
      />,
    );
    expect(screen.getByLabelText("Jackpot")).toBeTruthy();
  });

  it("participation enregistrée : l'issue, la progression et le décompte", async () => {
    participateJackpotStaff.mockResolvedValue(recorded());
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    valider();

    expect(await screen.findByText("Participation enregistrée !")).toBeTruthy();
    expect(participateJackpotStaff).toHaveBeenCalledWith({
      campaignId: "j1",
      checkinToken: "abcdefghijklmnopqrstuvwx.signature",
    });
    // Le jeton du client accepté tel quel (forme `corps.signature`), et la
    // progression du cycle lue depuis la réponse, jamais recalculée ici.
    expect(screen.getByText(/7 participations sur 20/)).toBeTruthy();
    expect(screen.getByText(/1 participation validée/)).toBeTruthy();
    expect(screen.getByText(/👤 Client connu/)).toBeTruthy();
  });

  it("premier passage : le nouveau joueur est signalé et compté", async () => {
    participateJackpotStaff.mockResolvedValue(recorded({ isNewPlayer: true }));
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    valider();

    expect(await screen.findByText(/✨ Nouveau client/)).toBeTruthy();
    expect(screen.getByText(/1 nouveau joueur/)).toBeTruthy();
  });

  it("gagnant : le code de retrait s'affiche pour la caisse", async () => {
    participateJackpotStaff.mockResolvedValue(
      recorded({ isWinner: true, code: "JACKPOT-ABC123" }),
    );
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    valider();

    expect(await screen.findByText("🎉 Jackpot remporté !")).toBeTruthy();
    expect(screen.getByText("JACKPOT-ABC123")).toBeTruthy();
  });

  it("code invalide : on l'annonce, et rien n'est compté", async () => {
    participateJackpotStaff.mockResolvedValue({
      ok: true,
      data: {
        state: "invalid_code",
        campaign: null,
        currentCount: 0,
        threshold: 0,
        cycle: 0,
        isNewPlayer: false,
        isWinner: false,
        code: null,
        outOfStock: false,
        armed: false,
      },
    });
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    valider();

    expect(await screen.findByText("Code incorrect")).toBeTruthy();
    // Un refus n'est PAS une participation : le décompte de session reste muet.
    expect(screen.queryByText(/participation validée/)).toBeNull();
  });

  it("déjà participé : le délai est dit, sans rien compter", async () => {
    participateJackpotStaff.mockResolvedValue({
      ok: true,
      data: {
        state: "too_soon",
        campaign: null,
        currentCount: 0,
        threshold: 0,
        cycle: 0,
        isNewPlayer: false,
        isWinner: false,
        code: null,
        outOfStock: false,
        armed: false,
        retryInSeconds: 600,
      },
    });
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    valider();

    expect(await screen.findByText("Vous venez déjà de participer")).toBeTruthy();
    expect(screen.getByText(/10 min/)).toBeTruthy();
    expect(screen.queryByText(/participation validée/)).toBeNull();
  });

  it("refus du serveur : le motif est affiché en alerte", async () => {
    participateJackpotStaff.mockResolvedValue({
      ok: false,
      error: "Carte expirée ou illisible — demandez au client de rafraîchir son écran.",
    });
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    valider();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Carte expirée ou illisible/)).toBeTruthy();
  });

  it("réseau coupé : la caisse ne reste PAS sur « Validation en cours… »", async () => {
    participateJackpotStaff.mockRejectedValue(new Error("offline"));
    render(<JackpotStaffCheckin campaigns={CAMPAIGNS} />);
    valider();

    expect(await screen.findByText(/Connexion perdue/)).toBeTruthy();
    // Le poste doit rester utilisable : un client attend devant.
    expect(screen.queryByText("Validation en cours…")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Valider" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});

/**
 * LA SECTION EST BIEN MONTÉE SUR LA PAGE CAISSE, ET SOUS CONDITION.
 *
 * La page est un Server Component asynchrone dont la chaîne d'imports atteint
 * `next/headers` et le client Supabase : la rendre coûterait plus de mocks que
 * la valeur du signal (même arbitrage que `pass-termine.test.ts`). Ce qui est
 * gravé ici est donc précis — et c'est exactement ce qu'une réécriture pourrait
 * perdre sans faire rougir quoi que ce soit d'autre.
 */
describe("La page caisse ouvre le jackpot staff", () => {
  const SOURCE = readFileSync(
    path.join(process.cwd(), "src/app/dashboard/redeem/page.tsx"),
    "utf8",
  );

  it("rend la section", () => {
    expect(SOURCE).toContain("<JackpotStaffCheckin campaigns={staffJackpots} />");
  });

  it("ne la remplit que si le module est ouvert à l'organisation", () => {
    expect(SOURCE).toContain("hasJackpotAccess(organization)");
  });

  it("ne remonte que les jackpots actifs en mode staff de CETTE organisation", () => {
    const requete = SOURCE.slice(SOURCE.indexOf('from("jackpot_campaigns")'));
    // Le filtre multi-tenant fait partie du contrat : sans lui, la caisse
    // listerait les jackpots d'autrui.
    expect(requete).toContain('.eq("organization_id", organization.id)');
    expect(requete).toContain('.eq("status", "active")');
    expect(requete).toContain('.eq("validation_mode", "staff")');
  });
});

/**
 * LE CLIENT DOIT POUVOIR DICTER SON CODE. La caisse offre une saisie manuelle,
 * mais le jeton n'existait qu'en pixels dans le QR : sur un poste sans caméra
 * utilisable, personne ne pouvait rien saisir. Le repli en texte partage le
 * MÊME jeton (même secret, même durée de vie) — aucune exposition nouvelle.
 */
describe("La page joueur du jackpot expose le code en texte", () => {
  const SOURCE = readFileSync(
    path.join(process.cwd(), "src/components/jackpot/jackpot-tracker.tsx"),
    "utf8",
  );

  it("offre un pli « Afficher le code » sous le QR", () => {
    expect(SOURCE).toContain("Afficher le code");
  });

  it("y rend le jeton lui-même, sélectionnable", () => {
    const pli = SOURCE.slice(SOURCE.indexOf("Afficher le code"));
    expect(pli.slice(0, 600)).toContain("{token}");
    expect(pli.slice(0, 600)).toContain("select-all");
  });
});
