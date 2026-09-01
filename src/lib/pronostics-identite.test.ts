// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// LA BASCULE DES PRONOSTICS (ID-7) — le cookie du module d'abord,
// l'identité globale ensuite.
//
// LA PROMESSE DU LOT : un joueur dont le cookie `lc-prono-<id>` a disparu, mais
// dont l'appareil est connu, RETROUVE SA GRILLE. Le module écrivait déjà le
// pont d'ancienneté à chaque inscription ; il ne le LISAIT nulle part.
//
// LA NON-RÉGRESSION QUI COMPTE LE PLUS : un joueur avec son cookie de module
// intact garde exactement le même `contest_players` qu'avant. Personne ne doit
// changer d'identité en silence — ADR-041, le double chemin est un ORDRE, pas
// un remplacement. Inverser les deux étages ferait changer d'identité, le jour
// du déploiement, TOUS les clients au cookie valable.
//
// LE PIÈGE QUE CE BLOC SURVEILLE : `contest_players.token_hash` est un SHA-256
// NU du cookie du championnat ; l'empreinte de l'identité globale est SALÉE et
// versionnée. Les deux rendent 64 hexadécimaux, passent la même expression
// régulière, et les substituer ne lèverait AUCUNE erreur — la requête ne
// trouverait simplement plus personne, partout, sans une ligne de journal.
// C'est pourquoi l'empreinte globale est ici une valeur qui ne doit apparaître
// dans AUCUNE requête.
//
// CE QUE CE FICHIER NE TOUCHE PAS : le classement. `contest_leaderboard` joint
// par `contest_players.id` et n'entend jamais parler de l'identité globale —
// deux lignes de module restent deux lignes, et c'est le comportement voulu.
// ────────────────────────────────────────────────────────────

const { db, cookieJar, createAdminClientMock } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type ListResult = { data: Row[] | null; error: unknown };

  /** Applique la projection demandée — une colonne non demandée ne sort pas. */
  function project(row: Row, columns: string): Row {
    const out: Row = {};
    for (const part of columns.split(",").map((c) => c.trim())) {
      if (part === "*") {
        Object.assign(out, row);
        continue;
      }
      out[part] = row[part] ?? null;
    }
    return out;
  }

  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    in: (column: string, values: unknown[]) => Builder;
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
  };

  const db = {
    tables: {} as Record<string, Row[]>,
    queries: [] as QueryEntry[],
    /** Panne pilotable de la lecture de repli (la liste `in (…)`). */
    erreurSurIn: null as { message: string } | null,
    reset(): void {
      db.tables = { contest_players: [], contest_predictions: [] };
      db.queries = [];
      db.erreurSurIn = null;
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
              maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
              then: (onfulfilled, onrejected) =>
                Promise.resolve<ListResult>(
                  entry.inFilter && db.erreurSurIn
                    ? { data: null, error: db.erreurSurIn }
                    : { data: rows(), error: null },
                ).then(onfulfilled, onrejected),
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
 * L'IDENTITÉ GLOBALE (ID-7) — le second chemin de résolution du joueur.
 *
 * Doublée, et jamais exécutée pour de vrai : `peekPlayerDeviceTokenHash` lit un
 * cookie salé par `PLAYER_KEY_SALT` et `lookupLegacyIdentityHashes` appelle une
 * RPC. Ce fichier éprouve l'ORDRE de résolution et la portée des requêtes qui
 * en découlent, pas le pont lui-même (couvert par player-identity.test.ts).
 *
 * Le défaut par DÉFAUT est « aucune identité globale » : c'est exactement l'état
 * d'avant ce lot.
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

/** `recordCounter` seul est espionné ; le reste de l'observabilité reste réel. */
const { compteurs } = vi.hoisted(() => ({ compteurs: [] as string[] }));
vi.mock("@/lib/monitoring", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordCounter: (op: string) => {
    compteurs.push(op);
  },
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

const {
  contestTokenCookieName,
  loadContestPlayerState,
  resoudreIdentiteContest,
} = await import("./pronostics-context");
const { createAdminClient } = await import("@/lib/supabase/admin");

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const ORG_ID = "org-marcel";
const CONTEST_ID = "contest-marcel";
const AUTRE_CONTEST_ID = "contest-voisin";
const CONTEST = { id: CONTEST_ID, organization_id: ORG_ID };

/** Empreinte SALÉE de l'appareil : elle n'entre dans aucune requête. */
const EMPREINTE_APPAREIL = "f".repeat(64);
/** Le cookie de pronostics d'AVANT, dont seul le hash survit en base. */
const VIEUX_COOKIE = "jeton-prono-d-avant-le-nettoyage";
/** Le cookie de pronostics du navigateur courant. */
const TOKEN = "jeton-prono-de-marco";

type Over = Record<string, unknown>;

function joueur(over: Over = {}) {
  return {
    id: "player-moi",
    contest_id: CONTEST_ID,
    token_hash: sha256(VIEUX_COOKIE),
    first_name: "Marco",
    avatar: "🐧",
    // Colonnes JAMAIS demandées : présentes pour que la projection ait
    // quelque chose à retenir. Un `select("*")` les ferait sortir.
    email: "marco@example.com",
    phone: "+33600000000",
    ...over,
  };
}

function seedJoueur(over: Over = {}) {
  db.tables.contest_players = [joueur(over)];
}

beforeEach(() => {
  db.reset();
  cookieJar.jar = {};
  identiteGlobale.empreinte = null;
  identiteGlobale.anciennes = [];
  identiteGlobale.portees = [];
  compteurs.length = 0;
});

describe("pronostics — l'identité globale rattrape le cookie perdu", () => {
  it("LA PROMESSE : cookie de module disparu, appareil connu → la grille revient", async () => {
    // Le joueur a nettoyé son navigateur. Son `lc-prono-…` n'existe plus, mais
    // son `lc-player` oui, et le pont `contest` a été posé à l'inscription puis
    // à chaque pronostic. Rouge si le module le renvoyait au formulaire
    // d'inscription : une grille remplie, un rang gagné, et « inscrivez-vous ».
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    seedJoueur();
    db.tables.contest_predictions = [
      {
        contest_id: CONTEST_ID,
        player_id: "player-moi",
        match_id: "match-1",
        home_score: 2,
        away_score: 1,
        answer: null,
        points: 3,
      },
    ];

    const etat = await loadContestPlayerState(createAdminClient(), CONTEST);

    expect(etat.player).toMatchObject({ id: "player-moi", first_name: "Marco" });
    expect(etat.predictions["match-1"]).toMatchObject({
      home_score: 2,
      away_score: 1,
      points: 3,
    });
    // Le repli SE COMPTE : zéro est la valeur attendue tant que personne n'a
    // perdu son cookie, et une population non nulle dit combien de joueurs
    // auraient retrouvé une grille vide.
    expect(compteurs).toContain("pronostics.repli_identite_globale");
  });

  it("interroge le pont sur la portée du CHAMPIONNAT, jamais plus large", async () => {
    // La famille et l'expérience sont ce qui empêche l'empreinte d'un autre
    // module — ou d'un autre championnat — d'entrer dans la requête.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    seedJoueur();

    await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(identiteGlobale.portees).toEqual([
      {
        deviceTokenHash: EMPREINTE_APPAREIL,
        organizationId: ORG_ID,
        experienceKind: "contest",
        experienceId: CONTEST_ID,
      },
    ]);
  });

  it("L'EMPREINTE SALÉE N'ENTRE DANS AUCUN FILTRE — le piège du hachage", async () => {
    // `hashPlayerDeviceToken` (salé, versionné) et `hashPlayerToken` (SHA-256
    // nu) rendent tous deux 64 hexadécimaux et passent la même expression
    // régulière : les substituer ne lève rien, la requête ne trouve plus
    // personne, partout, en silence. C'est le SEUL filet du dépôt contre cette
    // faute côté pronostics.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    seedJoueur();

    await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(JSON.stringify(db.queries)).not.toContain(EMPREINTE_APPAREIL);
    const repli = db.queriesOn("contest_players")[0];
    expect(repli.filters.contest_id).toBe(CONTEST_ID);
    expect(repli.inFilter).toEqual({
      column: "token_hash",
      values: [sha256(VIEUX_COOKIE)],
    });
  });

  it("NON-RÉGRESSION : cookie intact → le MÊME joueur, et le repli n'est jamais consulté", async () => {
    // La garde qui compte le plus. Rouge si l'identité globale passait devant :
    // le joueur au cookie valable changerait d'identité en silence le jour du
    // déploiement, et ADR-041 interdit précisément de réinterpréter une
    // progression existante.
    cookieJar.jar[contestTokenCookieName(CONTEST_ID)] = TOKEN;
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    // Le pont désignerait un AUTRE joueur : il ne doit même pas être interrogé.
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.tables.contest_players = [
      joueur({ id: "player-du-cookie", token_hash: sha256(TOKEN) }),
      joueur({ id: "player-d-avant" }),
    ];

    const identite = await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(identite.joueur?.id).toBe("player-du-cookie");
    expect(identite.tokenHash).toBe(sha256(TOKEN));
    expect(identiteGlobale.portees).toEqual([]);
    expect(db.queriesOn("contest_players")).toHaveLength(1);
    expect(compteurs).not.toContain("pronostics.repli_identite_globale");
  });

  it("le cloisonnement par championnat tient sur le chemin de repli aussi", async () => {
    // Même empreinte de module, autre championnat : invisible. Rouge si le
    // filtre `contest_id` sautait du `in (…)` — la grille d'un commerce
    // s'afficherait sur la page d'un autre.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    seedJoueur({ contest_id: AUTRE_CONTEST_ID });

    const identite = await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(identite.joueur).toBeNull();
    expect(identite.tokenHash).toBeNull();
  });

  it("plusieurs anciennes empreintes : c'est la PLUS RÉCENTE qui gagne", async () => {
    // La RPC rend ses empreintes triées de la plus récemment vue à la plus
    // ancienne. Rouge si l'ordre de la base l'emportait : un joueur qui a changé
    // deux fois de cookie retomberait sur sa grille la plus vieille.
    const ENCORE_PLUS_VIEUX = "jeton-de-la-saison-derniere";
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [
      sha256(VIEUX_COOKIE),
      sha256(ENCORE_PLUS_VIEUX),
    ];
    db.tables.contest_players = [
      joueur({ id: "player-ancien", token_hash: sha256(ENCORE_PLUS_VIEUX) }),
      joueur({ id: "player-recent" }),
    ];

    const identite = await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(identite.joueur?.id).toBe("player-recent");
    expect(identite.tokenHash).toBe(sha256(VIEUX_COOKIE));
  });

  it("cookie posé mais sans joueur : le repli le rattrape, et le cookie a bien été essayé D'ABORD", async () => {
    // Le cookie d'une inscription sur un appareil désormais orphelin (le lien
    // magique a fait tourner l'empreinte ailleurs, par exemple).
    cookieJar.jar[contestTokenCookieName(CONTEST_ID)] = TOKEN;
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    seedJoueur();

    const identite = await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(identite.joueur?.id).toBe("player-moi");
    // Deux lectures, dans cet ordre : le cookie, PUIS le repli.
    expect(db.queriesOn("contest_players")).toHaveLength(2);
    expect(db.queriesOn("contest_players")[0].filters.token_hash).toBe(
      sha256(TOKEN),
    );
    expect(db.queriesOn("contest_players")[1].inFilter?.values).toEqual([
      sha256(VIEUX_COOKIE),
    ]);
  });

  it("visiteur neuf : aucune identité, aucune lecture d'identité", async () => {
    // Ni cookie de module, ni cookie global. Rouge si le chargeur interrogeait
    // quand même `contest_players` : une requête offerte à tout passant sur un
    // chemin public, pour un résultat connu d'avance.
    seedJoueur();

    const etat = await loadContestPlayerState(createAdminClient(), CONTEST);

    expect(etat).toEqual({ player: null, predictions: {} });
    expect(db.tablesQueried()).not.toContain("contest_players");
    expect(identiteGlobale.portees).toEqual([]);
  });

  it("aucune ancienne empreinte : l'état d'avant, à l'identique", async () => {
    // Le pont ne rend rien (appareil jamais vu sur ce championnat, ou RPC en
    // panne — il replie déjà toute panne sur une liste vide).
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [];
    seedJoueur();

    const etat = await loadContestPlayerState(createAdminClient(), CONTEST);

    expect(etat).toEqual({ player: null, predictions: {} });
    expect(db.tablesQueried()).not.toContain("contest_players");
  });

  it("la lecture de repli en PANNE rend exactement ce que le cookie avait trouvé", async () => {
    // Le repli ne peut qu'AJOUTER un joueur, jamais en retirer un ni faire
    // échouer la page. Rouge si une erreur de la seconde lecture remontait.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    db.erreurSurIn = { message: "connexion perdue" };
    seedJoueur();

    const identite = await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(identite.joueur).toBeNull();
    expect(compteurs).not.toContain("pronostics.repli_identite_globale");
  });

  it("ni email ni téléphone ne sortent du chargeur d'identité", async () => {
    // `contest_players` porte les coordonnées collectées par le commerçant. La
    // SEULE barrière est la liste de colonnes demandée : ce chargeur sert une
    // page publique servie par un client `service_role`.
    identiteGlobale.empreinte = EMPREINTE_APPAREIL;
    identiteGlobale.anciennes = [sha256(VIEUX_COOKIE)];
    seedJoueur();

    const identite = await resoudreIdentiteContest(createAdminClient(), CONTEST);

    expect(identite.joueur).toEqual({
      id: "player-moi",
      first_name: "Marco",
      avatar: "🐧",
    });
    expect(JSON.stringify(db.queries)).not.toContain("email");
  });
});
