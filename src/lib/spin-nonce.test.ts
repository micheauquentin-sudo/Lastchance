import { afterEach, describe, expect, it } from "vitest";
import { lireOuCreerNonceTirage, oublierNonceTirage } from "./spin-nonce";

/**
 * Le nonce du tirage — ce qui doit rester vrai.
 *
 * Il n'existe aucun bouton « Réessayer » sur le tirage : le rejeu réel est un
 * RECHARGEMENT DE PAGE. C'est pourquoi le nonce vit dans la mémoire d'onglet et
 * non dans un `useRef`, et c'est ce que ces trois épreuves vérifient — la même
 * tentative garde sa clé, la tentative suivante en prend une autre, et
 * l'absence de mémoire ne coûte jamais sa partie au joueur.
 */

/** Mémoire d'onglet simulée ; `lever` reproduit une navigation privée verrouillée. */
function poserMemoire({ lever = false }: { lever?: boolean } = {}) {
  const contenu = new Map<string, string>();
  const refus = () => {
    throw new Error("SecurityError: sessionStorage indisponible");
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    writable: true,
    value: lever
      ? { getItem: refus, setItem: refus, removeItem: refus }
      : {
          getItem: (k: string) => contenu.get(k) ?? null,
          setItem: (k: string, v: string) => void contenu.set(k, v),
          removeItem: (k: string) => void contenu.delete(k),
        },
  });
  return contenu;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "sessionStorage");
});

describe("nonce de tirage", () => {
  it("rend LE MÊME nonce tant qu'aucune réponse n'est parvenue", () => {
    poserMemoire();
    // Deux lectures séparées par un rechargement de page : le module est sans
    // état, tout ce qui relie les deux appels est la mémoire d'onglet.
    const premier = lireOuCreerNonceTirage("chez-marcel");
    const second = lireOuCreerNonceTirage("chez-marcel");

    expect(premier).toBeTruthy();
    expect(second).toBe(premier);
  });

  it("rend un nonce DIFFÉRENT une fois la tentative close", () => {
    poserMemoire();
    const premier = lireOuCreerNonceTirage("chez-marcel");
    oublierNonceTirage("chez-marcel");
    const suivant = lireOuCreerNonceTirage("chez-marcel");

    // Contre-épreuve indispensable : un nonce figé passerait la première
    // épreuve tout en interdisant au joueur de rejouer pour toujours, chaque
    // partie suivante étant servie comme le rejeu de la précédente.
    expect(suivant).toBeTruthy();
    expect(suivant).not.toBe(premier);
  });

  it("ne mélange pas deux jeux ouverts en même temps", () => {
    poserMemoire();
    expect(lireOuCreerNonceTirage("chez-marcel")).not.toBe(
      lireOuCreerNonceTirage("le-fournil"),
    );
  });

  it("laisse jouer même quand la mémoire d'onglet LÈVE", () => {
    poserMemoire({ lever: true });

    // Ni lecture, ni écriture, ni oubli ne doivent remonter : sans mémoire, le
    // tirage repart simplement dans son régime d'avant ce correctif.
    expect(() => lireOuCreerNonceTirage("chez-marcel")).not.toThrow();
    expect(() => oublierNonceTirage("chez-marcel")).not.toThrow();
    expect(lireOuCreerNonceTirage("chez-marcel")).toBeTruthy();
  });

  it("laisse jouer quand la mémoire d'onglet n'existe pas du tout", () => {
    // Rendu hors navigateur : `sessionStorage` n'est même pas défini.
    expect(() => lireOuCreerNonceTirage("chez-marcel")).not.toThrow();
  });

  it("émet une valeur que le serveur accepte (spinNonceSchema)", () => {
    poserMemoire();
    // Hors borne, la clé serait ignorée côté serveur et le correctif
    // n'existerait plus qu'en apparence.
    expect(lireOuCreerNonceTirage("chez-marcel")).toMatch(
      /^[A-Za-z0-9_-]{16,64}$/,
    );
  });

  it("ignore une valeur mémorisée hors borne au lieu de la transmettre", () => {
    const memoire = poserMemoire();
    memoire.set("lastchance:spin-nonce:chez-marcel", "trop-court");

    const nonce = lireOuCreerNonceTirage("chez-marcel");
    expect(nonce).not.toBe("trop-court");
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
});
