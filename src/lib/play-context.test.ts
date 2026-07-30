// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// loadPlayContext — chemin de LECTURE PUBLIC de la roue (/play/[slug]).
//
// POURQUOI CE FICHIER : c'est le seul endroit du produit où un visiteur
// ANONYME fait lire la base par le client `service_role`, qui contourne la
// RLS. Tout ce qui protège le joueur d'un autre commerçant est donc ici, en
// TypeScript, et nulle part ailleurs — aucune policy ne rattrape une erreur
// de ce fichier. Il n'avait aucun test.
//
// La base est simulée : un seul aller-retour PostgREST, dont on capture la
// chaîne de colonnes demandée et les filtres. Les fixtures ne sont pas
// typées contre `@/types/database` À DESSEIN — la ligne réelle est castée
// (double cast vers `PlayContextRow`) par le chargeur, donc un fixture typé
// donnerait une fausse impression de garantie sur une donnée qui arrive du
// réseau sans forme garantie.
// ────────────────────────────────────────────────────────────

const { h, createAdminClientMock } = vi.hoisted(() => {
  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
  };

  const h = {
    /** Ligne unique rendue par la requête imbriquée (qr_codes + embeds). */
    row: null as unknown,
    /** Chaînes de colonnes demandées, dans l'ordre d'appel. */
    selects: [] as string[],
    /** Filtres appliqués — prouve le NOMBRE d'allers-retours, pas seulement leur résultat. */
    filters: [] as Array<{ table: string; column: string; value: unknown }>,
    reset() {
      h.row = null;
      h.selects = [];
      h.filters = [];
    },
  };

  function createAdminClientMock() {
    return {
      from(table: string) {
        return {
          select(columns: string) {
            h.selects.push(columns);
            const builder: Builder = {
              eq(column, value) {
                h.filters.push({ table, column, value });
                return builder;
              },
              maybeSingle: async () => ({ data: h.row, error: null }),
            };
            return builder;
          },
        };
      },
    };
  }

  return { h, createAdminClientMock };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import { loadPlayContext } from "./play-context";

// ── Messages exacts rendus au joueur ────────────────────────────────────
// Ils sont recopiés ici plutôt qu'importés : ce sont des littéraux du
// chargeur, et c'est précisément leur STABILITÉ qu'on verrouille (les pages
// d'erreur du parcours public en dépendent).
const UNKNOWN = "Ce lien de jeu n'existe pas.";
const GENERIC = "Jeu indisponible.";
const SUSPENDED = "Ce jeu est momentanément désactivé.";
const NOT_ACTIVE = "Cette campagne n'est pas active.";
const NOT_STARTED = "Cette campagne n'a pas encore commencé.";
const ENDED = "Cette campagne est terminée.";

const QR_ID = "qr-1";
const CAMPAIGN_ID = "campaign-1";
const WHEEL_ID = "wheel-1";
const ORG_ID = "org-marcel";
const OTHER_ORG_ID = "org-voisin";

const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();
const oneHourAgo = () => new Date(Date.now() - 3_600_000).toISOString();

type Over = Record<string, unknown>;

function org(over: Over = {}) {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    logo_url: null,
    subscription_status: "active",
    trial_ends_at: oneHourAgo(),
    past_due_since: null,
    comp_access: false,
    comp_access_until: null,
    timezone: "Europe/Paris",
    ...over,
  };
}

function prize(over: Over = {}) {
  return {
    id: "prize-1",
    organization_id: ORG_ID,
    wheel_id: WHEEL_ID,
    label: "Café offert",
    description: "",
    color: "#e11d48",
    weight: 10,
    is_losing: false,
    stock: null,
    low_stock_threshold: null,
    low_stock_notified_at: null,
    cost_cents: 80,
    value_cents: 150,
    position: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function wheel(over: Over = {}) {
  return {
    id: WHEEL_ID,
    organization_id: ORG_ID,
    campaign_id: CAMPAIGN_ID,
    name: "Roue du midi",
    theme: {},
    play_limit: "once_per_day",
    game_type: "wheel",
    skill_config: null,
    position: 1,
    schedule_start_hour: null,
    schedule_end_hour: null,
    schedule_days: null,
    style: { bgFrom: "#111827" },
    created_at: "2026-01-01T00:00:00.000Z",
    prizes: [prize()],
    ...over,
  };
}

function campaign(over: Over = {}) {
  return {
    id: CAMPAIGN_ID,
    organization_id: ORG_ID,
    name: "Printemps",
    status: "active",
    starts_at: null,
    ends_at: null,
    auto_schedule: false,
    budget_cents: null,
    budget_spent_cents: 0,
    paused_reason: null,
    engagement: {},
    collect_email: false,
    collect_phone: false,
    code_ttl_seconds: null,
    created_at: "2026-01-01T00:00:00.000Z",
    wheels: [wheel()],
    ...over,
  };
}

function row(over: Over = {}) {
  return {
    id: QR_ID,
    campaign_id: CAMPAIGN_ID,
    organization_id: ORG_ID,
    organizations: org(),
    campaigns: campaign(),
    ...over,
  };
}

/**
 * Créneau qui ne peut JAMAIS couvrir l'instant courant (`h >= 5 && h < 5`).
 * Évite d'avoir à figer l'horloge pour prouver le comportement hors créneau —
 * une horloge simulée traverserait `Intl.DateTimeFormat`, ce qui rendrait le
 * test dépendant du fuseau de la machine plutôt que du code testé.
 */
const NEVER_OPEN = { schedule_start_hour: 5, schedule_end_hour: 5 };
/** Créneau toujours couvert, mais qui compte comme « planifié » (priorité). */
const ALWAYS_OPEN = { schedule_start_hour: 0, schedule_end_hour: 24 };

beforeEach(() => {
  h.reset();
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1. Cloisonnement multi-tenant
// ────────────────────────────────────────────────────────────
describe("loadPlayContext — cloisonnement multi-tenant", () => {
  it("un slug inconnu ne rend rien, et rien du tenant", async () => {
    // Rouge si : le chargeur inventait un contexte ouvert sur une ligne
    // absente, ou emportait un style (donc une identité visuelle) alors
    // qu'aucune roue n'a été résolue.
    h.row = null;

    const ctx = await loadPlayContext("slug-inconnu");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("un slug inconnu ne doit jamais ouvrir le jeu");
    expect(ctx.error).toBe(UNKNOWN);
    expect("wheelStyle" in ctx).toBe(false);
  });

  // Chaque cas casse UN maillon de la chaîne QR → campagne → roue → lots.
  // La service_role ignorant la RLS, ces vérifications TypeScript sont la
  // SEULE chose qui empêche de servir la roue d'un commerçant depuis le QR
  // d'un autre. Rouge si un conjoint d'`isConsistentPlayResourceChain`
  // disparaissait, ou si la garde passait après les gardes de statut.
  const brokenChains: Array<[string, Over]> = [
    [
      "l'organisation embarquée n'est pas celle du QR",
      { organizations: org({ id: OTHER_ORG_ID }) },
    ],
    [
      "la campagne appartient à un autre tenant",
      { campaigns: campaign({ organization_id: OTHER_ORG_ID }) },
    ],
    ["le QR pointe une autre campagne", { campaign_id: "campaign-autre" }],
    [
      "la roue appartient à un autre tenant",
      { campaigns: campaign({ wheels: [wheel({ organization_id: OTHER_ORG_ID })] }) },
    ],
    [
      "la roue appartient à une autre campagne",
      { campaigns: campaign({ wheels: [wheel({ campaign_id: "campaign-autre" })] }) },
    ],
    [
      "un lot appartient à un autre tenant",
      {
        campaigns: campaign({
          wheels: [wheel({ prizes: [prize({ organization_id: OTHER_ORG_ID })] })],
        }),
      },
    ],
    [
      "un lot appartient à une autre roue",
      {
        campaigns: campaign({
          wheels: [wheel({ prizes: [prize({ wheel_id: "wheel-autre" })] })],
        }),
      },
    ],
  ];

  it.each(brokenChains)("refuse quand %s", async (_label, over) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.row = row(over);

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("une chaîne inter-tenant ne doit jamais ouvrir le jeu");
    expect(ctx.error).toBe(GENERIC);
    // Le style vient de la roue : le renvoyer ici afficherait l'ambiance d'un
    // commerçant sur le lien d'un autre — le refus ne doit RIEN emporter.
    expect("wheelStyle" in ctx).toBe(false);
    // Une incohérence inter-tenant est un incident : sans trace, personne ne
    // saurait jamais qu'elle a eu lieu.
    expect(spy).toHaveBeenCalled();
  });

  it("un lot INACTIF d'un autre tenant referme quand même le jeu", async () => {
    // La garde de cohérence précède le filtre `is_active` : une ligne
    // résiduelle mal rattachée ferme le jeu au lieu d'être ignorée.
    // Fail-closed assumé. Rouge si le filtre passait avant la garde.
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.row = row({
      campaigns: campaign({
        wheels: [
          wheel({
            prizes: [prize(), prize({ id: "p-orphelin", is_active: false, organization_id: OTHER_ORG_ID })],
          }),
        ],
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("chaîne incohérente");
    expect(ctx.error).toBe(GENERIC);
  });

  it("une campagne sans roue est indistinguable d'une chaîne incohérente", async () => {
    // Même message, même absence de style : un visiteur ne peut pas
    // distinguer « mal configuré » de « pas pour vous ».
    // Rouge si l'un des deux chemins gagnait un message propre.
    h.row = row({ campaigns: campaign({ wheels: [] }) });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("aucune roue : le jeu ne peut pas s'ouvrir");
    expect(ctx.error).toBe(GENERIC);
    expect("wheelStyle" in ctx).toBe(false);
  });

  it("aucune roue de repli quand tous les créneaux sont fermés", async () => {
    // Conséquence produit : une roue « happy hour » ne doit pas être jouable
    // à 3 h du matin. Rouge si `selectActiveWheel` retombait sur une roue
    // planifiée hors créneau faute de roue toujours active.
    h.row = row({
      campaigns: campaign({
        wheels: [wheel({ ...NEVER_OPEN }), wheel({ id: "wheel-2", position: 2, ...NEVER_OPEN })],
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("hors créneau : le jeu doit être fermé");
    expect(ctx.error).toBe(GENERIC);
  });
});

// ────────────────────────────────────────────────────────────
// 2. États qui ferment le jeu
// ────────────────────────────────────────────────────────────
describe("loadPlayContext — états qui ferment le jeu", () => {
  it("essai expiré : le jeu est coupé mais garde l'ambiance du commerçant", async () => {
    // Le style est délibérément conservé sur les fermetures « connues » :
    // le joueur d'une kermesse ne doit pas retomber sur le thème nuit.
    // Rouge si `wheelStyle` disparaissait, ou si un essai expiré laissait
    // jouer (le commerçant jouerait alors gratuitement sans limite).
    h.row = row({
      organizations: org({
        subscription_status: "trialing",
        trial_ends_at: oneHourAgo(),
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("essai expiré : le jeu doit être coupé");
    expect(ctx.error).toBe(SUSPENDED);
    expect(ctx.wheelStyle).toEqual({ bgFrom: "#111827" });
  });

  it.each(["paused", "draft", "archived"])(
    "une campagne %s est fermée sans révéler laquelle",
    async (status) => {
      // Rouge si l'un des trois statuts non actifs devenait jouable, ou si
      // le message se mettait à nommer le statut (oracle inutile au joueur).
      h.row = row({ campaigns: campaign({ status }) });

      const ctx = await loadPlayContext("slug-1");

      expect(ctx.ok).toBe(false);
      if (ctx.ok) throw new Error(`statut ${status} : le jeu doit être fermé`);
      expect(ctx.error).toBe(NOT_ACTIVE);
    },
  );

  it("une campagne pas encore commencée est fermée", async () => {
    // Rouge si la borne de début n'était plus appliquée : les lots d'une
    // opération programmée partiraient avant son lancement.
    h.row = row({ campaigns: campaign({ starts_at: inOneHour() }) });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("campagne future : le jeu doit être fermé");
    expect(ctx.error).toBe(NOT_STARTED);
  });

  it("une campagne terminée est fermée", async () => {
    // Rouge si la borne de fin n'était plus appliquée : un QR imprimé sur un
    // flyer resterait jouable indéfiniment après l'opération.
    h.row = row({ campaigns: campaign({ ends_at: oneHourAgo() }) });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("campagne passée : le jeu doit être fermé");
    expect(ctx.error).toBe(ENDED);
  });

  it("l'accès prime sur le statut de campagne (ordre des gardes)", async () => {
    // Deux motifs à la fois : le message rendu doit rester celui de l'accès.
    // Rouge si l'ordre des gardes s'inversait — le commerçant impayé lirait
    // « campagne en pause » et croirait à un réglage de sa part.
    h.row = row({
      organizations: org({ subscription_status: "canceled" }),
      campaigns: campaign({ status: "paused" }),
    });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("accès coupé : le jeu doit être fermé");
    expect(ctx.error).toBe(SUSPENDED);
  });

  it("un impayé récent laisse le jeu ouvert (délai de grâce)", async () => {
    // Contre-exemple délibéré : sans lui, les tests ci-dessus passeraient
    // aussi avec un chargeur qui refuse TOUT. Conséquence produit : une carte
    // qui échoue le vendredi ne doit pas éteindre le jeu du week-end.
    // Rouge si le délai de grâce de 14 jours disparaissait.
    h.row = row({
      organizations: org({
        subscription_status: "past_due",
        past_due_since: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    expect(ctx.ok).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// 3. Ce qui franchit la frontière
// ────────────────────────────────────────────────────────────
describe("loadPlayContext — ce qui franchit la frontière", () => {
  it("ne demande que les colonnes publiques de l'organisation", async () => {
    // `organizations` est la seule table dont les colonnes sont énumérées :
    // un `organizations(*)` ramènerait `webhook_secret` et
    // `stripe_customer_id` dans un objet rendu par le chemin ANONYME, et le
    // typage ne le verrait pas (la ligne est castée depuis `unknown`).
    // Rouge si quelqu'un remplaçait la liste par une étoile « pour simplifier ».
    h.row = row();

    await loadPlayContext("slug-1");

    const select = h.selects[0];
    expect(select).toContain(
      "organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, comp_access, comp_access_until, timezone)",
    );
    expect(select).not.toContain("organizations(*");
    expect(select).not.toMatch(/webhook_secret|stripe_customer_id|webhook_url/);
  });

  it("un seul aller-retour, filtré sur le seul slug", async () => {
    // /play est le chemin le plus chaud du produit (un scan = un rendu) :
    // le chargeur documente qu'il tient en UNE requête imbriquée.
    // Rouge si quelqu'un rajoutait une lecture séquentielle (roue, lots,
    // organisation), ce qui doublerait la latence DB par vue.
    h.row = row();

    await loadPlayContext("slug-1");

    expect(h.selects).toHaveLength(1);
    expect(h.filters).toEqual([
      { table: "qr_codes", column: "slug", value: "slug-1" },
    ]);
  });

  it("détache les embeds : ni `wheels` sur la campagne, ni `prizes` sur la roue", async () => {
    // Sans ce détachement, l'objet roue rendu porterait encore TOUS les lots,
    // y compris les DÉSACTIVÉS et leurs poids/coûts — que le filtre censé les
    // retirer n'aurait plus aucun effet à empêcher de sérialiser.
    // Rouge si l'un des deux `rest` sautait.
    h.row = row({
      campaigns: campaign({
        wheels: [
          wheel({
            prizes: [prize(), prize({ id: "p-off", label: "Lot retiré", is_active: false })],
          }),
        ],
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    if (!ctx.ok) throw new Error(`contexte fermé : ${ctx.error}`);
    expect("wheels" in ctx.campaign).toBe(false);
    expect("prizes" in ctx.wheel).toBe(false);
    expect(
      JSON.stringify({ campaign: ctx.campaign, wheel: ctx.wheel, prizes: ctx.prizes }),
    ).not.toContain("Lot retiré");
  });
});

// ────────────────────────────────────────────────────────────
// 4. Cas nominal
// ────────────────────────────────────────────────────────────
describe("loadPlayContext — cas nominal", () => {
  it("rend les lots actifs, triés par position puis ancienneté", async () => {
    // Le lot désactivé porte la position 0 : s'il repassait, il serait EN
    // TÊTE de roue — l'échec est donc visible, pas seulement numérique.
    // Rouge si le filtre `is_active` ou le tri secondaire par `created_at`
    // (départage de deux lots à la même position) disparaissait.
    h.row = row({
      campaigns: campaign({
        wheels: [
          wheel({
            prizes: [
              prize({ id: "p-a", position: 2, created_at: "2026-01-01T00:00:00.000Z" }),
              prize({ id: "p-b", position: 1, created_at: "2026-01-03T00:00:00.000Z" }),
              prize({ id: "p-c", position: 1, created_at: "2026-01-02T00:00:00.000Z" }),
              prize({ id: "p-off", position: 0, is_active: false }),
            ],
          }),
        ],
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    if (!ctx.ok) throw new Error(`contexte fermé : ${ctx.error}`);
    expect(ctx.prizes.map((p) => p.id)).toEqual(["p-c", "p-b", "p-a"]);
  });

  it("rend la chaîne complète attendue par la page", async () => {
    // Rouge si le QR rendu cessait de porter son organisation (le spin
    // serveur re-résout ce contexte et s'appuie dessus pour scoper l'écriture).
    h.row = row();

    const ctx = await loadPlayContext("slug-1");

    if (!ctx.ok) throw new Error(`contexte fermé : ${ctx.error}`);
    expect(ctx.qr).toEqual({
      id: QR_ID,
      campaign_id: CAMPAIGN_ID,
      organization_id: ORG_ID,
    });
    expect(ctx.campaign.id).toBe(CAMPAIGN_ID);
    expect(ctx.wheel.id).toBe(WHEEL_ID);
    expect(ctx.organization.id).toBe(ORG_ID);
  });

  it("la roue planifiée qui couvre l'instant prime sur la roue toujours active", async () => {
    // Priorité documentée : une roue « toujours active » sert de repli, jamais
    // de concurrente. Ici elle est en position 1 (donc gagnante à l'ordre
    // seul) et doit pourtant perdre. Rouge si le tri par priorité de créneau
    // tombait au profit du seul tri par position — le commerçant verrait sa
    // roue d'happy hour ignorée pendant l'happy hour.
    h.row = row({
      campaigns: campaign({
        wheels: [
          wheel({ id: "wheel-toujours", position: 1 }),
          wheel({
            id: "wheel-creneau",
            position: 9,
            ...ALWAYS_OPEN,
            prizes: [prize({ wheel_id: "wheel-creneau" })],
          }),
        ],
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    if (!ctx.ok) throw new Error(`contexte fermé : ${ctx.error}`);
    expect(ctx.wheel.id).toBe("wheel-creneau");
  });

  it("la roue toujours active sert de repli quand aucun créneau ne couvre l'instant", async () => {
    // Contre-exemple du test précédent : sans lui, un chargeur qui servirait
    // TOUJOURS la roue planifiée passerait les deux.
    h.row = row({
      campaigns: campaign({
        wheels: [
          wheel({ id: "wheel-toujours", position: 9, prizes: [prize({ wheel_id: "wheel-toujours" })] }),
          wheel({ id: "wheel-ferme", position: 1, ...NEVER_OPEN }),
        ],
      }),
    });

    const ctx = await loadPlayContext("slug-1");

    if (!ctx.ok) throw new Error(`contexte fermé : ${ctx.error}`);
    expect(ctx.wheel.id).toBe("wheel-toujours");
  });
});
