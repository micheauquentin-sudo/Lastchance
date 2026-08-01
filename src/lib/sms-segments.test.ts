// @vitest-environment node
import { describe, expect, it } from "vitest";

import { smsSegments } from "@/lib/sms-segments";

/* ════════════════════════════════════════════════════════════
 * LE DÉCOUPAGE EN SEGMENTS — ce que ces tests prouvent
 *
 * Ce module décide de ce qui est FACTURÉ. Les vecteurs ci-dessous sont ceux
 * de la norme (3GPP TS 23.038) : 160/161 en GSM-7, 70/71 en UCS-2, et les
 * frontières de 153 / 67 en concaténé.
 *
 * LE TEST QUI PORTE LE FICHIER est celui du CHEVAUCHEMENT. Une
 * implémentation par division — `ceil(units / 153)` — passe tous les autres
 * et se trompe sur celui-là, c'est-à-dire dans le seul cas où le message
 * coûte un segment de plus que son compte d'unités ne le laisse croire.
 * ════════════════════════════════════════════════════════════ */

describe("GSM-7 — les frontières de la norme", () => {
  it("160 caractères simples tiennent en un seul segment", () => {
    expect(smsSegments("a".repeat(160))).toEqual({
      segments: 1,
      encoding: "gsm7",
      units: 160,
    });
  });

  it("161 en font DEUX — et la capacité retombe à 153, pas à 160", () => {
    // L'en-tête de concaténation (UDH) mange 6 septets sur CHAQUE segment.
    expect(smsSegments("a".repeat(161))).toEqual({
      segments: 2,
      encoding: "gsm7",
      units: 161,
    });
  });

  it("306 caractères simples = exactement deux segments pleins", () => {
    expect(smsSegments("a".repeat(306)).segments).toBe(2);
  });

  it("307 en font trois", () => {
    expect(smsSegments("a".repeat(307)).segments).toBe(3);
  });

  it("un message vide vaut un segment, jamais zéro", () => {
    // Rendre 0 ferait débiter zéro unité pour un envoi réellement tenté.
    expect(smsSegments("")).toEqual({ segments: 1, encoding: "gsm7", units: 0 });
  });

  it("les accents français de la table de base ne font PAS basculer en UCS-2", () => {
    // « é », « è », « à », « ù » : dans l'alphabet de base, un septet chacun.
    // C'est ce qui permet d'écrire un message français ordinaire à 160
    // caractères.
    const { encoding, units } = smsSegments("éèàù");
    expect(encoding).toBe("gsm7");
    expect(units).toBe(4);
  });

  it("mais le « ç » MINUSCULE, lui, bascule tout le message en UCS-2", () => {
    // Contre-intuitif et payant : la table normative ne porte que le « Ç »
    // MAJUSCULE (0x09). « Un café offert chez Marcel, ça vous dit ? » passe
    // donc en UCS-2 — 70 caractères par segment au lieu de 160 — à cause
    // d'une cédille. Même famille de piège que le « À » majuscule, qui
    // manque lui aussi alors que son « à » minuscule est présent : c'est
    // pour cela que la partie fixe de `prizeSmsContent` est sans accent.
    expect(smsSegments("Ç").encoding).toBe("gsm7");
    expect(smsSegments("ç").encoding).toBe("ucs2");
    expect(smsSegments("à").encoding).toBe("gsm7");
    expect(smsSegments("À").encoding).toBe("ucs2");
  });
});

describe("GSM-7 — la table d'extension coûte deux septets", () => {
  it("un caractère d'extension seul : 2 unités, mais toujours un segment", () => {
    expect(smsSegments("€")).toEqual({
      segments: 1,
      encoding: "gsm7",
      units: 2,
    });
  });

  it("les dix caractères d'extension coûtent le double", () => {
    // La barre verticale et le saut de page en font partie : les omettre
    // ferait basculer en UCS-2 un message qui n'en a pas besoin.
    for (const char of ["^", "{", "}", "\\", "[", "~", "]", "|", "€", "\f"]) {
      const { encoding, units } = smsSegments(char);
      expect(encoding, `caractère ${JSON.stringify(char)}`).toBe("gsm7");
      expect(units, `caractère ${JSON.stringify(char)}`).toBe(2);
    }
  });

  it("80 euros suffisent à remplir un segment de 160 septets", () => {
    expect(smsSegments("€".repeat(80))).toEqual({
      segments: 1,
      encoding: "gsm7",
      units: 160,
    });
  });
});

describe("UCS-2 — les frontières de la norme", () => {
  const HORS_GSM = "ж"; // cyrillique : absent des deux tables GSM-7

  it("70 caractères hors GSM-7 tiennent en un segment", () => {
    expect(smsSegments(HORS_GSM.repeat(70))).toEqual({
      segments: 1,
      encoding: "ucs2",
      units: 70,
    });
  });

  it("71 en font deux — capacité concaténée de 67", () => {
    expect(smsSegments(HORS_GSM.repeat(71))).toEqual({
      segments: 2,
      encoding: "ucs2",
      units: 71,
    });
  });

  it("une emoji compte pour DEUX unités UTF-16", () => {
    // Paire de substitution. La compter pour un ferait tenir 70 emojis dans
    // un segment qui n'en porte que 35.
    expect(smsSegments("😀")).toEqual({
      segments: 1,
      encoding: "ucs2",
      units: 2,
    });
    expect(smsSegments("😀".repeat(35)).segments).toBe(1);
    expect(smsSegments("😀".repeat(36)).segments).toBe(2);
  });
});

/* ════════════════════════════════════════════════════════════
 * LE CHEVAUCHEMENT — le contre-contrôle du module
 * ════════════════════════════════════════════════════════════ */

describe("un caractère à deux unités ne chevauche jamais une frontière", () => {
  it("GSM-7 : 306 unités donnent TROIS segments quand la division en dit deux", () => {
    // 152 « a » remplissent le segment 1 à 152/153. Le « € » coûte 2 : il ne
    // tient pas dans la place restante et part ENTIER au segment 2, laissant
    // un septet perdu derrière lui. Segment 2 : 2 + 151 = 153, plein. Il
    // reste un « a » — donc un troisième segment.
    const message = "a".repeat(152) + "€" + "a".repeat(152);
    const { units, segments } = smsSegments(message);

    expect(units).toBe(306);
    // LA PREUVE : ceil(306 / 153) = 2. Une implémentation par division rend 2
    // et sous-facture d'un segment entier.
    expect(Math.ceil(units / 153)).toBe(2);
    expect(segments).toBe(3);
  });

  it("GSM-7 : sans le caractère à deux unités, la division a raison", () => {
    // TÉMOIN du test précédent. Mêmes 306 unités, aucun chevauchement : deux
    // segments. Sans lui, le test ci-dessus serait vert avec une fonction qui
    // rend toujours « un de plus que la division ».
    const { units, segments } = smsSegments("a".repeat(306));
    expect(units).toBe(306);
    expect(segments).toBe(2);
  });

  it("GSM-7 : le caractère qui tient EXACTEMENT ne bascule pas", () => {
    // 151 « a » puis « € » : 151 + 2 = 153, la limite est atteinte pile. Le
    // caractère reste dans le segment 1. Une garde écrite avec `>=` au lieu
    // de `>` le pousserait à tort et facturerait un segment de plus.
    const message = "a".repeat(151) + "€" + "a".repeat(153);
    const { units, segments } = smsSegments(message);
    expect(units).toBe(306);
    expect(segments).toBe(2);
  });

  it("UCS-2 : une emoji sur la frontière bascule entière", () => {
    // Même mécanique, capacité 67. 66 + 2 > 67 → l'emoji part au segment
    // suivant. 134 unités, ceil(134 / 67) = 2, la réponse est 3.
    const message = "ж".repeat(66) + "😀" + "ж".repeat(66);
    const { units, segments } = smsSegments(message);

    expect(units).toBe(134);
    expect(Math.ceil(units / 67)).toBe(2);
    expect(segments).toBe(3);
  });
});
