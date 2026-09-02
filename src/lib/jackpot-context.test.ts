// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// jackpot-context — LA BASCULE DU JACKPOT (ID-8b) : le cookie du module
// d'abord, l'identité globale ensuite.
//
// LA PROMESSE DU LOT : un client dont le cookie `lc-jackpot-<campagne>` a
// disparu, mais dont l'appareil est connu, RETROUVE SA PARTICIPATION — et
// surtout SES CODES DE RETRAIT. Un lot gagné et non retiré cessait de
// s'afficher alors que son code restait valable au comptoir : c'est la perte la
// plus dure du module.
//
// LA NON-RÉGRESSION QUI COMPTE LE PLUS : un client avec son cookie intact garde
// exactement le même joueur qu'avant. Personne ne doit changer d'identité en
// silence — ADR-041, le double chemin est un ORDRE, pas un remplacement.
// Inverser les deux étages changerait l'identité de TOUS les porteurs de cookie
// valable le jour du déploiement, sans un mot dans le journal.
//
// LE PIÈGE QUE CE BLOC SURVEILLE : `jackpot_players.token_hash` est un SHA-256
// NU du cookie du module ; l'empreinte de l'identité globale est SALÉE et
// versionnée. Les deux font 64 hexadécimaux, passent le même contrôle de forme,
// et les substituer ne lèverait AUCUNE erreur — zéro joueur, partout, sans une
// ligne de journal. C'est pourquoi l'empreinte globale est ici une valeur qui
// ne doit apparaître dans AUCUNE requête.
// ────────────────────────────────────────────────────────────

const { db, cookieJar, createAdminClientMock } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type ListResult = { data: Row[]; error: unknown };

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

  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    in: (column: string, values: unknown[]) => Builder;
    limit: (count: number) => Builder;
    order: (column: string, opts: { ascending: boolean }) => Builder;
    maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
    then: (
      onfulfilled: (value: ListResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise<unknown>;
  };

  type QueryEntry = {
    table: string;
    columns: string;
    filters: Record<string, unknown>;
    inFilter?: { column: string; values: unknown[] };
    order?: { column: string; ascending: boolean };
  };

  const db = {
    tables: {} as Record<string, Row[]>,
    queries: [] as QueryEntry[],
    /** Tables dont la lecture doit RÉPONDRE EN PANNE (repli best-effort). */
    enPanne: new Set<string>(),
    reset(): void {
      db.tables = {
        jackpot_campaigns: [],
        jackpot_players: [],
        jackpot_wins: [],
      };
      db.queries = [];
      db.enPanne = new Set<string>();
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
      rpc(_name: string, _args: Record<string, unknown>) {
        void _name;
        void _args;
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        return {
          select(columns: string) {
            const entry: QueryEntry = { table, columns, filters: {} };
            db.queries.push(entry);
            const panne = () =>
              db.enPanne.has(table)
                ? { message: `lecture ${table} indisponible` }
                : null;
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
              limit() {
                return builder;
              },
              order(column, opts) {
                entry.order = { column, ascending: opts.ascending };
                return builder;
              },
              maybeSingle: async () => {
                const error = panne();
                return { data: error ? null : rows()[0] ?? null, error };
              },
              then: (onfulfilled, onrejected) => {
                const error = panne();
                return Promise.resolve<ListResult>({
                  data: error ? [] : rows(),
                  error,
                }).then(onfulfilled, onrejected);
              },
            };
            return builder;
          },
        };
      },
    };
  }

  return { db, cookieJar, createAdminClientMock };
});

/**
 * L'IDENTITÉ GLOBALE — le second chemin de résolution du joueur.
 *
 * Doublée, et jamais exécutée pour de vrai : `peekPlayerDeviceTokenHash` lit un
 * cookie salé par `PLAYER_KEY_SALT` et `lookupLegacyIdentityHashes` appelle une
 * RPC. Ce fichier éprouve l'ORDRE de résolution et la portée des requêtes qui
 * en découlent, pas le pont lui-même (couvert par player-identity.test.ts).
 *
 * Le défaut par DÉFAUT est « aucune identité globale » : c'est exactement
 * l'état d'avant ce lot.
 */
const { identiteGlobale } = vi.hoisted(() => ({
  identiteGlobale: {
    /** Empreinte SALÉE du cookie `lc-player`, ou `null` (visiteur neuf). */
    empreinte: null as string | null,
    /** Empreintes de MODULE rendues par le pont, de la plus récente d'abord. */
    anciennes: [] as string[],
    /** Portées passées au pont, dans l'ordre — l'isolement s'y assert. */
    portees: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/lib/player-identity", () => ({
  peekPlayerDeviceTokenHash: () => Promise.resolve(identiteGlobale.empreinte),
  lookupLegacyIdentityHashes: (portee: Record<string, unknown>) => {
    identiteGlobale.portees.push(portee);
    return Promise.resolve(identiteGlobale.anciennes);
  },
}));

const { compteurs } = vi.hoisted(() => ({ compteurs: [] as string[] }));
vi.mock("@/lib/monitoring", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordCounter: (op: string) => {
    compteurs.push(op);
  },
}));

// Ce fichier éprouve la RÉSOLUTION D'IDENTITÉ, pas le garde-barrière d'accès au
// module (couvert par module-acces-public.test.ts) : la porte est ouverte pour
// que les assertions d'identité puissent rougir seules.
vi.mock("@/lib/module-acces-public", () => ({
  moduleOuvertAuJoueur: () => Promise.resolve(true),
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

import { jackpotTokenCookieName, loadJackpotContext } from "./jackpot-context";

// UUID réels : `fetchCampaignWithOrg` résout par `id` OU par `public_slug`
// selon la FORME reçue, et le repli d'identité valide l'UUID de la campagne.
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

/** Cookie de module du joueur courant — un porteur valable 180 jours. */
const TOKEN = "jeton-jackpot-de-marco";
/** Empreinte SALÉE de l'appareil : elle n'entre dans aucune requête. */
const EMPREINTE_APPAREIL = "f".repeat(64);
/** Le cookie jackpot d'AVANT, dont seul le hash survit en base. */
const VIEUX_COOKIE = "jeton-jackpot-d-avant-le-nettoyage";
/** Secret de rotation : le fabriquer = fabriquer des participations. */
const SECRET_ROTATIF = "s3cr3t-de-rotation-du-jackpot";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type Over = Record<string, unknown>;

function org(over: Over = {}) {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    logo_url: null,
    subscription_status: "active",
    trial_ends_at: null,
    past_due_since: null,
    addon_jackpot: true,
    comp_access: false,
    comp_access_until: null,
    timezone: "Europe/Paris",
    webhook_secret: "whsec-du-commerce",
    ...over,
  };
}

function campaign(over: Over = {}) {
  return {
    id: CAMPAIGN_ID,
    organization_id: ORG_ID,
    name: "Le pot de Marcel",
    status: "active",
    public_slug: "pot-de-marcel",
    validation_mode: "staff",
    rotating_period_seconds: 60,
    min_participation_interval_seconds: 300,
    draw_mode: "threshold_draw",
    threshold: 50,
    draw_at: null,
    reward_label: "Une tournée",
    reward_details: null,
    reward_stock: 5,
    reward_claimed_count: 0,
    display_base_cents: 0,
    display_increment_cents: 100,
    merchant_content: null,
    current_count: 12,
    cycle: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    // Colonnes JAMAIS demandées : présentes pour que la projection ait quelque
    // chose à retenir.
    rotating_secret: SECRET_ROTATIF,
    win_probability: 0.05,
    organizations: org(),
    ...over,
  };
}

function joueur(over: Over = {}) {
  return {
    campaign_id: CAMPAIGN_ID,
    token_hash: sha256(VIEUX_COOKIE),
    participation_count: 4,
    last_participation_at: "2026-02-01T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  db.reset();
  db.tables.jackpot_campaigns = [campaign()];
  cookieJar.jar = {};
  identiteGlobale.empreinte = null;
  identiteGlobale.anciennes = [];
  identiteGlobale.portees = [];
  compteurs.length = 0;
});

describe("jackpot — l'identité globale rattrape le cookie perdu", () => {
  it("LA PROMESSE : cookie de campagne disparu, appareil connu → la participation revient", async () => {
    // Le client a nettoyé son navigateur. Son `lc-jackpot-…` n'existe plus,
    // mais son `lc-player` oui, et le pont `jackpot` a été posé à chaque
    // participation. Rouge si le joueur restait « inconnu » : une jauge qu'il a
    // contribué à remplir, remise à zéro sous ses yeux.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur()];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player).toMatchObject({
      hasIdentity: true,
      participationCount: 4,
      lastParticipationAt: "2026-02-01T10:00:00.000Z",
    });
    // Le repli SE COMPTE : zéro est la valeur attendue tant que personne n'a
    // perdu son cookie.
    expect(compteurs).toContain("jackpot.joueur.repli_identite_globale");
  });

  it("LE LOT NON RETIRÉ SUIT L'EMPREINTE RATTRAPÉE, pas le cookie absent", async () => {
    // La perte la plus dure du module : un code de retrait valable au comptoir
    // qui cesse de s'afficher. Rouge si les gains restaient lus sous
    // l'empreinte du cookie.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur()];
    db.tables.jackpot_wins = [
      {
        id: "gain-1",
        campaign_id: CAMPAIGN_ID,
        cycle: 1,
        code: "JACKPOT-MARCO42",
        drawn_at: "2026-02-01T11:00:00.000Z",
        redeemed_at: null,
        winner_token_hash: sha256(VIEUX_COOKIE),
      },
    ];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.wins).toEqual([
      {
        id: "gain-1",
        cycle: 1,
        code: "JACKPOT-MARCO42",
        drawnAt: "2026-02-01T11:00:00.000Z",
        redeemedAt: null,
      },
    ]);
  });

  it("interroge le pont sur la portée de LA CAMPAGNE, jamais plus large", async () => {
    // La famille et l'expérience sont ce qui empêche l'empreinte d'un autre
    // module — ou d'une autre campagne — d'entrer dans la requête.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur()];

    await loadJackpotContext(CAMPAIGN_ID);

    expect(identiteGlobale.portees).toEqual([
      {
        deviceTokenHash: EMPREINTE_APPAREIL,
        organizationId: ORG_ID,
        experienceKind: "jackpot",
        experienceId: CAMPAIGN_ID,
      },
    ]);
  });

  it("L'EMPREINTE SALÉE N'ENTRE DANS AUCUN FILTRE — le piège du hachage", async () => {
    // `hashPlayerDeviceToken` (salé, versionné) et `hashPlayerToken` (SHA-256
    // nu) ne sont PAS interchangeables, et les substituer ne lève rien : la
    // requête ne trouve plus personne, partout, en silence. C'est le SEUL filet
    // du dépôt contre cette faute sur ce module.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur()];

    await loadJackpotContext(CAMPAIGN_ID);

    expect(JSON.stringify(db.queries)).not.toContain(EMPREINTE_APPAREIL);
    const repli = db.queriesOn("jackpot_players")[0];
    expect(repli.filters.campaign_id).toBe(CAMPAIGN_ID);
    expect(repli.inFilter).toEqual({
      column: "token_hash",
      values: [sha256(VIEUX_COOKIE)],
    });
  });

  it("NON-RÉGRESSION : cookie intact → le MÊME joueur, et le repli n'est jamais consulté", async () => {
    // La garde qui compte le plus. Rouge si l'identité globale passait devant :
    // tous les porteurs de cookie valable changeraient d'identité en silence le
    // jour du déploiement, et ADR-041 interdit précisément de réinterpréter une
    // progression existante.
    cookieJar.jar[jackpotTokenCookieName(CAMPAIGN_ID)] = TOKEN;
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    // Le pont désignerait un AUTRE joueur : il ne doit même pas être interrogé.
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [
      joueur({ token_hash: sha256(TOKEN), participation_count: 7 }),
      joueur(),
    ];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.participationCount).toBe(7);
    expect(identiteGlobale.portees).toEqual([]);
    expect(db.queriesOn("jackpot_players")).toHaveLength(1);
    expect(compteurs).not.toContain("jackpot.joueur.repli_identite_globale");
  });

  it("le cloisonnement par campagne tient sur le chemin de repli aussi", async () => {
    // Même empreinte de module, autre campagne : invisible. Rouge si le filtre
    // `campaign_id` sautait du `in (…)` — la participation d'un commerce
    // s'afficherait sur la page d'un autre.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur({ campaign_id: OTHER_CAMPAIGN_ID })];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.hasIdentity).toBe(false);
    expect(ctx.player.participationCount).toBe(0);
  });

  it("plusieurs anciennes empreintes : c'est la PLUS RÉCENTE qui gagne", async () => {
    // La RPC rend ses empreintes triées de la plus récemment vue à la plus
    // ancienne. Rouge si l'ordre rendu par la base l'emportait.
    const ENCORE_PLUS_VIEUX = "jeton-de-l-annee-derniere";
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE), sha256(ENCORE_PLUS_VIEUX)];
    db.tables.jackpot_players = [
      joueur({ token_hash: sha256(ENCORE_PLUS_VIEUX), participation_count: 1 }),
      joueur({ participation_count: 4 }),
    ];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.participationCount).toBe(4);
  });

  it("cookie posé mais sans ligne joueur : le repli le rattrape", async () => {
    // Le cas du mode staff — un cookie neuf est posé avant la première
    // validation. Le cookie a bien été essayé EN PREMIER : deux lectures, dans
    // cet ordre.
    cookieJar.jar[jackpotTokenCookieName(CAMPAIGN_ID)] = TOKEN;
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur()];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.participationCount).toBe(4);
    expect(db.queriesOn("jackpot_players")).toHaveLength(2);
    expect(db.queriesOn("jackpot_players")[0].filters.token_hash).toBe(
      sha256(TOKEN),
    );
  });

  it("visiteur neuf : aucune identité, aucune lecture d'identité", async () => {
    // Ni cookie de module, ni cookie global. Rouge si le chargeur interrogeait
    // quand même `jackpot_players` : une requête offerte à tout passant sur un
    // chemin ouvert à Internet, pour un résultat connu d'avance.
    db.tables.jackpot_players = [joueur()];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.hasIdentity).toBe(false);
    expect(db.tablesQueried()).not.toContain("jackpot_players");
    expect(db.tablesQueried()).not.toContain("jackpot_wins");
    expect(identiteGlobale.portees).toEqual([]);
  });

  it("aucune ancienne empreinte : l'état d'avant, à l'identique", async () => {
    // Le pont ne rend rien (appareil jamais vu sur cette campagne, ou RPC en
    // panne — il replie déjà toute panne sur une liste vide).
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [];
    db.tables.jackpot_players = [joueur()];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.hasIdentity).toBe(false);
    expect(db.tablesQueried()).not.toContain("jackpot_players");
  });

  it("LECTURE DE REPLI EN PANNE : on rend EXACTEMENT ce que le cookie avait trouvé", async () => {
    // Le repli ne peut qu'AJOUTER un joueur, jamais en retirer un ni faire
    // échouer la page. Cookie présent (donc identité), lecture de repli en
    // panne : l'état d'avant, sans exception et sans page vide.
    cookieJar.jar[jackpotTokenCookieName(CAMPAIGN_ID)] = TOKEN;
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur()];
    db.enPanne.add("jackpot_players");

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.player.hasIdentity).toBe(true);
    expect(ctx.player.participationCount).toBe(0);
    expect(compteurs).not.toContain("jackpot.joueur.repli_identite_globale");
  });

  it("le secret de rotation ne sort JAMAIS, repli ou pas", async () => {
    // La graine du code de validation tournant : qui l'obtient fabrique des
    // participations à distance. La SEULE barrière est la liste de colonnes
    // demandée, `fetchCampaignWithOrg` recopiant ensuite la ligne entière.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.jackpot_players = [joueur()];

    const ctx = await loadJackpotContext(CAMPAIGN_ID);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(JSON.stringify(ctx.campaign)).not.toContain(SECRET_ROTATIF);
    expect("rotating_secret" in ctx.campaign).toBe(false);
    expect("win_probability" in ctx.campaign).toBe(false);
  });
});
