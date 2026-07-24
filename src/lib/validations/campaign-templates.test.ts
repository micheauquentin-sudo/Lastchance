// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CAMPAIGN_TEMPLATES } from "@/lib/campaign-templates";
import {
  applyCampaignTemplateSchema,
  BLUEPRINT_MAX_PRIZES,
  campaignBlueprintSchema,
  deleteCampaignTemplateSchema,
  saveCampaignAsTemplateSchema,
} from "./campaign-templates";

// ────────────────────────────────────────────────────────────
// campaignBlueprintSchema — la SEULE garde de forme du blueprint
//
// La base (20260802120000) ne promet que « objet jsonb ≤ 32 Ko » : tout le
// reste — bornes de textes, nombre de lots, poids, stocks, game_type réel,
// play_limit, durée relative — est vérifié ici, à l'écriture d'un modèle
// privé ET à sa relecture avant application. Un blueprint qui passe ce
// schéma produit, par construction, des lignes acceptables par
// campaigns / wheels / prizes.
// ────────────────────────────────────────────────────────────

/** Forme LÂCHE volontairement : chaque test doit pouvoir casser un champ. */
interface LooseBlueprint {
  version: number;
  texts: { campaignName: string; wheelName: string; wheelTitle: string };
  visual: { preset: string; style?: Record<string, unknown> };
  game: { game_type: string; skill_config: Record<string, unknown> | null };
  prizes: Array<{
    label: string;
    description: string;
    color: string;
    weight: number;
    is_losing: boolean;
    stock: number | null;
    cost_cents: number | null;
  }>;
  rules: {
    play_limit: string;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
    engagement: Record<string, unknown>;
    budget_cents: number | null;
  };
  durationDays: number;
  emails: Array<{ moment: string; subject: string; body: string }>;
}

/** Blueprint minimal valide — chaque test n'en casse qu'un aspect. */
function baseBlueprint(): LooseBlueprint {
  return {
    version: 1,
    texts: {
      campaignName: "Ma campagne",
      wheelName: "Ma roue",
      wheelTitle: "Tournez la roue !",
    },
    visual: { preset: "kermesse" },
    game: { game_type: "wheel", skill_config: null },
    prizes: [
      {
        label: "Café offert",
        description: "Un café au comptoir.",
        color: "#f59e0b",
        weight: 40,
        is_losing: false,
        stock: 50,
        cost_cents: null,
      },
      {
        label: "Pas de chance",
        description: "Retentez bientôt !",
        color: "#64748b",
        weight: 60,
        is_losing: true,
        stock: null,
        cost_cents: null,
      },
    ],
    rules: {
      play_limit: "once",
      collect_email: false,
      collect_phone: false,
      code_ttl_seconds: 300,
      engagement: {},
      budget_cents: null,
    },
    durationDays: 7,
    emails: [{ moment: "annonce", subject: "Objet", body: "Message" }],
  };
}

const firstMessage = (input: unknown): string | null => {
  const parsed = campaignBlueprintSchema.safeParse(input);
  return parsed.success ? null : parsed.error.issues[0].message;
};

describe("campaignBlueprintSchema", () => {
  it("accepte un blueprint minimal valide", () => {
    expect(firstMessage(baseBlueprint())).toBeNull();
  });

  it("accepte les 10 modèles du catalogue", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      expect(campaignBlueprintSchema.safeParse(template.blueprint).success).toBe(true);
    }
  });

  it("refuse une version de forme inconnue", () => {
    expect(firstMessage({ ...baseBlueprint(), version: 2 })).not.toBeNull();
  });

  it("exige au moins 2 lots", () => {
    const blueprint = baseBlueprint();
    blueprint.prizes = [blueprint.prizes[0]];
    expect(firstMessage(blueprint)).toContain("au moins 2 lots");
  });

  it("plafonne le nombre de lots", () => {
    const blueprint = baseBlueprint();
    blueprint.prizes = Array.from({ length: BLUEPRINT_MAX_PRIZES + 1 }, () => ({
      ...blueprint.prizes[0],
    }));
    expect(firstMessage(blueprint)).toContain("Trop de lots");
  });

  it("exige au moins un lot gagnant", () => {
    const blueprint = baseBlueprint();
    blueprint.prizes = blueprint.prizes.map((prize) => ({ ...prize, is_losing: true }));
    expect(firstMessage(blueprint)).toContain("au moins un lot gagnant");
  });

  it("refuse un tirage impossible (tous les poids à zéro)", () => {
    const blueprint = baseBlueprint();
    blueprint.prizes = blueprint.prizes.map((prize) => ({ ...prize, weight: 0 }));
    expect(firstMessage(blueprint)).toContain("poids supérieur à 0");
  });

  it("refuse un poids négatif ou non entier", () => {
    const negative = baseBlueprint();
    negative.prizes[0].weight = -1;
    expect(firstMessage(negative)).not.toBeNull();

    const fractional = baseBlueprint();
    fractional.prizes[0].weight = 1.5;
    expect(firstMessage(fractional)).toContain("Poids entier requis");
  });

  it("refuse un stock négatif ou non entier, accepte null", () => {
    const negative = baseBlueprint();
    negative.prizes[0].stock = -1;
    expect(firstMessage(negative)).toContain("Stock minimum 0");

    const fractional = baseBlueprint();
    fractional.prizes[0].stock = 2.5;
    expect(firstMessage(fractional)).toContain("Stock entier requis");

    const unlimited = baseBlueprint();
    unlimited.prizes[0].stock = null;
    expect(firstMessage(unlimited)).toBeNull();
  });

  it("refuse un game_type hors de l'enum réel", () => {
    const blueprint = baseBlueprint();
    blueprint.game.game_type = "roulette_russe";
    expect(firstMessage(blueprint)).not.toBeNull();
  });

  it("accepte les mécaniques du registre", () => {
    for (const gameType of ["wheel", "scratch", "flip_card", "chest", "draw_card"]) {
      const blueprint = baseBlueprint();
      blueprint.game.game_type = gameType;
      expect(firstMessage(blueprint)).toBeNull();
    }
  });

  it("refuse une config de défi sur un jeu sans défi", () => {
    const blueprint = baseBlueprint();
    blueprint.game.skill_config = { word: "secret" } as never;
    expect(firstMessage(blueprint)).toContain("ne prend pas de configuration");
  });

  it("refuse un jeu de défi sans config valide", () => {
    const blueprint = baseBlueprint();
    blueprint.game.game_type = "mystery_word";
    expect(firstMessage(blueprint)).not.toBeNull();
  });

  it("refuse play_limit=unlimited sur un jeu à secret serveur", () => {
    const blueprint = baseBlueprint();
    blueprint.game.game_type = "mystery_word";
    blueprint.game.skill_config = {
      word: "chocolat",
      hint: "On en mange à Noël",
    } as never;
    blueprint.rules.play_limit = "unlimited";
    const message = firstMessage(blueprint);
    expect(message).toContain("limite de participation");
  });

  it("refuse un play_limit inconnu", () => {
    const blueprint = baseBlueprint();
    blueprint.rules.play_limit = "hourly";
    expect(firstMessage(blueprint)).not.toBeNull();
  });

  it("borne la durée relative à 1..365 jours", () => {
    for (const durationDays of [0, -3, 366, 10_000]) {
      const blueprint = baseBlueprint();
      blueprint.durationDays = durationDays;
      expect(firstMessage(blueprint)).not.toBeNull();
    }
    for (const durationDays of [1, 30, 365]) {
      const blueprint = baseBlueprint();
      blueprint.durationDays = durationDays;
      expect(firstMessage(blueprint)).toBeNull();
    }
    const fractional = baseBlueprint();
    fractional.durationDays = 7.5;
    expect(firstMessage(fractional)).toContain("Nombre entier de jours requis");
  });

  it("refuse un texte vide ou trop long", () => {
    const empty = baseBlueprint();
    empty.texts.wheelTitle = "   ";
    expect(firstMessage(empty)).toContain("Accroche requise");

    const long = baseBlueprint();
    long.texts.wheelTitle = "x".repeat(81);
    expect(firstMessage(long)).toContain("Accroche trop longue");

    const longName = baseBlueprint();
    longName.texts.campaignName = "x".repeat(121);
    expect(firstMessage(longName)).toContain("Nom trop long");
  });

  it("refuse une couleur de lot invalide", () => {
    const blueprint = baseBlueprint();
    blueprint.prizes[0].color = "rouge";
    expect(firstMessage(blueprint)).toContain("Couleur invalide");
  });

  it("borne code_ttl_seconds comme les réglages de campagne", () => {
    const short = baseBlueprint();
    short.rules.code_ttl_seconds = 5;
    expect(firstMessage(short)).toContain("Minimum 10 secondes");

    const long = baseBlueprint();
    long.rules.code_ttl_seconds = 601;
    expect(firstMessage(long)).toContain("Maximum 600 secondes");

    const none = baseBlueprint();
    none.rules.code_ttl_seconds = null;
    expect(firstMessage(none)).toBeNull();
  });

  it("plafonne les textes d'email et les garde facultatifs", () => {
    const many = baseBlueprint();
    many.emails = Array.from({ length: 7 }, () => ({
      moment: "annonce",
      subject: "Objet",
      body: "Message",
    }));
    expect(firstMessage(many)).toContain("Trop de textes d'email");

    const none = baseBlueprint();
    none.emails = [];
    expect(firstMessage(none)).toBeNull();
  });

  it("refuse un blueprint qui n'est pas un objet", () => {
    for (const raw of ["texte", 42, null, [], undefined]) {
      expect(campaignBlueprintSchema.safeParse(raw).success).toBe(false);
    }
  });
});

describe("entrées des actions", () => {
  const UUID = "11111111-1111-4111-8111-111111111111";

  it("applyCampaignTemplateSchema exige une source, et une seule", () => {
    expect(applyCampaignTemplateSchema.safeParse({ templateKey: "noel" }).success).toBe(true);
    expect(applyCampaignTemplateSchema.safeParse({ templateId: UUID }).success).toBe(true);
    expect(
      applyCampaignTemplateSchema.safeParse({ templateKey: "noel", templateId: UUID }).success,
    ).toBe(false);
    expect(applyCampaignTemplateSchema.safeParse({}).success).toBe(false);
  });

  it("applyCampaignTemplateSchema refuse un id qui n'est pas un uuid", () => {
    expect(applyCampaignTemplateSchema.safeParse({ templateId: "1 OR 1=1" }).success).toBe(false);
  });

  it("applyCampaignTemplateSchema n'accepte aucun champ d'organisation ou de rôle", () => {
    // L'org et le rôle viennent de la SESSION : un champ envoyé par le
    // client ne doit jamais ressortir du parse.
    const parsed = applyCampaignTemplateSchema.safeParse({
      templateKey: "noel",
      organizationId: UUID,
      role: "owner",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data).sort()).toEqual(["templateKey"]);
    }
  });

  it("saveCampaignAsTemplateSchema borne le nom et la description", () => {
    expect(
      saveCampaignAsTemplateSchema.safeParse({ campaignId: UUID, name: "  " }).success,
    ).toBe(false);
    expect(
      saveCampaignAsTemplateSchema.safeParse({ campaignId: UUID, name: "x".repeat(81) }).success,
    ).toBe(false);
    expect(
      saveCampaignAsTemplateSchema.safeParse({
        campaignId: UUID,
        name: "Noël",
        description: "x".repeat(301),
      }).success,
    ).toBe(false);

    const ok = saveCampaignAsTemplateSchema.safeParse({ campaignId: UUID, name: " Noël " });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.name).toBe("Noël");
      expect(ok.data.description).toBe("");
    }
  });

  it("deleteCampaignTemplateSchema exige un uuid", () => {
    expect(deleteCampaignTemplateSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(deleteCampaignTemplateSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});
