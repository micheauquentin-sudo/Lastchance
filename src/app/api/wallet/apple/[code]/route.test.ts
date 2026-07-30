// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route OUVERTE À INTERNET dont le SEUL paramètre est un code de retrait :
 * un secret PORTEUR — qui le détient encaisse le lot en caisse. Deux
 * propriétés priment donc sur tout le reste, et ce sont elles que ce fichier
 * verrouille :
 *  1. la réponse ne dit JAMAIS si un code existe. Inconnu, déjà retiré, annulé
 *     ou expiré doivent être indiscernables, sinon la route devient un
 *     vérificateur de codes gratuit — bien plus utile à un attaquant que le pass
 *     lui-même, puisqu'il transforme une recherche à l'aveugle en tri ;
 *  2. le code ne fuit ni dans un cache partagé, ni dans un journal.
 *
 * `normalizeRedeemCode` est volontairement gardé RÉEL : c'est lui qui neutralise
 * les métacaractères PostgREST et les retours chariot avant que l'entrée
 * n'atteigne la base et les en-têtes. Le simuler viderait la moitié des
 * assertions de leur substance.
 */

const mocks = vi.hoisted(() => ({
  appleWalletConfigured: vi.fn<() => boolean>(),
  buildAppleWalletPass: vi.fn<(params: unknown) => Promise<Buffer | null>>(),
  createAdminClient: vi.fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
}));

vi.mock("@/lib/apple-wallet", () => ({
  appleWalletConfigured: () => mocks.appleWalletConfigured(),
  buildAppleWalletPass: (params: unknown) => mocks.buildAppleWalletPass(params),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));
// La route n'importe PAS ce module aujourd'hui. Le mock est un piège posé pour
// demain : il rougit le jour où quelqu'un ajoute un `reportError("wallet", code)`
// pour déboguer un 404, ce qui enverrait des porteurs de droit chez Sentry.
vi.mock("@/lib/monitoring", () => ({
  reportError: (...args: unknown[]) => mocks.reportError(...args),
  reportSecurityEvent: (...args: unknown[]) => mocks.reportSecurityEvent(...args),
}));

import { GET } from "./route";

/** Code au format réellement produit en base : `GAIN-` + 8 lettres/chiffres. */
const CODE = "GAIN-AB2C3D4E";

interface Recorded {
  table: string | null;
  columns: string | null;
  /** Chaque filtre appliqué, dans l'ordre : [méthode, colonne, valeur]. */
  filters: Array<[string, string, unknown]>;
  limit: number | null;
}

/**
 * Enregistre la chaîne PostgREST : from → select → eq → limit → maybeSingle.
 * Le mock n'expose QUE ces méthodes à dessein : introduire un `.or()`, un
 * `.like()` ou un `.ilike()` lève un TypeError et fait tomber le test au lieu
 * de passer inaperçu.
 */
function mockParticipation(row: unknown): Recorded {
  const recorded: Recorded = {
    table: null,
    columns: null,
    filters: [],
    limit: null,
  };
  const query = {
    select: (columns: string) => {
      recorded.columns = columns;
      return query;
    },
    eq: (column: string, value: unknown) => {
      recorded.filters.push(["eq", column, value]);
      return query;
    },
    limit: (value: number) => {
      recorded.limit = value;
      return query;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  mocks.createAdminClient.mockReturnValue({
    from: (table: string) => {
      recorded.table = table;
      return query;
    },
  });
  return recorded;
}

/** Gain vivant : ni retiré, ni annulé, sans échéance. */
function liveRow(overrides: Record<string, unknown> = {}) {
  return {
    redeem_code: CODE,
    redeemed_at: null,
    cancelled_at: null,
    redeem_expires_at: null,
    prizes: { label: "Un café offert", description: "À consommer sur place" },
    organizations: { name: "Chez Marco" },
    ...overrides,
  };
}

function call(code: string) {
  const request = new Request(
    `https://app.example.com/api/wallet/apple/${encodeURIComponent(code)}`,
  );
  return GET(request, { params: Promise.resolve({ code }) });
}

async function snapshot(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    headers: [...response.headers.entries()].sort(),
  };
}

let consoleSpies: Array<{ mockRestore: () => void }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appleWalletConfigured.mockReturnValue(true);
  mocks.buildAppleWalletPass.mockResolvedValue(Buffer.from([80, 75, 3, 4]));
  mockParticipation(liveRow());
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map(
    (level) => vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  for (const spy of consoleSpies) spy.mockRestore();
  vi.useRealTimers();
});

/** Tout ce que les espions de console ont vu, aplati en une seule chaîne. */
function consoleOutput(): string {
  return (["log", "info", "warn", "error", "debug"] as const)
    .flatMap((level) => vi.mocked(console[level]).mock.calls)
    .flat()
    .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
    .join(" | ");
}

describe("GET /api/wallet/apple/[code] — gardes en amont", () => {
  it("sans configuration Apple, refuse SANS jamais interroger la base", async () => {
    mocks.appleWalletConfigured.mockReturnValue(false);

    const response = await call(CODE);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Apple Wallet non configuré" });
    // ROUGIT si le contrôle de configuration passe après la lecture : un
    // déploiement sans certificat paierait alors une requête base par code
    // essayé, c'est-à-dire un amplificateur offert à qui balaie l'espace des
    // codes sur une installation où le bouton n'existe même pas côté client.
    // Ce message-ci ne trahit rien d'un code : il ne dépend que du déploiement.
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.buildAppleWalletPass).not.toHaveBeenCalled();
  });

  it("une saisie qui ne peut désigner aucun code s'arrête avant la base", async () => {
    // Ces entrées se normalisent en chaîne vide : elles ne peuvent correspondre
    // à AUCUNE participation. Le 400 n'est donc pas un oracle — il ne sépare pas
    // « existe » de « n'existe pas », il sépare « code » de « pas un code ».
    // ROUGIT si la garde disparaît : chacune de ces entrées coûterait une
    // requête base, sur une route sans limitation de débit.
    for (const junk of ["", "   ", "%", "GAIN-", "(),"]) {
      const label = `saisie «${junk}»`;
      mocks.createAdminClient.mockClear();

      const response = await call(junk);

      expect(response.status, label).toBe(400);
      expect(await response.json(), label).toEqual({ error: "Code invalide" });
      expect(mocks.createAdminClient, label).not.toHaveBeenCalled();
    }
  });
});

describe("GET /api/wallet/apple/[code] — non-divulgation", () => {
  it("inconnu, retiré, annulé et expiré rendent une réponse RIGOUREUSEMENT identique", async () => {
    // LE test du fichier. Un message qui distinguerait « déjà retiré » de
    // « inconnu » suffirait à valider un code à distance, sans caisse et sans
    // trace : l'attaquant n'aurait plus qu'à balayer et à ne garder que les
    // codes confirmés vivants, puis à les présenter en caisse. Statut, corps ET
    // en-têtes doivent coïncider — un `cache-control` différent suffirait aussi
    // à trier les réponses.
    // ROUGIT à la première tentative d'être serviable envers l'utilisateur
    // (« ce gain a déjà été retiré ») : c'est la régression naturelle ici.
    const cases: Array<[string, unknown]> = [
      ["inconnu", null],
      ["retiré", liveRow({ redeemed_at: "2026-07-01T10:00:00.000Z" })],
      ["annulé", liveRow({ cancelled_at: "2026-07-01T10:00:00.000Z" })],
      ["expiré", liveRow({ redeem_expires_at: "2020-01-01T00:00:00.000Z" })],
    ];

    const results: Array<[string, Awaited<ReturnType<typeof snapshot>>]> = [];
    for (const [name, row] of cases) {
      mockParticipation(row);
      results.push([name, await snapshot(await call(CODE))]);
    }

    expect(results[0][1].status).toBe(404);
    expect(JSON.parse(results[0][1].body)).toEqual({ error: "Gain indisponible" });
    for (const [name, result] of results.slice(1)) {
      expect(result, name).toEqual(results[0][1]);
    }
    // Aucun pass n'est signé pour un gain mort : le fichier .pkpass porte le
    // code en clair dans son code-barres, le produire serait déjà le divulguer.
    expect(mocks.buildAppleWalletPass).not.toHaveBeenCalled();
  });

  it("l'échéance est franchie à la seconde exacte", async () => {
    // Borne `<=` : à l'instant pile de l'échéance, le gain est MORT. La caisse
    // applique la même borne en base ; si la route glissait à `<`, elle
    // délivrerait un pass pour un code que la caisse refuse — le commerçant
    // hérite d'un client qui exhibe un billet valide à l'écran.
    // ROUGIT si `<=` devient `<`.
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2026-07-30T12:00:00.000Z");
    vi.setSystemTime(now);

    mockParticipation(liveRow({ redeem_expires_at: now.toISOString() }));
    expect((await call(CODE)).status).toBe(404);

    mockParticipation(
      liveRow({ redeem_expires_at: new Date(now.getTime() + 1000).toISOString() }),
    );
    expect((await call(CODE)).status).toBe(200);
  });

  it("le code de retrait n'atteint AUCUN journal, dans aucun des scénarios", async () => {
    // Un code de retrait dans les logs de l'hébergeur (ou dans Sentry) est un
    // porteur de droit lisible par quiconque a accès aux logs — c'est-à-dire
    // bien plus de monde que la caisse. Les quatre chemins sont balayés parce
    // que la tentation d'instrumenter naît sur les chemins d'échec.
    // ROUGIT au premier `console.error("[wallet] introuvable", code)`.
    mockParticipation(null);
    await call(CODE);

    mockParticipation(liveRow({ redeemed_at: "2026-07-01T10:00:00.000Z" }));
    await call(CODE);

    mockParticipation(liveRow());
    await call(CODE);

    mocks.buildAppleWalletPass.mockResolvedValue(null);
    await call(CODE);

    expect(consoleOutput()).not.toContain("AB2C3D4E");
    expect(consoleOutput()).toBe("");
    expect(mocks.reportError).not.toHaveBeenCalled();
    expect(mocks.reportSecurityEvent).not.toHaveBeenCalled();
  });

  it("un pass non signable rend une erreur générique", async () => {
    mocks.buildAppleWalletPass.mockResolvedValue(null);

    const response = await call(CODE);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Génération impossible" });
  });
});

describe("GET /api/wallet/apple/[code] — lecture en base", () => {
  it("filtre par ÉGALITÉ sur le code normalisé, et ne lit qu'une ligne", async () => {
    const recorded = mockParticipation(liveRow());

    await call("  gain ab2c3d4e  ");

    expect(recorded.table).toBe("participations");
    // ROUGIT si le filtre passe par `.or()` / `.like()` : `%` deviendrait un
    // joker PostgREST et un unique appel suffirait à récupérer un gain vivant
    // au hasard, sans jamais connaître le moindre code.
    expect(recorded.filters).toEqual([["eq", "redeem_code", CODE]]);
    expect(recorded.limit).toBe(1);
  });

  it("neutralise les métacaractères PostgREST avant la base", async () => {
    // `%`, `,`, `(`, `)` et `\` sont retirés par `sanitizeSearchTerm` : ce sont
    // exactement les caractères qui font la syntaxe des filtres PostgREST.
    const recorded = mockParticipation(null);

    await call("a%b,c(d)e");

    expect(recorded.filters).toEqual([["eq", "redeem_code", "GAIN-ABCDE"]]);
  });

  it("ne demande AUCUNE donnée personnelle du joueur", async () => {
    // `participations` porte `first_name`, `email`, `phone` et `player_key`.
    // Un `select("*")` les ferait transiter par une route publique appelable
    // avec le seul code — et ils finiraient dans le processus qui signe le pass.
    // ROUGIT au premier élargissement de la projection.
    const recorded = mockParticipation(liveRow());

    await call(CODE);

    expect(recorded.columns).not.toMatch(
      /\bfirst_name\b|\bemail\b|\bphone\b|\bplayer_key\b|\*/,
    );
    expect(recorded.columns).toContain("redeemed_at");
    expect(recorded.columns).toContain("cancelled_at");
    expect(recorded.columns).toContain("redeem_expires_at");
  });
});

describe("GET /api/wallet/apple/[code] — pass servi", () => {
  it("sert le .pkpass sans jamais autoriser sa mise en cache", async () => {
    const response = await call(CODE);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.apple.pkpass",
    );
    // `no-store` est la garde essentielle : le corps contient le code en clair
    // (champ « Code » + code-barres). Un `public, s-maxage=…` le ferait recopier
    // dans un cache CDN partagé, d'où il se sert ensuite sans repasser par les
    // contrôles de retrait/annulation/expiration.
    // ROUGIT si quelqu'un « optimise » cette route comme la route TV voisine.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([80, 75, 3, 4]),
    );
  });

  it("construit le pass avec les valeurs de la LIGNE, échéance comprise", async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    mockParticipation(liveRow({ redeem_expires_at: expiresAt }));

    await call(CODE);

    // L'échéance doit être propagée : c'est elle qui fait griser le pass par iOS
    // une fois installé. Sans elle, un pass mort reste affiché comme valide sur
    // le téléphone du client — la caisse refuse, et c'est le commerçant qui
    // encaisse la scène. ROUGIT si `redeemExpiresAt` cesse d'être transmis.
    expect(mocks.buildAppleWalletPass).toHaveBeenCalledWith({
      organizationName: "Chez Marco",
      prizeLabel: "Un café offert",
      prizeDescription: "À consommer sur place",
      redeemCode: CODE,
      redeemExpiresAt: expiresAt,
    });
  });

  it("survit à un lot ou une organisation manquants", async () => {
    // Les deux embeds sont des jointures optionnelles ; une participation dont
    // le lot a été supprimé ne doit pas rendre un 500 sur un gain VIVANT.
    // ROUGIT si les `??` de repli disparaissent (TypeError → 500).
    mockParticipation(liveRow({ prizes: null, organizations: null }));

    const response = await call(CODE);

    expect(response.status).toBe(200);
    expect(mocks.buildAppleWalletPass).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationName: "Votre commerce",
        prizeLabel: "Votre gain",
        prizeDescription: "",
      }),
    );
  });

  it("ne laisse ni retour chariot ni guillemet atteindre les en-têtes", async () => {
    // Le nom de fichier est interpolé dans `content-disposition`. Le retrait des
    // caractères d'espacement par `normalizeRedeemCode` (`[\s]` couvre \r et \n)
    // est ce qui interdit la coupure d'en-tête ; c'est un effet de bord d'une
    // fonction écrite pour la caisse, donc fragile — d'où ce verrou explicite.
    // ROUGIT si le retrait des espaces disparaît de `normalizeRedeemCode`.
    const response = await call("GAIN-AB2C\r\n3D4E");

    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toBe(`attachment; filename="gain-${CODE}.pkpass"`);
    expect(disposition).not.toMatch(/[\r\n]/);
  });
});
