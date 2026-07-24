import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Place de marché de campagnes — GARDES D'INNOCUITÉ
//
// Les tests de `src/lib/campaign-templates.test.ts` couvrent la fonction PURE
// `blueprintToDraft`. Ce fichier couvre l'autre bout : l'ACTION, c'est-à-dire
// le seul endroit qui ÉCRIT. Un brouillon correctement calculé mais inséré
// avec `status: 'active'` serait une campagne publiée à l'insu du commerçant —
// c'est ce que ces tests rendent impossible.
//
// Trois invariants, chacun vérifié sur le comportement RÉEL de l'action (pas
// seulement sur les commentaires du module) :
//
//   1. LA CAMPAGNE CRÉÉE EST UN BROUILLON INERTE. `status: 'draft'` ET
//      `auto_schedule: false` arrivent bien dans le payload d'insertion, pour
//      les 10 modèles du catalogue comme pour un modèle privé. Sans le
//      second, `run_campaign_schedule()` (pg_cron, 10 min) ferait passer le
//      brouillon en `active` dès que `starts_at <= now()` — donc tout de
//      suite, puisque `starts_at` vaut `now()`.
//
//   2. AUCUNE AUTOMATISATION, AUCUN ENVOI. Appliquer ou enregistrer un modèle
//      ne touche QUE `campaigns` / `wheels` / `prizes` / `campaign_templates` :
//      jamais `automation_settings`, jamais la file de jobs, jamais Resend.
//      Vérifié deux fois — sur les tables réellement visitées, et par un audit
//      statique des sources du chantier (commentaires retirés).
//
//   3. UN MODÈLE PRIVÉ NE SE LIT QU'AVEC LE CLIENT DE SESSION. Donc sous RLS,
//      avec en plus un filtre `organization_id` explicite venu de la SESSION
//      (jamais du formulaire). Aucun `createAdminClient` sur ce chemin : le
//      service_role court-circuiterait la RLS et rendrait lisible le modèle
//      d'un autre commerçant.
// ────────────────────────────────────────────────────────────

const ORG_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_ORG_ID = "00000000-0000-4000-8000-0000000000a2";
const TEMPLATE_ID = "00000000-0000-4000-8000-0000000000b1";
const CAMPAIGN_ID = "00000000-0000-4000-8000-0000000000c1";

interface DbCall {
  table: string;
  op: "select" | "insert" | "delete";
  payload: unknown;
  /** Filtres `.eq(colonne, valeur)` vus par la requête. */
  filters: Record<string, unknown>;
}

const { state, makeClient } = vi.hoisted(() => {
  const state = {
    /** Toutes les requêtes émises, dans l'ordre. */
    calls: [] as Array<{
      table: string;
      op: "select" | "insert" | "delete";
      payload: unknown;
      filters: Record<string, unknown>;
    }>,
    /** Ligne rendue par le select sur `campaign_templates` (null = introuvable). */
    privateRow: null as { blueprint: unknown } | null,
    /** Ligne rendue par le select sur `campaigns` (source d'un enregistrement). */
    sourceCampaign: null as unknown,
    /** Erreur simulée sur l'insertion d'un modèle privé (unicité du nom…). */
    templateInsertError: null as { message: string; code?: string } | null,
    reset() {
      state.calls = [];
      state.privateRow = null;
      state.sourceCampaign = null;
      state.templateInsertError = null;
    },
  };

  function makeClient() {
    return {
      from(table: string) {
        const call = {
          table,
          op: "select" as "select" | "insert" | "delete",
          payload: undefined as unknown,
          filters: {} as Record<string, unknown>,
        };
        state.calls.push(call);

        const settle = () => {
          if (call.op === "insert") {
            if (table === "campaign_templates") {
              if (state.templateInsertError) {
                return { data: null, error: state.templateInsertError };
              }
              return { data: { id: "template-new" }, error: null };
            }
            if (table === "campaigns") return { data: { id: "campaign-new" }, error: null };
            if (table === "wheels") return { data: { id: "wheel-new" }, error: null };
            // `prizes` : insertion en lot, sans `.select()`.
            return { data: null, error: null };
          }
          if (call.op === "delete") return { data: null, error: null };
          if (table === "campaign_templates") return { data: state.privateRow, error: null };
          if (table === "campaigns") return { data: state.sourceCampaign, error: null };
          return { data: null, error: null };
        };

        const builder = {
          select: () => builder,
          insert: (payload: unknown) => {
            call.op = "insert";
            call.payload = payload;
            return builder;
          },
          delete: () => {
            call.op = "delete";
            return builder;
          },
          eq: (column: string, value: unknown) => {
            call.filters[column] = value;
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve(settle()),
          single: () => Promise.resolve(settle()),
          then: (
            onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(settle()).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }

  return { state, makeClient };
});

const { getUserAndOrgMock } = vi.hoisted(() => ({
  getUserAndOrgMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => Promise.resolve(makeClient()) }));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: getUserAndOrgMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import {
  applyCampaignTemplate,
  deleteCampaignTemplate,
  saveCampaignAsTemplate,
} from "./campaign-templates";
import { CAMPAIGN_TEMPLATES } from "../lib/campaign-templates";

/** Session éditeur de l'organisation active — jamais issue de l'entrée. */
function session(role: "owner" | "editor" | "cashier" = "owner") {
  return {
    user: { id: "user-1" },
    organization: { id: ORG_ID, name: "Ma boutique" },
    role,
  };
}

function callsTo(table: string): DbCall[] {
  return state.calls.filter((call) => call.table === table);
}

function insertPayload(table: string): Record<string, unknown> {
  const call = callsTo(table).find((entry) => entry.op === "insert");
  expect(call, `aucune insertion dans ${table}`).toBeDefined();
  return call!.payload as Record<string, unknown>;
}

afterEach(() => {
  state.reset();
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────
// Invariant 1 — la campagne créée est un BROUILLON qui ne se publie pas seul
// ────────────────────────────────────────────────────────────

describe("applyCampaignTemplate — invariant BROUILLON", () => {
  it.each(CAMPAIGN_TEMPLATES.map((template) => [template.key] as const))(
    "%s — insère status='draft' ET auto_schedule=false",
    async (key) => {
      getUserAndOrgMock.mockResolvedValue(session("owner"));

      const res = await applyCampaignTemplate({ templateKey: key });

      expect(res.ok).toBe(true);
      const payload = insertPayload("campaigns");
      expect(payload.status).toBe("draft");
      // auto_schedule=true + starts_at<=now() ferait basculer le brouillon en
      // `active` au prochain passage de run_campaign_schedule (pg_cron 10 min).
      expect(payload.auto_schedule).toBe(false);
      expect(payload.organization_id).toBe(ORG_ID);
    },
  );

  it("un modèle PRIVÉ trafiqué ne peut pas forcer une campagne active", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    // Blueprint valide, AUGMENTÉ de champs d'activation : le schéma les écarte
    // et `blueprintToDraft` repose `draft` / `false` en dur. Un jsonb trafiqué
    // en base ne publie donc rien.
    state.privateRow = {
      blueprint: {
        ...CAMPAIGN_TEMPLATES[0].blueprint,
        status: "active",
        auto_schedule: true,
      },
    };

    const res = await applyCampaignTemplate({ templateId: TEMPLATE_ID });

    expect(res.ok).toBe(true);
    const payload = insertPayload("campaigns");
    expect(payload.status).toBe("draft");
    expect(payload.auto_schedule).toBe(false);
  });

  it("un blueprint privé ILLISIBLE ne crée aucune campagne", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    state.privateRow = { blueprint: { version: 1, prizes: [] } };

    const res = await applyCampaignTemplate({ templateId: TEMPLATE_ID });

    expect(res.ok).toBe(false);
    expect(callsTo("campaigns")).toHaveLength(0);
  });

  it("une clé de catalogue inconnue ne crée aucune campagne", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));

    const res = await applyCampaignTemplate({ templateKey: "modele-inexistant" });

    expect(res).toEqual({ ok: false, error: "Modèle introuvable" });
    expect(state.calls).toHaveLength(0);
  });

  it("un rôle caisse n'écrit rien du tout", async () => {
    getUserAndOrgMock.mockResolvedValue(session("cashier"));

    const res = await applyCampaignTemplate({ templateKey: "happy_hour" });

    expect(res.ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// Invariant 2 — aucune automatisation activée, aucun job, aucun envoi
// ────────────────────────────────────────────────────────────

/**
 * Source d'un module du chantier, COMMENTAIRES RETIRÉS : l'audit porte sur le
 * CODE, jamais sur la prose (les commentaires citent volontairement les
 * symboles interdits pour expliquer l'invariant).
 */
function codeOf(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CHANTIER_SOURCES = [
  "./campaign-templates.ts",
  "../lib/campaign-templates.ts",
  "../lib/validations/campaign-templates.ts",
  "../components/dashboard/campaign-template-gallery.tsx",
  "../components/dashboard/campaign-template-actions.tsx",
  "../components/dashboard/campaign-template-preview.ts",
  "../components/dashboard/save-campaign-as-template.tsx",
] as const;

describe("place de marché — aucune automatisation, aucun envoi", () => {
  it("appliquer un modèle ne touche QUE campagne / jeu / lots", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));

    await applyCampaignTemplate({ templateKey: "happy_hour" });

    // Le jeu de tables est FIGÉ : toute table nouvelle sur ce chemin (un
    // `automation_settings`, une file de jobs…) casse ce test.
    expect([...new Set(state.calls.map((call) => call.table))].sort()).toEqual([
      "campaigns",
      "prizes",
      "wheels",
    ]);
  });

  it("enregistrer une campagne en modèle ne lit aucun réglage d'automatisation", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    state.sourceCampaign = {
      id: CAMPAIGN_ID,
      name: "Ma campagne",
      starts_at: "2026-08-01T10:00:00.000Z",
      ends_at: "2026-08-08T10:00:00.000Z",
      budget_cents: null,
      engagement: {},
      collect_email: false,
      collect_phone: false,
      code_ttl_seconds: 120,
      wheels: [
        {
          id: "wheel-1",
          name: "Ma roue",
          position: 0,
          style: {},
          game_type: "wheel",
          play_limit: "once",
          skill_config: null,
          prizes: [
            {
              id: "p1",
              label: "Un café offert",
              description: "",
              color: "#22d3ee",
              weight: 30,
              is_losing: false,
              stock: 50,
              cost_cents: 150,
              position: 0,
              is_active: true,
            },
            {
              id: "p2",
              label: "Pas de chance",
              description: "",
              color: "#a1a1aa",
              weight: 70,
              is_losing: true,
              stock: null,
              cost_cents: null,
              position: 1,
              is_active: true,
            },
          ],
        },
      ],
    };

    const res = await saveCampaignAsTemplate({
      campaignId: CAMPAIGN_ID,
      name: "Mon modèle",
    });

    expect(res.ok).toBe(true);
    expect([...new Set(state.calls.map((call) => call.table))].sort()).toEqual([
      "campaign_templates",
      "campaigns",
    ]);
    // Le modèle enregistré ne transporte AUCUN texte d'email : rien qui
    // ressemble à un envoi ne se propage d'une campagne à une autre.
    const blueprint = insertPayload("campaign_templates").blueprint as {
      emails: unknown[];
    };
    expect(blueprint.emails).toEqual([]);
  });

  it.each(CHANTIER_SOURCES)(
    "%s n'importe ni Resend, ni la file de jobs, ni les automatisations",
    (path) => {
      const code = codeOf(path);
      expect(code).not.toMatch(/@\/lib\/resend/);
      expect(code).not.toMatch(/enqueueJob/);
      expect(code).not.toMatch(/automation_settings/);
      expect(code).not.toMatch(/sendCampaign|sendEmail/);
    },
  );

  it("le catalogue ne fournit que des TEXTES d'email, jamais un déclencheur", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      for (const email of template.blueprint.emails) {
        // Un texte suggéré n'a que trois champs : rien qui puisse être
        // interprété comme « activé », « planifié » ou « destinataires ».
        expect(Object.keys(email).sort()).toEqual(["body", "moment", "subject"]);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────
// Invariant 3 — modèle privé lu avec le client de SESSION (RLS) + filtre org
// ────────────────────────────────────────────────────────────

describe("modèle privé — RLS de session et filtre organisation", () => {
  it("le select porte l'id ET l'organisation de la SESSION", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    state.privateRow = { blueprint: CAMPAIGN_TEMPLATES[2].blueprint };

    const res = await applyCampaignTemplate({ templateId: TEMPLATE_ID });

    expect(res.ok).toBe(true);
    const [read] = callsTo("campaign_templates");
    expect(read.op).toBe("select");
    expect(read.filters).toEqual({ id: TEMPLATE_ID, organization_id: ORG_ID });
  });

  it("un modèle hors organisation est INTROUVABLE et ne crée rien", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    // RLS + filtre org : la ligne d'une autre organisation ne remonte pas.
    state.privateRow = null;

    const res = await applyCampaignTemplate({ templateId: TEMPLATE_ID });

    expect(res).toEqual({ ok: false, error: "Modèle introuvable" });
    expect(callsTo("campaigns")).toHaveLength(0);
    // Aucun filtre ne vient de l'entrée : l'organisation est celle de la session.
    expect(callsTo("campaign_templates")[0].filters.organization_id).toBe(ORG_ID);
    expect(callsTo("campaign_templates")[0].filters.organization_id).not.toBe(OTHER_ORG_ID);
  });

  it("la suppression est elle aussi bornée à l'organisation de la session", async () => {
    getUserAndOrgMock.mockResolvedValue(session("editor"));

    const res = await deleteCampaignTemplate({ id: TEMPLATE_ID });

    expect(res.ok).toBe(true);
    const [call] = callsTo("campaign_templates");
    expect(call.op).toBe("delete");
    expect(call.filters).toEqual({ id: TEMPLATE_ID, organization_id: ORG_ID });
  });

  it("aucune source du chantier n'emploie le service_role", () => {
    for (const path of CHANTIER_SOURCES) {
      const code = codeOf(path);
      expect(code, path).not.toMatch(/createAdminClient/);
      expect(code, path).not.toMatch(/SERVICE_ROLE/);
    }
    // Le chemin d'application passe bien par le client de SESSION.
    expect(codeOf("./campaign-templates.ts")).toMatch(
      /import \{ createClient \} from "@\/lib\/supabase\/server"/,
    );
  });

  it("un nom de modèle déjà pris renvoie le message d'unicité", async () => {
    getUserAndOrgMock.mockResolvedValue(session("owner"));
    state.sourceCampaign = {
      id: CAMPAIGN_ID,
      name: "Ma campagne",
      starts_at: null,
      ends_at: null,
      budget_cents: null,
      engagement: {},
      collect_email: false,
      collect_phone: false,
      code_ttl_seconds: null,
      wheels: [
        {
          id: "wheel-1",
          name: "Ma roue",
          position: 0,
          style: {},
          game_type: "wheel",
          play_limit: "once",
          skill_config: null,
          prizes: [
            {
              id: "p1",
              label: "Un café offert",
              description: "",
              color: "#22d3ee",
              weight: 30,
              is_losing: false,
              stock: 50,
              cost_cents: null,
              position: 0,
              is_active: true,
            },
            {
              id: "p2",
              label: "Pas de chance",
              description: "",
              color: "#a1a1aa",
              weight: 70,
              is_losing: true,
              stock: null,
              cost_cents: null,
              position: 1,
              is_active: true,
            },
          ],
        },
      ],
    };
    state.templateInsertError = { message: "duplicate key", code: "23505" };

    const res = await saveCampaignAsTemplate({
      campaignId: CAMPAIGN_ID,
      name: "Mon modèle",
    });

    expect(res).toEqual({ ok: false, error: "Un modèle porte déjà ce nom." });
  });
});
