import { describe, expect, it } from "vitest";
import { PLAFOND_PAGE, parsePageParam } from "./pagination";

/**
 * CE QUE CE FICHIER PROUVE. Le plancher (déjà tenu par les cinq copies) et le
 * PLAFOND (qui n'existait nulle part) — plus le fait que le plafond est une
 * CONSTANTE partagée, et non un nombre recopié : c'est le même 500 que portent
 * `org_customer_profiles_page` et `org_qr_hub` en base, et la garde de cette
 * égalité-là est en pgTAP, pas ici.
 */
describe("parsePageParam", () => {
  it("le défaut et le plancher : tout ce qui n'est pas lisible vaut 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    // Le plancher est ce qui protège l'`offset` d'un nombre NÉGATIF, que
    // PostgREST refuse et que les deux RPC gardées lèvent.
    expect(parsePageParam("-3")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
  });

  it("une page normale passe intacte", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("7")).toBe(7);
    expect(parsePageParam("499")).toBe(499);
    expect(parsePageParam(String(PLAFOND_PAGE))).toBe(PLAFOND_PAGE);
  });

  it("LE DÉFAUT FERMÉ : `?page=1000000` est replié, pas transmis", () => {
    // ROUGE AVANT : les cinq écrans rendaient 1 000 000, donc un `offset` de
    // 19 999 980 que Postgres calcule puis jette pour rendre zéro ligne.
    expect(parsePageParam("1000000")).toBe(PLAFOND_PAGE);
    expect(parsePageParam("501")).toBe(PLAFOND_PAGE);
  });

  it("le repli est SILENCIEUX : aucune exception, une page valide en sortie", () => {
    // Convention du dépôt pour un paramètre d'URL hors domaine. Lever ferait
    // une page d'erreur là où l'écran doit simplement montrer une liste.
    expect(() => parsePageParam("999999999999999999999")).not.toThrow();
    expect(parsePageParam("999999999999999999999")).toBe(PLAFOND_PAGE);
  });

  it("un plafond explicite l'emporte, pour un appelant qui en a un autre", () => {
    expect(parsePageParam("40", 10)).toBe(10);
    expect(parsePageParam("3", 10)).toBe(3);
  });

  it("un paramètre RÉPÉTÉ dans l'URL ne casse rien", () => {
    // `?page=2&page=9` : Next rend un tableau. Les cinq copies le passaient
    // tel quel à `parseInt` — `NaN`, donc 1. On garde cette issue, écrite.
    expect(parsePageParam(["2", "9"])).toBe(2);
    expect(parsePageParam([])).toBe(1);
  });

  it("le plafond vaut 500, et ce chiffre est écrit UNE fois", () => {
    // ROUGE SI : quelqu'un change la constante sans toucher les deux RPC. Le
    // test ne peut pas lire le SQL ; il épingle la valeur pour que le
    // changement soit délibéré et se voie en revue.
    expect(PLAFOND_PAGE).toBe(500);
  });
});
