// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lireToasts, viderToasts } from "@/lib/toast-bus";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";

/**
 * L'ENREGISTREMENT AUTOMATIQUE DES BLOCS SANS `<form>`.
 *
 * Mêmes pièges que `useAutoSave` (rien au montage, un silence qui se voit, la
 * dernière valeur gagne), plus les deux qui lui sont propres :
 *
 *  · le CLIC arme aussi — sans lui, réordonner un classement ou retirer une
 *    proposition (des boutons, aucun événement de saisie) cesserait d'être
 *    enregistré en silence ;
 *  · donc la signature TRIE : un clic qui n'a rien changé ne poste rien et
 *    n'annonce rien. Le bouton, lui, force.
 */

const DELAI_TEST = 500;

interface Sonde {
  appels: string[];
  /** Ce que rend `enregistrer` — mis à false pour éprouver l'échec. */
  reussit: boolean;
  /** Résout la promesse à la main, pour tenir un vol ouvert. */
  liberer?: () => void;
}

function Bloc({
  sonde,
  actif,
  valide,
  bouton = false,
}: {
  sonde: Sonde;
  actif?: boolean;
  valide?: () => boolean;
  bouton?: boolean;
}) {
  const blocRef = useRef<HTMLDivElement>(null);
  const [valeur, setValeur] = useState("a");
  const { enAttente, bloqueParValidation, declencher } = useAutoSaveManuel(
    blocRef,
    {
      signature: valeur,
      delai: DELAI_TEST,
      actif,
      valide,
      message: "Enregistré.",
      enregistrer: async () => {
        sonde.appels.push(valeur);
        if (sonde.liberer === undefined) return sonde.reussit;
        await new Promise<void>((resolve) => {
          sonde.liberer = resolve;
        });
        return sonde.reussit;
      },
    },
  );
  return (
    <div ref={blocRef}>
      <input
        aria-label="valeur"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
      />
      {/* Un bouton qui ne change RIEN : le clic arme, la signature doit trier. */}
      <button type="button">Aide</button>
      {bouton && (
        <button type="button" onClick={declencher}>
          Enregistrer
        </button>
      )}
      <p>{enAttente ? "En attente" : "À jour"}</p>
      {bloqueParValidation && <p>Non enregistré</p>}
    </div>
  );
}

function avancer(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Vide la file des micro-tâches : les promesses d'`enregistrer` atterrissent. */
async function atterrir() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function saisir(valeur: string) {
  fireEvent.change(screen.getByLabelText("valeur"), { target: { value: valeur } });
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

let sonde: Sonde;

beforeEach(() => {
  sonde = { appels: [], reussit: true };
  viderToasts();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  viderToasts();
  basculerVisibilite(false);
});

describe("useAutoSaveManuel — rien ne part sans un geste", () => {
  it("n'enregistre PAS au montage, quoi qu'il arrive ensuite dans le temps", () => {
    render(<Bloc sonde={sonde} />);
    avancer(60_000);
    expect(sonde.appels).toEqual([]);
    expect(screen.getByText("À jour")).toBeTruthy();
  });

  it("quitter un bloc qu'on n'a pas touché ne l'enregistre pas", () => {
    render(<Bloc sonde={sonde} />);
    fireEvent.focusOut(screen.getByLabelText("valeur"));
    avancer(60_000);
    expect(sonde.appels).toEqual([]);
  });

  it("un clic qui ne change rien n'arme même pas — seule la signature déclenche", () => {
    // Contrat renforcé depuis l'abandon des écouteurs natifs : un geste qui ne
    // change pas l'état ne produit AUCUNE activité (ni minuteur, ni requête,
    // ni annonce) — le hook n'observe que la signature, plus le DOM.
    render(<Bloc sonde={sonde} />);
    fireEvent.click(screen.getByRole("button", { name: "Aide" }));
    expect(screen.queryByText("En attente")).toBeNull();
    avancer(DELAI_TEST);
    expect(sonde.appels).toEqual([]);
    expect(lireToasts()).toHaveLength(0);
  });
});

describe("useAutoSaveManuel — le délai", () => {
  it("attend le délai puis enregistre une fois, et annonce", async () => {
    render(<Bloc sonde={sonde} />);
    saisir("b");
    expect(sonde.appels).toEqual([]);
    expect(screen.getByText("En attente")).toBeTruthy();

    avancer(DELAI_TEST - 1);
    expect(sonde.appels).toEqual([]);

    avancer(1);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);
    expect(screen.getByText("À jour")).toBeTruthy();
    expect(lireToasts().map((t) => t.message)).toEqual(["Enregistré."]);
  });

  it("rejoue le délai à chaque frappe : trois touches, un seul enregistrement", async () => {
    render(<Bloc sonde={sonde} />);
    for (const v of ["b", "bc", "bcd"]) {
      saisir(v);
      avancer(DELAI_TEST - 50);
    }
    expect(sonde.appels).toEqual([]);
    avancer(DELAI_TEST);
    await atterrir();
    expect(sonde.appels).toEqual(["bcd"]);
  });

  it("le clic arme aussi : un geste qui n'émet aucun événement de saisie compte", async () => {
    // Le bouton « Aide » ne change rien par lui-même ; on modifie l'état par
    // ailleurs pour rejouer ce que fait un bouton « monter d'un rang ».
    render(<Bloc sonde={sonde} />);
    saisir("z");
    avancer(DELAI_TEST);
    await atterrir();
    sonde.appels.length = 0;

    // Nouvelle modification, puis un clic AVANT la fin du délai : le clic
    // réarme, l'enregistrement part bien avec la dernière valeur.
    saisir("zz");
    fireEvent.click(screen.getByRole("button", { name: "Aide" }));
    avancer(DELAI_TEST);
    await atterrir();
    expect(sonde.appels).toEqual(["zz"]);
  });

  it("quitter le bloc vide la file sans attendre", async () => {
    render(<Bloc sonde={sonde} />);
    saisir("b");
    fireEvent.focusOut(screen.getByLabelText("valeur"));
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);
  });

  /**
   * MASQUER L'ONGLET EST LA SORTIE QU'ON NE VOIT PAS. `focusout` couvre le
   * passage d'un champ à l'autre ; sur mobile, basculer d'application ou
   * verrouiller l'écran gèle la page SANS déplacer le focus, et le navigateur
   * peut la décharger ensuite sans autre événement (`beforeunload` n'est pas
   * tenu sur iOS). Le délai était donc une fenêtre de perte muette.
   */
  it("masquer l'onglet vide la file sans attendre", async () => {
    render(<Bloc sonde={sonde} />);
    saisir("b");
    basculerVisibilite(true);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);

    // Minuteur désarmé : rien ne repart au terme du délai.
    avancer(DELAI_TEST * 2);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);
  });

  it("masquer un bloc intact ne l'enregistre pas", async () => {
    render(<Bloc sonde={sonde} />);
    basculerVisibilite(true);
    avancer(60_000);
    await atterrir();
    expect(sonde.appels).toEqual([]);
  });

  /** On enregistre en PARTANT, jamais en revenant. */
  it("le retour au premier plan ne déclenche rien", async () => {
    render(<Bloc sonde={sonde} />);
    saisir("b");
    basculerVisibilite(true);
    await atterrir();
    basculerVisibilite(false);
    avancer(DELAI_TEST * 2);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);
  });

  /** L'écouteur vit sur `document` : il doit repartir avec le bloc. */
  it("l'écouteur est retiré au démontage — plus rien ne part après", async () => {
    const vue = render(<Bloc sonde={sonde} />);
    saisir("b");
    vue.unmount();
    basculerVisibilite(true);
    avancer(60_000);
    await atterrir();
    expect(sonde.appels).toEqual([]);
  });
});

describe("useAutoSaveManuel — la file d'une place", () => {
  it("la frappe arrivée pendant un vol n'est pas JETÉE : elle repart après", async () => {
    // Un vol qui reste ouvert tant qu'on ne le libère pas.
    sonde.liberer = () => {};
    render(<Bloc sonde={sonde} />);

    saisir("b");
    avancer(DELAI_TEST);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);

    // Pendant le vol : deux frappes de plus.
    saisir("bc");
    avancer(DELAI_TEST);
    await atterrir();
    saisir("bcd");
    avancer(DELAI_TEST);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);

    // Atterrissage : le rejeu part, sur la DERNIÈRE valeur.
    const liberer = sonde.liberer;
    sonde.liberer = undefined;
    await act(async () => {
      liberer?.();
      await Promise.resolve();
    });
    await atterrir();
    expect(sonde.appels).toEqual(["b", "bcd"]);
  });
});

describe("useAutoSaveManuel — le silence se voit", () => {
  it("un bloc invalide n'est pas enregistré, et le dit", async () => {
    render(<Bloc sonde={sonde} valide={() => false} />);
    saisir("b");
    avancer(DELAI_TEST);
    await atterrir();
    expect(sonde.appels).toEqual([]);
    expect(screen.getByText("Non enregistré")).toBeTruthy();
    expect(lireToasts()).toHaveLength(0);
  });

  it("un échec d'enregistrement n'annonce pas « Enregistré. »", async () => {
    sonde.reussit = false;
    render(<Bloc sonde={sonde} />);
    saisir("b");
    avancer(DELAI_TEST);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);
    expect(lireToasts()).toHaveLength(0);
  });
});

describe("useAutoSaveManuel — suspendu et bouton", () => {
  it("inactif : aucune frappe n'enregistre quoi que ce soit", async () => {
    render(<Bloc sonde={sonde} actif={false} />);
    saisir("b");
    avancer(60_000);
    await atterrir();
    expect(sonde.appels).toEqual([]);
    expect(screen.getByText("À jour")).toBeTruthy();
  });

  it("le bouton FORCE : il enregistre même sans changement", async () => {
    render(<Bloc sonde={sonde} bouton />);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await atterrir();
    expect(sonde.appels).toEqual(["a"]);
  });

  it("le bouton et le minuteur partagent le verrou : pas de double vol", async () => {
    render(<Bloc sonde={sonde} bouton />);
    saisir("b");
    // Le clic passe par le même chemin : il annule le minuteur en cours.
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    avancer(DELAI_TEST * 3);
    await atterrir();
    expect(sonde.appels).toEqual(["b"]);
  });
});
