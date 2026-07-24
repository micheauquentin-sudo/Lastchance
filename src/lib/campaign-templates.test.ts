// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  blueprintToDraft,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_BLUEPRINT_VERSION,
  getCampaignTemplate,
  listCampaignTemplates,
  type CampaignBlueprint,
} from "./campaign-templates";
import { campaignBlueprintSchema } from "./validations/campaign-templates";
import { gameTypeSchema } from "./validations/prizes";
import { getPreset } from "./wheel-style";

// ────────────────────────────────────────────────────────────
// Place de marché de campagnes — catalogue et blueprintToDraft
//
// Deux familles de garanties :
//   • COHÉRENCE DU CATALOGUE — les 10 modèles sont du CONTENU, donc du
//     code non exécuté par les autres tests : sans ces assertions, un
//     modèle injouable (un seul lot, game_type inventé, gagnant sans
//     stock) partirait en production sans bruit.
//   • PURETÉ DE blueprintToDraft — la recette porte une durée RELATIVE ;
//     c'est ici qu'elle devient des dates absolues, et c'est la seule
//     étape où un brouillon pourrait devenir publiable tout seul.
// ────────────────────────────────────────────────────────────

const NOW = new Date("2026-03-01T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const EXPECTED_KEYS = [
  "saint_valentin",
  "halloween",
  "noel",
  "ouverture_boutique",
  "anniversaire_boutique",
  "match_football",
  "fete_des_meres",
  "happy_hour",
  "soldes",
  "lancement_produit",
];

describe("catalogue Lastchance", () => {
  it("expose exactement les 10 modèles annoncés, sans doublon de clé", () => {
    const keys = CAMPAIGN_TEMPLATES.map((t) => t.key);
    expect(keys).toEqual(EXPECTED_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("listCampaignTemplates conserve l'ordre d'affichage", () => {
    expect(listCampaignTemplates().map((t) => t.key)).toEqual(EXPECTED_KEYS);
  });

  it("getCampaignTemplate retrouve une clé connue et rejette l'inconnue", () => {
    expect(getCampaignTemplate("noel")?.label).toBe("Noël");
    expect(getCampaignTemplate("noel-2099")).toBeUndefined();
    expect(getCampaignTemplate("")).toBeUndefined();
  });

  it.each(CAMPAIGN_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s — le blueprint passe la validation Zod",
    (_key, template) => {
      const parsed = campaignBlueprintSchema.safeParse(template.blueprint);
      expect(parsed.success ? null : parsed.error.issues[0]).toBeNull();
    },
  );

  it.each(CAMPAIGN_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s — jouable : ≥ 2 lots dont au moins un gagnant et un perdant",
    (_key, template) => {
      const prizes = template.blueprint.prizes;
      expect(prizes.length).toBeGreaterThanOrEqual(2);
      expect(prizes.some((p) => !p.is_losing)).toBe(true);
      expect(prizes.some((p) => p.is_losing)).toBe(true);
      expect(prizes.some((p) => p.weight > 0)).toBe(true);
    },
  );

  it.each(CAMPAIGN_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s — stocks FINIS sur les gagnants, illimité seulement sur le perdant (ADR-031)",
    (_key, template) => {
      for (const prize of template.blueprint.prizes) {
        if (prize.is_losing) {
          // Un « pas de chance » ne doit jamais s'épuiser : sinon le jeu
          // perdrait son issue perdante et ne distribuerait que des gains.
          expect(prize.stock).toBeNull();
        } else {
          expect(typeof prize.stock).toBe("number");
          expect(prize.stock).toBeGreaterThan(0);
          expect(Number.isInteger(prize.stock)).toBe(true);
        }
      }
    },
  );

  it.each(CAMPAIGN_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s — game_type dans l'enum réel et préréglage visuel existant",
    (_key, template) => {
      expect(gameTypeSchema.safeParse(template.blueprint.game.game_type).success).toBe(true);
      expect(getPreset(template.blueprint.visual.preset)).toBeDefined();
    },
  );

  it.each(CAMPAIGN_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s — durée bornée 1..365 jours, sans aucune date absolue",
    (_key, template) => {
      const { durationDays } = template.blueprint;
      expect(Number.isInteger(durationDays)).toBe(true);
      expect(durationDays).toBeGreaterThanOrEqual(1);
      expect(durationDays).toBeLessThanOrEqual(365);
      // Un modèle qui porterait une date absolue périmerait : le jsonb
      // sérialisé ne doit contenir ni starts_at ni ends_at.
      const serialized = JSON.stringify(template.blueprint);
      expect(serialized).not.toContain("starts_at");
      expect(serialized).not.toContain("ends_at");
    },
  );

  it.each(CAMPAIGN_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s — textes non vides (vignette, campagne, jeu, accroche, emails)",
    (_key, template) => {
      expect(template.label.trim().length).toBeGreaterThan(0);
      expect(template.description.trim().length).toBeGreaterThan(0);
      expect(template.emoji.trim().length).toBeGreaterThan(0);
      const { texts, emails } = template.blueprint;
      expect(texts.campaignName.trim().length).toBeGreaterThan(0);
      expect(texts.wheelName.trim().length).toBeGreaterThan(0);
      expect(texts.wheelTitle.trim().length).toBeGreaterThan(0);
      // L'accroche devient `style.title`, borné à 80 par wheelStyleSchema.
      expect(texts.wheelTitle.length).toBeLessThanOrEqual(80);
      expect(emails.length).toBeGreaterThan(0);
      for (const email of emails) {
        expect(email.subject.trim().length).toBeGreaterThan(0);
        expect(email.body.trim().length).toBeGreaterThan(0);
      }
      for (const prize of template.blueprint.prizes) {
        expect(prize.label.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it("aucun modèle du catalogue ne transporte de secret de défi", () => {
    // Les jeux skill-gated portent leur bonne réponse dans skill_config :
    // un catalogue public ne doit jamais en contenir.
    for (const template of CAMPAIGN_TEMPLATES) {
      expect(template.blueprint.game.skill_config).toBeNull();
    }
  });
});

describe("blueprintToDraft", () => {
  const blueprint = CAMPAIGN_TEMPLATES[0].blueprint;

  it("calcule la période à partir de la durée RELATIVE", () => {
    const draft = blueprintToDraft(blueprint, NOW);
    expect(draft.campaign.starts_at).toBe(NOW.toISOString());
    expect(Date.parse(draft.campaign.ends_at) - NOW.getTime()).toBe(
      blueprint.durationDays * DAY_MS,
    );
  });

  it("est PURE : deux appels avec le même `now` donnent le même résultat", () => {
    expect(blueprintToDraft(blueprint, NOW)).toEqual(blueprintToDraft(blueprint, NOW));
  });

  it.each(CAMPAIGN_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s — produit un BROUILLON qui ne peut pas se publier tout seul",
    (_key, template) => {
      const draft = blueprintToDraft(template.blueprint, NOW);
      expect(draft.campaign.status).toBe("draft");
      // auto_schedule=true + starts_at<=now ferait basculer le brouillon en
      // `active` au prochain passage de run_campaign_schedule (pg_cron 10 min).
      expect(draft.campaign.auto_schedule).toBe(false);
    },
  );

  it("reporte les règles et la mécanique du modèle", () => {
    const draft = blueprintToDraft(blueprint, NOW);
    expect(draft.campaign.collect_email).toBe(blueprint.rules.collect_email);
    expect(draft.campaign.collect_phone).toBe(blueprint.rules.collect_phone);
    expect(draft.campaign.code_ttl_seconds).toBe(blueprint.rules.code_ttl_seconds);
    expect(draft.wheel.game_type).toBe(blueprint.game.game_type);
    expect(draft.wheel.play_limit).toBe(blueprint.rules.play_limit);
    expect(draft.wheel.name).toBe(blueprint.texts.wheelName);
  });

  it("applique le préréglage visuel puis les surcharges du modèle", () => {
    const draft = blueprintToDraft(blueprint, NOW);
    expect(draft.wheel.style.preset).toBe(blueprint.visual.preset);
    // Surcharge saisonnière du modèle Saint-Valentin.
    expect(draft.wheel.style.buttonFrom).toBe(blueprint.visual.style?.buttonFrom);
    // L'accroche du modèle devient le titre affiché au joueur.
    expect(draft.wheel.style.title).toBe(blueprint.texts.wheelTitle);
  });

  it("numérote les lots dans l'ordre du modèle", () => {
    const draft = blueprintToDraft(blueprint, NOW);
    expect(draft.prizes.map((p) => p.position)).toEqual(
      blueprint.prizes.map((_, index) => index),
    );
    expect(draft.prizes[0].label).toBe(blueprint.prizes[0].label);
  });

  it("transporte les textes d'email SANS rien activer", () => {
    const draft = blueprintToDraft(blueprint, NOW);
    // Les emails ne sont qu'un contenu transporté : le brouillon produit
    // ne porte AUCUN réglage d'automatisation. Le jeu de clés est figé ici
    // pour qu'un futur champ « scénario activé » casse ce test.
    expect(draft.emails).toEqual(blueprint.emails);
    expect(Object.keys(draft.campaign).sort()).toEqual([
      "auto_schedule",
      "budget_cents",
      "code_ttl_seconds",
      "collect_email",
      "collect_phone",
      "ends_at",
      "engagement",
      "name",
      "starts_at",
      "status",
    ]);
  });

  it("tronque une accroche trop longue au lieu de perdre le préréglage", () => {
    const longTitle = {
      ...blueprint,
      texts: { ...blueprint.texts, wheelTitle: "x".repeat(200) },
    };
    const draft = blueprintToDraft(longTitle, NOW);
    expect(draft.wheel.style.title?.length).toBe(80);
    expect(draft.wheel.style.preset).toBe(blueprint.visual.preset);
  });

  it("ne jette pas et retombe sur les défauts si le style est corrompu", () => {
    const corrupted = {
      ...blueprint,
      visual: { preset: "preset-inexistant", style: { bgFrom: "pas-une-couleur" } },
    } as unknown as CampaignBlueprint;
    const draft = blueprintToDraft(corrupted, NOW);
    expect(draft.wheel.style.bgFrom).toMatch(/^#[0-9a-f]{6}$/i);
    expect(draft.campaign.status).toBe("draft");
  });

  it("le blueprint porte la version de forme attendue", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      expect(template.blueprint.version).toBe(CAMPAIGN_BLUEPRINT_VERSION);
    }
  });
});
