import { afterEach, describe, expect, it, vi } from "vitest";
import { lireOuCreerNonceTirage, oublierNonceTirage } from "./spin-nonce";

/** Mémoire d'onglet simulée, avec ses principaux modes d'échec. */
function stockageSession(
  options: {
    refuseLecture?: boolean;
    refuseEcriture?: boolean;
    oublieEcriture?: boolean;
  } = {},
) {
  const valeurs = new Map<string, string>();
  return {
    getItem(cle: string) {
      if (options.refuseLecture) throw new Error("lecture refusée");
      return valeurs.get(cle) ?? null;
    },
    setItem(cle: string, valeur: string) {
      if (options.refuseEcriture) throw new Error("écriture refusée");
      if (!options.oublieEcriture) valeurs.set(cle, valeur);
    },
    removeItem(cle: string) {
      valeurs.delete(cle);
    },
  };
}

describe("nonce de tirage persistant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("réutilise la tentative déjà mémorisée", () => {
    const stockage = stockageSession();
    stockage.setItem("lastchance:spin-nonce:jeu", "1234567890abcdef");
    vi.stubGlobal("sessionStorage", stockage);
    vi.stubGlobal("crypto", { randomUUID: vi.fn() });

    expect(lireOuCreerNonceTirage("jeu")).toBe("1234567890abcdef");
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it("ne rend un nouveau nonce qu'après l'avoir écrit et relu", () => {
    const stockage = stockageSession();
    vi.stubGlobal("sessionStorage", stockage);
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    });

    const premier = lireOuCreerNonceTirage("jeu");
    expect(premier).toBe("11111111-2222-4333-8444-555555555555");
    expect(lireOuCreerNonceTirage("jeu")).toBe(premier);

    oublierNonceTirage("jeu");
    expect(stockage.getItem("lastchance:spin-nonce:jeu")).toBeNull();
  });

  it("ne mélange pas deux jeux ouverts en même temps", () => {
    let compteur = 0;
    vi.stubGlobal("sessionStorage", stockageSession());
    vi.stubGlobal("crypto", {
      randomUUID: () => `11111111-2222-4333-8444-${String(++compteur).padStart(12, "0")}`,
    });

    expect(lireOuCreerNonceTirage("chez-marcel")).not.toBe(
      lireOuCreerNonceTirage("le-fournil"),
    );
  });

  it("remplace une valeur mémorisée hors borne", () => {
    const stockage = stockageSession();
    stockage.setItem("lastchance:spin-nonce:jeu", "trop-court");
    vi.stubGlobal("sessionStorage", stockage);
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    });

    expect(lireOuCreerNonceTirage("jeu")).toBe(
      "11111111-2222-4333-8444-555555555555",
    );
  });

  it.each([
    { refuseLecture: true },
    { refuseEcriture: true },
    { oublieEcriture: true },
  ])("refuse le tirage si la tentative ne peut pas être persistée (%o)", (options) => {
    vi.stubGlobal("sessionStorage", stockageSession(options));
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    });

    expect(() => lireOuCreerNonceTirage("jeu")).toThrow();
  });

  it("refuse le tirage sans générateur cryptographique", () => {
    vi.stubGlobal("sessionStorage", stockageSession());
    vi.stubGlobal("crypto", {});

    expect(() => lireOuCreerNonceTirage("jeu")).toThrow("generation_nonce_indisponible");
  });

  it("refuse le tirage si la mémoire d'onglet n'existe pas", () => {
    vi.stubGlobal("sessionStorage", undefined);

    expect(() => lireOuCreerNonceTirage("jeu")).toThrow(
      "stockage_nonce_indisponible",
    );
  });
});
