import { describe, expect, it } from "vitest";
import { masquerJetonUrl } from "./masquer-jeton-url";

/**
 * Deux exigences opposées se rencontrent ici, et le test les tient toutes deux :
 *  - AUCUNE forme d'URL portant `/commande/<jeton>` ou `/hunt/<jeton>` ne doit
 *    ressortir intacte — c'est un secret rejouable ;
 *  - RIEN d'autre ne doit changer — masquer large rendrait les journaux
 *    illisibles et le premier incident de production indéchiffrable.
 */

const JETON = "9f2c1ab4d8e7-QRCODE";

describe("masquerJetonUrl — ce qui doit disparaître", () => {
  it.each([
    ["chemin relatif de commande", `/commande/${JETON}`, "/commande/[jeton]"],
    ["chemin relatif de chasse", `/hunt/${JETON}`, "/hunt/[jeton]"],
    [
      "URL absolue",
      `https://app.lastchance.fr/commande/${JETON}`,
      "https://app.lastchance.fr/commande/[jeton]",
    ],
    [
      "URL protocol-relative",
      `//app.lastchance.fr/hunt/${JETON}`,
      "//app.lastchance.fr/hunt/[jeton]",
    ],
  ])("%s", (_cas, entree, attendu) => {
    expect(masquerJetonUrl(entree)).toBe(attendu);
  });

  it("préserve la query, qui porte le diagnostic", () => {
    expect(
      masquerJetonUrl(`https://app.lastchance.fr/commande/${JETON}?src=qr&page=2`),
    ).toBe("https://app.lastchance.fr/commande/[jeton]?src=qr&page=2");
  });

  it("préserve le fragment", () => {
    expect(masquerJetonUrl(`/hunt/${JETON}#etape-3`)).toBe("/hunt/[jeton]#etape-3");
  });

  it("préserve la suite du chemin", () => {
    expect(masquerJetonUrl(`/commande/${JETON}/imprimer`)).toBe(
      "/commande/[jeton]/imprimer",
    );
  });

  it("ne dépend pas de la casse du préfixe", () => {
    // Un lien recopié à la main, un proxy qui normalise, un `$referrer`
    // reconstitué : la casse n'est pas garantie, le masquage doit tenir quand
    // même — Next servirait un 404, mais le jeton serait déjà parti chez le tiers.
    expect(masquerJetonUrl(`/Commande/${JETON}`)).toBe("/Commande/[jeton]");
    expect(masquerJetonUrl(`/HUNT/${JETON}`)).toBe("/HUNT/[jeton]");
  });

  it("masque au fil d'un texte libre, pas seulement en tête de chemin", () => {
    // Forme exacte d'un breadcrumb `fetch` ou d'un message d'erreur Next.
    expect(masquerJetonUrl(`GET /commande/${JETON} 404 (Not Found)`)).toBe(
      "GET /commande/[jeton] 404 (Not Found)",
    );
  });

  it("masque TOUTES les occurrences, pas seulement la première", () => {
    expect(masquerJetonUrl(`/commande/${JETON} → /hunt/${JETON}`)).toBe(
      "/commande/[jeton] → /hunt/[jeton]",
    );
  });

  it("reste stable en appels répétés (motif global sans état résiduel)", () => {
    // Un motif `/g` partagé au niveau module conserve `lastIndex` avec `.test`
    // et `.exec` : le deuxième appel raterait alors une occurrence sur deux.
    const entree = `/commande/${JETON}`;
    expect(masquerJetonUrl(entree)).toBe(masquerJetonUrl(entree));
    expect(masquerJetonUrl(entree)).toBe("/commande/[jeton]");
  });

  it("est idempotent : masquer un chemin déjà masqué ne l'abîme pas", () => {
    expect(masquerJetonUrl("/commande/[jeton]")).toBe("/commande/[jeton]");
  });
});

describe("masquerJetonUrl — ce qui doit rester intact", () => {
  it.each([
    ["chaîne vide", ""],
    ["racine", "/"],
    ["page publique", "/privacy"],
    ["dashboard", "/dashboard/participations?statut=a-valider"],
    ["liste des chasses, au PLURIEL", "/dashboard/hunts/8f1c-2ab3"],
    ["préfixe sans jeton", "/commande/"],
    ["préfixe seul, sans slash final", "/commande"],
    ["segment homonyme au milieu d'un mot", "/mes-commandes/12"],
    ["URL d'un tiers", "https://api.stripe.com/v1/checkout/sessions/cs_test_123"],
    ["message d'erreur ordinaire", "duplicate key value violates constraint"],
  ])("%s", (_cas, entree) => {
    expect(masquerJetonUrl(entree)).toBe(entree);
  });

  it("ne touche pas à un jeton passé en QUERY (déjà couvert par sentry-scrub)", () => {
    // Chacun son poste : la query est expurgée PAR NOM DE PARAMÈTRE dans
    // `sentry-scrub`. Dupliquer ce travail ici masquerait deux fois la même
    // chose et laisserait croire que ce module couvre plus qu'il ne couvre.
    expect(masquerJetonUrl(`/jouer?token=${JETON}`)).toBe(`/jouer?token=${JETON}`);
  });
});
