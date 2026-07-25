import { describe, expect, it } from "vitest";
import {
  activeProgressionSeason,
  deriveProgressionRequestId,
  mapOrgProgressionSnapshot,
  mapPlayerProgressionSnapshot,
  mapProgressionChestOpening,
  PROGRESSION_REQUEST_WINDOW_MS,
} from "./meta-progression";
import {
  activateProgressionSeasonSchema,
  createProgressionBadgeSchema,
  createProgressionChestSchema,
  createProgressionCollectionItemSchema,
  createProgressionCollectionSchema,
  createProgressionMissionSchema,
  createProgressionSeasonSchema,
  openProgressionChestSchema,
} from "./validations/meta-progression";

const SEASON = "00000000-0000-4000-8000-000000000001";
const MISSION = "00000000-0000-4000-8000-000000000002";
const BADGE = "00000000-0000-4000-8000-000000000003";
const COLLECTION = "00000000-0000-4000-8000-000000000004";
const ITEM = "00000000-0000-4000-8000-000000000005";
const CHEST = "00000000-0000-4000-8000-000000000006";
const ORG = "00000000-0000-4000-8000-0000000000aa";
const DEVICE = "f".repeat(64);

// ════════════════════════════════════════════════════════════
// mapPlayerProgressionSnapshot — jsonb player_progression_snapshot
// ════════════════════════════════════════════════════════════

const PLAYER_SNAPSHOT = {
  organization: { id: ORG, name: "Café du Coin" },
  season: {
    id: SEASON,
    name: "Saison 1",
    starts_at: "2026-09-01T00:00:00+00:00",
    ends_at: "2026-12-01T00:00:00+00:00",
  },
  keys: 3,
  keys_earned: 5,
  keys_spent: 2,
  missions: [
    {
      id: MISSION,
      name: "Explorateur",
      description: "Terminer 3 expériences",
      target: 3,
      current: 2,
      completed_at: null,
      key_reward: 2,
      event_name: "experience_completed",
      experience_kinds: ["campaign", "quiz"],
    },
  ],
  badges: [
    {
      id: BADGE,
      name: "Curieux",
      description: "",
      icon_key: "compass",
      earned: true,
      awarded_at: "2026-09-10T12:00:00+00:00",
    },
  ],
  collections: [
    {
      id: COLLECTION,
      name: "Album",
      description: "",
      items: [
        {
          id: ITEM,
          name: "Carte 1",
          description: "",
          image_url: "https://cdn.test/1.png",
          owned: true,
          awarded_at: "2026-09-11T12:00:00+00:00",
        },
      ],
    },
  ],
  chests: [
    {
      id: CHEST,
      name: "Coffre de bronze",
      description: "",
      key_cost: 2,
      available_items: 4,
    },
  ],
};

describe("mapPlayerProgressionSnapshot", () => {
  it("mappe un tableau de bord joueur complet", () => {
    const snap = mapPlayerProgressionSnapshot(PLAYER_SNAPSHOT);
    expect(snap.state).toBe("ok");
    expect(snap.organization).toEqual({ id: ORG, name: "Café du Coin" });
    expect(snap.season?.id).toBe(SEASON);
    expect(snap.keys).toBe(3);
    expect(snap.keysEarned).toBe(5);
    expect(snap.keysSpent).toBe(2);
    expect(snap.missions).toEqual([
      {
        id: MISSION,
        name: "Explorateur",
        description: "Terminer 3 expériences",
        target: 3,
        current: 2,
        completedAt: null,
        keyReward: 2,
        eventName: "experience_completed",
        experienceKinds: ["campaign", "quiz"],
      },
    ]);
    expect(snap.badges[0].earned).toBe(true);
    expect(snap.collections[0].items[0].owned).toBe(true);
    expect(snap.chests[0].availableItems).toBe(4);
  });

  it("null / jsonb non reconnu → unavailable neutre (aucun oracle)", () => {
    for (const raw of [null, undefined, 42, "x", [], {}, { season: null }]) {
      const snap = mapPlayerProgressionSnapshot(raw);
      expect(snap.state).toBe("unavailable");
      expect(snap.season).toBeNull();
      expect(snap.keys).toBe(0);
      expect(snap.missions).toEqual([]);
      expect(snap.badges).toEqual([]);
      expect(snap.collections).toEqual([]);
      expect(snap.chests).toEqual([]);
    }
  });

  it("saison sans identifiant → unavailable (jsonb non conforme)", () => {
    expect(
      mapPlayerProgressionSnapshot({ ...PLAYER_SNAPSHOT, season: { name: "x" } })
        .state,
    ).toBe("unavailable");
  });

  it("badge non obtenu et objet non possédé n'exposent aucune date", () => {
    const snap = mapPlayerProgressionSnapshot({
      ...PLAYER_SNAPSHOT,
      badges: [{ ...PLAYER_SNAPSHOT.badges[0], earned: false }],
      collections: [
        {
          ...PLAYER_SNAPSHOT.collections[0],
          items: [{ ...PLAYER_SNAPSHOT.collections[0].items[0], owned: false }],
        },
      ],
    });
    expect(snap.badges[0].awardedAt).toBeNull();
    expect(snap.collections[0].items[0].awardedAt).toBeNull();
  });

  it("borne l'avancement au palier et refuse les valeurs négatives", () => {
    const snap = mapPlayerProgressionSnapshot({
      ...PLAYER_SNAPSHOT,
      keys: -4,
      missions: [{ ...PLAYER_SNAPSHOT.missions[0], current: 99 }],
      chests: [{ ...PLAYER_SNAPSHOT.chests[0], available_items: -1 }],
    });
    expect(snap.keys).toBe(0);
    expect(snap.missions[0].current).toBe(3);
    expect(snap.chests[0].availableItems).toBe(0);
  });

  it("écarte les entrées sans id et les familles d'expériences inconnues", () => {
    const snap = mapPlayerProgressionSnapshot({
      ...PLAYER_SNAPSHOT,
      missions: [
        { name: "sans id" },
        { ...PLAYER_SNAPSHOT.missions[0], experience_kinds: ["campaign", "nope"] },
      ],
      badges: [null, "x"],
    });
    expect(snap.missions).toHaveLength(1);
    expect(snap.missions[0].experienceKinds).toEqual(["campaign"]);
    expect(snap.badges).toEqual([]);
  });

  it("retombe sur des valeurs sûres pour un event_name / icône hors catalogue", () => {
    const snap = mapPlayerProgressionSnapshot({
      ...PLAYER_SNAPSHOT,
      missions: [{ ...PLAYER_SNAPSHOT.missions[0], event_name: "pirate" }],
      badges: [{ ...PLAYER_SNAPSHOT.badges[0], icon_key: "skull" }],
    });
    expect(snap.missions[0].eventName).toBe("experience_completed");
    expect(snap.badges[0].iconKey).toBe("star");
  });
});

// ════════════════════════════════════════════════════════════
// mapOrgProgressionSnapshot — jsonb org_progression_snapshot
// ════════════════════════════════════════════════════════════

const ORG_SNAPSHOT = {
  summary: {
    players: 12,
    missions_completed: 30,
    keys_earned: "45",
    chests_opened: 7,
  },
  seasons: [
    {
      id: SEASON,
      name: "Saison 1",
      status: "active",
      starts_at: "2026-09-01T00:00:00+00:00",
      ends_at: "2026-12-01T00:00:00+00:00",
      missions: [
        {
          id: MISSION,
          name: "Explorateur",
          description: "",
          enabled: true,
          key_reward: 2,
          badge_id: BADGE,
          collection_item_id: null,
          rule: {
            version: 1,
            event_name: "experience_completed",
            target: 3,
            experience_kinds: ["campaign", "quiz"],
            distinct_experiences: true,
          },
        },
      ],
      badges: [
        {
          id: BADGE,
          name: "Curieux",
          description: "",
          icon_key: "compass",
          created_at: "2026-08-01T00:00:00+00:00",
        },
      ],
      collections: [
        {
          id: COLLECTION,
          name: "Album",
          description: "",
          items: [
            {
              id: ITEM,
              name: "Carte 1",
              description: "",
              image_url: null,
              position: 0,
              created_at: "2026-08-01T00:00:00+00:00",
            },
          ],
        },
      ],
      chests: [
        {
          id: CHEST,
          name: "Coffre",
          description: "",
          key_cost: 2,
          enabled: true,
          item_ids: [ITEM],
        },
      ],
    },
  ],
};

describe("mapOrgProgressionSnapshot", () => {
  it("mappe la vue commerçant (volumes + configuration)", () => {
    const snap = mapOrgProgressionSnapshot(ORG_SNAPSHOT);
    expect(snap.summary).toEqual({
      players: 12,
      missionsCompleted: 30,
      keysEarned: 45,
      chestsOpened: 7,
    });
    expect(snap.seasons).toHaveLength(1);
    const season = snap.seasons[0];
    expect(season.status).toBe("active");
    expect(season.missions[0].rule).toEqual({
      version: 1,
      eventName: "experience_completed",
      target: 3,
      experienceKinds: ["campaign", "quiz"],
      source: null,
      distinctExperiences: true,
    });
    expect(season.badges[0].iconKey).toBe("compass");
    expect(season.collections[0].items[0].position).toBe(0);
    expect(season.chests[0].itemIds).toEqual([ITEM]);
  });

  it("n'expose aucun identifiant de joueur (agrégat seul)", () => {
    const serialized = JSON.stringify(mapOrgProgressionSnapshot(ORG_SNAPSHOT));
    expect(serialized).not.toContain("player_id");
    expect(serialized).not.toContain("playerId");
  });

  it("jsonb absent → tableau de bord vide, jamais une erreur", () => {
    for (const raw of [null, undefined, 0, "x", []]) {
      const snap = mapOrgProgressionSnapshot(raw);
      expect(snap.summary).toEqual({
        players: 0,
        missionsCompleted: 0,
        keysEarned: 0,
        chestsOpened: 0,
      });
      expect(snap.seasons).toEqual([]);
    }
  });

  it("statut de saison inconnu → draft (défaut le moins actif)", () => {
    const snap = mapOrgProgressionSnapshot({
      ...ORG_SNAPSHOT,
      seasons: [{ ...ORG_SNAPSHOT.seasons[0], status: "running" }],
    });
    expect(snap.seasons[0].status).toBe("draft");
  });

  it("activeProgressionSeason isole la saison en cours", () => {
    const snap = mapOrgProgressionSnapshot({
      ...ORG_SNAPSHOT,
      seasons: [
        { ...ORG_SNAPSHOT.seasons[0], id: MISSION, status: "ended" },
        ORG_SNAPSHOT.seasons[0],
      ],
    });
    expect(activeProgressionSeason(snap)?.id).toBe(SEASON);
    expect(
      activeProgressionSeason(mapOrgProgressionSnapshot(null)),
    ).toBeNull();
  });

  it("conserve un filtre d'origine quand la règle en porte un", () => {
    const snap = mapOrgProgressionSnapshot({
      ...ORG_SNAPSHOT,
      seasons: [
        {
          ...ORG_SNAPSHOT.seasons[0],
          missions: [
            {
              ...ORG_SNAPSHOT.seasons[0].missions[0],
              rule: { ...ORG_SNAPSHOT.seasons[0].missions[0].rule, source: "qr" },
            },
          ],
        },
      ],
    });
    expect(snap.seasons[0].missions[0].rule.source).toBe("qr");
  });
});

// ════════════════════════════════════════════════════════════
// mapProgressionChestOpening — jsonb open_progression_chest
// ════════════════════════════════════════════════════════════

describe("mapProgressionChestOpening", () => {
  it("mappe une ouverture réussie (objet de collection, jamais un code)", () => {
    const result = mapProgressionChestOpening({
      state: "opened",
      idempotent: false,
      keys: 1,
      item: {
        id: ITEM,
        name: "Carte 1",
        description: "Rare",
        image_url: "https://cdn.test/1.png",
      },
    });
    expect(result.state).toBe("opened");
    expect(result.idempotent).toBe(false);
    expect(result.keys).toBe(1);
    expect(result.item).toEqual({
      id: ITEM,
      name: "Carte 1",
      description: "Rare",
      imageUrl: "https://cdn.test/1.png",
    });
    expect(result.requiredKeys).toBeNull();
    // Invariant NON MONÉTAIRE : rien qui ressemble à un code de caisse.
    expect(JSON.stringify(result)).not.toMatch(/code/i);
  });

  it("signale un rejeu idempotent (aucune clé débitée une seconde fois)", () => {
    const result = mapProgressionChestOpening({
      state: "opened",
      idempotent: true,
      keys: 1,
      item: { id: ITEM, name: "Carte 1", description: "", image_url: null },
    });
    expect(result.idempotent).toBe(true);
    expect(result.item?.id).toBe(ITEM);
  });

  it("solde insuffisant : coût exposé, aucun objet révélé", () => {
    const result = mapProgressionChestOpening({
      state: "insufficient_keys",
      keys: 1,
      required_keys: 3,
      item: { id: ITEM, name: "fuite", description: "", image_url: null },
    });
    expect(result.state).toBe("insufficient_keys");
    expect(result.requiredKeys).toBe(3);
    expect(result.item).toBeNull();
    expect(result.idempotent).toBe(false);
  });

  it("collection complète : ni objet ni coût", () => {
    const result = mapProgressionChestOpening({
      state: "collection_complete",
      keys: 4,
    });
    expect(result.state).toBe("collection_complete");
    expect(result.keys).toBe(4);
    expect(result.item).toBeNull();
    expect(result.requiredKeys).toBeNull();
  });

  it("null / état inconnu → unavailable neutre, tout à zéro", () => {
    for (const raw of [null, undefined, {}, { state: "bogus" }, 7]) {
      const result = mapProgressionChestOpening(raw);
      expect(result).toEqual({
        state: "unavailable",
        idempotent: false,
        keys: 0,
        requiredKeys: null,
        item: null,
      });
    }
  });
});

// ════════════════════════════════════════════════════════════
// deriveProgressionRequestId — idempotence de l'ouverture
// ════════════════════════════════════════════════════════════

describe("deriveProgressionRequestId", () => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("produit un UUID valide (v4) accepté par Postgres", () => {
    expect(deriveProgressionRequestId(DEVICE, CHEST, 1_700_000_000_000)).toMatch(
      UUID_RE,
    );
  });

  it("est DÉTERMINISTE dans la fenêtre : un double-clic ne débite qu'une fois", () => {
    const now = 1_700_000_000_000;
    const first = deriveProgressionRequestId(DEVICE, CHEST, now);
    const secondClick = deriveProgressionRequestId(
      DEVICE,
      CHEST,
      now + PROGRESSION_REQUEST_WINDOW_MS - 1,
    );
    expect(secondClick).toBe(first);
  });

  it("change de fenêtre : une ouverture délibérée plus tard reste possible", () => {
    const now = 1_700_000_000_000;
    expect(
      deriveProgressionRequestId(
        DEVICE,
        CHEST,
        now + PROGRESSION_REQUEST_WINDOW_MS,
      ),
    ).not.toBe(deriveProgressionRequestId(DEVICE, CHEST, now));
  });

  it("sépare les devices et les coffres", () => {
    const now = 1_700_000_000_000;
    const base = deriveProgressionRequestId(DEVICE, CHEST, now);
    expect(deriveProgressionRequestId("a".repeat(64), CHEST, now)).not.toBe(base);
    expect(deriveProgressionRequestId(DEVICE, SEASON, now)).not.toBe(base);
  });

  it("ne laisse pas transparaître le hash du device", () => {
    const id = deriveProgressionRequestId(DEVICE, CHEST, 1_700_000_000_000);
    expect(id.replace(/-/g, "")).not.toContain(DEVICE.slice(0, 16));
  });
});

// ════════════════════════════════════════════════════════════
// Schémas Zod — miroir de confort des gardes SQL
// ════════════════════════════════════════════════════════════

describe("createProgressionSeasonSchema", () => {
  const base = {
    name: "Saison 1",
    startsAt: "2026-09-01T10:00",
    endsAt: "2026-12-01T10:00",
  };

  it("accepte une fenêtre civile valide", () => {
    const parsed = createProgressionSeasonSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("refuse une fin antérieure ou égale au début", () => {
    for (const endsAt of ["2026-09-01T10:00", "2026-08-31T10:00"]) {
      const parsed = createProgressionSeasonSchema.safeParse({ ...base, endsAt });
      expect(parsed.success).toBe(false);
    }
  });

  it("refuse une saison de plus de 366 jours", () => {
    const parsed = createProgressionSeasonSchema.safeParse({
      ...base,
      startsAt: "2026-01-01T00:00",
      endsAt: "2027-01-05T00:00",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuse un nom vide ou une date non civile", () => {
    expect(
      createProgressionSeasonSchema.safeParse({ ...base, name: "   " }).success,
    ).toBe(false);
    expect(
      createProgressionSeasonSchema.safeParse({
        ...base,
        startsAt: "2026-02-30T10:00",
      }).success,
    ).toBe(false);
  });
});

describe("createProgressionBadgeSchema", () => {
  it("défaut d'icône `star` et description vide tolérée", () => {
    const parsed = createProgressionBadgeSchema.parse({
      seasonId: SEASON,
      name: "Curieux",
    });
    expect(parsed.iconKey).toBe("star");
    expect(parsed.description).toBe("");
  });

  it("refuse une icône hors catalogue", () => {
    expect(
      createProgressionBadgeSchema.safeParse({
        seasonId: SEASON,
        name: "Curieux",
        iconKey: "skull",
      }).success,
    ).toBe(false);
  });
});

describe("createProgressionCollection*Schema", () => {
  it("accepte une collection nommée", () => {
    expect(
      createProgressionCollectionSchema.safeParse({
        seasonId: SEASON,
        name: "Album",
      }).success,
    ).toBe(true);
  });

  it("'' → null pour le visuel, et exige HTTPS sinon", () => {
    expect(
      createProgressionCollectionItemSchema.parse({
        collectionId: COLLECTION,
        name: "Carte 1",
        imageUrl: "",
      }).imageUrl,
    ).toBeNull();
    expect(
      createProgressionCollectionItemSchema.safeParse({
        collectionId: COLLECTION,
        name: "Carte 1",
        imageUrl: "http://cdn.test/1.png",
      }).success,
    ).toBe(false);
    expect(
      createProgressionCollectionItemSchema.safeParse({
        collectionId: COLLECTION,
        name: "Carte 1",
        imageUrl: "https://cdn.test/1.png",
      }).success,
    ).toBe(true);
  });
});

describe("createProgressionMissionSchema", () => {
  const base = {
    seasonId: SEASON,
    name: "Explorateur",
    eventName: "experience_completed",
    target: 3,
    experienceKinds: ["campaign", "quiz"],
  };

  it("applique les défauts (0 clé, aucune origine, non distinct)", () => {
    const parsed = createProgressionMissionSchema.parse(base);
    expect(parsed.keyReward).toBe(0);
    expect(parsed.source).toBeNull();
    expect(parsed.distinctExperiences).toBe(false);
    expect(parsed.badgeId).toBeNull();
    expect(parsed.collectionItemId).toBeNull();
  });

  it("refuse un doublon de famille d'expérience (la RPC lèverait un 22023)", () => {
    expect(
      createProgressionMissionSchema.safeParse({
        ...base,
        experienceKinds: ["quiz", "quiz"],
      }).success,
    ).toBe(false);
  });

  it("refuse une liste vide, un palier hors bornes et un événement inconnu", () => {
    expect(
      createProgressionMissionSchema.safeParse({ ...base, experienceKinds: [] })
        .success,
    ).toBe(false);
    expect(
      createProgressionMissionSchema.safeParse({ ...base, target: 0 }).success,
    ).toBe(false);
    expect(
      createProgressionMissionSchema.safeParse({ ...base, target: 501 }).success,
    ).toBe(false);
    expect(
      createProgressionMissionSchema.safeParse({ ...base, eventName: "spin" })
        .success,
    ).toBe(false);
  });

  it("refuse plus de 100 clés de récompense", () => {
    expect(
      createProgressionMissionSchema.safeParse({ ...base, keyReward: 101 })
        .success,
    ).toBe(false);
  });

  it("'' → null sur les rattachements facultatifs", () => {
    const parsed = createProgressionMissionSchema.parse({
      ...base,
      source: "",
      badgeId: "",
      collectionItemId: ITEM,
    });
    expect(parsed.source).toBeNull();
    expect(parsed.badgeId).toBeNull();
    expect(parsed.collectionItemId).toBe(ITEM);
  });
});

describe("createProgressionChestSchema", () => {
  const base = { seasonId: SEASON, name: "Coffre", keyCost: 2, itemIds: [ITEM] };

  it("accepte un coffre d'au moins un objet", () => {
    expect(createProgressionChestSchema.safeParse(base).success).toBe(true);
  });

  it("refuse un contenu vide, un doublon, ou un coût hors bornes", () => {
    expect(
      createProgressionChestSchema.safeParse({ ...base, itemIds: [] }).success,
    ).toBe(false);
    expect(
      createProgressionChestSchema.safeParse({ ...base, itemIds: [ITEM, ITEM] })
        .success,
    ).toBe(false);
    expect(
      createProgressionChestSchema.safeParse({ ...base, keyCost: 0 }).success,
    ).toBe(false);
    expect(
      createProgressionChestSchema.safeParse({ ...base, keyCost: 101 }).success,
    ).toBe(false);
  });
});

describe("schémas joueur", () => {
  it("activation : un UUID de saison est exigé", () => {
    expect(
      activateProgressionSeasonSchema.safeParse({ seasonId: SEASON }).success,
    ).toBe(true);
    expect(
      activateProgressionSeasonSchema.safeParse({ seasonId: "x" }).success,
    ).toBe(false);
  });

  it("ouverture : '' → null sur la clé d'idempotence, UUID sinon", () => {
    expect(
      openProgressionChestSchema.parse({
        organizationId: ORG,
        chestId: CHEST,
        requestId: "",
      }).requestId,
    ).toBeNull();
    expect(
      openProgressionChestSchema.parse({
        organizationId: ORG,
        chestId: CHEST,
        requestId: SEASON,
      }).requestId,
    ).toBe(SEASON);
    expect(
      openProgressionChestSchema.safeParse({
        organizationId: ORG,
        chestId: CHEST,
        requestId: "pas-un-uuid",
      }).success,
    ).toBe(false);
  });
});
