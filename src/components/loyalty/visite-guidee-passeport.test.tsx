// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisiteGuideePasseport } from "@/components/loyalty/visite-guidee-passeport";
import { _reinitialiserCacheVisiteGuidee } from "@/components/loyalty/visite-guidee-state";

/**
 * CE QUI EST GARDÉ ICI, ET POURQUOI AUCUN DE CES POINTS N'EST VISIBLE AU DIFF.
 *
 *  · RIEN NE S'OUVRE TOUT SEUL. C'est la promesse tenue envers deux publics :
 *    le client en caisse, qui a dix secondes, et `e2e/loyalty.spec.ts`, qui
 *    ouvre le passeport avec un cookie VIERGE et exige de VOIR « Mes points »,
 *    « Niveau Bronze », « Ma carte à présenter » et le QR. Une modale
 *    `aria-modal="true"` rendue au montage les masquerait tous — pour axe, pour
 *    Playwright et pour un lecteur d'écran. Le premier cas ci-dessous est donc
 *    le garde-fou de la suite de bout en bout, joué en millisecondes.
 *  · UN SEUL MODE DE VALIDATION EST EXPLIQUÉ. Décrire au client un geste qu'il
 *    ne verra jamais à l'écran, c'est lui faire chercher un bouton qui
 *    n'existe pas.
 *  · LE STOCKAGE PEUT LEVER. Navigation privée, données de site bloquées :
 *    l'ACCESSEUR jette avant même la lecture. Non gardé, le passeport entier
 *    serait remplacé par l'écran d'erreur parce qu'une bande d'aide n'a pas pu
 *    se souvenir d'elle.
 *  · LES DEUX COMPTEURS SONT DITS. C'est le seul endroit où le produit peut
 *    passer pour malhonnête alors qu'il est généreux : le texte doit affirmer
 *    que le niveau ne se perd pas.
 */

const PROGRAM = "11111111-1111-4111-8111-111111111111";

function poser(sur: Partial<Parameters<typeof VisiteGuideePasseport>[0]> = {}) {
  return render(
    <VisiteGuideePasseport
      programId={PROGRAM}
      organizationName="Café des Sports"
      validationMode="staff"
      referralEnabled={false}
      {...sur}
    />,
  );
}

/** Déroule la visite jusqu'à l'étape voulue (1-indexée). */
function avancerJusqua(etape: number) {
  for (let i = 1; i < etape; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  }
}

beforeEach(() => {
  _reinitialiserCacheVisiteGuidee();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("visite guidée du passeport — ouverture", () => {
  it("ne rend AUCUNE boîte de dialogue au montage, cookie vierge compris", () => {
    poser();
    // Le contrat vis-à-vis d'axe et de e2e/loyalty.spec.ts : rien ne recouvre
    // la carte tant que le client n'a rien demandé.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("propose une invitation EN LIGNE au premier passage, et un bouton toujours", () => {
    poser();
    expect(screen.getByText(/Première fois ici/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Comment ça marche ?" }),
    ).toBeTruthy();
  });

  it("n'ouvre la fenêtre qu'après un appui, et la referme sur Échap", () => {
    poser();
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));

    const boite = screen.getByRole("dialog");
    expect(boite.getAttribute("aria-modal")).toBe("true");
    // Le nom accessible vient du titre de l'étape courante.
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "Votre carte de fidélité",
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rend le focus au déclencheur à la fermeture, invitation déjà écartée", () => {
    // Cas SANS bascule : la visite a déjà été vue, le bouton discret est le
    // seul déclencheur et il survit à l'ouverture. C'est la restitution
    // classique, celle que `useModalFocus` assure à lui seul.
    poser();
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));

    const declencheur = screen.getByRole("button", {
      name: "Comment ça marche ?",
    });
    declencheur.focus();
    fireEvent.click(declencheur);
    // Le conteneur prend le focus à l'ouverture : on n'est plus sur le bouton.
    expect(document.activeElement).not.toBe(declencheur);

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(document.activeElement).toBe(declencheur);
  });

  it("rend le focus au déclencheur MÊME quand l'invitation cède la place", () => {
    /**
     * LE CAS QUI SE PERDAIT. Ouvrir depuis la bande d'invitation la marque
     * comme vue : la bande cède aussitôt la place au bouton discret, et le
     * nœud capturé par `useModalFocus` est DÉTACHÉ quand il tente de lui
     * rendre le focus — qui repartait alors au début du document.
     *
     * L'assertion porte donc sur le bouton TEL QU'IL EST RENDU MAINTENANT, et
     * non sur le nœud d'avant l'ouverture : c'est un autre élément du DOM, et
     * c'est bien celui-là que le doigt et le clavier retrouvent à l'écran.
     */
    poser();
    const avant = screen.getByRole("button", { name: "Comment ça marche ?" });
    avant.focus();
    fireEvent.click(avant);
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));

    const apres = screen.getByRole("button", { name: "Comment ça marche ?" });
    expect(apres).not.toBe(avant);
    expect(document.activeElement).toBe(apres);
    // Et surtout : pas retombé sur le corps du document.
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("visite guidée du passeport — mémoire", () => {
  it("ne repropose plus l'invitation une fois la visite ouverte, mais garde le bouton", () => {
    const premier = poser();
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    fireEvent.keyDown(document, { key: "Escape" });
    premier.unmount();

    _reinitialiserCacheVisiteGuidee();
    poser();
    expect(screen.queryByText(/Première fois ici/)).toBeNull();
    // ON PEUT Y REVENIR : le point d'entrée ne disparaît jamais. Un client qui
    // se demande trois mois plus tard pourquoi son solde a baissé doit
    // retrouver l'explication.
    expect(
      screen.getByRole("button", { name: "Comment ça marche ?" }),
    ).toBeTruthy();
  });

  it("« Plus tard » écarte l'invitation sans ouvrir la fenêtre", () => {
    poser();
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/Première fois ici/)).toBeNull();
  });

  it("se rend correctement quand localStorage LÈVE à la lecture comme à l'écriture", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    poser();
    // Stockage muet ⇒ « jamais vue » : l'invitation s'affiche, elle ne casse rien.
    expect(screen.getByText(/Première fois ici/)).toBeTruthy();
    // Et la bande se referme quand même sous le doigt, écriture perdue ou non.
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(screen.queryByText(/Première fois ici/)).toBeNull();
  });
});

describe("visite guidée du passeport — ce qui est expliqué", () => {
  it("explique le comptoir en mode staff, et JAMAIS le code tournant", () => {
    poser({ validationMode: "staff" });
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    avancerJusqua(2);

    const dialogue = screen.getByRole("dialog");
    expect(dialogue.textContent).toContain("Ma carte à présenter");
    expect(dialogue.textContent).not.toContain("Valider ma visite");
  });

  it("explique le code tournant en mode rotating_code, et JAMAIS le comptoir", () => {
    poser({ validationMode: "rotating_code" });
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    avancerJusqua(2);

    const dialogue = screen.getByRole("dialog");
    expect(dialogue.textContent).toContain("Valider ma visite");
    expect(dialogue.textContent).not.toContain("Ma carte à présenter");
  });

  it("dit que le niveau ne redescend pas quand on échange un cadeau", () => {
    poser();
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    avancerJusqua(3);

    const dialogue = screen.getByRole("dialog");
    expect(dialogue.textContent).toContain("Deux compteurs");
    // La phrase qui désamorce le seul malentendu coûteux du module.
    expect(dialogue.textContent).toContain(
      "jamais perdre votre niveau",
    );
  });

  it("ne parle de parrainage que si le commerçant l'a ouvert", () => {
    const sans = poser({ referralEnabled: false });
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    avancerJusqua(4);
    expect(screen.getByRole("dialog").textContent).not.toContain("Parrainer");
    sans.unmount();

    _reinitialiserCacheVisiteGuidee();
    poser({ referralEnabled: true });
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    avancerJusqua(4);
    expect(screen.getByRole("dialog").textContent).toContain("Parrainer un ami");
  });

  it("n'annonce AUCUN montant de parrainage — il est réglé par programme", () => {
    poser({ referralEnabled: true });
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    avancerJusqua(4);
    // `referral_sponsor_points` / `referral_filleul_points` sont configurables
    // et peuvent valoir zéro (20261119120000) : un chiffre écrit en dur ici
    // serait un mensonge pour tout programme qui les a changés. Le bloc
    // « Parrainer un ami » affiche les vrais, lus du serveur.
    expect(screen.getByRole("dialog").textContent).not.toMatch(/\d+\s*points/);
  });

  it("ne place aucun emoji dans un nom accessible", () => {
    poser();
    fireEvent.click(screen.getByRole("button", { name: "Comment ça marche ?" }));
    // U+FE0F dans un nom accessible a déjà cassé un locator Playwright ici.
    for (const bouton of screen.getAllByRole("button")) {
      const nom = bouton.getAttribute("aria-label") ?? bouton.textContent ?? "";
      expect(nom).not.toMatch(/[\u{FE0F}\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u);
    }
  });
});
