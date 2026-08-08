// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lireToasts, viderToasts } from "@/lib/toast-bus";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import type { ActionResult } from "@/lib/utils";

/**
 * LA FILE D'ATTENTE — ce que le drop silencieux coûtait.
 *
 * `useActionForm` jetait toute soumission arrivée pendant qu'une autre volait.
 * Avec un bouton, c'est le second clic, donc un doublon évité. Avec
 * l'enregistrement automatique, c'est la FRAPPE QUI SUIT le départ d'une
 * sauvegarde : elle disparaissait sans trace, et le formulaire affichait
 * « Enregistré. » pour la valeur d'avant. L'accusé de réception était exact,
 * mais il portait sur un contenu qui n'était plus celui de l'écran.
 *
 * Le test central est donc celui-ci : deux soumissions rapprochées → DEUX
 * appels à l'action, et le second porte la DERNIÈRE valeur du formulaire.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

type Action = (
  prev: ActionResult<void> | null,
  formData: FormData,
) => Promise<ActionResult<void>>;

/**
 * Formulaire minimal, RENDU PAR REACT — c'est indispensable et non un confort
 * de test : le rejeu passe par `form.requestSubmit()`, dont l'événement natif
 * doit ressortir dans le `onSubmit` de React pour prouver quoi que ce soit.
 * Un appel direct au gestionnaire ne prouverait rien de ce chemin-là.
 */
function Formulaire({
  action,
  options,
}: {
  action: Action;
  options?: Parameters<typeof useActionForm>[1];
}) {
  const { state, pending, onSubmit } = useActionForm(action, options);
  return (
    <form onSubmit={onSubmit} aria-label="essai">
      <input name="titre" defaultValue="premier" aria-label="titre" />
      <button type="submit">{pending ? "…" : "Enregistrer"}</button>
      {state?.ok && <p>Enregistré.</p>}
    </form>
  );
}

/** Une action dont on choisit l'instant de résolution, appel par appel. */
function actionDifferee() {
  const resolveurs: ((resultat: ActionResult<void>) => void)[] = [];
  const valeursRecues: (string | null)[] = [];
  const action = vi.fn<Action>((_prev, formData) => {
    valeursRecues.push(formData.get("titre") as string | null);
    return new Promise<ActionResult<void>>((resolve) => {
      resolveurs.push(resolve);
    });
  });
  const repondre = async (index: number, resultat?: ActionResult<void>) => {
    await act(async () => {
      resolveurs[index](resultat ?? { ok: true, data: undefined });
    });
  };
  return { action, valeursRecues, repondre };
}

beforeEach(() => {
  refresh.mockClear();
  viderToasts();
});
afterEach(cleanup);

describe("useActionForm — la soumission concurrente est mise en file, pas jetée", () => {
  it("rejoue la soumission en attente AVEC la dernière valeur du formulaire", async () => {
    const { action, valeursRecues, repondre } = actionDifferee();
    render(<Formulaire action={action} />);
    const form = screen.getByRole("form", { name: "essai" });
    const champ = screen.getByLabelText("titre") as HTMLInputElement;

    // Départ n°1 : l'action part avec « premier » et reste en vol.
    fireEvent.submit(form);
    expect(action).toHaveBeenCalledTimes(1);

    // L'utilisateur continue de taper pendant que la sauvegarde vole, et une
    // seconde soumission part. AVANT : elle était jetée sans trace.
    champ.value = "dernier";
    fireEvent.submit(form);
    expect(action).toHaveBeenCalledTimes(1); // en file, pas en double vol

    // La première atterrit : la file se vide, et le rejeu relit le formulaire.
    await repondre(0);
    expect(action).toHaveBeenCalledTimes(2);
    expect(valeursRecues).toEqual(["premier", "dernier"]);

    await repondre(1);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("ne garde qu'UNE place : trois frappes concurrentes → un seul rejeu, le dernier état", async () => {
    // La file ne rejoue pas chaque frappe — ce serait N allers-retours pour
    // rien. Ce qui compte est de FINIR sur la dernière valeur.
    const { action, valeursRecues, repondre } = actionDifferee();
    render(<Formulaire action={action} />);
    const form = screen.getByRole("form", { name: "essai" });
    const champ = screen.getByLabelText("titre") as HTMLInputElement;

    fireEvent.submit(form);
    champ.value = "b";
    fireEvent.submit(form);
    champ.value = "c";
    fireEvent.submit(form);
    champ.value = "d";
    fireEvent.submit(form);

    await repondre(0);
    expect(action).toHaveBeenCalledTimes(2);
    expect(valeursRecues).toEqual(["premier", "d"]);
  });

  it("sans concurrence, rien ne change : un geste, un appel", async () => {
    const { action, repondre } = actionDifferee();
    render(<Formulaire action={action} />);
    const form = screen.getByRole("form", { name: "essai" });

    fireEvent.submit(form);
    await repondre(0);
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Enregistré.")).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("rejoue aussi après un ÉCHEC : la frappe en attente n'est pas punie", async () => {
    const { action, valeursRecues, repondre } = actionDifferee();
    render(<Formulaire action={action} />);
    const form = screen.getByRole("form", { name: "essai" });
    const champ = screen.getByLabelText("titre") as HTMLInputElement;

    fireEvent.submit(form);
    champ.value = "dernier";
    fireEvent.submit(form);
    await repondre(0, { ok: false, error: "Trop long." });

    expect(valeursRecues).toEqual(["premier", "dernier"]);
  });

  it("ne rejoue PAS par-dessus un formulaire qui vient d'être vidé", async () => {
    // `resetOnSuccess` remet le formulaire à blanc. Rejouer là-dessus posterait
    // un formulaire VIDE — exactement ce que la file cherche à éviter.
    const { action, valeursRecues, repondre } = actionDifferee();
    render(<Formulaire action={action} options={{ resetOnSuccess: true }} />);
    const form = screen.getByRole("form", { name: "essai" });
    const champ = screen.getByLabelText("titre") as HTMLInputElement;

    fireEvent.submit(form);
    champ.value = "dernier";
    fireEvent.submit(form);
    await repondre(0);

    expect(action).toHaveBeenCalledTimes(1);
    expect(valeursRecues).toEqual(["premier"]);
  });

  it("le réseau coupé le dit, et laisse le formulaire réutilisable", async () => {
    const action = vi.fn<Action>(() => Promise.reject(new Error("offline")));
    render(
      <Formulaire
        action={action}
        options={{ networkError: "Action impossible, réessayez." }}
      />,
    );
    const form = screen.getByRole("form", { name: "essai" });

    await act(async () => {
      fireEvent.submit(form);
    });
    expect(screen.queryByText("Enregistré.")).toBeNull();

    await act(async () => {
      fireEvent.submit(form);
    });
    // Le verrou est bien retombé : le second geste repart.
    expect(action).toHaveBeenCalledTimes(2);
  });
});

/**
 * LES DEUX PIÈCES ENSEMBLE — c'est le montage que les vagues suivantes
 * poseront sur les formulaires : `useActionForm` garde son appel LITTÉRAL (les
 * gardes mécaniques du dépôt le cherchent tel quel dans les `.tsx`), et
 * `useAutoSave` s'ajoute À CÔTÉ pour déclencher la soumission.
 */
function FormulaireAutoEnregistre({ action }: { action: Action }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, onSubmit } = useActionForm(action, {
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente } = useAutoSave(formRef, { delai: 500 });
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-label="auto">
      <input name="titre" aria-label="titre" defaultValue="premier" />
      <p>{enAttente ? "En attente" : "À jour"}</p>
      {state?.ok && <p>Enregistré.</p>}
    </form>
  );
}

describe("useAutoSave + useActionForm — la frappe pendant l'envoi n'est pas perdue", () => {
  it("enregistre la DERNIÈRE valeur, même tapée pendant que la précédente vole", async () => {
    vi.useFakeTimers();
    try {
      const { action, valeursRecues, repondre } = actionDifferee();
      render(<FormulaireAutoEnregistre action={action} />);
      const champ = screen.getByLabelText("titre") as HTMLInputElement;

      // Première frappe → délai → la sauvegarde part avec « premier ».
      champ.value = "premier";
      fireEvent.input(champ);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(action).toHaveBeenCalledTimes(1);

      // L'utilisateur continue de taper PENDANT que la requête vole.
      champ.value = "corrigé";
      fireEvent.input(champ);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      // Mise en file : rien ne part en double vol, et rien n'est jeté.
      expect(action).toHaveBeenCalledTimes(1);

      await repondre(0);
      expect(valeursRecues).toEqual(["premier", "corrigé"]);
      await repondre(1);
      expect(lireToasts().map((t) => t.message)).toEqual([
        "Enregistré.",
        "Enregistré.",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useActionForm — toastOnSuccess", () => {
  it("pousse le message dans l'émetteur global après un succès", async () => {
    const { action, repondre } = actionDifferee();
    render(
      <Formulaire action={action} options={{ toastOnSuccess: "Enregistré." }} />,
    );
    fireEvent.submit(screen.getByRole("form", { name: "essai" }));
    await repondre(0);

    expect(lireToasts().map((t) => [t.message, t.ton])).toEqual([
      ["Enregistré.", "succes"],
    ]);
  });

  it("ne pousse RIEN sur un échec, ni sans l'option", async () => {
    const premier = actionDifferee();
    const { unmount } = render(
      <Formulaire
        action={premier.action}
        options={{ toastOnSuccess: "Enregistré." }}
      />,
    );
    fireEvent.submit(screen.getByRole("form", { name: "essai" }));
    await premier.repondre(0, { ok: false, error: "Non." });
    expect(lireToasts()).toEqual([]);
    unmount();

    const second = actionDifferee();
    render(<Formulaire action={second.action} />);
    fireEvent.submit(screen.getByRole("form", { name: "essai" }));
    await second.repondre(0);
    expect(lireToasts()).toEqual([]);
  });

  it("n'altère pas `state` : le message local reste la source de vérité", async () => {
    // Les gardes mécaniques du dépôt exigent que le composant rende son
    // `state?.ok`. Un toast s'AJOUTE, il ne remplace pas.
    const { action, repondre } = actionDifferee();
    render(
      <Formulaire action={action} options={{ toastOnSuccess: "Enregistré." }} />,
    );
    fireEvent.submit(screen.getByRole("form", { name: "essai" }));
    await repondre(0);
    expect(screen.getByText("Enregistré.")).toBeTruthy();
  });
});
