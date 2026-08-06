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

  it("ne rend pas le slot si l'animation n'est pas terminée", () => {
    render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="not_completed"
        canCreateDraft
        isSupported
        action={bouton}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Terminez ou clôturez d'abord/)).toBeTruthy();
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

  it("ne rend pas le slot si la formule n'est pas copiable", () => {
    render(
      <RelaunchFormulaCard
        sourceName="Quiz de la carte"
        sourceState="completed"
        canCreateDraft
        isSupported={false}
        action={bouton}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
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
