// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// jackpot-identite (ID-8b) — le pont d'ancienneté du chemin caisse, et le
// MOMENT où la déduplication se déclenche.
//
// CE QUE CE FICHIER GARDE :
//
//   1. LE PONT — `participateJackpotStaff` était le seul chemin d'écriture du
//      module à n'en poser aucun. Sans lui, `reward_player_from_legacy` rend
//      `null` pour les gains de cette empreinte, et le lot n'apparaît JAMAIS
//      sur `/portefeuille`.
//   2. LE MOMENT — la déduplication balaie TOUTE la campagne sous le verrou de
//      la ligne de campagne, celui-là même que prennent les participations et
//      le tirage par cron. L'appeler à chaque geste la ferait tourner pour rien
//      dans l'immense majorité des cas ; l'appeler à chaque AFFICHAGE la ferait
//      tourner à chaque tour de sondage d'un écran de salle. Deux lectures
//      indexées décident, et elles sont ici.
//   3. LA TOTALITÉ — ni le comptoir ni une participation déjà enregistrée ne
//      doivent échouer pour un défaut de comptabilité d'identité. Ces fonctions
//      ne lèvent jamais.
// ────────────────────────────────────────────────────────────

const { db, createAdminClientMock } = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const db = {
    tables: {} as Record<string, Row[]>,
    /** Toutes les RPC appelées, dans l'ordre — c'est le MOMENT qu'on assert. */
    rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Tables lues, dans l'ordre : prouve qu'on sort AVANT la seconde lecture. */
    lectures: [] as string[],
    /** Tables dont la lecture répond en panne. */
    enPanne: new Set<string>(),
    /** RPC qui répondent en erreur, par nom. */
    rpcEnErreur: new Set<string>(),
    /** RPC qui LÈVENT (panne réseau du client Supabase). */
    rpcQuiLeve: new Set<string>(),
    reset(): void {
      db.tables = {
        player_legacy_identities: [],
        jackpot_players: [],
        loyalty_programs: [],
      };
      db.rpcs = [];
      db.lectures = [];
      db.enPanne = new Set<string>();
      db.rpcEnErreur = new Set<string>();
      db.rpcQuiLeve = new Set<string>();
    },
  };
  db.reset();

  function createAdminClientMock() {
    return {
      rpc(name: string, args: Record<string, unknown>) {
        db.rpcs.push({ name, args });
        if (db.rpcQuiLeve.has(name)) throw new Error(`RPC ${name} injoignable`);
        if (db.rpcEnErreur.has(name)) {
          return Promise.resolve({ data: null, error: { message: `${name} KO` } });
        }
        // Le pont posé DEVIENT visible : sans cet effet, la lecture qui suit ne
        // verrait pas ce que la RPC vient d'écrire, et l'enchaînement
        // « pont → réunion » serait invérifiable.
        if (name === "link_jackpot_legacy_identity") {
          db.tables.player_legacy_identities.push({
            player_id: args.p_player_id,
            organization_id: args.p_organization_id,
            experience_kind: "jackpot",
            experience_id: args.p_campaign_id,
            legacy_identity_hash: args.p_legacy_hash,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        db.lectures.push(table);
        const filters: Record<string, unknown> = {};
        let inFilter: { column: string; values: unknown[] } | null = null;
        const panne = () =>
          db.enPanne.has(table) ? { message: `lecture ${table} KO` } : null;
        const rows = () =>
          (db.tables[table] ?? [])
            .filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
            .filter((r) =>
              inFilter ? inFilter.values.includes(r[inFilter.column]) : true,
            );
        type Builder = {
          eq: (column: string, value: unknown) => Builder;
          in: (column: string, values: unknown[]) => Builder;
          maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
          then: (
            onfulfilled: (value: { data: Row[]; error: unknown }) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) => Promise<unknown>;
        };
        const builder: Builder = {
          eq(column, value) {
            filters[column] = value;
            return builder;
          },
          in(column, values) {
            inFilter = { column, values };
            return builder;
          },
          maybeSingle: async () => {
            const error = panne();
            return { data: error ? null : rows()[0] ?? null, error };
          },
          then: (onfulfilled, onrejected) => {
            const error = panne();
            return Promise.resolve({
              data: error ? [] : rows(),
              error,
            }).then(onfulfilled, onrejected);
          },
        };
        return { select: () => builder };
      },
    };
  }

  return { db, createAdminClientMock };
});

const { compteurs, erreurs } = vi.hoisted(() => ({
  compteurs: [] as string[],
  erreurs: [] as string[],
}));
vi.mock("@/lib/monitoring", () => ({
  recordCounter: (op: string) => {
    compteurs.push(op);
  },
  reportError: (scope: string) => {
    erreurs.push(scope);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  ponterIdentiteJackpotCaisse,
  reunirIdentitesJackpot,
} from "./jackpot-identite";

const ORG_ID = "33333333-3333-4333-8333-333333333333";
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const PROGRAM_ID = "44444444-4444-4444-8444-444444444444";
const PLAYER_ID = "55555555-5555-4555-8555-555555555555";
const AUTRE_PLAYER_ID = "66666666-6666-4666-8666-666666666666";

/** Empreinte du cookie de campagne (SHA-256 nu du jeton de module). */
const EMPREINTE_COOKIE = "a".repeat(64);
/** Empreinte recopiée par l'ancien trigger de fidélité (ID-8a). */
const EMPREINTE_FIDELITE = "b".repeat(64);

function pont(over: Record<string, unknown> = {}) {
  return {
    player_id: PLAYER_ID,
    organization_id: ORG_ID,
    experience_kind: "jackpot",
    experience_id: CAMPAIGN_ID,
    legacy_identity_hash: EMPREINTE_COOKIE,
    ...over,
  };
}

function ligneJoueur(tokenHash: string) {
  return { campaign_id: CAMPAIGN_ID, token_hash: tokenHash };
}

beforeEach(() => {
  db.reset();
  compteurs.length = 0;
  erreurs.length = 0;
});

// ════════════════════════════════════════════════════════════
// reunirIdentitesJackpot — QUAND la déduplication tourne
// ════════════════════════════════════════════════════════════

describe("reunirIdentitesJackpot — la déduplication ne tourne que sur un doublon mesuré", () => {
  it("une seule empreinte : aucune RPC, et la seconde lecture n'a même pas lieu", async () => {
    // Le cas de presque tout le monde. Rouge si la déduplication tournait à
    // chaque participation : un balayage de campagne sous le verrou que prend
    // aussi le tirage par cron.
    db.tables.player_legacy_identities = [pont()];

    await reunirIdentitesJackpot({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      playerId: PLAYER_ID,
    });

    expect(db.rpcs).toEqual([]);
    expect(db.lectures).toEqual(["player_legacy_identities"]);
  });

  it("deux empreintes mais UNE SEULE ligne joueur : rien à réunir", async () => {
    // Une personne peut porter deux empreintes sans porter deux lignes : la
    // seconde a déjà été absorbée, et `player_legacy_identities` la CONSERVE
    // pour que son ancien cookie continue de la désigner. Rouge si l'on
    // repartait en déduplication à chaque geste de ces clients-là.
    db.tables.player_legacy_identities = [
      pont(),
      pont({ legacy_identity_hash: EMPREINTE_FIDELITE }),
    ];
    db.tables.jackpot_players = [ligneJoueur(EMPREINTE_FIDELITE)];

    await reunirIdentitesJackpot({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      playerId: PLAYER_ID,
    });

    expect(db.rpcs).toEqual([]);
  });

  it("LE DOUBLON : deux empreintes, deux lignes joueur → la campagne est réunie", async () => {
    // C'est exactement le contrôle négatif (a) de la migration : personne ne
    // doit porter deux `jackpot_players` sur une même campagne — deux
    // compteurs, deux cooldowns, et surtout DEUX JEUX D'ENTRÉES au tirage.
    db.tables.player_legacy_identities = [
      pont(),
      pont({ legacy_identity_hash: EMPREINTE_FIDELITE }),
    ];
    db.tables.jackpot_players = [
      ligneJoueur(EMPREINTE_COOKIE),
      ligneJoueur(EMPREINTE_FIDELITE),
    ];

    await reunirIdentitesJackpot({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      playerId: PLAYER_ID,
    });

    expect(db.rpcs).toEqual([
      {
        name: "dedupe_jackpot_player_identities",
        // BORNÉE À LA CAMPAGNE : `null` traiterait TOUTES les campagnes de la
        // base, y compris celles des autres locataires.
        args: { p_campaign_id: CAMPAIGN_ID },
      },
    ]);
    expect(compteurs).toContain("jackpot.identite.deduplication");
  });

  it("la portée est celle de la personne ET de la campagne, jamais plus large", async () => {
    // Les empreintes d'un autre joueur, d'une autre famille ou d'une autre
    // campagne ne comptent pas dans le doublon : les faire compter
    // déclencherait la déduplication sur un dédoublement qui n'existe pas.
    db.tables.player_legacy_identities = [
      pont(),
      pont({ player_id: AUTRE_PLAYER_ID, legacy_identity_hash: EMPREINTE_FIDELITE }),
      pont({ experience_kind: "loyalty", legacy_identity_hash: "c".repeat(64) }),
      pont({ experience_id: "77777777-7777-4777-8777-777777777777",
             legacy_identity_hash: "d".repeat(64) }),
    ];
    db.tables.jackpot_players = [
      ligneJoueur(EMPREINTE_COOKIE),
      ligneJoueur(EMPREINTE_FIDELITE),
    ];

    await reunirIdentitesJackpot({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      playerId: PLAYER_ID,
    });

    expect(db.rpcs).toEqual([]);
  });

  it("identifiant mal formé : refusé AVANT toute requête", async () => {
    await reunirIdentitesJackpot({
      organizationId: ORG_ID,
      campaignId: "pas-un-uuid",
      playerId: PLAYER_ID,
    });

    expect(db.lectures).toEqual([]);
    expect(db.rpcs).toEqual([]);
    expect(erreurs).toContain("jackpot.identite.reunir-input");
  });

  it("lecture en panne : on s'arrête, on ne déduplique pas à l'aveugle", async () => {
    db.tables.player_legacy_identities = [
      pont(),
      pont({ legacy_identity_hash: EMPREINTE_FIDELITE }),
    ];
    db.enPanne.add("player_legacy_identities");

    await reunirIdentitesJackpot({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      playerId: PLAYER_ID,
    });

    expect(db.rpcs).toEqual([]);
  });

  it("NE LÈVE JAMAIS, même si la RPC explose", async () => {
    db.tables.player_legacy_identities = [
      pont(),
      pont({ legacy_identity_hash: EMPREINTE_FIDELITE }),
    ];
    db.tables.jackpot_players = [
      ligneJoueur(EMPREINTE_COOKIE),
      ligneJoueur(EMPREINTE_FIDELITE),
    ];
    db.rpcQuiLeve.add("dedupe_jackpot_player_identities");

    await expect(
      reunirIdentitesJackpot({
        organizationId: ORG_ID,
        campaignId: CAMPAIGN_ID,
        playerId: PLAYER_ID,
      }),
    ).resolves.toBeUndefined();
    expect(erreurs).toContain("jackpot.identite.reunir");
    expect(compteurs).not.toContain("jackpot.identite.deduplication");
  });
});

// ════════════════════════════════════════════════════════════
// ponterIdentiteJackpotCaisse — la fuite du comptoir
// ════════════════════════════════════════════════════════════

describe("ponterIdentiteJackpotCaisse — le comptoir cesse de laisser des gains sans propriétaire", () => {
  it("LA FUITE COLMATÉE : une empreinte connue du passeport est pontée côté jackpot", async () => {
    // L'empreinte recopiée par l'ancien trigger de fidélité : le comptoir la
    // valide, et sans ce pont ses gains n'ont AUCUN bénéficiaire —
    // `reward_player_from_legacy` rend `null` et le lot n'atteint jamais
    // `/portefeuille`.
    db.tables.loyalty_programs = [
      { id: PROGRAM_ID, organization_id: ORG_ID, jackpot_campaign_id: CAMPAIGN_ID },
    ];
    db.tables.player_legacy_identities = [
      pont({
        experience_kind: "loyalty",
        experience_id: PROGRAM_ID,
        legacy_identity_hash: EMPREINTE_FIDELITE,
      }),
    ];

    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: EMPREINTE_FIDELITE,
    });

    expect(db.rpcs[0]).toEqual({
      name: "link_jackpot_legacy_identity",
      args: {
        p_player_id: PLAYER_ID,
        p_organization_id: ORG_ID,
        p_campaign_id: CAMPAIGN_ID,
        p_legacy_hash: EMPREINTE_FIDELITE,
      },
    });
    expect(compteurs).toContain("jackpot.identite.pont_caisse");
  });

  it("LE PONT VIENT D'APPRENDRE QUELQUE CHOSE : la réunion suit immédiatement", async () => {
    // C'est l'instant, et le seul sur ce chemin, où la base peut savoir que
    // deux empreintes désignent le même client.
    db.tables.loyalty_programs = [
      { id: PROGRAM_ID, organization_id: ORG_ID, jackpot_campaign_id: CAMPAIGN_ID },
    ];
    db.tables.player_legacy_identities = [
      pont({
        experience_kind: "loyalty",
        experience_id: PROGRAM_ID,
        legacy_identity_hash: EMPREINTE_FIDELITE,
      }),
      // Le pont du COOKIE de ce client existe déjà (posé par son navigateur) ;
      // celui de l'empreinte de caisse va naître de `link_…` ci-dessous.
      pont(),
    ];
    db.tables.jackpot_players = [
      ligneJoueur(EMPREINTE_COOKIE),
      ligneJoueur(EMPREINTE_FIDELITE),
    ];

    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: EMPREINTE_FIDELITE,
    });

    expect(db.rpcs.map((r) => r.name)).toEqual([
      "link_jackpot_legacy_identity",
      "dedupe_jackpot_player_identities",
    ]);
  });

  it("empreinte DÉJÀ pontée à quelqu'un d'autre : on ne la déplace pas", async () => {
    // `link_jackpot_legacy_identity` LÈVE dans ce cas (23505) plutôt que de
    // déplacer une empreinte en silence : réunir deux personnes est une
    // décision, elle a son outil, et le comptoir n'est pas l'endroit où la
    // prendre. On écarte donc AVANT d'appeler.
    db.tables.player_legacy_identities = [
      pont({ player_id: AUTRE_PLAYER_ID, legacy_identity_hash: EMPREINTE_FIDELITE }),
    ];

    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: EMPREINTE_FIDELITE,
    });

    expect(db.rpcs.map((r) => r.name)).not.toContain("link_jackpot_legacy_identity");
  });

  it("personne inconnue du socle : rien n'est ponté, et surtout rien n'est inventé", async () => {
    // Sans appareil du client, le comptoir ne peut rattacher une empreinte à
    // personne. Fabriquer une identité ici en inventerait une par client servi.
    db.tables.loyalty_programs = [
      { id: PROGRAM_ID, organization_id: ORG_ID, jackpot_campaign_id: CAMPAIGN_ID },
    ];

    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: EMPREINTE_COOKIE,
    });

    expect(db.rpcs).toEqual([]);
  });

  it("aucun passeport relié : on s'arrête sans chercher plus loin", async () => {
    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: EMPREINTE_COOKIE,
    });

    expect(db.rpcs).toEqual([]);
    expect(db.lectures).toEqual(["player_legacy_identities", "loyalty_programs"]);
  });

  it("le passeport d'un AUTRE locataire ne peut pas servir d'ancienneté", async () => {
    // Le lien `jackpot_campaign_id` est lu avec le filtre d'organisation :
    // sans lui, la campagne d'un voisin ponterait l'empreinte d'un client.
    db.tables.loyalty_programs = [
      {
        id: PROGRAM_ID,
        organization_id: "88888888-8888-4888-8888-888888888888",
        jackpot_campaign_id: CAMPAIGN_ID,
      },
    ];
    db.tables.player_legacy_identities = [
      pont({
        experience_kind: "loyalty",
        experience_id: PROGRAM_ID,
        legacy_identity_hash: EMPREINTE_FIDELITE,
      }),
    ];

    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: EMPREINTE_FIDELITE,
    });

    expect(db.rpcs).toEqual([]);
  });

  it("empreinte mal formée : refusée AVANT toute requête", async () => {
    // Elle repart en argument d'une RPC qui lève `22023` sur une empreinte mal
    // formée ; une garde qui repose sur « l'appelant l'a dit » ne garde rien.
    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: "pas-une-empreinte",
    });

    expect(db.lectures).toEqual([]);
    expect(erreurs).toContain("jackpot.identite.caisse-input");
  });

  it("NE LÈVE JAMAIS : une caisse ne refuse pas un client pour un défaut d'identité", async () => {
    db.tables.loyalty_programs = [
      { id: PROGRAM_ID, organization_id: ORG_ID, jackpot_campaign_id: CAMPAIGN_ID },
    ];
    db.tables.player_legacy_identities = [
      pont({
        experience_kind: "loyalty",
        experience_id: PROGRAM_ID,
        legacy_identity_hash: EMPREINTE_FIDELITE,
      }),
    ];
    db.rpcQuiLeve.add("link_jackpot_legacy_identity");

    await expect(
      ponterIdentiteJackpotCaisse({
        organizationId: ORG_ID,
        campaignId: CAMPAIGN_ID,
        tokenHash: EMPREINTE_FIDELITE,
      }),
    ).resolves.toBeUndefined();
    expect(erreurs).toContain("jackpot.identite.caisse");
  });

  it("le pont échoue en base : on n'enchaîne pas sur une déduplication", async () => {
    db.tables.loyalty_programs = [
      { id: PROGRAM_ID, organization_id: ORG_ID, jackpot_campaign_id: CAMPAIGN_ID },
    ];
    db.tables.player_legacy_identities = [
      pont({
        experience_kind: "loyalty",
        experience_id: PROGRAM_ID,
        legacy_identity_hash: EMPREINTE_FIDELITE,
      }),
    ];
    db.rpcEnErreur.add("link_jackpot_legacy_identity");

    await ponterIdentiteJackpotCaisse({
      organizationId: ORG_ID,
      campaignId: CAMPAIGN_ID,
      tokenHash: EMPREINTE_FIDELITE,
    });

    expect(db.rpcs.map((r) => r.name)).toEqual(["link_jackpot_legacy_identity"]);
    expect(erreurs).toContain("jackpot.identite.caisse-pont");
    expect(compteurs).not.toContain("jackpot.identite.pont_caisse");
  });
});
