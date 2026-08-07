// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";

/**
 * LE SLOT `action` EST LA SEULE CHOSE QUI PEUT CRÉER QUELQUE CHOSE ICI.
 *
 * L'état sait dire « blocked » ; s'il le dit et que le bouton reste à l'écran,
 * le commerçant clique sur une action que le serveur refusera. La garde
 * serveur ferait son travail — mais l'écran aurait menti. Ces tests gravent
 * que le slot ne sort JAMAIS d'un état bloqué, pour chacune des trois raisons.
 */

afterEach(cleanup);

const bouton = <button type="submit">Créer le brouillon</button>;

describe("RelaunchFormulaCard — le bouton et les trois refus", () => {
  it("rend le slot action quand la relance est éligible", () => {
    render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        occasionLabel="les soldes"
        sourceState="completed"
        canCreateDraft
        isSupported
        action={bouton}
      />,
    );

    expect(screen.getByRole("button", { name: "Créer le brouillon" })).toBeTruthy();
    expect(screen.getByText("La structure et les réglages compatibles")).toBeTruthy();
  });

  /**
   * UN REFUS N'A DE SENS QU'APRÈS UNE TENTATIVE.
   *
   * La carte s'affichait sur CHAQUE animation, brouillon neuf compris, pour y
   * écrire « Terminez ou clôturez d'abord… » — un pavé que personne n'avait
   * demandé, en bas de chaque page. Elle se tait désormais tant que la source
   * n'est pas clôturée : il n'y a rien à refuser à qui n'a rien demandé.
   */
  it("ne rend RIEN du tout si l'animation n'est pas terminée", () => {
    const { container } = render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="not_completed"
        canCreateDraft
        isSupported
        action={bouton}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("ne rend RIEN du tout si la formule n'est pas copiable", () => {
    const { container } = render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="not_completed"
        canCreateDraft
        isSupported={false}
        action={bouton}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("ne rend pas le slot si le rôle ne peut pas créer de brouillon", () => {
    render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="completed"
        canCreateDraft={false}
        isSupported
        action={bouton}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Seul un propriétaire ou un éditeur autorisé/)).toBeTruthy();
  });

  it("ne rend rien si la formule n'est pas copiable, même clôturée", () => {
    const { container } = render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="completed"
        canCreateDraft
        isSupported={false}
        action={bouton}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("reste lisible sans slot : la carte explique, même sans bouton branché", () => {
    render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="completed"
        canCreateDraft
        isSupported
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Jamais repris")).toBeTruthy();
    expect(screen.getByText("Les participants")).toBeTruthy();
  });

  it("nomme l'animation source, et l'occasion seulement si elle est fournie", () => {
    const { unmount } = render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        occasionLabel="Noël"
        sourceState="completed"
        canCreateDraft
        isSupported
      />,
    );
    expect(screen.getByText(/Pour Noël, vous/)).toBeTruthy();
    unmount();

    render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="completed"
        canCreateDraft
        isSupported
      />,
    );
    // Sans occasion, aucune phrase tronquée du genre « Pour , vous ».
    expect(screen.queryByText(/Pour ,/)).toBeNull();
  });
});
