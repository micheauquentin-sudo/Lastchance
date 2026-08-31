import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LE PONT PASSEPORT → GOOGLE WALLET, ET SES TROIS SILENCES.
 *
 * Aucun des trois n'est une erreur, et la page ne doit pouvoir en distinguer
 * aucun : dans les trois cas elle ne reçoit que `null`, donc aucun bouton.
 *
 *  · Google Wallet n'est pas configuré — l'état par défaut aujourd'hui ;
 *  · aucun cookie de passeport (premier passage, navigation privée) ;
 *  · aucun passeport en base (le cookie existe, aucune visite validée).
 *
 * Le quatrième invariant gardé ici est le plus important : le module LIT le
 * cookie, il ne l'écrit jamais. La page passeport est en lecture seule au
 * rendu, et une carte Wallet n'est pas une raison de la faire écrire.
 */

const cookieJar: { jar: Record<string, string> } = { jar: {} };
const cookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name in cookieJar.jar ? { value: cookieJar.jar[name] } : undefined,
    set: cookieSet,
  }),
}));

const { lienGoogleWalletPasseport } = await import("@/lib/loyalty-wallet");
const { loyaltyTokenCookieName } = await import("@/lib/loyalty-context");

const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";
const COOKIE = loyaltyTokenCookieName(PROGRAM_ID);

const BASE = {
  programId: PROGRAM_ID,
  programName: "Carte du Café",
  organizationName: "Café des Sports",
  logoUrl: null,
  passport: { hasPassport: true, pointsBalance: 12, tier: "bronze" as const },
};

/** Une vraie paire RSA, pour que le chemin « configuré » signe pour de bon. */
async function configurerWallet(): Promise<void> {
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000000000001");
  vi.stubEnv(
    "GOOGLE_WALLET_CLIENT_EMAIL",
    "wallet@exemple.iam.gserviceaccount.com",
  );
  vi.stubEnv("GOOGLE_WALLET_PRIVATE_KEY", pem.replace(/\n/g, "\\n"));
}

beforeEach(() => {
  cookieJar.jar = {};
  cookieSet.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "");
  vi.stubEnv("GOOGLE_WALLET_CLIENT_EMAIL", "");
  vi.stubEnv("GOOGLE_WALLET_PRIVATE_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("lienGoogleWalletPasseport — sans variables d'environnement", () => {
  it("rend null SANS LEVER, cookie et passeport présents", async () => {
    cookieJar.jar[COOKIE] = "jeton-du-client";
    await expect(lienGoogleWalletPasseport(BASE)).resolves.toBeNull();
  });

  it("ne casse pas non plus quand le passeport est vide", async () => {
    await expect(
      lienGoogleWalletPasseport({
        ...BASE,
        passport: { hasPassport: false, pointsBalance: 0, tier: "bronze" },
      }),
    ).resolves.toBeNull();
  });
});

describe("lienGoogleWalletPasseport — configuré", () => {
  beforeEach(configurerWallet);

  it("rend un lien « save to wallet » pour un passeport établi", async () => {
    cookieJar.jar[COOKIE] = "jeton-du-client";
    const lien = await lienGoogleWalletPasseport(BASE);
    expect(lien).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
  });

  it("rend null SANS COOKIE : aucune identité à graver dans une carte", async () => {
    await expect(lienGoogleWalletPasseport(BASE)).resolves.toBeNull();
  });

  it("rend null SANS PASSEPORT : rien à mettre sur une carte de fidélité", async () => {
    cookieJar.jar[COOKIE] = "jeton-du-client";
    await expect(
      lienGoogleWalletPasseport({
        ...BASE,
        passport: { hasPassport: false, pointsBalance: 0, tier: "bronze" },
      }),
    ).resolves.toBeNull();
  });

  it("n'ÉCRIT AUCUN COOKIE — la page passeport reste en lecture seule", async () => {
    cookieJar.jar[COOKIE] = "jeton-du-client";
    await lienGoogleWalletPasseport(BASE);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("ne laisse PAS fuiter la valeur du cookie dans le lien", async () => {
    cookieJar.jar[COOKIE] = "jeton-du-client";
    const lien = (await lienGoogleWalletPasseport(BASE)) as string;
    // Le jeton d'identité ne quitte pas le serveur, ni en clair ni encodé.
    expect(lien).not.toContain("jeton-du-client");
    expect(Buffer.from(lien).toString()).not.toContain("jeton-du-client");
  });

  it("traduit le niveau, sans emoji, tel que l'affiche le passeport", async () => {
    cookieJar.jar[COOKIE] = "jeton-du-client";
    const lien = (await lienGoogleWalletPasseport({
      ...BASE,
      passport: { hasPassport: true, pointsBalance: 300, tier: "gold" },
    })) as string;

    const corps = JSON.parse(
      Buffer.from(
        lien.slice("https://pay.google.com/gp/v/save/".length).split(".")[1],
        "base64url",
      ).toString(),
    ) as { payload: { loyaltyObjects: Record<string, unknown>[] } };
    const objet = corps.payload.loyaltyObjects[0];

    expect(objet.secondaryLoyaltyPoints).toEqual({
      label: "Niveau",
      balance: { string: "Or" },
    });
    expect(objet.loyaltyPoints).toEqual({
      label: "Points",
      balance: { string: "300" },
    });
  });
});
