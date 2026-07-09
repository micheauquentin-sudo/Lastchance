import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "./csv";

describe("csvEscape", () => {
  it("laisse les valeurs simples intactes", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("2025-01-15")).toBe("2025-01-15");
    expect(csvEscape("")).toBe("");
  });

  it("échappe séparateurs, virgules et sauts de ligne", () => {
    expect(csvEscape("a;b")).toBe('"a;b"');
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape("ligne1\nligne2")).toBe('"ligne1\nligne2"');
  });

  it("double les guillemets internes", () => {
    expect(csvEscape('dit "bonjour"')).toBe('"dit ""bonjour"""');
  });
});

describe("toCsv", () => {
  it("assemble BOM + en-tête + lignes avec ';'", () => {
    const csv = toCsv(["date", "email"], [["2025-01-15", "a@b.fr"]]);
    expect(csv).toBe("﻿date;email\n2025-01-15;a@b.fr");
  });

  it("échappe chaque cellule, y compris l'en-tête", () => {
    const csv = toCsv(["nom;complet"], [['Marco "Chez"'], ["normal"]]);
    expect(csv).toBe('﻿"nom;complet"\n"Marco ""Chez"""\nnormal');
  });

  it("un CSV sans lignes reste un en-tête valide", () => {
    expect(toCsv(["a", "b"], [])).toBe("﻿a;b");
  });
});
