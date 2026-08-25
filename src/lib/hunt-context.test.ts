// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// hunt-context — chemin de LECTURE PUBLIC de la chasse au trésor
// (/hunt/[token]) et résolution du claim.
//
// POURQUOI CE FICHIER : un visiteur ANONYME y déclenche des lectures en
// `service_role`, qui contourne la RLS. Deux promesses tiennent uniquement
// dans ce TypeScript, et n'avaient aucun test :
//   1. tous les refus sont LE MÊME refus (pas d'oracle sur le motif) ;
//   2. le code de retrait d'un joueur n'est rendu qu'au porteur du cookie
//      dont le SHA-256 correspond — jamais au visiteur suivant.
//
// Base simulée : moteur de filtres `eq` générique, qui enregistre AUSSI les
// tables interrogées. Compter les requêtes est ici une assertion de sécurité
// autant que de performance : sur un endpoint ouvert à Internet, une lecture
// faite avant les gardes est une lecture qu'on offre à n'importe qui.
// ────────────────────────────────────────────────────────────

const { db, cookieJar, createAdminClientMock, limiteur } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type ListResult = { data: Row[]; error: null };
  // Le chargeur consomme deux formes : `.maybeSingle()` (ligne unique) et
  // l'attente directe du builder (liste). Le builder est donc « thenable ».
  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    maybeSingle: () => Promise<{ data: Row | null; error: null }>;
    then: (
      onfulfilled: (value: ListResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise<unknown>;
  };

  const db = {
    tables: {} as Record<string, Row[]>,
    /** Table + colonnes + filtres de chaque requête, dans l'ordre. */
    queries: [] as Array<{
      table: string;
      columns: string;
      filters: Record<string, unknown>;
    }>,
    reset() {
      db.tables = {
        hunts: [],
        hunt_steps: [],
        hunt_players: [],
        hunt_scans: [],
        hunt_completions: [],
      };
      db.queries = [];
    },
    tablesQueried() {
      return db.queries.map((q) => q.table);
    },
  };
  db.reset();

  const cookieJar = { jar: {} as Record<string, string> };

  function createAdminClientMock() {
    return {
      from(table: string) {
        return {
          select(columns: string) {
            // L'objet `filters` est enregistré par RÉFÉRENCE puis rempli par
            // les `eq` successifs : au moment des assertions il est complet.
            const filters: Record<string, unknown> = {};
            db.queries.push({ table, columns, filters });
            const rows = () =>
              (db.tables[table] ?? []).filter((r) =>
                Object.entries(filters).every(([k, v]) => r[k] === v),
              );
            const builder: Builder = {
              eq(column, value) {
                filters[column] = value;
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

  const limiteur = {
    /** Seaux consommés, dans l'ordre : `hunt:recall:<huntId>:<hash>`. */
    seaux: [] as string[],
    /**
     * Options passées à `rateLimit`, dans le même ordre. C'est `failClosed`
     * qui décide de ce qu'un verdict INDÉTERMINÉ vaut, et sur ce chemin-ci il
     * doit valoir « laisse passer » : sinon une panne de la table de compteurs
     * ferme la seule page qui rend son code à un gagnant.
     */
    options: [] as unknown[],
    /** Verdict rendu — passer à `false` simule un seau saturé. */
    autorise: true,
    /**
     * Compteurs d'OBSERVABILITÉ consommés, dans l'ordre. Séparés des seaux :
     * ceux-ci peuvent REFUSER, ceux-là ne le peuvent pas — `observeSharedKey`
     * ne rend rien. Les mélanger ferait passer un compteur pour une porte,
     * exactement l'erreur que l'en-tête du module démonte.
     */
    compteurs: [] as Array<{ bucket: string; event: string }>,
    rateLimit(...args: unknown[]) {
      limiteur.seaux.push(String(args[0]));
      limiteur.options.push(args[2]);
      return Promise.resolve(limiteur.autorise);
    },
    observeSharedKey(...args: unknown[]) {
      limiteur.compteurs.push({
        bucket: String(args[0]),
        event: String(args[2]),
      });
      return Promise.resolve();
    },
    reset() {
      limiteur.seaux = [];
      limiteur.options = [];
      limiteur.compteurs = [];
      limiteur.autorise = true;
    },
  };

  return { db, cookieJar, createAdminClientMock, limiteur };
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
    // `getAll` sert la garde à ZÉRO requête de `loadHuntRecallContext` : le nom
    // du cookie porte l'identifiant de la chasse, encore inconnu à cet instant.
    getAll: () =>
      Object.entries(cookieJar.jar).map(([name, value]) => ({ name, value })),
  }),
  // Aucun en-tête de confiance déclaré ici : `clientIpFromHeaders` rend
  // « unknown », ce qui est le bon comportement à reproduire — l'IP n'est lue
  // que derrière un proxy déclaré, et le compteur doit rester consommé même
  // quand elle est inconnue (sinon il s'éteindrait précisément là où
  // l'exploitant croit mesurer). Il l'est, mais sous l'étiquette
  // `ip-non-mesuree` et sur un événement suffixé : un agrégat de tous les
  // visiteurs ne doit pas pouvoir se lire comme une pression mono-IP.
  headers: async () => ({ get: () => null }),
}));

// Le seau de restitution est réel en production ; ici on le pilote pour
// mesurer DEUX choses distinctes : qu'il est bien consommé (et sur quelle clé),
// et qu'un refus de sa part ferme la porte au lieu de la laisser ouverte.
vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: {
    huntRecall: { limit: 60, windowSeconds: 600 },
    huntStepIp: { limit: 200, windowSeconds: 600 },
    huntRecallIp: { limit: 200, windowSeconds: 600 },
  },
  rateLimit: (...args: unknown[]) => limiteur.rateLimit(...args),
  observeSharedKey: (...args: unknown[]) => limiteur.observeSharedKey(...args),
  rateLimitBucket: (...parts: Array<string | number>) =>
    parts.map((p) => String(p)).join(":"),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  huntTokenCookieName,
  loadHuntClaimContext,
  loadHuntPlayerProgress,
  loadHuntRecallContext,
  loadHuntStepContext,
} from "./hunt-context";

/** Le refus unique du module — recopié, car c'est sa stabilité qu'on teste. */
const UNAVAILABLE = "Cette chasse au QR n'est pas disponible.";

const HUNT_ID = "hunt-1";
const ORG_ID = "org-marcel";
const OTHER_ORG_ID = "org-voisin";
const NOW = Date.parse("2026-03-04T12:00:00.000Z");

type Over = Record<string, unknown>;

function org(over: Over = {}) {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    logo_url: null,
    subscription_status: "active",
    trial_ends_at: "2026-01-01T00:00:00.000Z",
    past_due_since: null,
    addon_hunts: true,
    comp_access: false,
    comp_access_until: null,
    timezone: "Europe/Paris",
    ...over,
  };
}

function hunt(over: Over = {}) {
  return {
    id: HUNT_ID,
    organization_id: ORG_ID,
    name: "Le trésor du marché",
    status: "active",
    starts_at: null,
    ends_at: null,
    order_mode: "free",
    min_scan_interval_seconds: 0,
    reward_label: "Un dessert offert",
    reward_details: null,
    reward_stock: null,
    reward_claimed_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    organizations: org(),
    ...over,
  };
}

function step(position: number, over: Over = {}) {
  return {
    id: `step-${position}`,
    hunt_id: HUNT_ID,
    organization_id: ORG_ID,
    position,
    label: `Étape ${position}`,
    hint_text: `Indice ${position}`,
    token: `tok-${position}`,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Chasse active à trois étapes, organisation abonnée, module ouvert. */
function seedNominal() {
  db.reset();
  db.tables.hunts = [hunt()];
  db.tables.hunt_steps = [step(1), step(2), step(3)];
}

/** Hash indépendant de l'implémentation : recalculé ici, pas importé — un
 *  test qui réutilise `hashPlayerToken` ne prouve que sa propre cohérence. */
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

beforeEach(() => {
  seedNominal();
  cookieJar.jar = {};
  limiteur.reset();
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1. Un refus unique, indistinguable
// ────────────────────────────────────────────────────────────
describe("loadHuntStepContext — un seul refus pour tous les motifs", () => {
  it("un jeton d'étape inconnu ne fait lire aucune autre table", async () => {
    // Rouge si le chargeur poursuivait la résolution après l'échec : sur un
    // endpoint ouvert à Internet, chaque lecture supplémentaire est offerte à
    // qui balaie des jetons au hasard.
    const ctx = await loadHuntStepContext("tok-inexistant");

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("jeton inconnu : la page doit être fermée");
    expect(ctx.error).toBe(UNAVAILABLE);
    expect(db.tablesQueried()).toEqual(["hunt_steps"]);
  });

  // Neuf motifs de refus distincts. Ce que ce test protège n'est pas qu'ils
  // refusent — c'est qu'ils refusent AVEC LA MÊME PHRASE. Rouge dès qu'un
  // chemin gagne un message propre (« chasse terminée », « module désactivé ») :
  // un tiers pourrait alors, à partir d'un jeton trouvé sur un flyer, déduire
  // l'état interne et jusqu'à l'existence d'une chasse.
  const refusals: Array<[string, () => string]> = [
    ["jeton d'étape inconnu", () => "tok-inexistant"],
    [
      "étape et chasse de tenants différents",
      () => {
        db.tables.hunt_steps = [step(1, { organization_id: OTHER_ORG_ID })];
        return "tok-1";
      },
    ],
    [
      "organisation embarquée incohérente",
      () => {
        db.tables.hunts = [hunt({ organizations: org({ id: OTHER_ORG_ID }) })];
        return "tok-1";
      },
    ],
    [
      "organisation embarquée absente",
      () => {
        db.tables.hunts = [hunt({ organizations: null })];
        return "tok-1";
      },
    ],
    [
      "module chasse coupé",
      () => {
        db.tables.hunts = [hunt({ organizations: org({ addon_hunts: false }) })];
        return "tok-1";
      },
    ],
    [
      "essai expiré",
      () => {
        db.tables.hunts = [
          hunt({
            organizations: org({
              subscription_status: "trialing",
              trial_ends_at: "2020-01-01T00:00:00.000Z",
            }),
          }),
        ];
        return "tok-1";
      },
    ],
    [
      "chasse en brouillon",
      () => {
        db.tables.hunts = [hunt({ status: "draft" })];
        return "tok-1";
      },
    ],
    [
      "chasse archivée",
      () => {
        db.tables.hunts = [hunt({ status: "archived" })];
        return "tok-1";
      },
    ],
    [
      "chasse pas encore ouverte",
      () => {
        db.tables.hunts = [hunt({ starts_at: "2099-01-01T00:00:00.000Z" })];
        return "tok-1";
      },
    ],
    [
      "chasse clôturée",
      () => {
        db.tables.hunts = [hunt({ ends_at: "2020-01-01T00:00:00.000Z" })];
        return "tok-1";
      },
    ],
  ];

  it("tous les motifs de refus rendent exactement la même phrase", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = new Set<string>();

    for (const [label, setup] of refusals) {
      seedNominal();
      const token = setup();
      const ctx = await loadHuntStepContext(token);
      if (ctx.ok) throw new Error(`« ${label} » aurait dû fermer la chasse`);
      messages.add(ctx.error);
    }

    expect(messages).toEqual(new Set([UNAVAILABLE]));
  });

  it("aucune progression n'est lue tant que les gardes ne sont pas passées", async () => {
    // Un joueur légitime existe, avec son cookie : le chargeur ne doit pourtant
    // toucher ni `hunt_players`, ni `hunt_scans`, ni `hunt_completions` sur une
    // chasse archivée. Rouge si la progression remontait avant les gardes —
    // le code de retrait serait alors lu (et rendu) sur une chasse fermée.
    const token = "jeton-joueur";
    db.tables.hunts = [hunt({ status: "archived" })];
    db.tables.hunt_players = [
      { id: "player-1", hunt_id: HUNT_ID, token_hash: sha256(token) },
    ];
    db.tables.hunt_completions = [
      { hunt_id: HUNT_ID, player_id: "player-1", code: "CHASSE-SECRET1" },
    ];
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = token;

    const ctx = await loadHuntStepContext("tok-1");

    expect(ctx.ok).toBe(false);
    expect(db.tablesQueried()).toEqual(["hunt_steps", "hunts"]);
  });

  it("ne demande que les colonnes publiques de l'organisation", async () => {
    // `organizations(*)` ramènerait `webhook_secret` et `stripe_customer_id`
    // dans un contexte servi à un visiteur anonyme — et le typage ne le verrait
    // pas, la ligne étant castée depuis `unknown`.
    // Rouge si la liste explicite était remplacée par une étoile.
    await loadHuntStepContext("tok-1");

    const huntsQuery = db.queries.find((q) => q.table === "hunts");
    expect(huntsQuery?.columns).toContain(
      "organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_hunts, comp_access, comp_access_until, timezone)",
    );
    expect(huntsQuery?.columns).not.toContain("organizations(*");
  });
});

// ────────────────────────────────────────────────────────────
// 2. Bornes de la fenêtre de jeu
// ────────────────────────────────────────────────────────────
describe("loadHuntStepContext — bornes de la fenêtre", () => {
  beforeEach(() => {
    // Seul `Date.now()` est figé : `new Date()` (utilisé par le calcul
    // d'abonnement) reste réel, ce qui évite de faire dépendre ces tests de
    // deux horloges à la fois.
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("une chasse qui ouvre à l'instant même est jouable", async () => {
    // Garde stricte `>` : « à partir de 10 h » doit accepter le scan de
    // 10:00:00.000. Rouge si elle devenait `>=` — le premier joueur, celui qui
    // attend devant la boutique, se verrait refuser la chasse.
    db.tables.hunts = [hunt({ starts_at: new Date(NOW).toISOString() })];

    const ctx = await loadHuntStepContext("tok-1");

    expect(ctx.ok).toBe(true);
  });

  it("une chasse qui se clôt à l'instant même est fermée", async () => {
    // Garde `<=` : « jusqu'à 18 h » ne doit pas accepter 18:00:00.000.
    // Rouge si elle devenait `<` — la borne annoncée au commerçant serait
    // dépassée d'un instant, et le lot resterait tirable après la clôture.
    db.tables.hunts = [hunt({ ends_at: new Date(NOW).toISOString() })];

    const ctx = await loadHuntStepContext("tok-1");

    expect(ctx.ok).toBe(false);
  });

  it("une milliseconde avant la clôture, la chasse est encore jouable", async () => {
    // Contre-exemple : sans lui, un chargeur qui refuserait toute chasse datée
    // passerait le test précédent.
    db.tables.hunts = [hunt({ ends_at: new Date(NOW + 1).toISOString() })];

    const ctx = await loadHuntStepContext("tok-1");

    expect(ctx.ok).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// 3. La progression n'appartient qu'à son porteur de cookie
// ────────────────────────────────────────────────────────────
describe("loadHuntPlayerProgress — le code ne quitte pas son gagnant", () => {
  const CODE = "CHASSE-ABCD1234";
  const TOKEN = "jeton-du-joueur-A";

  function seedWinner() {
    db.tables.hunt_players = [
      { id: "player-A", hunt_id: HUNT_ID, token_hash: sha256(TOKEN) },
    ];
    db.tables.hunt_completions = [
      { hunt_id: HUNT_ID, player_id: "player-A", code: CODE },
    ];
    db.tables.hunt_scans = [
      { player_id: "player-A", step_id: "step-3" },
      { player_id: "player-A", step_id: "step-1" },
    ];
  }

  it("sans cookie : progression vide, et hunt_players n'est pas interrogé", async () => {
    // Rouge si le chargeur interrogeait `hunt_players` avec un jeton absent :
    // un filtre `token_hash = undefined` est, côté PostgREST, un filtre qu'on
    // ne contrôle plus. Le total d'étapes, lui, doit rester public (la page
    // affiche « 0/3 »).
    seedWinner();

    const progress = await loadHuntPlayerProgress(createAdminClient(), HUNT_ID);

    expect(progress).toEqual({
      hasPlayer: false,
      total: 3,
      done: 0,
      stamped: [],
      completedCode: null,
    });
    expect(db.tablesQueried()).toEqual(["hunt_steps"]);
  });

  it("un cookie inconnu ne révèle jamais le code d'un autre joueur", async () => {
    // LE test du module : sur le même appareil partagé, ou après expiration
    // d'un cookie, le visiteur suivant ne doit pas hériter du code du gagnant.
    // Rouge si la complétion était lue par `hunt_id` seul, sans `player_id`.
    seedWinner();
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = "jeton-de-quelqu-un-d-autre";

    const progress = await loadHuntPlayerProgress(createAdminClient(), HUNT_ID);

    expect(progress.hasPlayer).toBe(false);
    expect(progress.completedCode).toBeNull();
    expect(progress.done).toBe(0);
    expect(JSON.stringify(progress)).not.toContain(CODE);
  });

  it("seul le SHA-256 du jeton part en base, jamais le jeton", async () => {
    // Le cookie est le mot de passe du joueur : s'il était stocké/filtré en
    // clair, une fuite de la base suffirait à rejouer n'importe quelle
    // identité. Rouge si `hashPlayerToken` sautait du filtre.
    seedWinner();
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = TOKEN;

    await loadHuntPlayerProgress(createAdminClient(), HUNT_ID);

    const playersQuery = db.queries.find((q) => q.table === "hunt_players");
    expect(playersQuery?.filters.token_hash).toBe(sha256(TOKEN));
    const allValues = db.queries.flatMap((q) => Object.values(q.filters));
    expect(allValues).not.toContain(TOKEN);
  });

  it("rend le code, les positions triées, et ignore un scan étranger à la chasse", async () => {
    // Le scan orphelin (étape d'une AUTRE chasse) ne doit pas gonfler `done` :
    // l'écran annoncerait une chasse terminée qu'aucun code ne viendrait
    // honorer. Rouge si le repli sur `posById` disparaissait, ou si le tri
    // croissant des positions sautait (les tampons s'afficheraient dans
    // l'ordre des scans, pas dans celui du parcours).
    seedWinner();
    db.tables.hunt_scans.push({ player_id: "player-A", step_id: "step-autre-chasse" });
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = TOKEN;

    const progress = await loadHuntPlayerProgress(createAdminClient(), HUNT_ID);

    expect(progress).toEqual({
      hasPlayer: true,
      total: 3,
      done: 2,
      stamped: [1, 3],
      completedCode: CODE,
    });
  });

  it("le cookie est nommé par chasse : celui d'une autre chasse n'ouvre rien", async () => {
    // Deux chasses du même commerce, deux cookies distincts. Rouge si le nom
    // du cookie perdait l'identifiant de chasse : le joueur d'une chasse
    // hériterait de l'identité qu'il a sur une autre.
    seedWinner();
    cookieJar.jar[huntTokenCookieName("hunt-2")] = TOKEN;

    const progress = await loadHuntPlayerProgress(createAdminClient(), HUNT_ID);

    expect(progress.hasPlayer).toBe(false);
    expect(progress.completedCode).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// 4. Le claim, délibérément indulgent
// ────────────────────────────────────────────────────────────
describe("loadHuntClaimContext — indulgent par décision produit", () => {
  it("accepte une chasse close, archivée et hors module", async () => {
    // NON, ce n'est pas un trou : le chargeur le documente. Le code a déjà été
    // gagné ; le rebloquer rendrait irrécupérables tous les codes non réclamés
    // dès la clôture d'une chasse. Rouge si quelqu'un « harmonisait » ce
    // chargeur avec `loadHuntStepContext` — la conséquence produit serait des
    // joueurs gagnants renvoyés sans lot.
    db.tables.hunts = [
      hunt({
        status: "archived",
        ends_at: "2020-01-01T00:00:00.000Z",
        organizations: org({ addon_hunts: false }),
      }),
    ];

    const ctx = await loadHuntClaimContext({ huntId: HUNT_ID });

    expect(ctx.ok).toBe(true);
  });

  it("refuse sans jeton ni identifiant, sans toucher la base", async () => {
    // Rouge si un appel vide dégénérait en requête non filtrée.
    const ctx = await loadHuntClaimContext({});

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("un claim sans cible doit être refusé");
    expect(ctx.error).toBe(UNAVAILABLE);
    expect(db.queries).toEqual([]);
  });

  it("refuse un identifiant de chasse inconnu et une organisation incohérente", async () => {
    // Deux refus, une seule phrase : même exigence d'absence d'oracle que la
    // page publique.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const inconnu = await loadHuntClaimContext({ huntId: "hunt-inexistant" });

    seedNominal();
    db.tables.hunts = [hunt({ organizations: org({ id: OTHER_ORG_ID }) })];
    const incoherent = await loadHuntClaimContext({ huntId: HUNT_ID });

    expect(inconnu.ok).toBe(false);
    expect(incoherent.ok).toBe(false);
    if (inconnu.ok || incoherent.ok) throw new Error("ces deux cas doivent être refusés");
    expect(inconnu.error).toBe(UNAVAILABLE);
    expect(incoherent.error).toBe(UNAVAILABLE);
  });

  it("résout la chasse depuis un jeton d'étape", async () => {
    // Rouge si la résolution par jeton disparaissait : le bouton « récupérer
    // mon code » de la page d'étape n'a que ce jeton à envoyer.
    const ctx = await loadHuntClaimContext({ stepToken: "tok-2" });

    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.hunt.id).toBe(HUNT_ID);
    expect(ctx.organization.id).toBe(ORG_ID);
  });

  // ── ÉTAT ACTUEL, PAS GARANTIE SOUHAITABLE ────────────────────────────
  // `loadHuntStepContext` vérifie `step.organization_id === hunt.organization_id` ;
  // `loadHuntClaimContext` ne le fait PAS. L'asymétrie n'est pas exploitable en
  // l'état (la suite du claim rescope tout sur `hunt.id`, et l'étape ne sert
  // qu'à trouver cet identifiant), mais elle est réelle et signalée.
  // Si ce test rougit parce que la garde a été ajoutée : SUPPRIMEZ-LE, il ne
  // décrit qu'un état qu'on ne défend pas.
  it("[état actuel] ne revérifie pas le tenant de l'étape (asymétrie assumée)", async () => {
    db.tables.hunt_steps = [step(1, { organization_id: OTHER_ORG_ID })];

    const parStep = await loadHuntClaimContext({ stepToken: "tok-1" });
    const parPage = await loadHuntStepContext("tok-1");

    expect(parStep.ok).toBe(true);
    expect(parPage.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 4bis. La RESTITUTION du code quand la page d'étape a fermé
//
// LE DÉFAUT FERMÉ : `loadHuntStepContext` refuse sur le statut et sur la
// fenêtre AVANT de charger la progression, et la page rend 404. Or le code
// `CHASSE-…` n'existe QUE sur cette page. Le joueur qui terminait le dernier
// jour sans laisser son e-mail — l'écran lui dit que le code reste affiché,
// et l'ADR-024 fonde là-dessus le caractère facultatif de l'e-mail — perdait
// l'accès à un code que la caisse honore pourtant toujours
// (`redeem_hunt_completion` ne teste ni statut ni fenêtre).
//
// CE QUI NE DOIT PAS S'OUVRIR AU PASSAGE : le jeu. `stampHuntStep` n'appelle
// que `loadHuntStepContext`, qui reste strict — le premier test ci-dessous
// l'épingle.
// ────────────────────────────────────────────────────────────
describe("loadHuntRecallContext — le code se relit, la chasse ne se rejoue pas", () => {
  const CODE = "CHASSE-ZZZZ9999";
  const TOKEN = "jeton-du-gagnant";

  function seedGagnantSurChasseClose(over: Over = {}) {
    db.tables.hunts = [
      hunt({ status: "archived", ends_at: "2020-01-01T00:00:00.000Z", ...over }),
    ];
    db.tables.hunt_players = [
      { id: "player-A", hunt_id: HUNT_ID, token_hash: sha256(TOKEN) },
    ];
    db.tables.hunt_completions = [
      { hunt_id: HUNT_ID, player_id: "player-A", code: CODE },
    ];
    db.tables.hunt_scans = [
      { player_id: "player-A", step_id: "step-1" },
      { player_id: "player-A", step_id: "step-2" },
      { player_id: "player-A", step_id: "step-3" },
    ];
    cookieJar.jar = { [huntTokenCookieName(HUNT_ID)]: TOKEN };
  }

  it("LE JEU RESTE FERMÉ — c'est la garantie la plus importante du correctif", () => {
    // ROUGE SI : quelqu'un « harmonise » les deux chargeurs en assouplissant
    // `loadHuntStepContext`. C'est lui, et lui SEUL, que `stampHuntStep`
    // appelle : l'assouplir rouvrirait scan et progression hors fenêtre, sur
    // une chasse que le commerçant croit close.
    const source = readFileSync("src/actions/hunts.ts", "utf8");
    expect(source, "stampHuntStep ne garde plus le contexte strict").toContain(
      "loadHuntStepContext(parsed.data.stepToken)",
    );
    expect(
      source,
      "le chargeur de restitution est devenu accessible à une action d'écriture",
    ).not.toContain("loadHuntRecallContext");
  });

  it("rend le code d'un gagnant sur une chasse archivée ET hors fenêtre", async () => {
    seedGagnantSurChasseClose();

    const strict = await loadHuntStepContext("tok-1");
    const recall = await loadHuntRecallContext("tok-1");

    // TÉMOIN : la porte d'origine est bien fermée, sinon ce test ne mesure rien.
    expect(strict.ok, "TÉMOIN : la page d'étape doit encore refuser").toBe(false);
    expect(recall.ok).toBe(true);
    if (!recall.ok) throw new Error(recall.error);
    expect(recall.progress.completedCode).toBe(CODE);
    expect(recall.step.token).toBe("tok-1");
    expect(recall.organization.id).toBe(ORG_ID);
  });

  it("SANS complétion sur cet appareil, il refuse comme avant", async () => {
    // La permission d'entrer, c'est le gain lui-même. Sans elle cette porte
    // dirait à n'importe quel visiteur qu'une chasse close existe à ce jeton —
    // un oracle que la 404 d'origine ne donnait pas.
    seedGagnantSurChasseClose();
    cookieJar.jar = {};

    const recall = await loadHuntRecallContext("tok-1");

    expect(recall.ok).toBe(false);
    if (recall.ok) throw new Error("un visiteur sans gain doit être refusé");
    expect(recall.error).toBe(UNAVAILABLE);
  });

  it("le cookie d'un AUTRE joueur ne relit pas le code", async () => {
    seedGagnantSurChasseClose();
    cookieJar.jar = { [huntTokenCookieName(HUNT_ID)]: "jeton-du-voisin" };

    const recall = await loadHuntRecallContext("tok-1");

    expect(recall.ok).toBe(false);
  });

  // ── LES TROIS BORNES ──────────────────────────────────────
  // Ce chargeur vit sur une page publique `force-dynamic` : quiconque
  // photographie le QR d'une étape en boutique peut le rejouer. Ce qu'on
  // mesure ici n'est pas « il refuse » (c'était déjà vrai) mais « il refuse
  // SANS TRAVAILLER » — le nombre de lectures `service_role` avant le refus.
  it("SANS aucun cookie de chasse, il refuse à ZÉRO requête", async () => {
    seedGagnantSurChasseClose();
    cookieJar.jar = {};
    db.queries = [];

    const recall = await loadHuntRecallContext("tok-1");

    expect(recall.ok).toBe(false);
    // ROUGE SI la garde à zéro requête disparaît : le refus coûterait alors
    // trois lectures, offertes à n'importe qui, sur une chasse archivée.
    expect(db.tablesQueried()).toEqual([]);
    // Et aucun jeton n'est brûlé sur un porteur qui n'existe pas.
    expect(limiteur.seaux).toEqual([]);
  });

  it("un cookie d'une AUTRE chasse ne va pas plus loin qu'UNE requête", async () => {
    seedGagnantSurChasseClose();
    cookieJar.jar = { [huntTokenCookieName("hunt-voisine")]: TOKEN };
    db.queries = [];

    const recall = await loadHuntRecallContext("tok-1");

    expect(recall.ok).toBe(false);
    // Le jeton d'étape suffit à résoudre l'étape, jamais à deviner
    // l'identifiant interne de la chasse : la porte se referme là.
    expect(db.tablesQueried()).toEqual(["hunt_steps"]);
  });

  it("le seau porte l'IDENTITÉ du joueur, jamais le jeton d'étape ni l'IP", async () => {
    // ROUGE SI le seau change de clé. Une clé PARTAGÉE (jeton d'étape, IP)
    // ferait de ce seau un interrupteur : un seul abuseur fermerait la carte de
    // victoire de tous les joueurs d'un même lieu (ADR-032).
    seedGagnantSurChasseClose();

    await loadHuntRecallContext("tok-1");

    expect(limiteur.seaux).toEqual([`hunt:recall:${HUNT_ID}:${sha256(TOKEN)}`]);
    expect(limiteur.seaux[0]).not.toContain("tok-1");
  });

  it("la PRESSION est comptée sur (chasse, IP), sur un seau DISTINCT de la page d'étape", async () => {
    // CE QUE FERME CE COMPTEUR. Le seau d'identité ci-dessus ne borne pas un
    // DÉBIT : sa clé est le hash de la VALEUR d'un cookie que le porteur
    // choisit, donc un script ouvre un seau neuf à chaque requête et aucun ne se
    // remplit. C'était écrit depuis un chantier, sans que rien ne soit posé —
    // le raisonnement sautait le terme moyen d'ADR-032, qui prescrit sur une
    // clé partagée un compteur LARGE et fail-OPEN. L'IP est la seule clé de ce
    // chemin que l'appelant ne choisit pas.
    //
    // ROUGE SI le seau devient `hunt:step:ip` « puisque c'est la même page » :
    // ce chargeur ne tourne qu'APRÈS le refus de `loadHuntStepContext`, qui a
    // déjà compté cette même requête — un passage compterait pour deux, et le
    // rapport entre les deux séries, qui est l'information utile, deviendrait
    // faux.
    seedGagnantSurChasseClose();

    await loadHuntRecallContext("tok-1");

    expect(limiteur.compteurs).toEqual([
      {
        bucket: `hunt:recall:ip:${HUNT_ID}:ip-non-mesuree`,
        event: "hunt_recall_ip_pressure.ip_non_mesuree",
      },
    ]);
    // Ni le jeton d'étape (un QR de vitrine : le compteur suivrait l'affiche),
    // ni le hash du cookie (que l'appelant choisit, donc un compteur qui ne se
    // remplit jamais — le défaut même qu'on ferme ici).
    expect(limiteur.compteurs[0].bucket).not.toContain("tok-1");
    expect(limiteur.compteurs[0].bucket).not.toContain(sha256(TOKEN));
  });

  it("le compteur est posé AVANT le seau d'identité, et ne refuse rien", async () => {
    // L'ORDRE est l'assertion. Après le seau, le compteur ne verrait plus la
    // population qu'il est censé mesurer : celle qui sature le seau justement
    // parce qu'elle en change à chaque coup. Et il ne doit RIEN fermer — le
    // `failClosed: false` de la garde 3 resterait sans objet si un compteur
    // posé au-dessus pouvait refuser à sa place.
    seedGagnantSurChasseClose();
    limiteur.autorise = false;

    const recall = await loadHuntRecallContext("tok-1");

    // Le seau saturé a refusé (assertion voisine) ; le compteur, lui, a bien été
    // consommé AVANT — donc il compte aussi les requêtes que le seau rejette.
    expect(recall.ok).toBe(false);
    expect(limiteur.compteurs).toHaveLength(1);
  });

  it("un jeton d'étape inconnu ne compte RIEN — il n'y a pas de chasse à nommer", async () => {
    // Miroir de la page d'étape : le compteur est posé après la résolution de
    // l'étape, sinon l'attaquant choisirait lui-même la clé sur laquelle il est
    // compté en inventant des identifiants de chasse.
    seedGagnantSurChasseClose();

    const recall = await loadHuntRecallContext("tok-inexistant");

    expect(recall.ok).toBe(false);
    expect(limiteur.compteurs).toEqual([]);
  });

  it("un verdict INDÉTERMINÉ laisse passer le gagnant — `failClosed: false`", async () => {
    // ROUGE SI quelqu'un repasse ce seau en `failClosed: true` « par
    // cohérence » avec les autres seaux d'identité du dépôt.
    //
    // `rateLimit` rend `false` quand `check_rate_limit` échoue ET que le seau
    // est fail-closed. Ce chemin est le SEUL endroit où un gagnant peut relire
    // son code `CHASSE-…` une fois la chasse close : le fermer sur une panne de
    // la table de compteurs refuse un lot réel, dû, encore encaissable en
    // caisse. Et il le refuse de travers — pendant le MÊME incident, une chasse
    // ENCORE ACTIVE continue de répondre, `loadHuntStepContext` ne REFUSANT
    // rien (son `huntStepIp` compte, il ne ferme pas). Une chasse close serait
    // donc moins accessible qu'une chasse ouverte, au moment précis où cette
    // page est son seul recours.
    //
    // Le calcul du fail-closed suppose qu'un rejeu non borné coûte quelque
    // chose : ici il n'écrit rien, ne rend pas le client admin, et exige une
    // complétion déjà acquise par le cookie.
    seedGagnantSurChasseClose();

    await loadHuntRecallContext("tok-1");

    expect(limiteur.options).toEqual([{ failClosed: false }]);
  });

  it("seau saturé : refus générique, et la lecture de la chasse n'a pas lieu", async () => {
    seedGagnantSurChasseClose();
    limiteur.autorise = false;
    db.queries = [];

    const recall = await loadHuntRecallContext("tok-1");

    expect(recall.ok).toBe(false);
    if (recall.ok) throw new Error("un seau saturé doit refuser");
    // Le refus reste LE refus du module : dire « trop de tentatives » ici
    // révélerait qu'une chasse existe derrière ce jeton.
    expect(recall.error).toBe(UNAVAILABLE);
    expect(db.tablesQueried()).toEqual(["hunt_steps"]);
  });

  it("le gagnant légitime paie exactement les mêmes lectures qu'avant les bornes", async () => {
    // TÉMOIN de non-régression : les bornes ne doivent rien coûter au parcours
    // légitime, ni en lectures ni en refus. Un joueur qui recharge sa carte de
    // victoire trois fois de suite reste servi les trois fois.
    seedGagnantSurChasseClose();
    db.queries = [];

    for (let i = 0; i < 3; i += 1) {
      const recall = await loadHuntRecallContext("tok-1");
      expect(recall.ok, `rechargement ${i + 1}`).toBe(true);
    }

    expect(db.tablesQueried()).toEqual([
      // Un passage = étape, chasse, puis la progression (étapes, joueur, scans,
      // complétion). Trois passages identiques, aucune lecture ajoutée.
      ...["hunt_steps", "hunts", "hunt_steps", "hunt_players", "hunt_scans", "hunt_completions"],
      ...["hunt_steps", "hunts", "hunt_steps", "hunt_players", "hunt_scans", "hunt_completions"],
      ...["hunt_steps", "hunts", "hunt_steps", "hunt_players", "hunt_scans", "hunt_completions"],
    ]);
  });

  it("indulgent sur l'abonnement, strict sur le tenant", async () => {
    // Indulgent comme `loadHuntClaimContext` : un abonnement expiré n'annule
    // pas les codes que la caisse honore encore, les cacher les rendrait
    // seulement illisibles. Strict, en revanche, sur la cohérence de tenant —
    // c'est une lecture `service_role`, qui contourne la RLS.
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedGagnantSurChasseClose({ organizations: org({ addon_hunts: false }) });
    const sansAbonnement = await loadHuntRecallContext("tok-1");

    seedGagnantSurChasseClose({ organizations: org({ id: OTHER_ORG_ID }) });
    const tenantIncoherent = await loadHuntRecallContext("tok-1");

    expect(sansAbonnement.ok).toBe(true);
    expect(tenantIncoherent.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 5. Cas nominal
// ────────────────────────────────────────────────────────────
describe("loadHuntStepContext — cas nominal", () => {
  it("rend l'étape, la chasse, l'organisation et une progression vide", async () => {
    // Rouge si l'étape rendue cessait d'être celle du jeton demandé (le joueur
    // verrait l'indice d'une autre étape), ou si la progression n'était plus
    // chargée du tout (le compteur de tampons resterait figé).
    const ctx = await loadHuntStepContext("tok-2");

    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.step.position).toBe(2);
    expect(ctx.step.token).toBe("tok-2");
    expect(ctx.hunt.id).toBe(HUNT_ID);
    expect(ctx.organization.id).toBe(ORG_ID);
    expect(ctx.progress).toEqual({
      hasPlayer: false,
      total: 3,
      done: 0,
      stamped: [],
      completedCode: null,
    });
  });
});

// ────────────────────────────────────────────────────────────
// 6. Le coût public du chargeur d'étape, mesuré — et l'absence de seau,
//    qui est une DÉCISION et non un oubli.
//
// `loadHuntStepContext` est consigné « non borné » dans docs/bugs.md depuis
// quatre chantiers, avec un coût annoncé « ~4 lectures » que personne n'avait
// compté. Les deux premiers tests le comptent : c'est la seule façon de savoir
// si un futur ajout de lecture aggrave l'amplification, et le préalable à toute
// décision de la réduire (un coût qu'on n'a pas mesuré, on ne le voit pas
// doubler).
//
// Les suivants épinglent l'absence de tout REFUS, et la présence du COMPTEUR
// qui l'accompagne. Le refus rougira le jour où quelqu'un en posera un — et
// c'est voulu : l'en-tête de la fonction explique pourquoi aucune des trois
// clés disponibles (jeton d'étape, IP, cookie) ne peut porter un refus sans
// être soit l'interrupteur qu'ADR-032 interdit, soit une garde décorative
// assise sur la route que l'abuseur ne prend jamais. Rouvrir la décision est
// légitime ; la rouvrir SANS LA LIRE ne l'est pas.
// ────────────────────────────────────────────────────────────
describe("loadHuntStepContext — coût public mesuré, aucun refus", () => {
  it("un visiteur sans cookie coûte exactement trois lectures", async () => {
    // Le cas de l'amplification : quiconque photographie le QR de vitrine
    // obtient ceci, autant de fois qu'il le demande. Rouge si une lecture
    // s'ajoutait sur ce chemin — c'est la page publique la plus exposée du
    // module, et la seule dont le coût ne soit borné par rien.
    const ctx = await loadHuntStepContext("tok-1");

    expect(ctx.ok).toBe(true);
    expect(db.tablesQueried()).toEqual(["hunt_steps", "hunts", "hunt_steps"]);
  });

  it("un cookie de chasse ARBITRAIRE en coûte quatre — le vrai plancher", async () => {
    // LE TROISIÈME CAS, que les comptes précédents ne nommaient pas : le nom du
    // cookie est `lc-hunt-<huntId>` et un en-tête ne coûte rien à fabriquer.
    // Aucune ligne `hunt_players` ne correspond, la résolution s'arrête là —
    // mais une lecture de plus a déjà eu lieu. Le coût minimal d'un abuseur est
    // donc QUATRE, pas trois : c'est le chiffre à surveiller, et le seul des
    // trois qui décrive quelqu'un qui ne joue pas.
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = "cookie-fabrique";

    const ctx = await loadHuntStepContext("tok-1");

    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error(ctx.error);
    // Le cookie n'ouvre rien : la progression reste celle d'un inconnu.
    expect(ctx.progress.hasPlayer).toBe(false);
    expect(db.tablesQueried()).toEqual([
      "hunt_steps",
      "hunts",
      "hunt_steps",
      "hunt_players",
    ]);
  });

  it("un joueur qui revient en coûte six", async () => {
    // Chemin légitime le plus cher. Il ne doit surtout PAS devenir moins
    // accessible que le précédent : c'est le joueur en cours de partie.
    const token = "jeton-du-joueur";
    db.tables.hunt_players = [
      { id: "player-1", hunt_id: HUNT_ID, token_hash: sha256(token) },
    ];
    db.tables.hunt_scans = [{ player_id: "player-1", step_id: "step-1" }];
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = token;

    const ctx = await loadHuntStepContext("tok-2");

    expect(ctx.ok).toBe(true);
    expect(db.tablesQueried()).toEqual([
      "hunt_steps",
      "hunts",
      "hunt_steps",
      "hunt_players",
      "hunt_scans",
      "hunt_completions",
    ]);
  });

  it("aucun seau BLOQUANT n'est consommé, ni avec cookie ni sans", async () => {
    // ROUGE SI un seau apparaît ici. Avant de le rendre vert en ajustant ce
    // test, répondre à la question de l'en-tête : lequel des trois cas
    // ce seau ferme-t-il, et sur quelle clé, sans être un interrupteur ?
    // Le compteur d'observabilité, lui, est mesuré séparément juste en dessous :
    // il ne peut PAS refuser, `observeSharedKey` ne rendant rien.
    await loadHuntStepContext("tok-1");

    const token = "jeton-du-joueur";
    db.tables.hunt_players = [
      { id: "player-1", hunt_id: HUNT_ID, token_hash: sha256(token) },
    ];
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = token;
    await loadHuntStepContext("tok-1");

    expect(limiteur.seaux).toEqual([]);
  });

  it("la PRESSION est comptée sur (chasse, IP), après résolution de l'étape", async () => {
    // Ce que ferme ce compteur : l'amplification passait par le chemin SANS
    // cookie et n'était mesurée nulle part. Un coût qu'on ne compte pas, on ne
    // le voit pas doubler.
    //
    // ROUGE SI la clé change. Elle ne doit contenir NI le jeton d'étape (un QR
    // de vitrine : le compteur suivrait l'affiche et non le visiteur) NI le
    // hash d'un cookie (que l'appelant choisit, donc un compteur qui ne se
    // remplit jamais).
    await loadHuntStepContext("tok-1");

    // Aucun proxy déclaré dans ce harnais : l'IP est illisible, et c'est ÉCRIT
    // dans la clé comme dans l'événement plutôt que fondu dans un seau
    // `…:unknown` qu'un lecteur de la supervision prendrait pour une adresse.
    expect(limiteur.compteurs).toEqual([
      {
        bucket: `hunt:step:ip:${HUNT_ID}:ip-non-mesuree`,
        event: "hunt_step_ip_pressure.ip_non_mesuree",
      },
    ]);
    expect(limiteur.compteurs[0].bucket).not.toContain("tok-1");
  });

  it("un jeton d'étape inconnu ne compte RIEN — il n'y a pas de chasse à nommer", async () => {
    // Le compteur est posé APRÈS la résolution de l'étape. Un balayage de
    // jetons au hasard s'arrête donc une lecture plus tôt, sans écrire de seau :
    // sinon un attaquant choisirait lui-même la clé sur laquelle il est compté,
    // en inventant des identifiants de chasse.
    const ctx = await loadHuntStepContext("tok-inexistant");

    expect(ctx.ok).toBe(false);
    expect(limiteur.compteurs).toEqual([]);
  });

  it("TÉMOIN : le chargeur de RAPPEL, lui, en consomme un", async () => {
    // Sans ce témoin, les trois assertions ci-dessus resteraient vertes même
    // si le double de `rateLimit` avait cessé d'enregistrer quoi que ce soit —
    // c'est très exactement de cette façon que quatre harnais ont menti sur ce
    // projet. Ici, la preuve que le compteur voit bien les seaux vient d'un
    // chemin voisin qui, lui, en pose un (ADR-070).
    const token = "jeton-du-gagnant";
    db.tables.hunt_players = [
      { id: "player-1", hunt_id: HUNT_ID, token_hash: sha256(token) },
    ];
    db.tables.hunt_completions = [
      { hunt_id: HUNT_ID, player_id: "player-1", code: "CHASSE-ABCD1234" },
    ];
    cookieJar.jar[huntTokenCookieName(HUNT_ID)] = token;

    const ctx = await loadHuntRecallContext("tok-1");

    expect(ctx.ok).toBe(true);
    expect(limiteur.seaux).toEqual([`hunt:recall:${HUNT_ID}:${sha256(token)}`]);
  });
});
