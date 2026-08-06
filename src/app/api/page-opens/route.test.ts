// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/page-opens` est l'une des rares routes OUVERTES À INTERNET sans jeton ni
 * session : n'importe qui peut la marteler. Ce qui est verrouillé ici n'est
 * donc pas le comptage lui-même (best-effort, assumé) mais les trois
 * propriétés qui empêchent la route de devenir un levier : le slug est
 * validé avant d'atteindre la base, le seau est consommé avant l'écriture,
 * et la réponse est rigoureusement identique dans tous les cas.
 */

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
  consoleError: vi.fn(),
}));

// Seul `rateLimit` est simulé : `RATE_LIMITS` et `rateLimitBucket` restent
// les vrais. Les remplacer ferait vérifier au test la clé de seau qu'il
// aurait lui-même inventée, et un changement de règle passerait inaperçu.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    rateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

// `@/lib/request-ip` n'est VOLONTAIREMENT pas simulé : la composition de la
// clé de seau dépend de sa politique d'en-têtes de confiance, et c'est
// précisément ce couplage qu'on veut voir tomber s'il change.
import { RATE_LIMITS } from "@/lib/rate-limit";
import * as pageOpensRoute from "./route";

const { POST } = pageOpensRoute;

function pageOpenRequest(slug: string | null, headers: Record<string, string> = {}) {
  const url = new URL("https://app.example.com/api/page-opens");
  if (slug !== null) url.searchParams.set("slug", slug);
  return new Request(url.toString(), { method: "POST", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Politique d'IP remise à zéro AVANT chaque cas : sur une machine où
  // `VERCEL` est défini, la clé de seau changerait de forme sans que le
  // test ne dise pourquoi.
  delete process.env.TRUSTED_PROXY_PROVIDER;
  delete process.env.VERCEL;
  mocks.rateLimit.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
  vi.spyOn(console, "error").mockImplementation(mocks.consoleError);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TRUSTED_PROXY_PROVIDER;
  delete process.env.VERCEL;
});

describe("POST /api/page-opens — validation de l'entrée", () => {
  // Le slug est concaténé dans aucune requête SQL (la RPC est paramétrée),
  // mais il sert de CLÉ DE SEAU : un slug libre = un seau neuf par requête,
  // donc plus aucune limite. La validation est ce qui borne l'espace des clés.
  it.each([
    ["absent", null],
    ["vide", ""],
    ["trop court (3 caractères)", "abc"],
    ["trop long (65 caractères)", "a".repeat(65)],
    ["avec un espace", "promo ete"],
    ["avec un souligné", "promo_ete"],
    ["avec une barre oblique", "promo/ete"],
    ["remontant dans l'arborescence", "../../etc/passwd"],
    ["portant une apostrophe", "promo'; drop table qr_codes;--"],
    ["portant un caractère nul", `promo${String.fromCharCode(0)}ete`],
    ["portant un retour à la ligne (injection de journal)", "promo\nete"],
  ])("un slug %s n'atteint jamais la base et répond quand même 204", async (_cas, slug) => {
    const response = await POST(pageOpenRequest(slug));

    // Rougirait si SLUG_RE était assoupli, ou si la validation passait
    // APRÈS l'ouverture du client d'administration (qui contourne la RLS).
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    // ET pas même le seau : c'est LA propriété que ce bloc prétend garder.
    // Déplacer la validation après `rateLimit` laisserait les trois
    // assertions ci-dessus vertes (le client n'est ouvert qu'après un
    // verdict favorable) alors qu'un slug libre rouvrirait un seau NEUF à
    // chaque requête — plus aucune limite, et une écriture de rate-limit
    // (upsert dans `public.rate_limits`) offerte à chaque coup de l'attaquant.
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("accepte le format exact de la contrainte SQL sur qr_codes.slug", async () => {
    // La borne haute et la borne basse sont testées des DEUX côtés : un
    // format plus permissif que la colonne ferait écrire des seaux pour des
    // slugs que la base ne peut pas porter ; plus strict, il ferait cesser
    // de compter des QR pourtant valides et déjà imprimés.
    for (const slug of ["abcd", "a".repeat(64), "Promo-Ete-2026", "1234"]) {
      mocks.rpc.mockClear();
      await POST(pageOpenRequest(slug));
      expect(mocks.rpc, slug).toHaveBeenCalledWith("increment_qr_scan", {
        p_slug: slug,
      });
    }
  });
});

describe("POST /api/page-opens — seau de limitation", () => {
  it("consomme un jeton par (QR, IP) AVANT d'écrire, et en fail-closed", async () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";

    await POST(pageOpenRequest("promo-ete", { "x-real-ip": "203.0.113.7" }));

    // La clé porte le QR ET l'IP : sur le seul QR, un visiteur unique
    // couperait le comptage de tous les autres ; sur la seule IP, un
    // commerce multi-QR verrait ses campagnes se voler leur budget.
    // `failClosed` : une panne du compteur ne doit pas ouvrir le gonflage
    // des statistiques — ici elle ne coûte qu'une statistique perdue,
    // jamais un refus joueur (la réponse reste 204 dans tous les cas).
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      "scan:promo-ete:203.0.113.7",
      RATE_LIMITS.scanIp,
      { failClosed: true },
    );
    expect(mocks.rpc).toHaveBeenCalledWith("increment_qr_scan", {
      p_slug: "promo-ete",
    });
  });

  it("seau refusé : aucune écriture, et la même réponse 204", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    const response = await POST(pageOpenRequest("promo-ete"));

    // Rougirait si la RPC passait avant le seau, ou si son verdict était
    // consulté puis ignoré — c'est-à-dire si le seau devenait décoratif.
    expect(response.status).toBe(204);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("deux visiteurs ne partagent pas le seau d'un même QR", async () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";

    await POST(pageOpenRequest("promo-ete", { "x-real-ip": "203.0.113.7" }));
    await POST(pageOpenRequest("promo-ete", { "x-real-ip": "198.51.100.4" }));

    const [premier, second] = mocks.rateLimit.mock.calls.map((call) => call[0]);
    // Rougirait si l'IP sortait de la clé : le 61ᵉ scan d'une affiche
    // arrêterait le comptage pour tout le monde pendant une minute.
    expect(premier).not.toBe(second);
    expect(premier).toBe("scan:promo-ete:203.0.113.7");
    expect(second).toBe("scan:promo-ete:198.51.100.4");
  });

  it("deux QR d'un même visiteur ne partagent pas le seau", async () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";

    await POST(pageOpenRequest("promo-ete", { "x-real-ip": "203.0.113.7" }));
    await POST(pageOpenRequest("promo-hiver", { "x-real-ip": "203.0.113.7" }));

    const [premier, second] = mocks.rateLimit.mock.calls.map((call) => call[0]);
    expect(premier).not.toBe(second);
  });

  it("sans proxy déclaré, les en-têtes forgeables ne composent pas la clé", async () => {
    // Rougirait si la route lisait `x-forwarded-for` sans proxy de
    // confiance : un bot changerait d'en-tête à chaque requête, ouvrirait
    // un seau neuf à chaque fois et gonflerait le compteur sans plafond —
    // et chaque requête coûterait en prime une écriture de rate-limit.
    const response = await POST(
      pageOpenRequest("promo-ete", {
        "x-forwarded-for": "203.0.113.9",
        "x-real-ip": "203.0.113.8",
      }),
    );

    expect(response.status).toBe(204);
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      "scan:promo-ete:unknown",
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("POST /api/page-opens — aucune fuite", () => {
  it("un échec de la RPC ne remonte ni en 500 ni dans la réponse", async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: 'permission denied for table "qr_codes"' },
    });

    const enPanne = await POST(pageOpenRequest("promo-ete"));
    const corps = await enPanne.text();

    // Rougirait si la route relayait l'erreur : le beacon tourne sur une
    // page publique, chaque visiteur verrait une 500 dans sa console et le
    // message PostgREST révélerait le nom des tables.
    expect(enPanne.status).toBe(204);
    expect(corps).toBe("");
    expect(corps).not.toContain("permission denied");
    // La panne reste néanmoins JOURNALISÉE : sans cette trace, un compteur
    // qui n'écrit plus rien serait indistinguable d'un commerce sans
    // visiteurs. (Résidu connu : ce journal ne part pas dans Sentry.)
    expect(mocks.consoleError).toHaveBeenCalledWith(
      "[page-opens] compteur:",
      'permission denied for table "qr_codes"',
    );
  });

  it("la réponse est identique que le comptage réussisse ou échoue", async () => {
    // Anti-oracle : rien dans la réponse ne permet de distinguer un QR
    // existant d'un slug inventé. Rougirait si un 404 apparaissait sur QR
    // inconnu — un tiers énumérerait alors les QR d'un commerce.
    const ok = await POST(pageOpenRequest("promo-ete"));
    mocks.rpc.mockResolvedValue({ error: { message: "no rows" } });
    const inconnu = await POST(pageOpenRequest("slug-invente"));

    expect(inconnu.status).toBe(ok.status);
    expect(await inconnu.text()).toBe(await ok.text());
    expect([...inconnu.headers.keys()]).toEqual([...ok.headers.keys()]);
  });
});

describe("POST /api/page-opens — surface exposée", () => {
  it("n'expose que POST", () => {
    // Rougirait si un GET était ajouté : préchargements de navigateur,
    // scanners d'antivirus, aperçus de messagerie et caches CDN
    // incrémenteraient le compteur, et un simple <img src> tiers
    // deviendrait un incrémenteur à distance.
    // unsafe-cast-justification: on REFLECHIT sur l espace de noms du module
    // pour prouver qu un verbe n est PAS exporte. Le type du namespace ne
    // decrit que ce qui existe ; interroger ce qui n existe pas exige de
    // sortir du type. C'est l'objet même de ce test.
    // unsafe-cast-justification: réflexion sur l'espace de noms du module, pour
    // prouver qu'aucun verbe autre que POST n'est exporté.
    // unsafe-cast-justification: reflexion sur l'espace de noms du module — prouver qu'un verbe n'est PAS exporte oblige a sortir du type, qui ne decrit que ce qui existe.
    const surface = pageOpensRoute as unknown as Record<string, unknown>;
    for (const verbe of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(surface[verbe], verbe).toBeUndefined();
    }
    expect(typeof surface.POST).toBe("function");
  });

  it("reste dynamique", () => {
    // Raison d'être de la route : /play est servie depuis le cache ISR, le
    // comptage ne peut plus se faire à son rendu. Une réponse mise en cache
    // ici arrêterait le comptage en silence — le compteur se figerait sans
    // qu'aucune erreur n'apparaisse nulle part.
    expect(pageOpensRoute.dynamic).toBe("force-dynamic");
  });
});

/**
 * ── Le chemin MODULE (quiz, calendrier, jackpot, pronostics, fidélité, event,
 *    chasse au trésor)
 *
 * Même route, même seau, même 204 muette. Ce qui change : l'identifiant public
 * n'est plus forcément un slug (uuid pour le passeport, code de jonction à six
 * lettres pour l'événement, jeton d'étape pour la chasse), et le module devient
 * une part de la clé de seau.
 */
function moduleRequest(
  moduleKey: string | null,
  id: string | null,
  headers: Record<string, string> = {},
) {
  const url = new URL("https://app.example.com/api/page-opens");
  if (moduleKey !== null) url.searchParams.set("module", moduleKey);
  if (id !== null) url.searchParams.set("id", id);
  return new Request(url.toString(), { method: "POST", headers });
}

describe("POST /api/page-opens — comptage par module", () => {
  it("compte les sept modules équipés, chacun avec son identifiant public", async () => {
    // Rougirait sur une faute de frappe dans le vocabulaire : `event` au lieu
    // d'`events`, `contest` au lieu de `pronostics`. La RPC ne lèverait pas —
    // elle rendrait simplement sans rien compter, et le commerçant lirait 0
    // pour toujours sans qu'aucune erreur n'apparaisse nulle part.
    const cas: Array<[string, string]> = [
      ["quiz", "quiz-de-noel"],
      ["calendar", "calendrier-2026"],
      ["jackpot", "b3f1c2d4-0000-4000-8000-00000000000a"],
      ["pronostics", "ligue-1-j12"],
      ["loyalty", "b3f1c2d4-0000-4000-8000-00000000000b"],
      ["events", "TAPQR7"],
      // La chasse passe le jeton de l'ÉTAPE (`/hunt/[token]`), pas
      // l'identifiant de la chasse : le compteur est par affiche.
      ["hunts", "aB3d-etape-1-9f2c"],
    ];
    for (const [moduleKey, publicId] of cas) {
      mocks.rpc.mockClear();
      const response = await POST(moduleRequest(moduleKey, publicId));
      expect(response.status).toBe(204);
      expect(mocks.rpc, moduleKey).toHaveBeenCalledWith(
        "increment_module_page_open",
        { p_module: moduleKey, p_public_id: publicId },
      );
    }
  });

  it.each([
    ["inconnu", "referral"],
    ["au singulier alors que le vocabulaire est au pluriel", "event"],
    // `hunt` au singulier : le dépôt fait cohabiter les deux formes, et c'est
    // `hunts` qui compte. Se tromper de forme donnerait un compteur mort.
    ["au singulier pour la chasse, dont la clé est au pluriel", "hunt"],
    ["du vocabulaire des récompenses et non des modules", "contest"],
    ["la roue, qui a déjà son propre compteur", "wheel"],
    ["vide", ""],
    ["forgé", "'; drop table module_page_opens;--"],
  ])(
    "un module %s n'atteint jamais la base et ne consomme pas de seau",
    async (_cas, moduleKey) => {
      const response = await POST(moduleRequest(moduleKey, "quiz-de-noel"));

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      // Même propriété que pour le slug de la roue : un module libre serait un
      // seau neuf par requête, donc plus aucune limite.
      expect(mocks.rateLimit).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["absent", null],
    ["vide", ""],
    ["trop court", "abc"],
    ["trop long", "a".repeat(65)],
    ["avec une barre oblique", "quiz/noel"],
    ["remontant dans l'arborescence", "../../etc/passwd"],
    ["portant un retour à la ligne", "quiz\nnoel"],
  ])(
    "un identifiant public %s n'atteint jamais la base",
    async (_cas, publicId) => {
      const response = await POST(moduleRequest("quiz", publicId));

      expect(response.status).toBe(204);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.rateLimit).not.toHaveBeenCalled();
    },
  );

  it("le format accepté couvre les TROIS formes d'identifiant public", async () => {
    // Un slug, un uuid (passeport et jackpot) et un code de jonction à six
    // lettres (événement). Resserrer la regex sur le seul format slug ferait
    // cesser de compter deux modules sur six, en silence.
    for (const publicId of [
      "promo-ete",
      "b3f1c2d4-1111-4000-8000-00000000000c",
      "TAPQR7",
    ]) {
      mocks.rpc.mockClear();
      await POST(moduleRequest("quiz", publicId));
      expect(mocks.rpc, publicId).toHaveBeenCalledWith(
        "increment_module_page_open",
        { p_module: "quiz", p_public_id: publicId },
      );
    }
  });

  it("consomme un jeton par (module, ressource, IP) AVANT d'écrire, en fail-closed", async () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";

    await POST(
      moduleRequest("quiz", "quiz-de-noel", { "x-real-ip": "203.0.113.7" }),
    );

    expect(mocks.rateLimit).toHaveBeenCalledWith(
      "scan:quiz:quiz-de-noel:203.0.113.7",
      RATE_LIMITS.scanIp,
      { failClosed: true },
    );
  });

  it("le module fait partie de la clé de seau", async () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";
    // Deux modules peuvent porter le MÊME identifiant public (rien n'impose
    // l'unicité entre les six tables). Sans le module dans la clé, l'affiche
    // d'un quiz couperait le comptage du calendrier homonyme.
    await POST(moduleRequest("quiz", "noel", { "x-real-ip": "203.0.113.7" }));
    await POST(
      moduleRequest("calendar", "noel", { "x-real-ip": "203.0.113.7" }),
    );

    const [premier, second] = mocks.rateLimit.mock.calls.map((call) => call[0]);
    expect(premier).not.toBe(second);
  });

  it("seau refusé : aucune écriture, et la même réponse 204", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    const response = await POST(moduleRequest("quiz", "quiz-de-noel"));

    expect(response.status).toBe(204);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("un échec de la RPC ne remonte ni en 500 ni dans la réponse", async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: 'permission denied for table "module_page_opens"' },
    });

    const response = await POST(moduleRequest("quiz", "quiz-de-noel"));
    const corps = await response.text();

    expect(response.status).toBe(204);
    expect(corps).toBe("");
    expect(corps).not.toContain("permission denied");
    expect(mocks.consoleError).toHaveBeenCalledWith(
      "[page-opens] compteur module:",
      'permission denied for table "module_page_opens"',
    );
  });

  it("la présence de `module` n'incrémente JAMAIS le compteur de la roue", async () => {
    // Les deux paramètres ensemble : un appelant confus, ou un attaquant qui
    // tente de faire compter deux fois. Une seule RPC doit partir.
    const url = new URL("https://app.example.com/api/page-opens");
    url.searchParams.set("module", "quiz");
    url.searchParams.set("id", "quiz-de-noel");
    url.searchParams.set("slug", "promo-ete");

    await POST(new Request(url.toString(), { method: "POST" }));

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("increment_module_page_open", {
      p_module: "quiz",
      p_public_id: "quiz-de-noel",
    });
  });

  it("la réponse est identique que la ressource existe ou non", async () => {
    // Anti-oracle : la RPC ne crée rien pour un identifiant inconnu, et rien
    // dans la réponse ne permet de le distinguer d'un identifiant réel. Un
    // tiers ne peut donc pas énumérer les quiz d'un commerce.
    const connu = await POST(moduleRequest("quiz", "quiz-de-noel"));
    const inconnu = await POST(moduleRequest("quiz", "quiz-invente"));

    expect(inconnu.status).toBe(connu.status);
    expect(await inconnu.text()).toBe(await connu.text());
    expect([...inconnu.headers.keys()]).toEqual([...connu.headers.keys()]);
  });
});
