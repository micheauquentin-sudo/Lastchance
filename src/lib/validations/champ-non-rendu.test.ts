import { describe, expect, it } from "vitest";

import { merchantCompAccessSchema } from "./admin";
import { updateCampaignSchema } from "./campaigns";
import { updateHuntSchema } from "./hunts";
import { updateJackpotCampaignSchema } from "./jackpot";
import { updateLoyaltyProgramSchema } from "./loyalty";
import { addPrizeSchema } from "./prizes";
import {
  updateContestScoringSchema,
  updateContestTiebreakerSchema,
} from "./pronostics";

/* ════════════════════════════════════════════════════════════
 * LES FAMILLES CONVERTIES, SUR LEURS VRAIS SCHÉMAS
 *
 * `champ-formulaire-coverage.test.ts` prouve MÉCANIQUEMENT qu'aucun champ du
 * dossier ne lit `null` autrement que l'absence. Il ne prouve pas la seconde
 * moitié de la promesse, et c'est ce fichier-ci qui s'en charge : **une valeur
 * INVALIDE reste refusée**.
 *
 * Les deux sont nécessaires ensemble. Un `.catch(() => valeurParDéfaut)` posé
 * sur chaque champ satisferait la garde de couverture d'un bout à l'autre — et
 * ferait passer « poids = abc » pour un lot valide. Sans les cas de refus
 * ci-dessous, « fermer la classe » voudrait dire « tout accepter », ce qui est
 * la panne d'à côté et pas un progrès.
 *
 * On y ajoute les valeurs LIMITES que la conversion aurait pu emporter sans
 * qu'on le remarque : le `0` saisi, qui reste une décision métier partout où il
 * en est une.
 * ════════════════════════════════════════════════════════════ */

const UUID = "11111111-1111-4111-8111-111111111111";

describe("prizes — le poids d'un lot", () => {
  const base = { wheel_id: UUID, label: "Café offert", is_losing: false };

  it("champ non rendu : REFUSÉ, et le refus nomme la conséquence", () => {
    const r = addPrizeSchema.safeParse({ ...base, weight: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("jamais tiré");
  });

  it("« 0 » SAISI : accepté — mettre un lot en réserve est un geste légitime", () => {
    const r = addPrizeSchema.safeParse({ ...base, weight: "0" });
    expect(r.success, r.success ? "" : r.error.issues[0].message).toBe(true);
    if (r.success) expect(r.data.weight).toBe(0);
  });

  it("valeurs INVALIDES : toujours refusées", () => {
    for (const mauvais of ["abc", "3.5", "-1", "10001"]) {
      expect(
        addPrizeSchema.safeParse({ ...base, weight: mauvais }).success,
        `weight = ${mauvais}`,
      ).toBe(false);
    }
  });

  it("les textes facultatifs absorbent le champ non rendu sans devenir laxistes", () => {
    const r = addPrizeSchema.safeParse({
      ...base,
      weight: "1",
      description: null,
      color: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBe("");
      expect(r.data.color).toBe("#7c3aed");
    }
    // Une couleur qui n'en est pas une reste refusée.
    expect(
      addPrizeSchema.safeParse({ ...base, weight: "1", color: "bleu" }).success,
    ).toBe(false);
  });
});

describe("pronostics — le barème et la question subsidiaire", () => {
  it("barème non rendu : REFUSÉ, plus jamais trois paliers à 0", () => {
    const r = updateContestScoringSchema.safeParse({
      id: UUID,
      exact: null,
      diff: null,
      winner: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("Barème incomplet");
  });

  it("un palier volontairement à 0 reste enregistrable", () => {
    const r = updateContestScoringSchema.safeParse({
      id: UUID,
      exact: "5",
      diff: "3",
      winner: "0",
    });
    expect(r.success, r.success ? "" : r.error.issues[0].message).toBe(true);
    if (r.success) expect(r.data.winner).toBe(0);
  });

  it("barème INVALIDE : toujours refusé", () => {
    for (const mauvais of ["abc", "2.5", "-1", "101"]) {
      expect(
        updateContestScoringSchema.safeParse({
          id: UUID,
          exact: mauvais,
          diff: "1",
          winner: "1",
        }).success,
        `exact = ${mauvais}`,
      ).toBe(false);
    }
  });

  it("question subsidiaire non rendue : '' et non 0 — le départage ne se fait plus sur un zéro fantôme", () => {
    const r = updateContestTiebreakerSchema.safeParse({
      id: UUID,
      question: null,
      answer: null,
    });
    expect(r.success, r.success ? "" : r.error.issues[0].message).toBe(true);
    if (r.success) {
      expect(r.data.question).toBe("");
      // LE cas que le commentaire d'admin.ts affirmait déjà couvert : il ne
      // l'était pas, et `null` devenait 0 — une réponse valide, indistinguable
      // d'une vraie.
      expect(r.data.answer).toBe("");
      expect(r.data.answer).not.toBe(0);
    }
  });

  it("une réponse subsidiaire de 0 SAISIE reste un 0", () => {
    const r = updateContestTiebreakerSchema.safeParse({
      id: UUID,
      question: "Combien de buts ?",
      answer: "0",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.answer).toBe(0);
  });

  it("une réponse subsidiaire INVALIDE reste refusée", () => {
    for (const mauvais of ["abc", "-1", "1.5"]) {
      expect(
        updateContestTiebreakerSchema.safeParse({
          id: UUID,
          question: "Q",
          answer: mauvais,
        }).success,
        `answer = ${mauvais}`,
      ).toBe(false);
    }
  });
});

describe("cooldowns — les anti-rejeu ne se désarment plus en silence", () => {
  const chasse = {
    id: UUID,
    name: "Chasse de Noël",
    order_mode: "free",
    reward_label: "",
    reward_details: "",
    reward_stock: "",
    starts_at: "",
    ends_at: "",
  };

  it("chasse : délai anti-partage non rendu → REFUS, pas « désactivé »", () => {
    const r = updateHuntSchema.safeParse({
      ...chasse,
      min_scan_interval_seconds: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("délai minimal");
  });

  it("chasse : 0 SAISI reste « anti-partage désactivé », un choix du commerçant", () => {
    const r = updateHuntSchema.safeParse({
      ...chasse,
      min_scan_interval_seconds: "0",
    });
    expect(r.success, r.success ? "" : r.error.issues[0].message).toBe(true);
    if (r.success) expect(r.data.min_scan_interval_seconds).toBe(0);
  });

  it("chasse : un délai INVALIDE reste refusé", () => {
    for (const mauvais of ["abc", "-1", "86401"]) {
      expect(
        updateHuntSchema.safeParse({ ...chasse, min_scan_interval_seconds: mauvais })
          .success,
        `interval = ${mauvais}`,
      ).toBe(false);
    }
  });

  it("fidélité : cooldown non rendu → REFUS", () => {
    const r = updateLoyaltyProgramSchema.safeParse({
      id: UUID,
      name: "Passeport",
      validation_mode: "staff",
      rotating_period_seconds: "60",
      min_stamp_interval_seconds: null,
      silver_threshold: "5",
      gold_threshold: "10",
    });
    expect(r.success).toBe(false);
  });

  it("jackpot : cooldown non rendu → REFUS", () => {
    const r = updateJackpotCampaignSchema.safeParse({
      id: UUID,
      name: "Cagnotte",
      public_slug: "",
      validation_mode: "staff",
      rotating_period_seconds: "60",
      min_participation_interval_seconds: null,
      draw_mode: "threshold_draw",
      threshold: "100",
      win_probability: "",
      draw_at: "",
      reward_label: "",
      reward_details: "",
      reward_stock: "10",
      display_base: "",
      display_increment: "",
      merchant_content: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("mises à jour partielles — l'absence reste l'absence", () => {
  it("campagne : un champ non rendu ne devient pas une écriture", () => {
    const r = updateCampaignSchema.safeParse({ id: UUID, name: null, status: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBeUndefined();
      expect(r.data.status).toBeUndefined();
    }
  });

  it("campagne : une valeur INVALIDE reste refusée, l'absence n'est pas un passe-droit", () => {
    expect(updateCampaignSchema.safeParse({ id: UUID, name: "" }).success).toBe(false);
    expect(
      updateCampaignSchema.safeParse({ id: UUID, status: "supprimee" }).success,
    ).toBe(false);
  });
});

describe("back-office — les cases d'add-on d'un accès offert", () => {
  const base = {
    organizationId: UUID,
    enabled: "true",
    until: "",
    note: "Partenaire",
  };

  it("les quatre cases non rendues valent « décochée »", () => {
    const r = merchantCompAccessSchema.safeParse({
      ...base,
      includePronostics: null,
      includeHunts: null,
      includeLoyalty: null,
      includeJackpot: null,
    });
    expect(r.success, r.success ? "" : r.error.issues[0].message).toBe(true);
    if (r.success) {
      expect(r.data.includePronostics).toBe(false);
      expect(r.data.includeJackpot).toBe(false);
    }
  });

  it("une valeur hors des deux littéraux reste refusée", () => {
    // Sans ce cas, un `.catch(false)` aurait satisfait le précédent — et
    // n'importe quelle chaîne aurait valu « décochée », y compris celle d'un
    // formulaire mal sérialisé qui voulait ACTIVER l'add-on.
    expect(
      merchantCompAccessSchema.safeParse({ ...base, includeHunts: "oui" }).success,
    ).toBe(false);
  });

  it("une date de fin invalide reste refusée", () => {
    expect(
      merchantCompAccessSchema.safeParse({ ...base, until: "2026-02-30" }).success,
    ).toBe(false);
  });
});
