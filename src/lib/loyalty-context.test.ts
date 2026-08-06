// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// loyalty-context — chemin de LECTURE PUBLIC du passeport de fidélité
// (/passeport/[programId]) et contexte des actions publiques du module.
//
// POURQUOI CE FICHIER : la page passeport est servie à un visiteur ANONYME par
// un client `service_role` qui contourne la RLS. Trois promesses ne tiennent
// que dans ce TypeScript, et rien ne les vérifiait :
//
//   1. le SECRET DE ROTATION du programme (`rotating_secret`) ne sort jamais.
//      Il est la graine du code de validation tournant affiché en caisse :
//      qui l'obtient peut fabriquer des tampons à distance, donc s'octroyer
//      les paliers — dessert offert compris — sans jamais entrer dans la
//      boutique. La SEULE barrière est la LISTE DE COLONNES demandée, car
//      `fetchProgramWithOrg` recopie ensuite la ligne entière ;
//   2. le passeport rendu est celui du porteur du cookie, et de personne
//      d'autre : ni celui d'un voisin, ni celui d'un autre programme ;
//   3. tous les refus sont LE MÊME refus — la page ne dit pas au visiteur si
//      le commerçant a coupé son module ou laissé filer son abonnement.
//
// Le faux client respecte donc la PROJECTION : sans cela, l'assertion « le
// secret de rotation ne sort pas » ne pourrait pas rougir, la ligne entière
// étant rendue de toute façon. Compter les requêtes est ici une assertion de
// sécurité autant que de performance : sur un endpoint ouvert à Internet, une
// lecture faite avant les gardes est une lecture offerte à n'importe qui.
// ────────────────────────────────────────────────────────────

const { db, cookieJar, createAdminClientMock } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type ListResult = { data: Row[]; error: null };

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

  // Le chargeur consomme deux formes : `.maybeSingle()` (ligne unique) et
  // l'attente directe du builder (liste) — ce dernier est donc « thenable ».
  // Type NOMMÉ, sans quoi `builder` se référencerait dans son propre
  // initialiseur et retomberait en `any` implicite.
  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    in: (column: string, values: unknown[]) => Builder;
    order: (column: string, opts: { ascending: boolean }) => Builder;
    maybeSingle: () => Promise<{ data: Row | null; error: null }>;
    then: (
      onfulfilled: (value: ListResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise<unknown>;
  };

  /** Table, colonnes, filtres `eq`, filtre `in` et tri d'une requête. */
  type QueryEntry = {
    table: string;
    columns: string;
    filters: Record<string, unknown>;
    inFilter?: { column: string; values: unknown[] };
    order?: { column: string; ascending: boolean };
  };

  // Types de retour ANNOTÉS : sans cela l'inférence de `tablesQueried` /
  // `queriesOn` dépendrait du type de `db`, qui dépend d'elles.
  const db = {
    tables: {} as Record<string, Row[]>,
    queries: [] as QueryEntry[],
    reset(): void {
      db.tables = {
        loyalty_programs: [],
        loyalty_milestones: [],
        loyalty_members: [],
        loyalty_rewards: [],
      };
      db.queries = [];
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
            // `eq` / `in` / `order` successifs : complète aux assertions.
            const entry: QueryEntry = { table, columns, filters: {} };
            db.queries.push(entry);
            const rows = () =>
              (db.tables[table] ?? [])
                .filter((r) =>
                  Object.entries(entry.filters).every(([k, v]) => r[k] === v),
                )
                .filter((r) =>
                  entry.inFilter
                    ? entry.inFilter.values.includes(r[entry.inFilter.column])
                    : true,
                )
                .map((r) => project(r, columns));
            const builder: Builder = {
              eq(column, value) {
                entry.filters[column] = value;
                return builder;
              },
              in(column, values) {
                entry.inFilter = { column, values };
                return builder;
              },
              order(column, opts) {
                entry.order = { column, ascending: opts.ascending };
                return builder;
              },
              maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
              then: (onfulfilled, onrejected) =>
                Promise.resolve<ListResult>({ data: rows(), error: null }).then(
                  onfulfilled,
                  onrejected,
                ),
            };
            return builder;
          },
        };
      },
    };
  }

  return { db, cookieJar, createAdminClientMock };
});

// La factory `vi.mock` est hissée au-dessus des imports : elle ne peut lire
// que des valeurs issues de `vi.hoisted`.
// Ce fichier éprouve le GARDE-BARRIÈRE du contexte, pas le chargeur d'octrois.
// Sans octroi, le verdict doit être exactement celui d'avant P0.4 — c'est ce
// que ce double fige. Que l'octroi OUVRE le module est prouvé là où la
// décision vit : src/lib/module-acces-public.test.ts.
vi.mock("@/lib/module-grants-loader", () => ({
  chargerOctroisVivants: () => Promise.resolve([]),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name in cookieJar.jar ? { value: cookieJar.jar[name] } : undefined,
  }),
}));

import {
  loadLoyaltyActionContext,
  loadLoyaltyContext,
  loadOrderCodeActionContext,
  loadOrderCodeContext,
  loyaltyTokenCookieName,
} from "./loyalty-context";

/** Le refus unique du module — recopié, car c'est sa stabilité qu'on teste. */
const UNAVAILABLE = "Ce passeport de fidélité n'est pas disponible.";

const PROGRAM_ID = "program-marcel";
const OTHER_PROGRAM_ID = "program-voisin";
const ORG_ID = "org-marcel";
const OTHER_ORG_ID = "org-voisin";

/** Graine du code tournant : la fabriquer = fabriquer des visites. */
const SECRET_ROTATIF = "s3cr3t-de-rotation-du-commerce";
/** Secret d'organisation qu'un `organizations(*)` ferait sortir. */
const SECRET_ORG = "whsec-webhook-du-commerce";
/** Cookie passeport du joueur courant — un porteur valable 180 jours. */
const TOKEN = "jeton-passeport-de-marco";
/** Code de retrait d'un AUTRE membre : ne doit jamais franchir la frontière. */
const CODE_DU_VOISIN = "FIDELITE-VOISIN99";

type Over = Record<string, unknown>;

function org(over: Over = {}) {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    logo_url: null,
    subscription_status: "active",
    trial_ends_at: "2026-01-01T00:00:00.000Z",
    past_due_since: null,
    addon_loyalty: true,
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

function program(over: Over = {}) {
  return {
    id: PROGRAM_ID,
    organization_id: ORG_ID,
    name: "Le passeport de Marcel",
    status: "active",
    validation_mode: "staff",
    // La ligne PORTE le secret : c'est la projection, et elle seule, qui doit
    // l'empêcher de sortir.
    rotating_secret: SECRET_ROTATIF,
    rotating_period_seconds: 30,
    min_stamp_interval_seconds: 3600,
    silver_threshold: 5,
    gold_threshold: 10,
    created_at: "2026-01-01T00:00:00.000Z",
    organizations: org(),
    ...over,
  };
}

function milestone(over: Over = {}) {
  return {
    id: "milestone-1",
    program_id: PROGRAM_ID,
    organization_id: ORG_ID,
    visit_count: 5,
    reward_type: "lot",
    reward_label: "Un dessert offert",
    reward_details: "Au choix à la carte",
    reward_stock: 100,
    reward_claimed_count: 4,
    target_wheel_id: null,
    position: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/**
 * Hash recalculé ici, jamais importé de `@/lib/pronostics` : un test qui
 * réutilise la fonction hachée ne prouve que sa cohérence avec elle-même.
 */
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

beforeEach(() => {
  db.reset();
  db.tables.loyalty_programs = [program()];
  cookieJar.jar = {};
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1. Le secret de rotation, et rien que les colonnes publiques
// ────────────────────────────────────────────────────────────
describe("loadLoyaltyContext — ce qui n'est même pas demandé à la base", () => {
  it("ne lit jamais `rotating_secret`, ni les colonnes privées de l'organisation", async () => {
    // LA garde du module. `fetchProgramWithOrg` fait `{ organizations, ...program }` :
    // TOUTE colonne rapportée par la requête est recopiée dans le contexte, puis
    // dans le rendu de la page. La liste de colonnes est donc l'unique rempart —
    // un `select("*")` bien intentionné publierait la graine du code tournant
    // dans le payload servi au navigateur du joueur, et n'importe qui pourrait
    // dès lors se tamponner des visites depuis chez lui.
    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    expect(db.queries[0].columns).not.toContain("rotating_secret");
    expect(db.queries[0].columns).not.toContain("*");
    expect(db.queries[0].columns).toContain(
      "organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_loyalty, comp_access, comp_access_until, timezone)",
    );
    const dump = JSON.stringify(ctx);
    expect(dump).not.toContain(SECRET_ROTATIF);
    expect(dump).not.toContain(SECRET_ORG);
    expect(dump).not.toContain("cus_marcel");
  });

  it("le programme rendu ne traîne pas l'organisation embarquée", async () => {
    // `organizations` est retirée par déstructuration. Rouge si le spread la
    // gardait : chaque contexte (donc chaque rendu de page publique) porterait
    // l'état commercial du commerçant — statut d'abonnement, fin d'essai — en
    // plus, sans qu'aucun type ne s'en plaigne (la ligne est castée d'`unknown`).
    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect("organizations" in ctx.program).toBe(false);
    expect(ctx.program.id).toBe(PROGRAM_ID);
    expect(ctx.organization.id).toBe(ORG_ID);
  });
});

// ────────────────────────────────────────────────────────────
// 2. Refus indistinguables — et rien de lu au-delà du programme
// ────────────────────────────────────────────────────────────
describe("loadLoyaltyContext — refus indistinguables", () => {
  const refusals: Array<[string, () => void]> = [
    ["programme inconnu", () => { db.tables.loyalty_programs = []; }],
    [
      "organisation embarquée absente",
      () => { db.tables.loyalty_programs = [program({ organizations: null })]; },
    ],
    [
      "organisation embarquée d'un AUTRE tenant",
      () => {
        db.tables.loyalty_programs = [
          program({ organizations: org({ id: OTHER_ORG_ID }) }),
        ];
      },
    ],
    [
      "module fidélité coupé",
      () => {
        db.tables.loyalty_programs = [
          program({ organizations: org({ addon_loyalty: false }) }),
        ];
      },
    ],
    [
      "essai expiré",
      () => {
        db.tables.loyalty_programs = [
          program({
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
        db.tables.loyalty_programs = [
          program({
            organizations: org({
              subscription_status: "past_due",
              past_due_since: "2020-01-01T00:00:00.000Z",
            }),
          }),
        ];
      },
    ],
    [
      "programme en brouillon",
      () => { db.tables.loyalty_programs = [program({ status: "draft" })]; },
    ],
    [
      "programme archivé",
      () => { db.tables.loyalty_programs = [program({ status: "archived" })]; },
    ],
  ];

  it("tous les motifs rendent la même phrase et ne lisent RIEN de plus", async () => {
    // Deux propriétés qui se tiennent. (1) Un message par motif ferait de la
    // page un oracle sur l'état commercial du commerçant : « essai expiré » se
    // lirait depuis la rue. (2) Paliers et passeport ne doivent pas être lus
    // pour un visiteur qu'on va refuser : ce sont quatre requêtes de plus, sur
    // un chemin ouvert à Internet, avant le premier rempart.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = new Set<string>();

    for (const [label, setup] of refusals) {
      db.reset();
      db.tables.loyalty_programs = [program()];
      cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
      setup();

      const ctx = await loadLoyaltyContext(PROGRAM_ID);
      if (ctx.ok) throw new Error(`« ${label} » aurait dû fermer le passeport`);
      messages.add(ctx.error);
      expect(db.tablesQueried(), label).toEqual(["loyalty_programs"]);
    }

    expect(messages).toEqual(new Set([UNAVAILABLE]));
  });

  it("l'incohérence de tenant est TRACÉE, pas seulement refusée", async () => {
    // La service role contourne la RLS : un programme dont l'organisation
    // embarquée pointe ailleurs est un état qui ne devrait pas exister. Rouge
    // si le `console.error` disparaissait — la divergence deviendrait muette.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.tables.loyalty_programs = [program({ organizations: org({ id: OTHER_ORG_ID }) })];

    await loadLoyaltyContext(PROGRAM_ID);

    expect(spy).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// 3. Paliers : ce que le joueur voit du stock, et ce qu'il n'en voit pas
// ────────────────────────────────────────────────────────────
describe("loadLoyaltyContext — paliers", () => {
  it("n'expose ni le stock ni le compteur, seulement « épuisé »", async () => {
    // `reward_stock` et `reward_claimed_count` sont des chiffres d'exploitation
    // (combien de desserts le commerçant a mis en jeu, combien sont partis).
    // Le joueur n'a besoin que du booléen. Rouge si `toMilestoneView` devenait
    // un passe-plat : la page publique afficherait la dotation du commerce.
    db.tables.loyalty_milestones = [milestone()];

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.milestones).toEqual([
      {
        id: "milestone-1",
        visitCount: 5,
        rewardType: "lot",
        rewardLabel: "Un dessert offert",
        rewardDetails: "Au choix à la carte",
        targetWheelId: null,
        soldOut: false,
      },
    ]);
    expect(JSON.stringify(ctx.milestones)).not.toContain("100");
  });

  it("« épuisé » vaut aussi pour un palier de TOUR OFFERT, pas seulement pour un lot", async () => {
    // Depuis 20260725200000 le stock est obligatoire sur les DEUX natures.
    // Rouge si le calcul redevenait `rewardType === "lot" && …` : un palier
    // `spin` épuisé s'afficherait comme encore à débloquer, et le joueur
    // collectionnerait des visites vers une récompense qui n'existe plus.
    db.tables.loyalty_milestones = [
      milestone({ id: "m-lot", visit_count: 3, reward_type: "lot", reward_claimed_count: 100 }),
      milestone({
        id: "m-spin",
        visit_count: 7,
        reward_type: "spin",
        target_wheel_id: "wheel-1",
        reward_stock: 20,
        reward_claimed_count: 20,
      }),
    ];

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.milestones.map((m) => [m.id, m.soldOut])).toEqual([
      ["m-lot", true],
      ["m-spin", true],
    ]);
  });

  it("un stock illimité (null) n'est jamais épuisé", async () => {
    // Contrôle négatif du calcul précédent : sans cette borne, `soldOut`
    // deviendrait vrai dès la première remise sur un palier historique dont le
    // stock est resté nul, et le palier disparaîtrait de la page.
    db.tables.loyalty_milestones = [
      milestone({ reward_stock: null, reward_claimed_count: 999 }),
    ];

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.milestones[0].soldOut).toBe(false);
  });

  it("les paliers sont demandés triés par nombre de visites croissant", async () => {
    // L'ordre fait foi côté base (le composant ne retrie pas). Rouge si le
    // `order` sautait : la carte de tampons afficherait le palier « 10 visites »
    // avant le palier « 3 visites », et le joueur ne saurait plus ce qui vient.
    db.tables.loyalty_milestones = [milestone()];

    await loadLoyaltyContext(PROGRAM_ID);

    expect(db.queriesOn("loyalty_milestones")[0].order).toEqual({
      column: "visit_count",
      ascending: true,
    });
  });

  it("ne lit que les paliers de CE programme", async () => {
    // Rouge si le filtre `program_id` sautait : le commerce voisin verrait ses
    // paliers — libellés de lots compris — affichés sur la page de Marcel.
    db.tables.loyalty_milestones = [
      milestone(),
      milestone({ id: "m-voisin", program_id: OTHER_PROGRAM_ID, reward_label: "Lot du voisin" }),
    ];

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.milestones.map((m) => m.id)).toEqual(["milestone-1"]);
    expect(JSON.stringify(ctx)).not.toContain("Lot du voisin");
  });
});

// ────────────────────────────────────────────────────────────
// 4. Le passeport — celui du porteur du cookie, et de personne d'autre
// ────────────────────────────────────────────────────────────
describe("loadLoyaltyContext — passeport du joueur courant", () => {
  /** Membre du programme + ses récompenses, retrouvable par le hash du cookie. */
  function seedMember(over: Over = {}) {
    db.tables.loyalty_members = [
      {
        id: "member-moi",
        program_id: PROGRAM_ID,
        token_hash: sha256(TOKEN),
        visit_count: 7,
        ...over,
      },
    ];
  }

  it("sans cookie : passeport vide, et la base n'est même pas interrogée", async () => {
    // Le visiteur qui découvre la page n'a pas d'identité. Rouge si le chargeur
    // interrogeait quand même `loyalty_members` : deux requêtes offertes à tout
    // passant, sur un chemin public, pour un résultat connu d'avance.
    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.passport).toEqual({
      hasPassport: false,
      visitCount: 0,
      tier: "bronze",
      rewards: [],
    });
    expect(db.tablesQueried()).toEqual(["loyalty_programs", "loyalty_milestones"]);
  });

  it("le cookie est nommé par PROGRAMME : celui d'un autre commerce est ignoré", async () => {
    // Deux passeports sur le même téléphone (deux commerces, ou deux programmes
    // d'un même commerce) doivent rester deux identités. Rouge si le nom du
    // cookie perdait l'identifiant : les visites et les codes FIDELITE-… d'un
    // programme s'afficheraient sur l'autre.
    cookieJar.jar[loyaltyTokenCookieName(OTHER_PROGRAM_ID)] = TOKEN;
    seedMember();

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.passport.hasPassport).toBe(false);
    expect(db.tablesQueried()).not.toContain("loyalty_members");
  });

  it("seul le SHA-256 du cookie part en base, jamais le cookie", async () => {
    // Le cookie est un porteur de 180 jours : qui l'obtient lit les codes non
    // remis et consomme les tours offerts de la victime (c'est ce qui a motivé
    // le jeton de check-in court). Rouge si `hashPlayerToken` sautait — le
    // porteur brut transiterait vers la base et ses journaux.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    seedMember();

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    const query = db.queriesOn("loyalty_members")[0];
    expect(query.filters.token_hash).toBe(sha256(TOKEN));
    expect(JSON.stringify(db.queries)).not.toContain(TOKEN);
    // Ni le porteur ni son hash ne repartent vers l'appelant (donc vers le RSC).
    expect(JSON.stringify(ctx)).not.toContain(TOKEN);
    expect(JSON.stringify(ctx)).not.toContain(sha256(TOKEN));
  });

  it("un passeport d'un AUTRE programme, au même hash, reste invisible", async () => {
    // Cloisonnement : la recherche porte sur (program_id, token_hash). Rouge si
    // le filtre `program_id` sautait — un même appareil réutilisant sa valeur de
    // cookie ferait apparaître le compteur de visites et les récompenses non
    // remises d'un AUTRE commerce sur la page de Marcel.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    db.tables.loyalty_members = [
      {
        id: "member-ailleurs",
        program_id: OTHER_PROGRAM_ID,
        token_hash: sha256(TOKEN),
        visit_count: 42,
      },
    ];
    db.tables.loyalty_rewards = [
      {
        id: "reward-ailleurs",
        member_id: "member-ailleurs",
        milestone_id: "milestone-1",
        reward_type: "lot",
        earned_at: "2026-07-01T10:00:00.000Z",
        code: CODE_DU_VOISIN,
        redeemed_at: null,
        grant_token: null,
        consumed_at: null,
        resulting_spin_id: null,
      },
    ];

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    // Le cookie existe (l'identité est posée), mais aucun passeport ici.
    expect(ctx.passport).toEqual({
      hasPassport: true,
      visitCount: 0,
      tier: "bronze",
      rewards: [],
    });
    expect(JSON.stringify(ctx)).not.toContain(CODE_DU_VOISIN);
  });

  it("cookie posé mais aucune visite encore validée : identité sans compteur", async () => {
    // Mode `staff` : le cookie est posé à l'affichage du QR de check-in, la
    // ligne `loyalty_members` n'est créée qu'à la première validation par la
    // caisse. Rouge si le chargeur rendait `hasPassport: false` — la page
    // cesserait d'afficher le QR, et le joueur ne pourrait plus se faire
    // tamponner sa toute première visite.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.passport).toEqual({
      hasPassport: true,
      visitCount: 0,
      tier: "bronze",
      rewards: [],
    });
    // Aucune récompense à chercher pour un membre qui n'existe pas.
    expect(db.tablesQueried()).not.toContain("loyalty_rewards");
  });

  it("le niveau est RECALCULÉ depuis les seuils courants du programme", async () => {
    // Le niveau n'est pas stocké : il se déduit des seuils du jour. Conséquence
    // produit : un commerçant qui abaisse son seuil « or » doit voir ses fidèles
    // y passer immédiatement. Rouge si un niveau figé était lu en base.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    seedMember();

    const argent = await loadLoyaltyContext(PROGRAM_ID);
    if (!argent.ok) throw new Error(argent.error);
    expect(argent.passport).toMatchObject({ visitCount: 7, tier: "silver" });

    db.reset();
    db.tables.loyalty_programs = [program({ gold_threshold: 7 })];
    seedMember();

    const or = await loadLoyaltyContext(PROGRAM_ID);
    if (!or.ok) throw new Error(or.error);
    expect(or.passport.tier).toBe("gold");
  });

  it("rend les récompenses de CE membre — code et jeton compris — et rien d'un autre", async () => {
    // Contrôle négatif du cloisonnement : le code FIDELITE-… et le jeton de
    // tour offert du joueur DOIVENT sortir, sinon il ne peut ni retirer son
    // dessert ni jouer son tour. Ce qui ne doit pas sortir, c'est la ligne du
    // voisin : rouge si le filtre `member_id` sautait.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    seedMember();
    db.tables.loyalty_milestones = [
      milestone(),
      milestone({ id: "milestone-2", visit_count: 10, reward_type: "spin", reward_label: "Un tour offert" }),
    ];
    db.tables.loyalty_rewards = [
      {
        id: "reward-moi-1",
        member_id: "member-moi",
        milestone_id: "milestone-1",
        reward_type: "lot",
        earned_at: "2026-07-20T10:00:00.000Z",
        code: "FIDELITE-ABCD2345",
        redeemed_at: null,
        grant_token: null,
        consumed_at: null,
        resulting_spin_id: null,
      },
      {
        id: "reward-moi-2",
        member_id: "member-moi",
        milestone_id: "milestone-2",
        reward_type: "spin",
        earned_at: "2026-07-25T10:00:00.000Z",
        code: null,
        redeemed_at: null,
        grant_token: "jeton-de-tour-offert",
        consumed_at: null,
        resulting_spin_id: null,
      },
      {
        id: "reward-du-voisin",
        member_id: "member-voisin",
        milestone_id: "milestone-1",
        reward_type: "lot",
        earned_at: "2026-07-26T10:00:00.000Z",
        code: CODE_DU_VOISIN,
        redeemed_at: null,
        grant_token: null,
        consumed_at: null,
        resulting_spin_id: null,
      },
    ];

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.passport.rewards.map((r) => r.id)).toEqual([
      "reward-moi-1",
      "reward-moi-2",
    ]);
    expect(ctx.passport.rewards[0].code).toBe("FIDELITE-ABCD2345");
    expect(ctx.passport.rewards[1].grantToken).toBe("jeton-de-tour-offert");
    expect(JSON.stringify(ctx)).not.toContain(CODE_DU_VOISIN);
  });

  it("les récompenses sont demandées de la plus récente à la plus ancienne", async () => {
    // L'ordre fait foi côté base. Rouge si le `order` sautait : le dessert
    // gagné il y a six mois s'afficherait au-dessus de celui de ce matin.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    seedMember();
    db.tables.loyalty_rewards = [
      {
        id: "reward-moi-1",
        member_id: "member-moi",
        milestone_id: "milestone-1",
        reward_type: "lot",
        earned_at: "2026-07-20T10:00:00.000Z",
        code: "FIDELITE-ABCD2345",
        redeemed_at: null,
        grant_token: null,
        consumed_at: null,
        resulting_spin_id: null,
      },
    ];

    await loadLoyaltyContext(PROGRAM_ID);

    expect(db.queriesOn("loyalty_rewards")[0].order).toEqual({
      column: "earned_at",
      ascending: false,
    });
  });

  it("les libellés coûtent UN aller-retour, quel que soit le nombre de récompenses", async () => {
    // `loyalty_rewards` ne dénormalise pas les libellés : ils viennent des
    // paliers. Rouge si la déduplication ou le regroupement sautait — on
    // retomberait sur un N+1 (une requête par récompense) sur une page publique
    // qu'un fidèle recharge à chaque visite.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    seedMember();
    db.tables.loyalty_milestones = [milestone()];
    db.tables.loyalty_rewards = [1, 2, 3].map((n) => ({
      id: `reward-${n}`,
      member_id: "member-moi",
      milestone_id: "milestone-1",
      reward_type: "lot",
      earned_at: `2026-07-2${n}T10:00:00.000Z`,
      code: `FIDELITE-ABCD234${n}`,
      redeemed_at: null,
      grant_token: null,
      consumed_at: null,
      resulting_spin_id: null,
    }));

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    // Une lecture pour la liste des paliers, une seule pour leurs libellés.
    expect(db.queriesOn("loyalty_milestones")).toHaveLength(2);
    expect(db.queriesOn("loyalty_milestones")[1].inFilter).toEqual({
      column: "id",
      values: ["milestone-1"],
    });
    expect(ctx.passport.rewards.every((r) => r.rewardLabel === "Un dessert offert")).toBe(
      true,
    );
  });

  it("une récompense dont le palier a disparu s'affiche sans libellé, sans casser la page", async () => {
    // Un palier supprimé par le commerçant laisse ses récompenses déjà émises.
    // Rouge si le libellé devenait `undefined` : la carte de fidélité afficherait
    // « undefined » au joueur, et le code de retrait resterait pourtant valable.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    seedMember();
    db.tables.loyalty_rewards = [
      {
        id: "reward-orphelin",
        member_id: "member-moi",
        milestone_id: "milestone-disparu",
        reward_type: "lot",
        earned_at: "2026-07-20T10:00:00.000Z",
        code: "FIDELITE-ABCD2345",
        redeemed_at: null,
        grant_token: null,
        consumed_at: null,
        resulting_spin_id: null,
      },
    ];

    const ctx = await loadLoyaltyContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.passport.rewards[0]).toMatchObject({
      rewardLabel: "",
      rewardDetails: null,
      code: "FIDELITE-ABCD2345",
    });
  });
});

// ────────────────────────────────────────────────────────────
// 5. Contexte d'action — l'amplification de lecture, refusée
// ────────────────────────────────────────────────────────────
describe("loadLoyaltyActionContext — contexte minimal des actions publiques", () => {
  const refusals: Array<[string, () => void]> = [
    ["programme inconnu", () => { db.tables.loyalty_programs = []; }],
    [
      "organisation absente",
      () => { db.tables.loyalty_programs = [program({ organizations: null })]; },
    ],
    [
      "organisation d'un autre tenant",
      () => {
        db.tables.loyalty_programs = [
          program({ organizations: org({ id: OTHER_ORG_ID }) }),
        ];
      },
    ],
    [
      "module coupé",
      () => {
        db.tables.loyalty_programs = [
          program({ organizations: org({ addon_loyalty: false }) }),
        ];
      },
    ],
    [
      "programme archivé",
      () => { db.tables.loyalty_programs = [program({ status: "archived" })]; },
    ],
  ];

  it.each(refusals)("refuse par la MÊME phrase quand %s", async (_label, setup) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup();

    const ctx = await loadLoyaltyActionContext(PROGRAM_ID);

    expect(ctx).toEqual({ ok: false, error: UNAVAILABLE });
  });

  it("UNE seule requête : ni paliers, ni passeport, ni récompenses", async () => {
    // C'est la raison d'être de ce second chargeur. `loadLoyaltyContext` engage
    // jusqu'à CINQ lectures ; une action publique (tampon, jeton de check-in,
    // tour offert) n'a besoin d'aucune d'elles. Sur un chemin ouvert à
    // Internet, cette amplification précéderait le premier rempart — rouge si
    // quelqu'un « factorisait » les deux chargeurs en un seul.
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    db.tables.loyalty_milestones = [milestone()];

    const ctx = await loadLoyaltyActionContext(PROGRAM_ID);

    expect(ctx.ok).toBe(true);
    expect(db.tablesQueried()).toEqual(["loyalty_programs"]);
  });

  it("ne rend que le client admin et le programme", async () => {
    // Contrat de sortie volontairement pauvre. Rouge s'il s'élargissait :
    // chaque action publique se mettrait à charrier l'organisation complète,
    // et la tentation d'y lire une garde à la place du programme suivrait.
    const ctx = await loadLoyaltyActionContext(PROGRAM_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(Object.keys(ctx).sort()).toEqual(["admin", "ok", "program"]);
    expect(ctx.program.id).toBe(PROGRAM_ID);
    expect(ctx.program.organization_id).toBe(ORG_ID);
    expect(JSON.stringify(ctx.program)).not.toContain(SECRET_ROTATIF);
  });
});

// ────────────────────────────────────────────────────────────
// 6. QR de commande unique (cahier §7) — /commande/[token]
//
// Même surface d'exposition que la page passeport, avec une différence qui
// change tout : ici l'entrée est un JETON, pas un identifiant public. Balayer
// des UUID de programme n'apprend rien (le QR est en vitrine) ; balayer des
// JETONS apprendrait lesquels sont réels, donc lesquels valent un tampon. Les
// refus doivent donc être STRICTEMENT indiscernables — un `null` unique.
// ────────────────────────────────────────────────────────────

const ORDER_TOKEN = "CMDABCD2345EFGH";
const ORDER_TOKEN_VOISIN = "CMDZZZZ9999YYYY";

function orderCode(over: Over = {}) {
  return {
    token: ORDER_TOKEN,
    consumed_at: null,
    program_id: PROGRAM_ID,
    organization_id: ORG_ID,
    loyalty_programs: program(),
    ...over,
  };
}

describe("loadOrderCodeContext — page publique d'un QR de commande", () => {
  beforeEach(() => {
    db.tables.loyalty_order_codes = [orderCode()];
  });

  it("jeton valable : de quoi afficher la carte, et rien de plus", async () => {
    const ctx = await loadOrderCodeContext(ORDER_TOKEN);

    expect(ctx).toEqual({
      programId: PROGRAM_ID,
      programName: "Le passeport de Marcel",
      organizationName: "Chez Marcel",
      logoUrl: null,
      alreadyConsumed: false,
    });
  });

  it("le contrat de sortie est CLOS : cinq clés, jamais un secret", async () => {
    // `Object.keys` et non un `toMatchObject` : c'est l'ABSENCE qu'on teste.
    // Un `...row` glissé dans le retour publierait `rotating_secret` — la
    // graine du code du comptoir — dans le payload servi au navigateur, et
    // quiconque l'obtient se tamponne des visites depuis chez lui.
    const ctx = await loadOrderCodeContext(ORDER_TOKEN);

    expect(ctx).not.toBeNull();
    expect(Object.keys(ctx!).sort()).toEqual([
      "alreadyConsumed",
      "logoUrl",
      "organizationName",
      "programId",
      "programName",
    ]);
    const dump = JSON.stringify(ctx);
    expect(dump).not.toContain(SECRET_ROTATIF);
    expect(dump).not.toContain(SECRET_ORG);
    expect(dump).not.toContain("cus_marcel");
    // Réglages internes du programme : ils servent à la server action, ils ne
    // sortent pas vers la page.
    expect(dump).not.toContain("min_stamp_interval");
    expect(dump).not.toContain("validation_mode");
  });

  it("ne demande jamais `rotating_secret` ni `*` à la base", async () => {
    // Seconde serrure, à la SOURCE : ce qui n'est pas lu ne peut pas fuir par
    // un futur spread. La projection du retour est la première.
    await loadOrderCodeContext(ORDER_TOKEN);

    expect(db.queries[0].table).toBe("loyalty_order_codes");
    expect(db.queries[0].columns).not.toContain("rotating_secret");
    expect(db.queries[0].columns).not.toContain("*");
  });

  it("jeton déjà consommé : la page le DIT, elle ne refuse pas", async () => {
    // `alreadyConsumed` n'est pas une garde — le verrou est `consumed_at` en
    // base, posé sous verrou de ligne par la RPC. C'est une politesse : mieux
    // vaut annoncer que faire cliquer un bouton condamné.
    db.tables.loyalty_order_codes = [
      orderCode({ consumed_at: "2026-08-01T10:00:00.000Z" }),
    ];

    const ctx = await loadOrderCodeContext(ORDER_TOKEN);

    expect(ctx?.alreadyConsumed).toBe(true);
    expect(ctx?.programId).toBe(PROGRAM_ID);
  });

  const refusals: Array<[string, () => void]> = [
    ["le jeton est inconnu", () => { db.tables.loyalty_order_codes = []; }],
    [
      "le programme visé a disparu",
      () => { db.tables.loyalty_order_codes = [orderCode({ loyalty_programs: null })]; },
    ],
    [
      "le code pointe le programme d'un AUTRE tenant",
      () => {
        // La service role contourne la RLS : la cohérence
        // code.organization_id = programme.organization_id se vérifie à la main.
        db.tables.loyalty_order_codes = [
          orderCode({ organization_id: OTHER_ORG_ID }),
        ];
      },
    ],
    [
      "l'organisation embarquée est celle d'un voisin",
      () => {
        db.tables.loyalty_order_codes = [
          orderCode({
            loyalty_programs: program({ organizations: org({ id: OTHER_ORG_ID }) }),
          }),
        ];
      },
    ],
    [
      "le programme est archivé",
      () => {
        db.tables.loyalty_order_codes = [
          orderCode({ loyalty_programs: program({ status: "archived" }) }),
        ];
      },
    ],
    [
      "le module est coupé",
      () => {
        db.tables.loyalty_order_codes = [
          orderCode({
            loyalty_programs: program({
              organizations: org({ addon_loyalty: false }),
            }),
          }),
        ];
      },
    ],
    [
      "l'abonnement a expiré",
      () => {
        db.tables.loyalty_order_codes = [
          orderCode({
            loyalty_programs: program({
              organizations: org({
                subscription_status: "canceled",
                trial_ends_at: "2020-01-01T00:00:00.000Z",
              }),
            }),
          }),
        ];
      },
    ],
  ];

  it.each(refusals)("rend le MÊME null quand %s", async (_label, setup) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup();

    expect(await loadOrderCodeContext(ORDER_TOKEN)).toBeNull();
  });

  it("jeton malformé : refusé SANS la moindre requête", async () => {
    // Le schéma est le miroir du CHECK SQL. Un jeton qui ne peut pas exister
    // ne mérite pas un aller-retour base : c'est le seul endroit du chemin où
    // l'on peut refuser gratuitement, et une page publique doit en profiter.
    for (const mauvais of ["", "court", "x".repeat(65), "ABCD_2345", "ABCD 2345"]) {
      expect(await loadOrderCodeContext(mauvais), mauvais).toBeNull();
    }
    expect(db.queries).toHaveLength(0);
  });

  it("un jeton n'ouvre QUE sa propre ligne", async () => {
    db.tables.loyalty_order_codes = [
      orderCode(),
      orderCode({ token: ORDER_TOKEN_VOISIN, program_id: OTHER_PROGRAM_ID }),
    ];

    await loadOrderCodeContext(ORDER_TOKEN);

    expect(db.queriesOn("loyalty_order_codes")[0].filters).toEqual({
      token: ORDER_TOKEN,
    });
  });

  it("UNE seule lecture : ni paliers, ni passeport, ni récompenses", async () => {
    cookieJar.jar[loyaltyTokenCookieName(PROGRAM_ID)] = TOKEN;
    db.tables.loyalty_milestones = [milestone()];

    await loadOrderCodeContext(ORDER_TOKEN);

    expect(db.tablesQueried()).toEqual(["loyalty_order_codes"]);
  });
});

describe("loadOrderCodeActionContext — contexte minimal du tampon de commande", () => {
  beforeEach(() => {
    db.tables.loyalty_order_codes = [orderCode()];
  });

  it("rend le programme dérivé du jeton, et le cooldown dont l'action a besoin", async () => {
    const ctx = await loadOrderCodeActionContext(ORDER_TOKEN);

    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    expect(Object.keys(ctx).sort()).toEqual(["admin", "ok", "program"]);
    expect(ctx.program).toEqual({
      id: PROGRAM_ID,
      organizationId: ORG_ID,
      minStampIntervalSeconds: 3600,
    });
    expect(JSON.stringify(ctx.program)).not.toContain(SECRET_ROTATIF);
  });

  it("le refus NE PORTE AUCUN MOTIF", async () => {
    // Pas de champ `error`, volontairement : l'appelant rend `order_invalid`
    // dans tous les cas — exactement ce que la RPC fait d'un jeton déjà
    // consommé. Un motif par cause serait l'oracle que toute la chaîne évite.
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.tables.loyalty_order_codes = [];

    const ctx = await loadOrderCodeActionContext(ORDER_TOKEN);

    expect(ctx).toEqual({ ok: false });
  });

  it("un jeton DÉJÀ CONSOMMÉ passe encore ici : c'est la RPC qui tranche", async () => {
    // Refuser sur `consumed_at` lu ici serait une course perdue d'avance
    // (deux scans concurrents liraient tous deux « libre »). Le verrou est le
    // `update … where consumed_at is null` de la RPC, atomique sous verrou de
    // ligne. Ce contexte ne fait donc que résoudre le programme.
    db.tables.loyalty_order_codes = [
      orderCode({ consumed_at: "2026-08-01T10:00:00.000Z" }),
    ];

    expect((await loadOrderCodeActionContext(ORDER_TOKEN)).ok).toBe(true);
  });
});
