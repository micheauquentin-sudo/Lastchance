import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * LE PASSEPORT DE FIDÉLITÉ N'A QUE GOOGLE WALLET.
 *
 * `src/lib/loyalty-wallet.ts` n'expose que `buildGoogleWalletLoyaltySaveUrl`, et
 * `installer-passeport.tsx` ne rend qu'un lien Google : aucun pass Apple n'existe
 * pour la fidélité. Les surfaces marketing en promettaient un — cette garde
 * échoue si la promesse revient.
 *
 * ELLE NE VISE PAS LE PASS DE GAIN : `claim-form.tsx` propose bien un pass Apple
 * Wallet après un gain (`src/lib/apple-wallet.ts`), et le dernier cas ci-dessous
 * le verrouille pour qu'une coupe trop large ne l'emporte pas au passage.
 */
const SURFACES = [
  "src/app/(public)/fideliser/page.tsx",
  "src/components/marketing/experience-selector.tsx",
  "src/components/marketing/site-header.tsx",
  "src/components/marketing/use-cases-by-trade.tsx",
];

const lire = (chemin: string) => readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");

describe("surfaces marketing — passeport de fidélité", () => {
  it.each(SURFACES)("ne promet aucun Apple Wallet dans %s", (chemin) => {
    expect(lire(chemin)).not.toMatch(/Apple/);
  });

  it("garde le bénéfice client, pas seulement la marque retirée", () => {
    const fideliser = lire("src/app/(public)/fideliser/page.tsx");
    expect(fideliser).toMatch(/Google Wallet/);
    expect(fideliser).toMatch(/passeport dématérialisé/i);
  });

  it("laisse INTACT le pass Apple Wallet du GAIN, qui existe, lui", () => {
    expect(lire("src/components/wheel/claim-form.tsx")).toContain("Ajouter à Apple Wallet");
  });
});
