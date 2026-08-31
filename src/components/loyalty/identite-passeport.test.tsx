// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enregistrerIdentitePasseport = vi.fn();
vi.mock("@/actions/loyalty", () => ({ enregistrerIdentitePasseport }));

const { IdentitePasseport } = await import(
  "@/components/loyalty/identite-passeport"
);

/**
 * « LE CLIENT NOMME SA CARTE » N'EST PAS UN FORMULAIRE D'INSCRIPTION.
 *
 * Trois propriétés sont gardées ici parce qu'aucune n'est visible au diff :
 *
 *  · L'ÉTAT VIDE EST UN ÉTAT NORMAL. La grande majorité des cartes n'auront
 *    jamais de surnom. L'écran ne doit donc afficher ni « Sans nom », ni
 *    emplacement vide, ni figure par défaut que le client n'a pas choisie —
 *    et surtout aucune relance qui ferait passer une carte anonyme pour un
 *    profil incomplet.
 *  · LE CHOIX SE VOIT. Un champ qu'on remplit sans rien voir changer ne sert à
 *    rien : le surnom gravé doit apparaître sur la carte, replié, sans qu'on
 *    rouvre l'éditeur.
 *  · L'AFFICHAGE SUIT LA BASE, PAS LA SAISIE. La RPC renvoie la forme
 *    réellement gravée (espaces repliés, blanc devenu `null`) ; c'est elle que
 *    la carte montre, sinon un surnom rogné resterait affiché dans sa forme
 *    d'origine jusqu'au prochain rechargement.
 */

beforeEach(() => {
  enregistrerIdentitePasseport.mockReset();
});

afterEach(() => {
  cleanup();
});

const PROGRAM = "11111111-1111-4111-8111-111111111111";

describe("IdentitePasseport — la carte sans surnom", () => {
  it("ne montre NI « Sans nom » NI figure par défaut, et n'exige rien", () => {
    const { container } = render(
      <IdentitePasseport programId={PROGRAM} displayName={null} avatar="" />,
    );

    expect(screen.queryByText(/sans nom/i)).toBeNull();
    expect(screen.queryByText(/incomplet/i)).toBeNull();
    expect(screen.queryByText(/complét/i)).toBeNull();
    // Aucune figure peinte : `coerceAvatarId("")` rendrait le renard, et
    // montrer à chaque client un animal qu'il n'a jamais choisi serait faux.
    expect(container.querySelector("svg")).toBeNull();
    // Aucun champ ouvert : le bloc est replié, personne n'est arrêté ici.
    expect(screen.queryByLabelText("Mon surnom")).toBeNull();
  });

  it("propose seulement, par un bouton discret", () => {
    render(<IdentitePasseport programId={PROGRAM} displayName={null} avatar="" />);
    const bouton = screen.getByRole("button", { name: "Personnaliser" });
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
  });

  it("ouvre l'éditeur au clic, et le champ part vide", () => {
    render(<IdentitePasseport programId={PROGRAM} displayName={null} avatar="" />);
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));

    const champ = screen.getByLabelText("Mon surnom") as HTMLInputElement;
    expect(champ.value).toBe("");
    // La borne de saisie est celle du zod et du CHECK SQL : 24.
    expect(champ.maxLength).toBe(24);
  });
});

describe("IdentitePasseport — le choix se voit", () => {
  it("affiche le surnom et la figure déjà gravés, éditeur replié", () => {
    const { container } = render(
      <IdentitePasseport programId={PROGRAM} displayName="Marie" avatar="renard" />,
    );

    expect(screen.getByText("Marie")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Modifier" })).toBeTruthy();
    expect(screen.queryByLabelText("Mon surnom")).toBeNull();
  });

  it("un surnom SANS figure garde son médaillon plutôt qu'un trou", () => {
    render(
      <IdentitePasseport programId={PROGRAM} displayName="Marie" avatar="" />,
    );
    expect(screen.getByText("Marie")).toBeTruthy();
    // L'initiale tient la place du médaillon : pas de renard non choisi.
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("montre la forme RELUE PAR LA BASE, pas la saisie", async () => {
    enregistrerIdentitePasseport.mockResolvedValue({
      ok: true,
      data: { state: "saved", displayName: "Jean Pierre", avatar: "renard" },
    });

    render(<IdentitePasseport programId={PROGRAM} displayName={null} avatar="" />);
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
    fireEvent.change(screen.getByLabelText("Mon surnom"), {
      // Espaces internes doublés : la base les replie, l'écran doit suivre.
      target: { value: "Jean  Pierre" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(screen.getByText("Jean Pierre")).toBeTruthy());
    expect(screen.queryByText("Jean  Pierre")).toBeNull();
    // L'éditeur se referme sur un succès : le geste est fini.
    expect(screen.queryByLabelText("Mon surnom")).toBeNull();
  });
});

describe("IdentitePasseport — les refus", () => {
  it("affiche le refus du serveur sans fermer l'éditeur", async () => {
    enregistrerIdentitePasseport.mockResolvedValue({
      ok: false,
      error: "Choisissez un autre surnom",
    });

    render(<IdentitePasseport programId={PROGRAM} displayName={null} avatar="" />);
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
    fireEvent.change(screen.getByLabelText("Mon surnom"), {
      target: { value: "connard" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Choisissez un autre surnom",
      ),
    );
    // La saisie SURVIT au refus : le client corrige, il ne retape pas.
    const champ = screen.getByLabelText("Mon surnom") as HTMLInputElement;
    expect(champ.value).toBe("connard");
  });

  it("une action injoignable donne un message, jamais une page cassée", async () => {
    enregistrerIdentitePasseport.mockRejectedValue(new Error("offline"));

    render(<IdentitePasseport programId={PROGRAM} displayName={null} avatar="" />);
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
    fireEvent.change(screen.getByLabelText("Mon surnom"), {
      target: { value: "Marie" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Connexion perdue/),
    );
  });

  it("le champ vidé puis enregistré EFFACE le surnom, et la carte redevient neutre", async () => {
    enregistrerIdentitePasseport.mockResolvedValue({
      ok: true,
      data: { state: "saved", displayName: null, avatar: "" },
    });

    render(
      <IdentitePasseport programId={PROGRAM} displayName="Marie" avatar="renard" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(screen.getByLabelText("Mon surnom"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Personnaliser" })).toBeTruthy(),
    );
    expect(screen.queryByText("Marie")).toBeNull();
    expect(screen.queryByText(/sans nom/i)).toBeNull();
  });
});

describe("IdentitePasseport — accessibilité", () => {
  it("aucun emoji dans un nom accessible", () => {
    // Un U+FE0F invisible dans un nom accessible a déjà cassé des locators
    // Playwright ici : la garde vaut pour tout ce qui est cliquable.
    render(
      <IdentitePasseport programId={PROGRAM} displayName="Marie" avatar="renard" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));

    // Le sélecteur de variante U+FE0F est écrit par son point de code : le
    // coller en littéral le rendrait invisible dans ce fichier-ci aussi.
    const emoji = new RegExp(
      "\\p{Extended_Pictographic}|" + String.fromCharCode(0xfe0f),
      "u",
    );
    for (const el of screen.getAllByRole("button")) {
      const nom = el.getAttribute("aria-label") ?? el.textContent ?? "";
      expect(emoji.test(nom)).toBe(false);
    }
    expect(emoji.test(screen.getByLabelText("Mon surnom").outerHTML)).toBe(false);
  });
});
