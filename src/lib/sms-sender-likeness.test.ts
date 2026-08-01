import { describe, expect, it } from "vitest";
import {
  matchesNotoriousSender,
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

  it("signale un identifiant sans rapport avec le nom commercial", () => {
    for (const usurpation of ["COLISSIMO", "AMELI", "MONBANQUE", "IMPOTSGOUV"]) {
      const result = measureSenderLikeness("Le Petit Jardin", usurpation);
      expect(result.resembles, usurpation).toBe(false);
    }
  });

  it("NE DÉTECTE PAS une usurpation : les deux champs viennent du commerçant", () => {
    // La mesure de la contre-revue, gardée comme test parce qu'elle est la
    // raison d'être de `matchesNotoriousSender`. Celui qui veut MONBANQUE
    // s'inscrit sous « Mon Banque » : le score vaut 1, le bandeau ne
    // s'allume pas. Toute réécriture qui prétendrait le contraire tombe ici.
    const result = measureSenderLikeness("Mon Banque", "MONBANQUE");
    expect(result.score).toBe(1);
    expect(result.resembles).toBe(true);
    // Et c'est la liste, elle seule, qui attrape le cas.
    expect(matchesNotoriousSender("MONBANQUE")).not.toBeNull();
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

describe("matchesNotoriousSender", () => {
  it("attrape les trois familles, et nomme laquelle", () => {
    expect(matchesNotoriousSender("AMELI")).toContain("service public");
    expect(matchesNotoriousSender("IMPOTSGOUV")).toContain("service public");
    expect(matchesNotoriousSender("MONBANQUE")).toContain("banque");
    expect(matchesNotoriousSender("PAYPAL")).toContain("banque");
    expect(matchesNotoriousSender("COLISSIMO")).toContain("transporteur");
    expect(matchesNotoriousSender("SUIVICOLIS")).toContain("transporteur");
  });

  it("ne se laisse pas contourner par la casse, les accents ni un suffixe", () => {
    expect(matchesNotoriousSender("ameli")).not.toBeNull();
    expect(matchesNotoriousSender("AMELI-FR")).not.toBeNull();
    expect(matchesNotoriousSender("LA POSTE")).not.toBeNull();
  });

  it("laisse tranquilles les noms de commerce ordinaires", () => {
    for (const legitimate of [
      "MONRESTO",
      "LEPTJARDIN",
      "CAFEDEJAVU", // « CAF » est un jeton court : égalité stricte seulement.
      "BAR1900",
      "CHEZBOB",
      "",
    ]) {
      expect(matchesNotoriousSender(legitimate), legitimate).toBeNull();
    }
  });

  it("le faux positif assumé est TESTÉ, pas subi", () => {
    // « Amélie » sera signalée. C'est le prix documenté de la recherche en
    // sous-chaîne ; si quelqu'un la retire un jour, ce test le lui dira.
    expect(matchesNotoriousSender("AMELIE")).not.toBeNull();
  });
});
