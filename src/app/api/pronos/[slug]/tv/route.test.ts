// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route OUVERTE À INTERNET, sans cookie ni authentification : elle sert le
 * classement d'un championnat à l'écran affiché en salle. Ce qui est verrouillé
 * ici n'est pas « la route répond », c'est ce qu'elle refuse de dire — un
 * message qui distinguerait « brouillon » de « inexistant » transformerait
 * l'endpoint en oracle d'énumération de slugs, et un champ de trop dans la
 * charge utile publierait des coordonnées de joueurs sur un écran de bar.
 */

const mocks = vi.hoisted(() => ({
  loadContestTvContext: vi.fn<(slug: string) => Promise<unknown>>(),
  rateLimit: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
}));

vi.mock("@/lib/pronostics-context", () => ({
  loadContestTvContext: (slug: string) => mocks.loadContestTvContext(slug),
}));

// `RATE_LIMITS` et `rateLimitBucket` restent RÉELS : l'assertion porte alors
// sur la règle du catalogue vivant. Recopier `{ limit: 30, windowSeconds: 60 }`
// dans le test aurait produit un vert qui survit à un desserrage de la règle —
// exactement le genre de test qui ne prouve rien.
// Le relais est variadique À DESSEIN : un troisième argument ajouté à l'appel
// (`{ failClosed: true }`) doit faire ROUGIR l'assertion d'arité ci-dessous, pas
// être silencieusement absorbé par le mock.
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
}));

import { RATE_LIMITS } from "@/lib/rate-limit";
import { GET } from "./route";

const SLUG = "coupe-du-bar-A2B3";

/** Contexte TV nominal, tel que `loadContestTvContext` le rend. */
function tvContext(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    contest: { name: "Coupe du bar", status: "open", finalizedAt: null },
    organization: { name: "Chez Marco", logoUrl: null },
    totalPlayers: 42,
    entries: [
      { rank: 1, firstName: "Ana", avatar: "🦊", points: 24 },
      { rank: 2, firstName: "Bo", avatar: "🐙", points: 18 },
    ],
    generatedAt: "2026-07-30T10:00:00.000Z",
    ...extra,
  };
}

function call(slug: string, headers: Record<string, string> = {}) {
  const request = new Request(
    `https://app.example.com/api/pronos/${encodeURIComponent(slug)}/tv`,
    { headers },
  );
  return GET(request, { params: Promise.resolve({ slug }) });
}

async function snapshot(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    headers: [...response.headers.entries()].sort(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sans fournisseur déclaré, `clientIpFromHeaders` dépend de la présence de la
  // variable VERCEL dans l'environnement du runner : on fige le fournisseur pour
  // que le seau attendu soit le même en local et en CI.
  vi.stubEnv("TRUSTED_PROXY_PROVIDER", "cloudflare");
  mocks.rateLimit.mockResolvedValue(true);
  mocks.loadContestTvContext.mockResolvedValue(tvContext());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/pronos/[slug]/tv — forme du slug", () => {
  it("n'ouvre ni seau de débit ni lecture de base pour un slug hors format", async () => {
    // POURQUOI c'est la garde la plus en amont : la clé du seau est composée
    // AVEC le slug. Valider après aurait laissé n'importe quelle chaîne ouvrir
    // une clé de seau NEUVE à chaque requête — une ligne de `rate_limits` (ou
    // une clé Upstash) écrite au rythme de l'appelant, sans plafond.
    // ROUGIT si la validation passe après `rateLimit`, ou si le motif s'élargit.
    const mauvais = [
      "",
      "abc",
      "a".repeat(65),
      "slug_avec_souligne",
      "slug.point",
      "slug/tv",
      "slug%20",
    ];
    for (const bad of mauvais) {
      const label = `slug «${bad}»`;
      mocks.rateLimit.mockClear();
      mocks.loadContestTvContext.mockClear();

      const response = await call(bad);

      expect(response.status, label).toBe(404);
      // Même corps que pour un championnat inconnu : la forme du slug ne doit
      // pas non plus se lire dans la réponse.
      expect(await response.json(), label).toEqual({
        error: "Championnat indisponible",
      });
      expect(mocks.rateLimit, label).not.toHaveBeenCalled();
      expect(mocks.loadContestTvContext, label).not.toHaveBeenCalled();
    }
  });

  it("accepte les deux bornes du format", async () => {
    // Les slugs réels font 8 caractères (`randomCode(8)`) ; les bornes 4 et 64
    // sont la marge. ROUGIT si quelqu'un resserre le motif sans mesurer, ce qui
    // rendrait 404 des écrans en salle qui fonctionnaient la veille.
    for (const good of ["abcd", "A".repeat(64), "MiXtE-42"]) {
      mocks.rateLimit.mockClear();
      const response = await call(good);
      expect(response.status, good).toBe(200);
      expect(mocks.rateLimit, good).toHaveBeenCalledTimes(1);
    }
  });
});

describe("GET /api/pronos/[slug]/tv — limitation de débit", () => {
  it("consomme un jeton clé sur le championnat ET sur l'IP appelante", async () => {
    await call(SLUG, { "cf-connecting-ip": "203.0.113.7" });

    // Les deux composantes comptent, et pour des raisons opposées :
    // – sans le SLUG, l'écran d'un commerce épuiserait le budget des écrans de
    //   tous les autres commerces (seau plateforme) ;
    // – sans l'IP, un seul robot suffirait à couper l'écran d'un championnat
    //   pour la salle entière.
    // L'assertion porte sur DEUX arguments exactement : `failClosed` doit rester
    // absent — un écran en salle qui perd Upstash doit continuer d'afficher, pas
    // se transformer en 429 permanent.
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      `prono:tv:${SLUG}:203.0.113.7`,
      RATE_LIMITS.pronoTvIp,
    );
  });

  it("sépare les seaux de deux IP distinctes", async () => {
    await call(SLUG, { "cf-connecting-ip": "203.0.113.7" });
    await call(SLUG, { "cf-connecting-ip": "198.51.100.9" });

    // Chaque appel consomme deux seaux (plafond par IP seule, puis seau par
    // championnat) : quatre clés, toutes distinctes, aucune partagée entre les
    // deux IP.
    const buckets = mocks.rateLimit.mock.calls.map((args) => args[0]);
    expect(new Set(buckets).size).toBe(4);
  });

  it("le plafond par IP SEULE est consommé avant le seau par championnat (SEC-1/SEC-4)", async () => {
    await call(SLUG, { "cf-connecting-ip": "203.0.113.7" });

    // LE DÉFAUT QUE CE TEST FERME. `prono:tv:<slug>:<ip>` est composé avec un
    // slug que l'APPELANT choisit : en boucler des inventés ouvrait un seau
    // NEUF à chaque tour — 30 req/min chacun — et une écriture de rate-limit
    // avec lui. L'ORDRE est tout le correctif.
    //
    // DEUX arguments exactement, ici aussi : `failClosed` doit rester absent,
    // sinon une panne d'Upstash éteindrait les écrans de toutes les salles.
    const [premier] = mocks.rateLimit.mock.calls;
    expect(premier).toEqual([
      "prono:tv:ip:203.0.113.7",
      RATE_LIMITS.pronoTvIpCeiling,
    ]);
  });

  it("le plafond par IP saturé n'atteint AUCUN seau par championnat", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    const response = await call(SLUG, { "cf-connecting-ip": "203.0.113.7" });

    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(429);
  });

  it("sans IP mesurable, le plafond ne s'applique pas (jamais d'interrupteur global)", async () => {
    // Sans en-tête de proxy de confiance, `clientIpFromHeaders` rend `unknown` :
    // tous les écrans du parc tomberaient dans une seule ligne, et y refuser
    // les éteindrait tous d'un coup — l'interrupteur qu'ADR-032 interdit.
    await call(SLUG);

    const buckets = mocks.rateLimit.mock.calls.map((args) => String(args[0]));
    expect(buckets.some((b) => b.startsWith("prono:tv:ip:"))).toBe(false);
    expect(buckets).toEqual([`prono:tv:${SLUG}:unknown`]);
  });

  it("tranche AVANT toute lecture de base", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    const response = await call(SLUG);

    expect(response.status).toBe(429);
    // ROUGIT si la lecture précède le seau : le refus ne coûterait alors plus
    // rien à l'appelant mais coûterait une requête base à chaque tentative,
    // c'est-à-dire un amplificateur de charge au lieu d'un frein.
    expect(mocks.loadContestTvContext).not.toHaveBeenCalled();
  });

  it("ne laisse jamais mettre un refus en cache", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    const response = await call(SLUG);

    // Un 429 mis en cache par un CDN partagé prolongerait le refus bien au-delà
    // de la fenêtre du seau, pour tous les écrans derrière ce cache.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("GET /api/pronos/[slug]/tv — indisponibilité", () => {
  it("rend une réponse RIGOUREUSEMENT identique quel que soit le motif", async () => {
    // Les trois motifs que `loadContestTvContext` sait distinguer :
    // championnat inexistant, brouillon non ouvert, module coupé (abonnement).
    // Les distinguer côté client donnerait un oracle gratuit : « ce slug existe
    // mais n'est pas publié » suffit à confirmer qu'un commerce prépare une
    // opération, et à énumérer les slugs valides sans jamais en ouvrir un.
    // ROUGIT dès que quelqu'un écrit `{ error: tv.error }` — la tentation est
    // réelle, le loader porte des messages soignés faits pour la page publique.
    const motifs = [
      "Ce championnat n'existe pas.",
      "Ce championnat n'est pas encore ouvert.",
      "Ce championnat est momentanément désactivé.",
    ];

    const snapshots: Array<Awaited<ReturnType<typeof snapshot>>> = [];
    for (const error of motifs) {
      mocks.loadContestTvContext.mockResolvedValueOnce({ ok: false, error });
      const response = await call(SLUG);
      snapshots.push(await snapshot(response));
    }

    expect(snapshots[0].status).toBe(404);
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
    for (const motif of motifs) {
      expect(snapshots[0].body).not.toContain(motif);
    }
    expect(JSON.parse(snapshots[0].body)).toEqual({
      error: "Championnat indisponible",
    });
  });

  it("fait quand même payer un jeton pour un slug bien formé mais inconnu", async () => {
    // Sinon l'énumération de slugs valides est gratuite : seuls les slugs
    // EXISTANTS coûteraient, ce qui est exactement l'inverse de ce qu'on veut.
    mocks.loadContestTvContext.mockResolvedValue({ ok: false, error: "nope" });

    await call(SLUG);

    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/pronos/[slug]/tv — charge utile", () => {
  it("ne rend QUE les cinq champs de la liste blanche", async () => {
    // Le contexte est volontairement empoisonné avec des champs qui n'ont rien
    // à faire sur un écran public. ROUGIT si la route repasse à `...tv` : la
    // liste blanche explicite est la seule chose qui empêche un futur champ
    // ajouté au loader (identifiants internes, réponse subsidiaire, client
    // admin) d'être publié sans que personne ne le décide.
    mocks.loadContestTvContext.mockResolvedValue(
      tvContext({
        contestId: "11111111-1111-1111-1111-111111111111",
        organizationId: "22222222-2222-2222-2222-222222222222",
        tiebreakerAnswer: 7,
      }),
    );

    const body = await (await call(SLUG)).json();

    expect(Object.keys(body).sort()).toEqual([
      "contest",
      "entries",
      "generatedAt",
      "organization",
      "totalPlayers",
    ]);
    // `ok` fait partie du contrat du loader : le voir sortir signerait le
    // passe-plat, c'est le canari le moins coûteux à vérifier.
    expect(body).not.toHaveProperty("ok");
    expect(JSON.stringify(body)).not.toContain("11111111");
    expect(JSON.stringify(body)).not.toContain("22222222");
    expect(JSON.stringify(body)).not.toContain("tiebreakerAnswer");
  });

  it("ne publie du classement que rang, prénom, avatar et points", async () => {
    // Le prénom EST assumé par le produit (c'est l'objet même d'un classement
    // affiché en salle) ; l'email ne l'est pas — et la ligne brute du RPC
    // `contest_leaderboard` en porte un (`ContestLeaderboardRow.email`).
    // ATTENTION, périmètre : la liste blanche PAR LIGNE est appliquée dans
    // `loadContestTvContext` (src/lib/pronostics-context.ts), pas ici — la route
    // fait un passe-plat sur `tv.entries`. Ce test verrouille le contrat rendu ;
    // il ne peut pas rattraper une fuite introduite dans le loader.
    const body = await (await call(SLUG)).json();

    expect(body.entries).toHaveLength(2);
    for (const entry of body.entries) {
      expect(Object.keys(entry).sort()).toEqual([
        "avatar",
        "firstName",
        "points",
        "rank",
      ]);
    }
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("sert une photo partagée 30 s et non indexable", async () => {
    const response = await call(SLUG);

    // `public, s-maxage=30` est délibéré : plusieurs écrans du même commerce
    // partagent la même photo. Repasser en `no-store` ferait retomber CHAQUE
    // écran sur la base toutes les 30 s (le classement est un agrégat SQL).
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=60",
    );
    // Sans `noindex`, un moteur publierait les prénoms des joueurs d'un bar
    // hors de ce bar, et de façon durable.
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
