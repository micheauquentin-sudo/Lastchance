// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// referral-context — chemin de LECTURE PUBLIC du parrainage ludique
// (résolution du slug d'affiche → campagne) et contexte des actions publiques.
//
// POURQUOI CE FICHIER : `referral_public_state` ne rend les versements — donc
// les CODES de retrait PARRAIN-… et les JETONS de tour offert — que du parrain
// dont la clé lui est passée. Cette non-fuite est verrouillée côté SQL
// (referral.test.sql) SOUS UNE HYPOTHÈSE que le SQL ne peut pas vérifier :
// que l'appelant lui passe l'identité du visiteur COURANT, et rien d'autre.
// Cette hypothèse vit entièrement ici, et rien ne la tenait. Un
// `p_sponsor_key` qui viendrait d'un paramètre d'URL rouvrirait, en une ligne
// de TypeScript, exactement la fuite que la migration a fermée.
//
// Deuxième promesse propre à ce chargeur : `p_sponsor_key` n'a PAS de défaut
// SQL (contrairement au `p_player_token_hash` du quiz). Un visiteur sans
// cookie doit donc recevoir une CHAÎNE VIDE — rejetée par le regex 64-hex de
// la RPC — et jamais `undefined`, que supabase-js retirerait du corps JSON,
// faisant échouer l'appel de fonction lui-même.
//
// CE FICHIER PORTE LE CHEMIN VIVANT. `loadReferralPublicContext` est resté sans
// appelant pendant tout le module, pendant que `getReferralState`
// (src/actions/referral.ts) refaisait la même chaîne à la main : deux copies
// d'une même règle, dont la MORTE était la mieux testée — exactement la
// configuration où l'on relit la mauvaise en croyant relire la bonne.
// `getReferralState` n'en est plus qu'un appelant : ce qui est prouvé ici est
// ce qui est servi au joueur.
//
// Le faux client respecte la PROJECTION : sans cela, les assertions « telle
// colonne ne sort pas » ne pourraient jamais rougir.
// ────────────────────────────────────────────────────────────

const { db, cookieJar, createAdminClientMock } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  // Type NOMMÉ, sans quoi `builder` se référencerait dans son propre
  // initialiseur et retomberait en `any` implicite.
  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  };
  type QueryEntry = {
    table: string;
    columns: string;
    filters: Record<string, unknown>;
  };

  /** Découpe une liste de colonnes PostgREST aux virgules de PREMIER niveau. */
  function splitTopLevel(columns: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of columns) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  /** Applique la projection demandée, relations embarquées comprises. */
  function project(row: Row, columns: string): Row {
    const out: Row = {};
    for (const part of splitTopLevel(columns)) {
      if (part === "*") {
        Object.assign(out, row);
        continue;
      }
      const embed = /^([A-Za-z_]+)(?:![A-Za-z_]+)?\((.*)\)$/.exec(part);
      if (!embed) {
        out[part] = row[part] ?? null;
        continue;
      }
      const [, name, inner] = embed;
      const value = row[name];
      if (Array.isArray(value)) {
        out[name] = value.map((entry) => project(entry as Row, inner));
      } else if (value && typeof value === "object") {
        out[name] = project(value as Row, inner);
      } else {
        out[name] = value ?? null;
      }
    }
    return out;
  }

  // Types de retour ANNOTÉS : sans cela l'inférence de `tablesQueried`
  // dépendrait du type de `db`, qui dépend d'elle.
  const db = {
    tables: {} as Record<string, Row[]>,
    queries: [] as QueryEntry[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Réponse simulée de `referral_public_state`. */
    rpcData: null as unknown,
    rpcError: null as { message: string } | null,
    reset(): void {
      db.tables = { qr_codes: [], referral_programs: [], campaigns: [] };
      db.queries = [];
      db.rpcCalls = [];
      db.rpcData = null;
      db.rpcError = null;
    },
    tablesQueried(): string[] {
      return db.queries.map((q) => q.table);
    },
    queriesOn(table: string): QueryEntry[] {
      return db.queries.filter((q) => q.table === table);
    },
  };
  db.reset();

  const cookieJar = { jar: {} as Record<string, string> };

  function createAdminClientMock() {
    return {
      from(table: string) {
        return {
          select(columns: string) {
            // L'entrée est enregistrée par RÉFÉRENCE puis complétée par les
            // `eq` successifs : complète au moment des assertions.
            const entry: QueryEntry = { table, columns, filters: {} };
            db.queries.push(entry);
            const builder: Builder = {
              eq(column, value) {
                entry.filters[column] = value;
                return builder;
              },
              maybeSingle: async () => {
                const row = (db.tables[table] ?? []).find((r) =>
                  Object.entries(entry.filters).every(([k, v]) => r[k] === v),
                );
                return { data: row ? project(row, columns) : null, error: null };
              },
            };
            return builder;
          },
        };
      },
      rpc(name: string, args: Record<string, unknown>) {
        db.rpcCalls.push({ name, args });
        return Promise.resolve({ data: db.rpcData, error: db.rpcError });
      },
    };
  }

  return { db, cookieJar, createAdminClientMock };
});

// La factory `vi.mock` est hissée au-dessus des imports : elle ne peut lire
// que des valeurs issues de `vi.hoisted`.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name in cookieJar.jar ? { value: cookieJar.jar[name] } : undefined,
  }),
}));

// Mocké pour pouvoir asserter qu'un incident est SIGNALÉ (Sentry), pas seulement
// avalé : un parrainage qui se referme sans bruit se lit comme une jauge à zéro.
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

import { reportError } from "@/lib/monitoring";
import {
  hasReferralAccess,
  loadReferralActionContext,
  loadReferralPublicContext,
} from "./referral-context";

const CAMPAIGN_ID = "5b8a7d31-0000-4000-8000-000000000001";
const SLUG = "chez-marcel-ete";
const ORG_ID = "org-marcel";
const OTHER_ORG_ID = "org-voisin";

/**
 * Cookie device : le nom et le sel sont RECOPIÉS ici plutôt qu'importés. Le
 * jour où l'un des deux change, la clé de tous les parrains existants change
 * avec lui — leurs jauges et leurs coffres repartent de zéro. Ce test doit
 * rougir ce jour-là, pas suivre silencieusement.
 */
const DEVICE_COOKIE = "lc-anonymous-player";
const DEVICE_UUID = "b1e9f4d2-1c3a-4f7b-9d2e-6a5c8f0b1234";
const SALT = "test-salt"; // vitest.config.ts : PLAYER_KEY_SALT

/** Jetons d'un AUTRE parrain : ce que la RPC ne doit jamais rendre ici. */
const CODE_DU_VOISIN = "PARRAIN-VOISIN99";
const JETON_DU_VOISIN = "jeton-de-tour-du-voisin";
/** Secret d'organisation qu'un `organizations(*)` ferait sortir. */
const SECRET_ORG = "whsec-webhook-du-commerce";

/**
 * Empreinte device recalculée ici, jamais importée de `@/lib/anonymous-player` :
 * un test qui réutilise la fonction hachée ne prouve que sa cohérence avec
 * elle-même.
 */
const deviceKey = (uuid: string) =>
  createHash("sha256").update(`${SALT}:anonymous-device:${uuid}`).digest("hex");

type Over = Record<string, unknown>;

function org(over: Over = {}) {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    logo_url: null,
    subscription_status: "active",
    trial_ends_at: "2026-01-01T00:00:00.000Z",
    past_due_since: null,
    addon_referral: true,
    comp_access: false,
    comp_access_until: null,
    timezone: "Europe/Paris",
    // Colonnes JAMAIS demandées : présentes dans la ligne brute pour que la
    // projection ait quelque chose à retenir.
    webhook_secret: SECRET_ORG,
    stripe_customer_id: "cus_marcel",
    ...over,
  };
}

function programRow(over: Over = {}) {
  return {
    campaign_id: CAMPAIGN_ID,
    organization_id: ORG_ID,
    enabled: true,
    // Colonnes internes du programme : plafonds et compteurs n'ont rien à
    // faire dans un contexte public.
    monthly_cap: 50,
    chest_threshold: 5,
    organizations: org(),
    ...over,
  };
}

function campaignRow(over: Over = {}) {
  return {
    id: CAMPAIGN_ID,
    organization_id: ORG_ID,
    status: "active",
    starts_at: null,
    ends_at: null,
    wheels: [{ id: "wheel-1" }],
    ...over,
  };
}

/**
 * Réponse de `referral_public_state` : les versements DU PARRAIN COURANT, plus
 * un champ hors contrat portant ceux d'un autre device. La RPC réelle ne rend
 * jamais ce second bloc ; il est là pour prouver que le mapper est une liste
 * blanche et non un passe-plat.
 */
function publicStateRaw(over: Over = {}) {
  return {
    state: "ok",
    campaign_id: CAMPAIGN_ID,
    gauge: 2,
    validated_count: 2,
    chest_threshold: 5,
    chest_rewarded: false,
    referral_code: "PR-MARCO42",
    program: {
      sponsor_reward_kind: "lot",
      sponsor_reward_label: "Un café offert",
      filleul_reward_kind: "spin",
      filleul_reward_label: "Un tour de roue",
      chest_reward_kind: "lot",
      chest_reward_label: "Le magnum",
    },
    rewards: [
      {
        beneficiary: "sponsor",
        kind: "lot",
        code: "PARRAIN-ABCD2345",
        spin_grant_token: null,
        grant_consumed_at: null,
        resulting_spin_id: null,
        redeemed_at: null,
        out_of_stock: false,
        created_at: "2026-07-20T10:00:00.000Z",
      },
      {
        beneficiary: "chest",
        kind: "spin",
        code: null,
        spin_grant_token: "jeton-de-tour-a-moi",
        grant_consumed_at: null,
        resulting_spin_id: null,
        redeemed_at: null,
        out_of_stock: false,
        created_at: "2026-07-25T10:00:00.000Z",
      },
    ],
    // Champ HORS CONTRAT : le mapper est une liste blanche, pas un passe-plat.
    other_sponsors: [
      { sponsor_key: "0".repeat(64), code: CODE_DU_VOISIN, grant: JETON_DU_VOISIN },
    ],
    ...over,
  };
}

beforeEach(() => {
  db.reset();
  db.tables.qr_codes = [{ slug: SLUG, campaign_id: CAMPAIGN_ID }];
  db.tables.referral_programs = [programRow()];
  db.tables.campaigns = [campaignRow()];
  db.rpcData = publicStateRaw();
  cookieJar.jar = {};
  vi.restoreAllMocks();
  // `restoreAllMocks` ne touche pas les `vi.fn()` d'un module mocké : sans ce
  // nettoyage, un test verrait les signalements du test précédent.
  vi.mocked(reportError).mockClear();
});

// ────────────────────────────────────────────────────────────
// 1. Résolution du slug d'affiche → campagne
// ────────────────────────────────────────────────────────────
describe("loadReferralPublicContext — résolution de la campagne", () => {
  it("résout par le slug du QR, et ne lit que la colonne campaign_id", async () => {
    // Le parrainage est PAR CAMPAGNE : c'est `qr_codes` qui fait le pont, comme
    // pour `/play/[slug]`. Rouge si le chargeur cherchait la campagne par son
    // slug (colonne qui n'existe pas) ou ramenait la ligne QR entière.
    const ctx = await loadReferralPublicContext(SLUG);

    expect(db.queries[0]).toMatchObject({
      table: "qr_codes",
      columns: "campaign_id",
      filters: { slug: SLUG },
    });
    expect(ctx.ok).toBe(true);
  });

  it("deux affiches différentes mènent au MÊME parrainage", async () => {
    // Conséquence produit : le commerçant peut imprimer un flyer et un
    // chevalet de table ; la jauge du parrain est celle de la CAMPAGNE, pas
    // celle du bout de papier. Rouge si le parrainage était indexé sur le QR.
    db.tables.qr_codes = [
      { slug: SLUG, campaign_id: CAMPAIGN_ID },
      { slug: "chez-marcel-flyer", campaign_id: CAMPAIGN_ID },
    ];

    const parAffiche = await loadReferralPublicContext(SLUG);
    const parFlyer = await loadReferralPublicContext("chez-marcel-flyer");

    if (!parAffiche.ok || !parFlyer.ok) throw new Error("les deux QR doivent ouvrir");
    expect(parAffiche.campaignId).toBe(parFlyer.campaignId);
  });

  it("slug inconnu : refus immédiat, plus aucune lecture ni RPC", async () => {
    // Rouge si le chargeur poursuivait avec un identifiant vide : il
    // interrogerait `referral_programs` et `campaigns` pour n'importe quelle
    // chaîne trouvée dans une URL — deux lectures offertes à tout scanner.
    db.tables.qr_codes = [];

    const ctx = await loadReferralPublicContext("slug-invente");

    expect(ctx).toEqual({ ok: false });
    expect(db.tablesQueried()).toEqual(["qr_codes"]);
    expect(db.rpcCalls).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// 2. Gardes — un seul refus, aucune RPC, aucune amplification
// ────────────────────────────────────────────────────────────
describe("loadReferralPublicContext — refus indistinguables", () => {
  const HIER = new Date(Date.now() - 86_400_000).toISOString();
  const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();

  const refusals: Array<[string, () => void]> = [
    ["programme de parrainage absent", () => { db.tables.referral_programs = []; }],
    [
      "organisation embarquée absente",
      () => { db.tables.referral_programs = [programRow({ organizations: null })]; },
    ],
    [
      "organisation embarquée d'un AUTRE tenant",
      () => {
        db.tables.referral_programs = [
          programRow({ organizations: org({ id: OTHER_ORG_ID }) }),
        ];
      },
    ],
    [
      "module parrainage coupé",
      () => {
        db.tables.referral_programs = [
          programRow({ organizations: org({ addon_referral: false }) }),
        ];
      },
    ],
    [
      "essai expiré",
      () => {
        db.tables.referral_programs = [
          programRow({
            organizations: org({
              subscription_status: "trialing",
              trial_ends_at: "2020-01-01T00:00:00.000Z",
            }),
          }),
        ];
      },
    ],
    [
      "impayé au-delà du délai de grâce",
      () => {
        db.tables.referral_programs = [
          programRow({
            organizations: org({
              subscription_status: "past_due",
              past_due_since: "2020-01-01T00:00:00.000Z",
            }),
          }),
        ];
      },
    ],
    [
      "programme désactivé par le commerçant",
      () => { db.tables.referral_programs = [programRow({ enabled: false })]; },
    ],
    ["campagne introuvable", () => { db.tables.campaigns = []; }],
    ["campagne en brouillon", () => { db.tables.campaigns = [campaignRow({ status: "draft" })]; }],
    ["campagne en pause", () => { db.tables.campaigns = [campaignRow({ status: "paused" })]; }],
    [
      "campagne pas encore ouverte",
      () => { db.tables.campaigns = [campaignRow({ starts_at: DEMAIN })]; },
    ],
    [
      "campagne terminée",
      () => { db.tables.campaigns = [campaignRow({ ends_at: HIER })]; },
    ],
  ];

  it("tous les motifs rendent le MÊME refus et n'appellent JAMAIS la RPC", async () => {
    // Deux propriétés qui se tiennent. (1) Un refus qui porterait son motif
    // ferait de ce chemin un oracle : « module coupé » et « essai expiré » se
    // liraient depuis la rue, et « programme désactivé » dirait à un concurrent
    // que le commerce a renoncé au parrainage. Rouge dès qu'un champ s'ajoute au
    // refus — y compris un message d'erreur bien intentionné. (2)
    // `referral_public_state` est la fonction qui matérialise les codes et les
    // jetons ; l'appeler avant d'avoir statué sur le tenant, l'abonnement et la
    // fenêtre de campagne, c'est la faire travailler pour un visiteur qu'on va
    // refuser.
    for (const [label, setup] of refusals) {
      db.reset();
      db.tables.qr_codes = [{ slug: SLUG, campaign_id: CAMPAIGN_ID }];
      db.tables.referral_programs = [programRow()];
      db.tables.campaigns = [campaignRow()];
      db.rpcData = publicStateRaw();
      cookieJar.jar[DEVICE_COOKIE] = DEVICE_UUID;
      setup();

      const ctx = await loadReferralPublicContext(SLUG);
      expect(ctx, label).toEqual({ ok: false });
      expect(db.rpcCalls, label).toEqual([]);
    }
  });

  it("la fenêtre OUVERTE laisse passer (contrôle négatif des deux bornes)", async () => {
    // Sans ce contrôle, un chargeur qui refuserait TOUJOURS rendrait les deux
    // tests de fenêtre ci-dessus verts pour la mauvaise raison.
    db.tables.campaigns = [campaignRow({ starts_at: HIER, ends_at: DEMAIN })];

    const ctx = await loadReferralPublicContext(SLUG);

    expect(ctx.ok).toBe(true);
  });

  it("l'incohérence de tenant est SIGNALÉE, pas seulement refusée", async () => {
    // La service role contourne la RLS : un programme dont l'organisation
    // embarquée pointe ailleurs ne devrait pas exister. Rouge si le
    // signalement disparaissait, ou s'il retombait sur un `console.error` que
    // personne ne lit : le seul indice d'une donnée à cheval sur deux tenants
    // serait un parrainage qui se referme sans raison visible.
    db.tables.referral_programs = [
      programRow({ organizations: org({ id: OTHER_ORG_ID }) }),
    ];

    await loadReferralPublicContext(SLUG);

    expect(vi.mocked(reportError)).toHaveBeenCalled();
  });

  it("la campagne est lue SCOPÉE sur l'organisation du programme", async () => {
    // Le programme est la source d'autorité du tenant. Rouge si le scope
    // sautait : une campagne d'un autre commerce portant le même identifiant
    // (données divergentes, restauration partielle) ouvrirait le parrainage.
    await loadReferralPublicContext(SLUG);

    expect(db.queriesOn("campaigns")[0].filters).toEqual({
      id: CAMPAIGN_ID,
      organization_id: ORG_ID,
    });
  });

  it("trois lectures indexées au plus, avant la RPC", async () => {
    // Chemin ouvert à Internet : rouge si quelqu'un ajoutait une lecture
    // (parrain, versements, roues) avant les gardes.
    await loadReferralPublicContext(SLUG);

    expect(db.tablesQueried()).toEqual([
      "qr_codes",
      "referral_programs",
      "campaigns",
    ]);
    expect(db.rpcCalls).toHaveLength(1);
  });

  it("ne lit de l'organisation QUE ce que le garde évalue", async () => {
    // `organizations(*)` ramènerait `webhook_secret` et `stripe_customer_id`
    // sur un chemin servi à un anonyme — invisible du typage, la ligne étant
    // castée depuis `unknown`. La liste est donc fermée, et volontairement
    // réduite aux entrées de `hasReferralAccess` plus `id` (contrôle de
    // tenant) : ce contexte ne rend plus d'en-tête de commerce, une colonne
    // lue sans être évaluée est une colonne qu'on finit par publier. Le
    // plafond mensuel et le seuil de coffre, eux, ne sont pas demandés du
    // tout : le joueur n'a pas à connaître le budget de parrainage du commerce.
    //
    // La projection du faux client est fidèle : c'est ce qui rend cette
    // assertion capable de rougir. Elle est le SEUL garde-fou restant, l'état
    // rendu ne portant plus l'organisation.
    await loadReferralPublicContext(SLUG);

    const programQuery = db.queriesOn("referral_programs")[0];
    expect(programQuery.columns).toContain(
      "organizations(id, subscription_status, trial_ends_at, past_due_since, addon_referral, comp_access, comp_access_until)",
    );
    expect(programQuery.columns).not.toContain("*");
    expect(programQuery.columns).not.toContain("monthly_cap");
    expect(db.queriesOn("campaigns")[0].columns).not.toContain("*");
  });
});

// ────────────────────────────────────────────────────────────
// 3. LE CŒUR — sous quelle identité la RPC est appelée
// ────────────────────────────────────────────────────────────
describe("loadReferralPublicContext — identité passée à referral_public_state", () => {
  it("n'envoie QUE la campagne et la clé du parrain, rien d'autre", async () => {
    // C'est l'hypothèse que le SQL ne peut pas vérifier. `referral_public_state`
    // rend les codes et les jetons du parrain désigné par `p_sponsor_key` :
    // toute clé supplémentaire — un `p_sponsor_id` repris d'un paramètre d'URL,
    // par exemple — rouvrirait côté TypeScript la fuite que la migration a
    // fermée. Rouge dès qu'un troisième argument apparaît.
    cookieJar.jar[DEVICE_COOKIE] = DEVICE_UUID;

    await loadReferralPublicContext(SLUG);

    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].name).toBe("referral_public_state");
    expect(Object.keys(db.rpcCalls[0].args).sort()).toEqual([
      "p_campaign_id",
      "p_sponsor_key",
    ]);
  });

  it("sans cookie : une CHAÎNE VIDE, jamais `undefined`", async () => {
    // `p_sponsor_key` n'a PAS de défaut en SQL (vérifié dans la migration
    // vivante : un seul `create or replace`, deux paramètres, aucun défaut). Un
    // `undefined` serait retiré du corps JSON par supabase-js et PostgREST ne
    // trouverait plus la fonction : le panneau parrain se refermerait pour TOUT
    // visiteur neuf — c'est-à-dire celui qui vient de scanner l'affiche. La
    // chaîne vide, elle, échoue proprement le regex 64-hex de la RPC : parrain
    // inconnu, jauge à zéro, panneau affiché.
    const ctx = await loadReferralPublicContext(SLUG);

    expect(db.rpcCalls[0].args).toEqual({
      p_campaign_id: CAMPAIGN_ID,
      p_sponsor_key: "",
    });
    expect(db.rpcCalls[0].args.p_sponsor_key).not.toBeUndefined();
    // Un visiteur sans cookie doit être SERVI, pas refusé.
    expect(ctx.ok).toBe(true);
  });

  it("avec cookie : l'empreinte SALÉE part, jamais l'identifiant du navigateur", async () => {
    // Le cookie porte un UUID de navigateur. Rouge s'il partait tel quel : (1)
    // il deviendrait un identifiant de suivi lisible dans les journaux de base,
    // (2) il ne passerait pas le regex `^[0-9a-f]{64}$` de la RPC — chaque
    // parrain verrait sa jauge à zéro et perdrait son code de partage.
    cookieJar.jar[DEVICE_COOKIE] = DEVICE_UUID;

    const ctx = await loadReferralPublicContext(SLUG);

    const key = db.rpcCalls[0].args.p_sponsor_key;
    expect(key).toBe(deviceKey(DEVICE_UUID));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.rpcCalls[0].args)).not.toContain(DEVICE_UUID);
    expect(ctx.ok).toBe(true);
    // Ni l'UUID ni son empreinte ne repartent vers l'appelant — donc vers la
    // Server Action, donc vers le navigateur. Rouge si un champ d'identité
    // (« hasIdentity », clé, empreinte) revenait se glisser dans le contexte.
    expect(JSON.stringify(ctx)).not.toContain(DEVICE_UUID);
    expect(JSON.stringify(ctx)).not.toContain(deviceKey(DEVICE_UUID));
  });

  it("deux navigateurs = deux clés = deux parrains", async () => {
    // Contrôle négatif de la dérivation : si l'empreinte ne dépendait pas de
    // l'UUID (constante, ou dérivée du seul sel), tous les visiteurs
    // partageraient une identité de parrain — donc la jauge, le code de
    // partage et les codes PARRAIN-… les uns des autres.
    cookieJar.jar[DEVICE_COOKIE] = DEVICE_UUID;
    await loadReferralPublicContext(SLUG);

    cookieJar.jar[DEVICE_COOKIE] = "c2f8a6b4-7d1e-4a9c-8b3f-2e5d9c0a1b76";
    await loadReferralPublicContext(SLUG);

    const [premier, second] = db.rpcCalls.map((c) => c.args.p_sponsor_key);
    expect(premier).not.toBe(second);
  });

  it("cookie illisible : traité comme une absence d'identité", async () => {
    // Le cookie est httpOnly, mais rien n'empêche un client bricolé d'en poser
    // un autre. Rouge si le format n'était plus vérifié : une valeur choisie
    // par l'attaquant deviendrait une clé de parrain — il lui suffirait
    // d'essayer des valeurs pour se promener d'un parrain à l'autre.
    for (const bidon of ["pas-un-uuid", "", "'; drop table --"]) {
      db.reset();
      db.tables.qr_codes = [{ slug: SLUG, campaign_id: CAMPAIGN_ID }];
      db.tables.referral_programs = [programRow()];
      db.tables.campaigns = [campaignRow()];
      db.rpcData = publicStateRaw();
      cookieJar.jar[DEVICE_COOKIE] = bidon;

      const ctx = await loadReferralPublicContext(SLUG);

      expect(db.rpcCalls[0].args.p_sponsor_key, bidon).toBe("");
      // Absence d'identité ≠ refus : le visiteur voit une jauge à zéro, pas une
      // porte fermée. Contrôle négatif de l'assertion ci-dessus, qui serait
      // verte pour la mauvaise raison si le chargeur refusait tout.
      expect(ctx.ok, bidon).toBe(true);
    }
  });

  it("la campagne envoyée à la RPC vient de qr_codes, jamais du slug", async () => {
    // Rouge si le slug était passé tel quel : la RPC recevrait un `uuid`
    // invalide (22P02) et la page tomberait — pour tout parrainage servi par QR.
    await loadReferralPublicContext(SLUG);

    expect(db.rpcCalls[0].args.p_campaign_id).toBe(CAMPAIGN_ID);
    expect(db.rpcCalls[0].args.p_campaign_id).not.toBe(SLUG);
  });
});

// ────────────────────────────────────────────────────────────
// 4. Ce qui franchit la frontière
// ────────────────────────────────────────────────────────────
describe("loadReferralPublicContext — état rendu au parrain", () => {
  it("rend SES codes et SES jetons, et rien d'un autre parrain", async () => {
    // Double propriété. Le code PARRAIN-… et le jeton de tour offert du parrain
    // DOIVENT sortir — sinon il ne peut ni retirer son café ni jouer son tour.
    // Le bloc hors contrat, lui, ne doit pas : le mapper est une liste blanche.
    // Rouge si le chargeur rendait le jsonb brut — une future clé du payload
    // serait publiée sans que personne n'ait à toucher au TypeScript.
    cookieJar.jar[DEVICE_COOKIE] = DEVICE_UUID;

    const ctx = await loadReferralPublicContext(SLUG);

    if (!ctx.ok) throw new Error("le contexte nominal doit être servi");
    expect(ctx.publicState.rewards.map((r) => r.code)).toEqual([
      "PARRAIN-ABCD2345",
      null,
    ]);
    expect(ctx.publicState.rewards[1].spinGrantToken).toBe("jeton-de-tour-a-moi");
    expect(ctx.publicState.referralCode).toBe("PR-MARCO42");

    const dump = JSON.stringify(ctx);
    expect(dump).not.toContain(CODE_DU_VOISIN);
    expect(dump).not.toContain(JETON_DU_VOISIN);
    expect(dump).not.toContain("other_sponsors");
  });

  it("rend la campagne résolue en base, et rien de plus", async () => {
    // Contrôle négatif de tout le bloc : un chargeur qui refuserait toujours
    // rendrait vertes, pour la mauvaise raison, les assertions de non-fuite
    // ci-dessus. `campaignId` sort de `qr_codes`, jamais du slug reçu — c'est
    // lui que l'appelant porte ensuite au compteur de pression.
    //
    // La forme EXACTE est assertée : ce contexte a longtemps trimballé une
    // organisation entière et un drapeau d'identité que personne ne lisait.
    // Rouge si un champ sans lecteur y revenait.
    const ctx = await loadReferralPublicContext(SLUG);

    if (!ctx.ok) throw new Error("le contexte nominal doit être servi");
    expect(ctx.campaignId).toBe(CAMPAIGN_ID);
    expect(Object.keys(ctx).sort()).toEqual(["campaignId", "ok", "publicState"]);
    expect(ctx.publicState.state).toBe("ok");
    expect(ctx.publicState.gauge).toBe(2);
    expect(ctx.publicState.chestThreshold).toBe(5);
  });
});

// ────────────────────────────────────────────────────────────
// 5. Fail-closed sur la RPC
// ────────────────────────────────────────────────────────────
describe("loadReferralPublicContext — fail-closed", () => {
  it("une RPC en erreur ferme le parrainage ET remonte l'incident", async () => {
    // Deux propriétés. (1) Fail-closed : rouge si l'erreur était ignorée, le
    // parrain verrait une jauge à zéro au lieu d'un refus — il croirait ses
    // filleuls perdus et repartirait partager un code qu'il ne voit plus.
    // (2) Signalée : rouge si le signalement disparaissait, ou retombait sur un
    // `console.error` qu'aucune alerte ne lit — une panne de la RPC ressemble
    // alors, côté produit, à un parrainage désactivé par le commerçant.
    db.rpcError = { message: "deadlock detected" };

    const ctx = await loadReferralPublicContext(SLUG);

    expect(ctx).toEqual({ ok: false });
    expect(vi.mocked(reportError)).toHaveBeenCalled();
  });

  it.each([
    ["un état non `ok`", { state: "unavailable" }],
    ["un état inconnu", { state: "peut-etre" }],
  ])("%s ferme la page", async (_label, over) => {
    // Rouge si le chargeur se contentait de l'absence d'erreur SQL : la RPC
    // rejoue ses propres gardes (addon, programme activé, campagne dans sa
    // fenêtre) et refuse PAR LA DONNÉE, pas par exception.
    db.rpcData = publicStateRaw(over);

    const ctx = await loadReferralPublicContext(SLUG);

    expect(ctx.ok).toBe(false);
  });

  it("une réponse RPC informe (null) ferme la page", async () => {
    db.rpcData = null;

    const ctx = await loadReferralPublicContext(SLUG);

    expect(ctx.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 6. Contexte d'action — plus pauvre encore
// ────────────────────────────────────────────────────────────
describe("loadReferralActionContext — contexte minimal des actions publiques", () => {
  const refusals: Array<[string, () => void]> = [
    ["programme absent", () => { db.tables.referral_programs = []; }],
    [
      "organisation absente",
      () => { db.tables.referral_programs = [programRow({ organizations: null })]; },
    ],
    [
      "organisation d'un autre tenant",
      () => {
        db.tables.referral_programs = [
          programRow({ organizations: org({ id: OTHER_ORG_ID }) }),
        ];
      },
    ],
    [
      "module coupé",
      () => {
        db.tables.referral_programs = [
          programRow({ organizations: org({ addon_referral: false }) }),
        ];
      },
    ],
    [
      "programme désactivé",
      () => { db.tables.referral_programs = [programRow({ enabled: false })]; },
    ],
    ["campagne archivée", () => { db.tables.campaigns = [campaignRow({ status: "archived" })]; }],
  ];

  it.each(refusals)("refuse SANS motif quand %s", async (_label, setup) => {
    // Refus NU, comme celui du contexte de lecture : rouge si un motif s'y
    // glissait — ces contextes servent des actions POST (validation d'un
    // filleul, consommation d'un tour offert) dont la réponse est directement
    // lisible par l'appelant, et dont TOUS les motifs de refus sont déjà
    // écrasés en `rejected` plus haut dans la pile.
    setup();

    const ctx = await loadReferralActionContext(CAMPAIGN_ID);

    expect(ctx).toEqual({ ok: false });
  });

  it("ne passe JAMAIS par qr_codes et n'appelle jamais la RPC d'état", async () => {
    // L'action reçoit un UUID de campagne déjà résolu. Rouge si ce chargeur
    // acceptait aussi le slug (clé devinable) ou reconstruisait tout l'état du
    // parrain pour vérifier une garde — l'amplification de lecture qu'on refuse
    // sur un chemin ouvert.
    const ctx = await loadReferralActionContext(CAMPAIGN_ID);

    expect(ctx.ok).toBe(true);
    expect(db.tablesQueried()).toEqual(["referral_programs", "campaigns"]);
    expect(db.rpcCalls).toEqual([]);
  });

  it("rend l'organisation résolue en base, jamais celle passée en entrée", async () => {
    // `organizationId` sort de la LIGNE du programme : c'est lui qui scopera
    // ensuite les écritures. Rouge s'il venait de l'appelant.
    const ctx = await loadReferralActionContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error("la campagne nominale doit être acceptée");
    expect(ctx.campaignId).toBe(CAMPAIGN_ID);
    expect(ctx.organizationId).toBe(ORG_ID);
    expect(ctx.admin).toBeDefined();
  });

  it("une campagne sans roue ne fait pas tomber le contexte", async () => {
    // `wheelId` est explicitement « best-effort » : l'autorité du tirage est la
    // RPC. Rouge si l'absence de roue levait une exception — les actions de
    // parrainage (validation d'un filleul, notamment) cesseraient sur une
    // campagne dont la roue vient d'être supprimée, alors qu'elles n'en ont
    // pas besoin.
    db.tables.campaigns = [campaignRow({ wheels: [] })];

    const ctx = await loadReferralActionContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error("la campagne nominale doit être acceptée");
    expect(ctx.wheelId).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 7. hasReferralAccess — les deux conditions, pas une seule
// ────────────────────────────────────────────────────────────
describe("hasReferralAccess", () => {
  const NOW = new Date("2026-07-30T12:00:00.000Z");

  type AccessOrg = Parameters<typeof hasReferralAccess>[0];

  function accessOrg(over: Partial<AccessOrg> = {}): AccessOrg {
    return {
      addon_referral: true,
      subscription_status: "active",
      trial_ends_at: "2026-01-01T00:00:00.000Z",
      past_due_since: null,
      comp_access: false,
      comp_access_until: null,
      ...over,
    };
  }

  it("exige l'addon ET l'accès actif", async () => {
    // Les RPC `service_role` gardent l'addon, le programme activé et la
    // campagne active mais NON l'abonnement : c'est ce prédicat, et lui seul,
    // qui referme la porte devant un commerçant dont l'essai est terminé.
    // Rouge si le `&&` devenait un `||` — un essai expiré continuerait à
    // distribuer des cafés offerts à chaque filleul validé.
    expect(hasReferralAccess(accessOrg({ addon_referral: false }), NOW)).toBe(false);
    expect(
      hasReferralAccess(
        accessOrg({
          subscription_status: "trialing",
          trial_ends_at: "2020-01-01T00:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(false);
    expect(hasReferralAccess(accessOrg(), NOW)).toBe(true);
  });

  it("un octroi vivant sur `referral` suffit — add-on éteint et abonnement résilié", async () => {
    // Même régression que pour le quiz, même cause : cette fonction vivait
    // hors de `subscription.ts` et n'a pas reçu la branche « octroi daté
    // vivant » du lot 2. Le Bouche-à-oreille acheté seul (12 €/mois au
    // catalogue) était accordé par la base et refusé par l'application.
    expect(
      hasReferralAccess(
        accessOrg({
          addon_referral: false,
          subscription_status: "canceled",
          live_module_grants: ["referral"],
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("un octroi vivant sur un AUTRE module n'ouvre pas le parrainage", async () => {
    // Contre-exemple : l'octroi porte le socle commun, jamais les autres
    // modules. Sans lui, un prédicat « au moins un octroi » passerait aussi.
    expect(
      hasReferralAccess(
        accessOrg({
          addon_referral: false,
          subscription_status: "canceled",
          live_module_grants: ["quiz"],
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("un impayé reste servi pendant le délai de grâce", async () => {
    // Stripe relance la carte pendant deux semaines. Couper le parrainage au
    // premier échec de prélèvement casserait la chaîne de parrainage d'un
    // commerçant qui va payer. Rouge si le prédicat testait `=== "active"`.
    expect(
      hasReferralAccess(
        accessOrg({
          subscription_status: "past_due",
          past_due_since: new Date(NOW.getTime() - 86_400_000).toISOString(),
        }),
        NOW,
      ),
    ).toBe(true);
  });
});
