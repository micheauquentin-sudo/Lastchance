// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELAI_AUTO_SAVE_MS, useAutoSave } from "@/lib/use-auto-save";

/**
 * L'ENREGISTREMENT AUTOMATIQUE, ET LES TROIS FAÇONS DONT IL PEUT MENTIR.
 *
 *  1. Partir tout seul au montage — le dépôt a déjà payé cet incident
 *     (`contest-settings.tsx` : un champ vide au premier rendu effaçait la date
 *     de verrouillage d'un championnat). Ici, RIEN ne part sans un geste.
 *  2. Ne pas partir sans le dire — un formulaire invalide n'est pas soumis, et
 *     comme il n'y a plus de bouton, le seul signal restant est l'état rendu.
 *  3. Partir sur une valeur périmée — d'où le rejeu du délai à chaque frappe,
 *     et son vidage immédiat quand on quitte le champ.
 */

const DELAI_TEST = 500;

interface Sonde {
  soumissions: FormData[];
}

function Formulaire({
  sonde,
  actif,
  delai = DELAI_TEST,
  requis = false,
}: {
  sonde: Sonde;
  actif?: boolean;
  delai?: number;
  requis?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSave(formRef, {
    delai,
    actif,
  });
  return (
    <form
      ref={formRef}
      aria-label="auto"
      onSubmit={(event) => {
        event.preventDefault();
        sonde.soumissions.push(new FormData(event.currentTarget));
      }}
    >
      <input
        name="titre"
        aria-label="titre"
        required={requis}
        defaultValue={requis ? "" : "a"}
      />
      <input name="note" aria-label="note" />
      <p>{enAttente ? "En attente" : "À jour"}</p>
      {bloqueParValidation && <p>Non enregistré : un champ requis est vide</p>}
    </form>
  );
}

function avancer(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * L'onglet passe en arrière-plan (bascule d'application, verrouillage d'écran,
 * changement d'onglet). `document.hidden` est en lecture seule : on redéfinit
 * l'accesseur, comme le ferait le navigateur, puis on émet l'événement.
 */
function basculerVisibilite(cache: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => cache,
  });
  fireEvent(document, new Event("visibilitychange"));
}

function valeurs(sonde: Sonde): (string | null)[] {
  return sonde.soumissions.map((f) => f.get("titre") as string | null);
}

let sonde: Sonde;

beforeEach(() => {
  sonde = { soumissions: [] };
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  basculerVisibilite(false);
});

describe("useAutoSave — rien ne part sans un geste", () => {
  it("ne soumet PAS au montage, quoi qu'il arrive ensuite dans le temps", () => {
    render(<Formulaire sonde={sonde} />);
    avancer(60_000);
    expect(sonde.soumissions).toHaveLength(0);
    expect(screen.getByText("À jour")).toBeTruthy();
  });

  it("ne soumet pas non plus quand on quitte un formulaire qu'on n'a pas touché", () => {
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre");
    fireEvent.focusOut(champ, { relatedTarget: document.body });
    avancer(60_000);
    expect(sonde.soumissions).toHaveLength(0);
  });
});

describe("useAutoSave — le délai", () => {
  it("attend le délai, puis soumet une fois", () => {
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;

    champ.value = "b";
    fireEvent.input(champ);
    expect(sonde.soumissions).toHaveLength(0);
    expect(screen.getByText("En attente")).toBeTruthy();

    avancer(DELAI_TEST - 1);
    expect(sonde.soumissions).toHaveLength(0);

    avancer(1);
    expect(valeurs(sonde)).toEqual(["b"]);
    expect(screen.getByText("À jour")).toBeTruthy();
  });

  it("rejoue le délai à chaque frappe : trois touches, une seule soumission", () => {
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;

    for (const v of ["b", "bc", "bcd"]) {
      champ.value = v;
      fireEvent.input(champ);
      avancer(DELAI_TEST - 50);
    }
    expect(sonde.soumissions).toHaveLength(0);

    avancer(DELAI_TEST);
    expect(valeurs(sonde)).toEqual(["bcd"]);
  });

  it("écoute aussi `change` — cases, listes déroulantes, dates", () => {
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    champ.value = "z";
    fireEvent.change(champ);
    avancer(DELAI_TEST);
    expect(valeurs(sonde)).toEqual(["z"]);
  });

  it("respecte le délai fourni, et porte un défaut explicite", () => {
    render(<Formulaire sonde={sonde} delai={2000} />);
    fireEvent.input(screen.getByLabelText("titre"));
    avancer(1999);
    expect(sonde.soumissions).toHaveLength(0);
    avancer(1);
    expect(sonde.soumissions).toHaveLength(1);
    expect(DELAI_AUTO_SAVE_MS).toBe(800);
  });
});

/**
 * QUITTER L'ONGLET EST UNE SORTIE, ET C'EST CELLE QU'ON NE VOIT PAS.
 *
 * `focusout` couvre le passage d'un champ à l'autre. Il ne couvre PAS le geste
 * qui perd réellement du travail sur mobile : basculer d'application ou
 * verrouiller l'écran gèle la page sans déplacer le focus, et le navigateur
 * peut la décharger ensuite sans autre événement (`beforeunload` n'est pas tenu
 * sur iOS). Sans écouteur de visibilité, les 800 ms du délai étaient une
 * fenêtre de PERTE muette : la dernière frappe ne partait jamais, et l'écran
 * affichait « En attente » à un commerçant déjà parti.
 */
describe("useAutoSave — masquer l'onglet vide la file", () => {
  it("soumet SANS attendre quand l'onglet passe en arrière-plan", () => {
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    champ.value = "b";
    fireEvent.input(champ);

    basculerVisibilite(true);
    expect(valeurs(sonde)).toEqual(["b"]);

    // Minuteur désarmé : pas de seconde soumission au terme du délai.
    avancer(DELAI_TEST * 2);
    expect(sonde.soumissions).toHaveLength(1);
  });

  it("masquer un formulaire intact ne l'enregistre pas", () => {
    render(<Formulaire sonde={sonde} />);
    basculerVisibilite(true);
    avancer(60_000);
    expect(sonde.soumissions).toHaveLength(0);
  });

  /**
   * On enregistre en PARTANT, jamais en revenant : un retour au premier plan
   * qui posterait rejouerait une soumission déjà faite au masquage.
   */
  it("le retour au premier plan ne déclenche rien", () => {
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    champ.value = "b";
    fireEvent.input(champ);
    basculerVisibilite(true);
    expect(sonde.soumissions).toHaveLength(1);

    basculerVisibilite(false);
    avancer(DELAI_TEST * 2);
    expect(sonde.soumissions).toHaveLength(1);
  });

  it("un formulaire invalide masqué le DIT au lieu de partir en silence", () => {
    render(<Formulaire sonde={sonde} requis />);
    const note = screen.getByLabelText("note") as HTMLInputElement;
    note.value = "x";
    fireEvent.input(note);
    basculerVisibilite(true);

    expect(sonde.soumissions).toHaveLength(0);
    expect(
      screen.getByText("Non enregistré : un champ requis est vide"),
    ).toBeTruthy();
  });

  /** L'écouteur vit sur `document` : il doit repartir avec le composant. */
  it("l'écouteur est retiré au démontage — plus rien ne part après", () => {
    const vue = render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    champ.value = "b";
    fireEvent.input(champ);
    vue.unmount();

    basculerVisibilite(true);
    avancer(60_000);
    expect(sonde.soumissions).toHaveLength(0);
  });
});

describe("useAutoSave — quitter un champ vide la file", () => {
  it("soumet SANS attendre quand le focus quitte le champ", () => {
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    champ.value = "b";
    fireEvent.input(champ);

    fireEvent.focusOut(champ, { relatedTarget: document.body });
    expect(valeurs(sonde)).toEqual(["b"]);

    // Le minuteur a bien été désarmé : pas de seconde soumission au terme.
    avancer(DELAI_TEST * 2);
    expect(sonde.soumissions).toHaveLength(1);
  });

  it("n'enregistre pas DEUX fois la même saisie en enchaînant les champs", () => {
    // Passer au champ suivant fait partir la sauvegarde en attente, puis le
    // minuteur est désarmé : la sortie du second champ, sans frappe entre les
    // deux, ne redemande rien.
    render(<Formulaire sonde={sonde} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    const note = screen.getByLabelText("note");
    champ.value = "b";
    fireEvent.input(champ);

    fireEvent.focusOut(champ, { relatedTarget: note });
    fireEvent.focusOut(note, { relatedTarget: document.body });
    avancer(DELAI_TEST * 2);

    expect(valeurs(sonde)).toEqual(["b"]);
  });

  it("un formulaire invalide quitté le DIT au lieu de partir en silence", () => {
    render(<Formulaire sonde={sonde} requis />);
    const note = screen.getByLabelText("note") as HTMLInputElement;
    note.value = "x";
    fireEvent.input(note);
    fireEvent.focusOut(note, { relatedTarget: document.body });

    expect(sonde.soumissions).toHaveLength(0);
    expect(
      screen.getByText("Non enregistré : un champ requis est vide"),
    ).toBeTruthy();
  });
});

describe("useAutoSave — un silence qui se voit", () => {
  it("ne soumet pas un formulaire invalide, et le DIT", () => {
    render(<Formulaire sonde={sonde} requis />);
    const note = screen.getByLabelText("note") as HTMLInputElement;
    note.value = "x";
    fireEvent.input(note);
    avancer(DELAI_TEST);

    expect(sonde.soumissions).toHaveLength(0);
    expect(
      screen.getByText("Non enregistré : un champ requis est vide"),
    ).toBeTruthy();
    // Et il n'affiche pas « en attente » : plus rien n'attend, c'est refusé.
    expect(screen.getByText("À jour")).toBeTruthy();
  });

  it("repart et lève le blocage dès que le champ requis est rempli", () => {
    render(<Formulaire sonde={sonde} requis />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    fireEvent.input(champ);
    avancer(DELAI_TEST);
    expect(
      screen.getByText("Non enregistré : un champ requis est vide"),
    ).toBeTruthy();

    champ.value = "enfin";
    fireEvent.input(champ);
    avancer(DELAI_TEST);
    expect(valeurs(sonde)).toEqual(["enfin"]);
    expect(
      screen.queryByText("Non enregistré : un champ requis est vide"),
    ).toBeNull();
  });
});

describe("useAutoSave — inerte sur demande", () => {
  it("ne fait rien du tout quand `actif` est faux", () => {
    render(<Formulaire sonde={sonde} actif={false} />);
    const champ = screen.getByLabelText("titre") as HTMLInputElement;
    champ.value = "b";
    fireEvent.input(champ);
    avancer(60_000);
    fireEvent.focusOut(champ, { relatedTarget: document.body });

    expect(sonde.soumissions).toHaveLength(0);
    expect(screen.getByText("À jour")).toBeTruthy();
  });

  it("désarme la sauvegarde en attente quand `actif` retombe", () => {
    const { rerender } = render(<Formulaire sonde={sonde} actif />);
    fireEvent.input(screen.getByLabelText("titre"));
    expect(screen.getByText("En attente")).toBeTruthy();

    rerender(<Formulaire sonde={sonde} actif={false} />);
    avancer(60_000);
    expect(sonde.soumissions).toHaveLength(0);
    expect(screen.getByText("À jour")).toBeTruthy();
  });

  it("annule le minuteur au démontage : rien ne part dans le vide", () => {
    const { unmount } = render(<Formulaire sonde={sonde} />);
    fireEvent.input(screen.getByLabelText("titre"));
    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(sonde.soumissions).toHaveLength(0);
  });
});
