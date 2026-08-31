import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LA CARTE DE FIDÉLITÉ GOOGLE WALLET, ET SURTOUT SON ABSENCE.
 *
 * La propriété la plus importante gardée ici n'est pas le contenu de la carte :
 * c'est le SILENCE quand le compte émetteur n'est pas configuré. C'est l'état
 * de tous les déploiements tant que le propriétaire n'a pas créé son compte
 * chez Google, et rien — ni le rendu du passeport, ni un tampon en caisse — ne
 * doit s'en apercevoir autrement que par un bouton absent.
 */

const { buildGoogleWalletLoyaltySaveUrl, pushGoogleWalletLoyaltyBalance, googleWalletLoyaltyObjectSuffix } =
  await import("@/lib/google-wallet");

/** Une vraie paire RSA : la signature est réellement calculée, pas simulée. */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const CARTE = {
  programId: "11111111-1111-4111-8111-111111111111",
  memberTokenHash: "a".repeat(64),
  organizationName: "Café des Sports",
  programName: "Carte du Café",
  logoUrl: "https://exemple.test/logo.png",
  pointsBalance: 42,
  tierLabel: "Argent",
};

function configurer(): void {
  vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000000000001");
  vi.stubEnv("GOOGLE_WALLET_CLIENT_EMAIL", "wallet@exemple.iam.gserviceaccount.com");
  // Comme dans un gestionnaire de variables : la clé tient sur UNE ligne, les
  // sauts de ligne y sont échappés. Le module doit les rétablir pour signer.
  vi.stubEnv("GOOGLE_WALLET_PRIVATE_KEY", PEM.replace(/\n/g, "\\n"));
}

/** Le corps du JWT « save to wallet », décodé. */
function payloadDe(url: string): Record<string, unknown> {
  const jwt = url.slice("https://pay.google.com/gp/v/save/".length);
  const body = jwt.split(".")[1];
  return JSON.parse(Buffer.from(body, "base64url").toString()) as Record<
    string,
    unknown
  >;
}

function objetDe(url: string): Record<string, unknown> {
  const payload = payloadDe(url).payload as {
    loyaltyObjects: Record<string, unknown>[];
  };
  return payload.loyaltyObjects[0];
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "");
  vi.stubEnv("GOOGLE_WALLET_CLIENT_EMAIL", "");
  vi.stubEnv("GOOGLE_WALLET_PRIVATE_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildGoogleWalletLoyaltySaveUrl — sans configuration", () => {
  it("rend null, sans lever, quand AUCUNE variable n'est posée", () => {
    expect(() => buildGoogleWalletLoyaltySaveUrl(CARTE)).not.toThrow();
    expect(buildGoogleWalletLoyaltySaveUrl(CARTE)).toBeNull();
  });

  it("rend null dès qu'UNE SEULE des trois manque", () => {
    configurer();
    vi.stubEnv("GOOGLE_WALLET_PRIVATE_KEY", "");
    expect(buildGoogleWalletLoyaltySaveUrl(CARTE)).toBeNull();

    configurer();
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "");
    expect(buildGoogleWalletLoyaltySaveUrl(CARTE)).toBeNull();

    configurer();
    vi.stubEnv("GOOGLE_WALLET_CLIENT_EMAIL", "");
    expect(buildGoogleWalletLoyaltySaveUrl(CARTE)).toBeNull();
  });

  it("rend null — et ne lève pas — si la clé privée est illisible", () => {
    configurer();
    vi.stubEnv("GOOGLE_WALLET_PRIVATE_KEY", "pas-une-cle-pem");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => buildGoogleWalletLoyaltySaveUrl(CARTE)).not.toThrow();
    expect(buildGoogleWalletLoyaltySaveUrl(CARTE)).toBeNull();
  });
});

describe("buildGoogleWalletLoyaltySaveUrl — configuré", () => {
  beforeEach(configurer);

  it("signe un lien « save to wallet » portant une classe et un objet", () => {
    const url = buildGoogleWalletLoyaltySaveUrl(CARTE);
    expect(url).not.toBeNull();
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);

    const payload = payloadDe(url as string);
    expect(payload.typ).toBe("savetowallet");
    expect(payload.iss).toBe("wallet@exemple.iam.gserviceaccount.com");

    const inner = payload.payload as {
      loyaltyClasses: Record<string, unknown>[];
      loyaltyObjects: Record<string, unknown>[];
    };
    expect(inner.loyaltyClasses).toHaveLength(1);
    expect(inner.loyaltyObjects).toHaveLength(1);
    expect(inner.loyaltyClasses[0].issuerName).toBe("Café des Sports");
    expect(inner.loyaltyClasses[0].programName).toBe("Carte du Café");
  });

  it("porte le solde et le niveau, tels qu'ils s'affichent sur le passeport", () => {
    const objet = objetDe(buildGoogleWalletLoyaltySaveUrl(CARTE) as string);
    expect(objet.loyaltyPoints).toEqual({
      label: "Points",
      balance: { string: "42" },
    });
    expect(objet.secondaryLoyaltyPoints).toEqual({
      label: "Niveau",
      balance: { string: "Argent" },
    });
  });

  /**
   * LE CŒUR DE L'ARBITRAGE — le QR porte l'URL PUBLIQUE du passeport, jamais
   * un jeton. Le laissez-passer du comptoir vit trois minutes : gravé dans une
   * carte, il serait périmé avant le premier passage en caisse.
   */
  it("grave un LIEN dans le QR, et aucune valeur secrète", () => {
    const objet = objetDe(buildGoogleWalletLoyaltySaveUrl(CARTE) as string);
    const barcode = objet.barcode as { type: string; value: string };

    expect(barcode.type).toBe("QR_CODE");
    expect(barcode.value).toContain(`/passeport/${CARTE.programId}`);
    // Ni le jeton passeport, ni son empreinte de base : la carte ne porte
    // aucune créance.
    expect(barcode.value).not.toContain(CARTE.memberTokenHash);
  });

  it("n'expose JAMAIS l'empreinte du jeton passeport dans le lien", () => {
    const url = buildGoogleWalletLoyaltySaveUrl(CARTE) as string;
    // L'URL est visible du client : la colonne `loyalty_members.token_hash`
    // ne doit s'y retrouver ni en clair, ni via l'identifiant de l'objet.
    expect(url).not.toContain(CARTE.memberTokenHash);
    expect(JSON.stringify(payloadDe(url))).not.toContain(CARTE.memberTokenHash);
  });

  it("omet le logo quand l'organisation n'en a pas", () => {
    const url = buildGoogleWalletLoyaltySaveUrl({
      ...CARTE,
      logoUrl: null,
    }) as string;
    const classe = (
      payloadDe(url).payload as { loyaltyClasses: Record<string, unknown>[] }
    ).loyaltyClasses[0];
    expect(classe.programLogo).toBeUndefined();
    // …et le reste de la carte tient debout sans lui.
    expect(classe.issuerName).toBe("Café des Sports");
  });
});

describe("googleWalletLoyaltyObjectSuffix", () => {
  it("est déterministe : la caisse retrouve l'objet émis par le passeport", () => {
    const a = googleWalletLoyaltyObjectSuffix("prog", "hash");
    const b = googleWalletLoyaltyObjectSuffix("prog", "hash");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("sépare deux membres, et deux programmes", () => {
    expect(googleWalletLoyaltyObjectSuffix("prog", "h1")).not.toBe(
      googleWalletLoyaltyObjectSuffix("prog", "h2"),
    );
    expect(googleWalletLoyaltyObjectSuffix("p1", "h")).not.toBe(
      googleWalletLoyaltyObjectSuffix("p2", "h"),
    );
  });
});

describe("pushGoogleWalletLoyaltyBalance", () => {
  const MISE_A_JOUR = {
    programId: "prog-1",
    memberTokenHash: "b".repeat(64),
    pointsBalance: 7,
    tierLabel: "Bronze",
  };

  it("ne fait AUCUN appel réseau sans configuration", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      pushGoogleWalletLoyaltyBalance(MISE_A_JOUR),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("n'échoue JAMAIS : un réseau coupé ne remonte pas au tampon", async () => {
    configurer();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      pushGoogleWalletLoyaltyBalance(MISE_A_JOUR),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("reste silencieux sur 404 — le client n'a jamais ajouté la carte", async () => {
    configurer();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "jeton" }), {
          status: 200,
        });
      }
      return new Response("", { status: 404 });
    });

    await pushGoogleWalletLoyaltyBalance(MISE_A_JOUR);
    expect(warn).not.toHaveBeenCalled();
  });

  it("PATCHe le solde sur l'objet de fidélité du membre", async () => {
    configurer();
    const appels: { url: string; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      appels.push({ url: String(input), init: init as RequestInit });
      if (String(input).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "jeton" }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 200 });
    });

    await pushGoogleWalletLoyaltyBalance(MISE_A_JOUR);

    const patch = appels.find((a) => a.url.includes("loyaltyObject"));
    expect(patch).toBeDefined();
    expect(patch?.init?.method).toBe("PATCH");
    const suffixe = googleWalletLoyaltyObjectSuffix(
      MISE_A_JOUR.programId,
      MISE_A_JOUR.memberTokenHash,
    );
    expect(patch?.url).toContain(suffixe);
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      loyaltyPoints: { label: "Points", balance: { string: "7" } },
      secondaryLoyaltyPoints: { label: "Niveau", balance: { string: "Bronze" } },
    });
  });
});
