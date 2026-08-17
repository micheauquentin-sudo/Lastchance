import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * « PASS TERMINÉ LE … » — LE MOT QUI MANQUAIT (constat SD-9).
 *
 * À l'expiration, l'option quittait `chargerOctroisVivants` et c'est tout : la
 * pastille « Ouvert » disparaissait, la carte redevenait achetable, et rien ne
 * disait au commerçant que son pass s'était terminé — ni quand. Il voyait une
 * page de catalogue identique à celle d'avant son achat.
 *
 * La page est un Server Component asynchrone dont la chaîne d'imports atteint
 * `next/headers` et le client admin Supabase : la rendre en test coûterait plus
 * de mocks que la valeur du signal (même arbitrage que `public-share.test.tsx`).
 * Ce qui est gravé ici est donc précis, et ce sont exactement les trois choses
 * qu'une réécriture pourrait perdre sans faire rougir quoi que ce soit d'autre :
 * l'état consulté, la date mise en forme au fuseau de l'établissement, et le
 * fait que seul `expired` parle.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/app/dashboard/settings/modules/page.tsx"),
  "utf8",
);

describe("La page des options dit qu'un pass est terminé", () => {
  it("interroge l'état de l'octroi du module", () => {
    expect(SOURCE).toContain("etatOctroiModule(");
  });

  it("n'affiche la ligne que pour un pass expiré", () => {
    expect(SOURCE).toContain('etat?.etat === "expired"');
    // `revoked` et `pending` ont leurs propres chemins : les faire parler ici
    // ferait deux messages pour un seul état.
    expect(SOURCE).not.toContain('=== "revoked"');
  });

  it("met la date au fuseau de l'établissement, jamais en UTC", () => {
    expect(SOURCE).toContain("formatDate(etat.endsAt, organization.timezone)");
  });

  it("écrit la phrase que lit le commerçant", () => {
    expect(SOURCE).toContain("Pass terminé le {finDePass}");
  });

  /**
   * L'état n'est calculé QUE pour les options fermées : une carte ne peut pas
   * porter « Ouvert » et « Pass terminé » en même temps, et on ne paie pas une
   * requête par option déjà ouverte.
   */
  it("ne consulte l'état que des options non ouvertes", () => {
    const appel = SOURCE.slice(0, SOURCE.indexOf("etatOctroiModule("));
    const filtre = appel.lastIndexOf("ADDON_OFFERS.filter(");
    expect(filtre).toBeGreaterThan(-1);
    expect(appel.slice(filtre)).toContain(
      "!(ouverts as readonly string[]).includes(offre.entitlement)",
    );
  });

  /**
   * Même règle que `finDuPassExpire` côté capacités : le caissier n'a pas à
   * savoir de quoi l'établissement est équipé ni jusqu'à quand. Sans cette
   * garde, la page édictait une règle et la contredisait deux fichiers plus
   * loin (revue sécurité du wagon 2, FAIBLE 1).
   */
  it("ne calcule rien pour le caissier", () => {
    const appel = SOURCE.slice(0, SOURCE.indexOf("etatOctroiModule("));
    const garde = appel.lastIndexOf('if (role !== "cashier")');
    const filtre = appel.lastIndexOf("ADDON_OFFERS.filter(");
    expect(garde).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(filtre);
  });
});
