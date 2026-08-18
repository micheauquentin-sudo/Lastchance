import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * UNE ROUTE PUBLIQUE DONT LE CHEMIN N'EST CITÉ NULLE PART EST UNE SURFACE SANS
 * CHEMIN.
 *
 * C'est le motif que ce dépôt s'est déjà reproché deux fois — le portefeuille
 * (`src/lib/portefeuille-atteignable.test.ts`) et le passeport
 * (`passeport-atteignable.test.ts`) : une capacité livrée, testée, déployée, et
 * qu'aucun utilisateur ne pouvait atteindre. `/commande/<token>` y est
 * particulièrement exposée : contrairement au passeport, elle n'a AUCUN écran
 * qui y renvoie — son unique porte d'entrée est un QR imprimé, donc le bloc
 * marchand qui le produit. Si ce bloc cesse de construire l'URL, la route
 * devient inatteignable sans que rien ne rougisse ailleurs.
 *
 * DEUX ANCRAGES, ET LE SECOND EST UN FILET ANTI-OUBLI CROISÉ :
 *
 *  1. le bloc marchand construit une URL ABSOLUE `${APP_URL}/commande/<token>`
 *     — un QR n'a pas d'origine à laquelle rattacher un chemin relatif, le
 *     défaut est invisible depuis le dashboard où le lien reste cliquable ;
 *  2. `/commande` figure dans `PUBLIC_NONCE_PREFIXES`. Sans cela la page
 *     retombe en régime `static`, c'est-à-dire `'unsafe-inline'` conservé sur
 *     une surface publique — une régression de sécurité silencieuse, et
 *     l'inverse exact de ce que les six autres expériences joueur obtiennent.
 *     Cette moitié-là appartient au périmètre serveur ; l'assertion est écrite
 *     ici parce que c'est le lot qui ouvre la route, et qu'un oubli à cheval
 *     sur deux périmètres n'a autrement personne pour le voir.
 */

const RACINE = join(__dirname, "..", "..", "..");
const lire = (relatif: string) => readFileSync(join(RACINE, relatif), "utf8");

describe("/commande est atteignable et traitée comme une surface publique", () => {
  it("le bloc marchand construit l'URL absolue du QR", () => {
    const page = lire("src/app/dashboard/loyalty/[id]/page.tsx");
    expect(page).toContain("url: `${APP_URL}/commande/${row.token}`");
    expect(page).toContain('import { APP_URL } from "@/lib/env"');
    // Le bloc est bien monté, pas seulement importé.
    expect(page).toMatch(/<OrderCodeCards\s+programId=\{p\.id\}/);
  });

  it("la page publique existe et rend à la requête (prérequis du nonce)", () => {
    const page = lire("src/app/(player)/commande/[token]/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("loadOrderCodeContext");
    expect(page).toContain("notFound()");
  });

  it("`/commande` porte le régime CSP public, comme les six autres expériences", () => {
    expect(lire("src/lib/security-headers.ts")).toContain('"/commande"');
  });
});
