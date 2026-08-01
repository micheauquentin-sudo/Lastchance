import { describe, expect, it } from "vitest";
import {
  measureSenderLikeness,
  normalizeForSenderComparison,
  SMS_SENDER_LIKENESS_THRESHOLD,
} from "./sms-sender-likeness";

describe("normalizeForSenderComparison", () => {
  it("réduit un nom commercial à l'alphabet d'un expéditeur", () => {
    expect(normalizeForSenderComparison("Café Déjà-Vu")).toBe("CAFEDEJAVU");
    expect(normalizeForSenderComparison("  Le  Petit Jardin ")).toBe(
      "LEPETITJARDIN",
    );
    expect(normalizeForSenderComparison("Bar 1900 !")).toBe("BAR1900");
  });
});

describe("measureSenderLikeness", () => {
  it("laisse passer un identifiant identique au nom", () => {
    const result = measureSenderLikeness("Mon Resto", "MONRESTO");
    expect(result.score).toBe(1);
    expect(result.resembles).toBe(true);
  });

  it("laisse passer une contraction légitime", () => {
    // Le cas nommé dans le brief : un refus automatique l'aurait bloqué.
    expect(measureSenderLikeness("Le Petit Jardin", "LEPTJARDIN").resembles).toBe(
      true,
    );
  });

  it("laisse passer un acronyme", () => {
    expect(measureSenderLikeness("Le Petit Jardin", "LPJ").resembles).toBe(true);
  });

  it("ignore accents, espaces et ponctuation", () => {
    expect(measureSenderLikeness("Café Déjà-Vu", "CAFEDEJAVU").score).toBe(1);
  });

  it("signale les noms empruntés à un tiers", () => {
    for (const usurpation of ["COLISSIMO", "AMELI", "MONBANQUE", "IMPOTSGOUV"]) {
      const result = measureSenderLikeness("Le Petit Jardin", usurpation);
      expect(result.resembles, usurpation).toBe(false);
    }
  });

  it("signale un identifiant qui ajoute des lettres au nom", () => {
    // Choix assumé : le dénominateur est l'identifiant, donc « CHEZBOBSHOP »
    // ressort signalé. Un signal de trop coûte un regard d'opérateur.
    expect(measureSenderLikeness("Chez Bob", "CHEZBOBSHOP").resembles).toBe(
      false,
    );
  });

  it("ne signale rien sur une saisie vide, et tout sur un nom vide", () => {
    expect(measureSenderLikeness("Chez Bob", "").resembles).toBe(true);
    expect(measureSenderLikeness("", "CHEZBOB").resembles).toBe(false);
  });

  it("rend un score borné, et le seuil décide seul de l'alerte", () => {
    const result = measureSenderLikeness("Le Petit Jardin", "LEJARDIN");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.resembles).toBe(
      result.score >= SMS_SENDER_LIKENESS_THRESHOLD,
    );
  });
});
