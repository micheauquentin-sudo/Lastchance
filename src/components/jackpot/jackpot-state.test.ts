import { describe, expect, it } from "vitest";
import type { JackpotParticipationResult } from "@/lib/jackpot";
import {
  clampJackpotPeriod,
  formatDurationLabel,
  formatJackpotAmount,
  jackpotCooldownFloor,
  jackpotDrawModeSummary,
  jackpotProgress,
  messageForJackpotParticipation,
  resolveJackpotCooldown,
} from "./jackpot-state";

describe("jackpotProgress", () => {
  it("calcule ratio, pourcentage et restant vers l'objectif", () => {
    const p = jackpotProgress(30, 100);
    expect(p.ratio).toBeCloseTo(0.3);
    expect(p.percent).toBe(30);
    expect(p.remaining).toBe(70);
    expect(p.reached).toBe(false);
  });

  it("borne le ratio à 1 et signale l'objectif atteint", () => {
    const p = jackpotProgress(120, 100);
    expect(p.ratio).toBe(1);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.reached).toBe(true);
  });

  it("objectif nul → ratio plein, jamais NaN", () => {
    const p = jackpotProgress(0, 0);
    expect(p.ratio).toBe(1);
    expect(Number.isNaN(p.ratio)).toBe(false);
    expect(p.remaining).toBe(0);
  });

  it("compteur négatif ramené à zéro", () => {
    const p = jackpotProgress(-5, 100);
    expect(p.percent).toBe(0);
    expect(p.remaining).toBe(100);
  });
});

describe("formatJackpotAmount", () => {
  it("affiche les euros sans décimale quand le montant tombe juste", () => {
    const out = formatJackpotAmount(125000);
    expect(out).toContain("1");
    expect(out).toContain("250");
    expect(out).toContain("€");
    expect(out).not.toContain(",00");
  });

  it("affiche deux décimales sur un montant fractionné", () => {
    expect(formatJackpotAmount(1250)).toContain("12,50");
  });

  it("0 centime → montant nul lisible", () => {
    const out = formatJackpotAmount(0);
    expect(out).toContain("0");
    expect(out).toContain("€");
  });

  it("valeur négative bornée à zéro", () => {
    expect(formatJackpotAmount(-500)).toContain("0");
  });
});

/** Résultat de participation de base (état recorded neutre). */
function baseResult(
  over: Partial<JackpotParticipationResult> = {},
): JackpotParticipationResult {
  return {
    state: "recorded",
    campaign: null,
    currentCount: 10,
    threshold: 100,
    cycle: 1,
    isNewPlayer: false,
    isWinner: false,
    code: null,
    outOfStock: false,
    armed: false,
    displayAmountCents: 5000,
    drawAt: null,
    retryInSeconds: null,
    ...over,
  };
}

describe("messageForJackpotParticipation", () => {
  it("gagnant → message de succès qui renvoie au code de retrait", () => {
    const m = messageForJackpotParticipation(
      baseResult({ isWinner: true, code: "JACKPOT-ABCD2345" }),
    );
    expect(m.tone).toBe("success");
    expect(m.title).toContain("remporté");
  });

  it("objectif atteint mais stock épuisé → avertissement, pas de gain", () => {
    const m = messageForJackpotParticipation(baseResult({ outOfStock: true }));
    expect(m.tone).toBe("warning");
    expect(m.title).toContain("épuisés");
  });

  it("jackpot armé (rescan) sans gain → invite à retenter", () => {
    const m = messageForJackpotParticipation(baseResult({ armed: true }));
    expect(m.tone).toBe("info");
    expect(m.title).toContain("débloqué");
  });

  it("participation simple enregistrée → succès neutre", () => {
    const m = messageForJackpotParticipation(baseResult());
    expect(m.tone).toBe("success");
    expect(m.title).toContain("enregistrée");
  });

  it("le gagnant prime sur la rupture de stock et l'armement", () => {
    const m = messageForJackpotParticipation(
      baseResult({ isWinner: true, code: "JACKPOT-ABCD2345", outOfStock: true, armed: true }),
    );
    expect(m.title).toContain("remporté");
  });

  it("too_soon avec délai → message d'attente chiffré", () => {
    const m = messageForJackpotParticipation(
      baseResult({ state: "too_soon", retryInSeconds: 3600 }),
    );
    expect(m.tone).toBe("warning");
    expect(m.body).toContain("1 h");
  });

  it("code invalide → erreur", () => {
    const m = messageForJackpotParticipation(baseResult({ state: "invalid_code" }));
    expect(m.tone).toBe("error");
    expect(m.title).toContain("incorrect");
  });

  it("indisponible → erreur générique sans oracle", () => {
    const m = messageForJackpotParticipation(baseResult({ state: "unavailable" }));
    expect(m.tone).toBe("error");
    expect(m.title).toContain("indisponible");
  });
});

describe("clampJackpotPeriod", () => {
  it("borne la rotation dans [15, 300]", () => {
    expect(clampJackpotPeriod(5)).toBe(15);
    expect(clampJackpotPeriod(600)).toBe(300);
    expect(clampJackpotPeriod(60)).toBe(60);
  });

  it("valeur non finie → défaut sûr", () => {
    expect(clampJackpotPeriod(Number.NaN)).toBe(60);
  });
});

describe("jackpotCooldownFloor", () => {
  it("code tournant : max(2 × période, 300)", () => {
    expect(jackpotCooldownFloor("rotating_code", 60)).toBe(300);
    expect(jackpotCooldownFloor("rotating_code", 200)).toBe(400);
  });

  it("caisse : plancher fixe de 300 s", () => {
    expect(jackpotCooldownFloor("staff", 200)).toBe(300);
  });
});

describe("resolveJackpotCooldown", () => {
  it("remonte au plancher une valeur trop basse et le signale", () => {
    const r = resolveJackpotCooldown({
      mode: "rotating_code",
      periodSeconds: 200,
      cooldownSeconds: 300,
    });
    expect(r.floorSeconds).toBe(400);
    expect(r.value).toBe(400);
    expect(r.adjusted).toBe(true);
    expect(r.options.every((o) => o.value >= 400)).toBe(true);
  });

  it("conserve une valeur au-dessus du plancher", () => {
    const r = resolveJackpotCooldown({
      mode: "staff",
      periodSeconds: 60,
      cooldownSeconds: 86400,
    });
    expect(r.adjusted).toBe(false);
    expect(r.value).toBe(86400);
    expect(r.options.some((o) => o.value === 86400)).toBe(true);
  });
});

describe("formatDurationLabel", () => {
  it("formate secondes, minutes, heures et jours", () => {
    expect(formatDurationLabel(45)).toBe("45 s");
    expect(formatDurationLabel(300)).toBe("5 min");
    expect(formatDurationLabel(3600)).toBe("1 heure");
    expect(formatDurationLabel(7200)).toBe("2 heures");
    expect(formatDurationLabel(86400)).toBe("1 jour");
    expect(formatDurationLabel(604800)).toBe("7 jours");
  });
});

describe("jackpotDrawModeSummary", () => {
  it("donne une phrase distincte par mode", () => {
    const a = jackpotDrawModeSummary("threshold_draw");
    const b = jackpotDrawModeSummary("rescan_win");
    const c = jackpotDrawModeSummary("date_draw");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(c).toContain("date");
  });
});
