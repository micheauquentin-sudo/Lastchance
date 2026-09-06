import { describe, expect, it } from "vitest";
import { formatDate, randomCode, sanitizeSearchTerm, slugify } from "./utils";

describe("sanitizeSearchTerm — recherche participations", () => {
  it("laisse un terme simple intact", () => {
    expect(sanitizeSearchTerm("GAIN-A2B3")).toBe("GAIN-A2B3");
    expect(sanitizeSearchTerm("marco@exemple.fr")).toBe("marco@exemple.fr");
  });

  it("retire les espaces autour du terme", () => {
    expect(sanitizeSearchTerm("  Marco  ")).toBe("Marco");
  });

  it("neutralise la syntaxe des filtres PostgREST .or()", () => {
    // Une virgule injecterait une condition supplémentaire dans .or()
    expect(sanitizeSearchTerm("a,or.id.eq.x")).toBe("aor.id.eq.x");
    expect(sanitizeSearchTerm("a(b)c")).toBe("abc");
    expect(sanitizeSearchTerm("100%")).toBe("100");
    expect(sanitizeSearchTerm("a\\b")).toBe("ab");
  });

  it("retourne une chaîne vide si rien d'exploitable ne reste", () => {
    expect(sanitizeSearchTerm("   ")).toBe("");
    expect(sanitizeSearchTerm("%()")).toBe("");
  });

  it("tronque les termes anormalement longs", () => {
    expect(sanitizeSearchTerm("x".repeat(200))).toHaveLength(80);
  });
});

describe("normalizeRedeemCode — saisie caisse", () => {
  it("normalise toutes les variantes de saisie", async () => {
    const { normalizeRedeemCode } = await import("./utils");
    expect(normalizeRedeemCode("GAIN-AB2C")).toBe("GAIN-AB2C");
    expect(normalizeRedeemCode("ab2c")).toBe("GAIN-AB2C");
    expect(normalizeRedeemCode("gain ab2c")).toBe("GAIN-AB2C");
    expect(normalizeRedeemCode("  gain-ab2c  ")).toBe("GAIN-AB2C");
    expect(normalizeRedeemCode("")).toBe("");
    expect(normalizeRedeemCode("gain-")).toBe("");
  });

  it("CONTRE-ÉPREUVE : le chemin de la roue est intact", async () => {
    // ROUGE SI : la préservation des préfixes ci-dessous déborde sur la roue.
    // C'est le comportement historique de la caisse — une saisie abrégée est un
    // lot de roue — et il ne doit pas bouger d'un caractère.
    const { normalizeRedeemCode } = await import("./utils");
    expect(normalizeRedeemCode("abc2")).toBe("GAIN-ABC2");
    // Préfixe COLLÉ, sans tiret : toujours retiré puis reposé.
    expect(normalizeRedeemCode("GAINABC2")).toBe("GAIN-ABC2");
    expect(normalizeRedeemCode("gain_abc2")).toBe("GAIN-ABC2");
  });

  it("ne re-préfixe plus un code qui porte déjà sa famille", async () => {
    // LE DÉFAUT FERMÉ : un caissier tapant `TICKET-ABCD2345` interrogeait
    // `GAIN-TICKET-ABCD2345`, code fabriqué par la caisse elle-même et présent
    // nulle part. Le gagnant s'entendait répondre « introuvable ».
    const { normalizeRedeemCode } = await import("./utils");
    expect(normalizeRedeemCode("TICKET-ABCD2345")).toBe("TICKET-ABCD2345");
    expect(normalizeRedeemCode("chasse-abcd2345")).toBe("CHASSE-ABCD2345");
    expect(normalizeRedeemCode("RESA-ABCD2345")).toBe("RESA-ABCD2345");
    // Le TIRET fait la reconnaissance : sans lui, la saisie reste ambiguë et
    // suit le chemin historique. Sinon un corps tiré commençant par ces lettres
    // — `EVENT…` est possible dans l'alphabet — cesserait d'être un code nu.
    expect(normalizeRedeemCode("EVENTABC2")).toBe("GAIN-EVENTABC2");
  });
});

describe("normalizeTicketOrCode — le code de RETRAIT du Ticket d'Or", () => {
  it("normalise les saisies de caisse", async () => {
    const { normalizeTicketOrCode } = await import("./utils");
    expect(normalizeTicketOrCode("ticket abcd2345")).toBe("TICKET-ABCD2345");
    expect(normalizeTicketOrCode("TICKET-ABCD2345")).toBe("TICKET-ABCD2345");
    expect(normalizeTicketOrCode("abcd2345")).toBe("TICKET-ABCD2345");
    expect(normalizeTicketOrCode("  ticket_abcd2345 ")).toBe("TICKET-ABCD2345");
  });

  it("rejette le code du TICKET, qui n'est PAS un code de retrait", async () => {
    // Dix caractères sans préfixe : `CODE_TICKET` ouvre le droit de JOUER.
    // L'accepter ici ferait remettre un lot à quelqu'un qui n'a pas encore tiré.
    const { normalizeTicketOrCode } = await import("./utils");
    expect(normalizeTicketOrCode("ABCDEFGHJK")).toBe("");
    expect(normalizeTicketOrCode("")).toBe("");
    expect(normalizeTicketOrCode("TICKET-ABC")).toBe("");
    // Alphabet sans ambiguïté : ni I, ni O, ni 0, ni 1.
    expect(normalizeTicketOrCode("ABCD2I45")).toBe("");
  });
});

describe("slugify", () => {
  it("retire accents et caractères spéciaux", () => {
    expect(slugify("Chez Marco")).toBe("chez-marco");
    expect(slugify("Café de l'Été !")).toBe("cafe-de-l-ete");
  });

  it("borne la longueur à 48 caractères", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(48);
  });
});

describe("randomCode", () => {
  it("respecte longueur et préfixe", () => {
    const code = randomCode(6, "GAIN");
    expect(code).toMatch(/^GAIN-[A-HJ-NP-Z2-9]{6}$/);
  });

  it("évite les caractères ambigus (I, O, 0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomCode(8)).not.toMatch(/[IO01]/);
    }
  });
});

/**
 * LE COMMERÇANT LIT L'HEURE DE SON ÉTABLISSEMENT, PAS CELLE DU SERVEUR.
 *
 * `Intl.DateTimeFormat` sans option `timeZone` retombe sur le fuseau du
 * processus — UTC en production. Toutes les dates du panneau et de la caisse
 * étaient donc décalées : deux heures à Paris en été, dix à Tahiti, et très
 * souvent le mauvais JOUR. Le commerçant règle pourtant son fuseau dans ses
 * réglages ; ce réglage n'était lu nulle part à l'affichage.
 *
 * L'instant choisi ci-dessous est délibéré : 23 h 30 UTC, c'est-à-dire un
 * changement de DATE dans les deux sens selon le fuseau. Un test qui ne
 * franchit pas minuit ne prouverait qu'un décalage d'heures.
 */
describe("formatDate — le fuseau de l'établissement", () => {
  const minuitMoinsLeQuart = "2026-07-15T23:30:00.000Z";

  it("bascule au LENDEMAIN à Paris (UTC+2 en été)", () => {
    // 23 h 30 UTC = 1 h 30 le 16 à Paris. Le jour change.
    expect(formatDate(minuitMoinsLeQuart, "Europe/Paris")).toContain("16");
  });

  it("reste la VEILLE à Tahiti (UTC−10)", () => {
    // 23 h 30 UTC = 13 h 30 le 15 à Tahiti. Le jour ne change pas.
    expect(formatDate(minuitMoinsLeQuart, "Pacific/Tahiti")).toContain("15");
  });

  it("prend Paris par défaut, JAMAIS le fuseau de l'hôte", () => {
    // C'est le cœur du correctif : les 42 appels serveur qui ne passent pas
    // encore de fuseau doivent afficher Paris, pas UTC. Le défaut de la
    // colonne `organizations.timezone` est lui aussi `Europe/Paris`.
    expect(formatDate(minuitMoinsLeQuart)).toBe(
      formatDate(minuitMoinsLeQuart, "Europe/Paris"),
    );
  });

  it("ne casse pas l'écran sur un fuseau inconnu du runtime", () => {
    // Mieux vaut une date juste-à-peu-près qu'une exception à la place d'une
    // date, sur une page de caisse en plein service.
    expect(() => formatDate(minuitMoinsLeQuart, "Mars/Olympus_Mons")).not.toThrow();
    expect(formatDate(minuitMoinsLeQuart, "Mars/Olympus_Mons")).toBe(
      formatDate(minuitMoinsLeQuart, "Europe/Paris"),
    );
  });
});

describe("normalizeStockHoldCode — le corps qui commence par RESA (revue L9)", () => {
  it("accepte les trois formes de saisie du comptoir", async () => {
    const { normalizeStockHoldCode } = await import("./utils");
    expect(normalizeStockHoldCode("RESA-ABCD2345")).toBe("RESA-ABCD2345");
    expect(normalizeStockHoldCode("abcd2345")).toBe("RESA-ABCD2345");
    expect(normalizeStockHoldCode("  resa abcd2345 ")).toBe("RESA-ABCD2345");
  });

  it("NE MANGE PAS un corps qui commence par RESA", async () => {
    // ROUGE SI : quelqu'un remet le retrait du préfixe AVANT le test de forme.
    // `R`, `E`, `S` et `A` sont tous dans l'alphabet du trigger : un corps sur
    // 32⁴ — environ une prise sur un million — commence par `RESA`. Saisi seul,
    // il était amputé à `2345`, refusé, et le code imprimé sur le téléphone du
    // client devenait inutilisable sans que rien n'explique pourquoi.
    const { normalizeStockHoldCode } = await import("./utils");
    expect(normalizeStockHoldCode("RESA2345")).toBe("RESA-RESA2345");
    expect(normalizeStockHoldCode("resa2345")).toBe("RESA-RESA2345");
    // Et la forme préfixée du même code marche toujours : douze caractères,
    // jamais huit — aucune ambiguïté entre les deux.
    expect(normalizeStockHoldCode("RESA-RESA2345")).toBe("RESA-RESA2345");
    expect(normalizeStockHoldCode("resa resa2345")).toBe("RESA-RESA2345");
  });

  it("rejette toujours les préfixes des neuf autres familles", async () => {
    const { normalizeStockHoldCode } = await import("./utils");
    expect(normalizeStockHoldCode("GAIN-ABCD2345")).toBe("");
    expect(normalizeStockHoldCode("PRONO-ABCD2345")).toBe("");
    // Alphabet sans ambiguïté : ni I, ni O, ni 0, ni 1.
    expect(normalizeStockHoldCode("ABCD234I")).toBe("");
    expect(normalizeStockHoldCode("")).toBe("");
    expect(normalizeStockHoldCode("resa-")).toBe("");
  });
});
