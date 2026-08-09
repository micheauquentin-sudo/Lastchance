import { describe, it, expect } from "vitest";
import { csvCell } from "@/lib/csv";
import {
  EXPORT_MAX_ROWS,
  EXPORT_PAGE_SIZE,
  collecterProfilsExport,
  csvClients,
  customerBadges,
  customerFiltersActifs,
  customerSearchParams,
  parseCustomerFilters,
} from "./filters";

const JOUR = 86_400_000;
const MAINTENANT = Date.UTC(2026, 7, 9);
const ilYA = (jours: number) => new Date(MAINTENANT - jours * JOUR).toISOString();

describe("parseCustomerFilters", () => {
  it("normalise segment et tri, valeur inconnue ⇒ défaut silencieux", () => {
    expect(parseCustomerFilters({ segment: "fidele", tri: "gains" })).toEqual({
      q: undefined,
      segment: "fidele",
      tri: "gains",
    });
    // Miroir du comportement de la RPC : un paramètre d'URL mal tapé ne rend
    // pas la page inaccessible, il retombe sur le défaut / l'absence de filtre.
    expect(parseCustomerFilters({ segment: "vip", tri: "au-hasard" })).toEqual({
      q: undefined,
      segment: undefined,
      tri: "dernier_gain",
    });
  });

  it("garde les caractères ilike de la recherche (la RPC les échappe) et borne à 80", () => {
    expect(parseCustomerFilters({ q: "  a%b_c  " }).q).toBe("a%b_c");
    expect(parseCustomerFilters({ q: "x".repeat(200) }).q).toHaveLength(80);
    expect(parseCustomerFilters({ q: "   " }).q).toBeUndefined();
  });
});

describe("customerSearchParams", () => {
  it("ne propage pas le tri par défaut", () => {
    expect(customerSearchParams(parseCustomerFilters({ q: "momo" }))).toEqual({
      q: "momo",
      segment: undefined,
      tri: undefined,
    });
    expect(customerSearchParams(parseCustomerFilters({ tri: "gains" })).tri).toBe("gains");
  });

  it("customerFiltersActifs suit les trois filtres", () => {
    expect(customerFiltersActifs(parseCustomerFilters({}))).toBe(false);
    expect(customerFiltersActifs(parseCustomerFilters({ segment: "nouveau" }))).toBe(true);
    expect(customerFiltersActifs(parseCustomerFilters({ tri: "recuperes" }))).toBe(true);
  });
});

describe("customerBadges", () => {
  it("cumule les segments : le SQL n'est pas exclusif, la pastille non plus", () => {
    // Cinq gains, dernier il y a quatre-vingts jours : fidèle ET à relancer.
    // L'ancienne pastille rendait « À relancer » SEUL (return anticipé), ce qui
    // contredisait un filtre sur « Fidèles ».
    const badges = customerBadges({ wins: 5, last_win: ilYA(80) }, MAINTENANT);
    expect(badges.map((b) => b.label)).toEqual(["Fidèle", "À relancer"]);
  });

  it("un seul gain récent est « Nouveau », deux gains récents n'ont aucune pastille", () => {
    expect(customerBadges({ wins: 1, last_win: ilYA(2) }, MAINTENANT).map((b) => b.label)).toEqual([
      "Nouveau",
    ]);
    expect(customerBadges({ wins: 2, last_win: ilYA(2) }, MAINTENANT)).toEqual([]);
  });

  it("le seuil « à relancer » est strictement au-delà de soixante jours", () => {
    expect(customerBadges({ wins: 1, last_win: ilYA(59) }, MAINTENANT).map((b) => b.label)).toEqual([
      "Nouveau",
    ]);
    expect(customerBadges({ wins: 1, last_win: ilYA(61) }, MAINTENANT).map((b) => b.label)).toEqual([
      "Nouveau",
      "À relancer",
    ]);
  });
});

// ── Export CSV ───────────────────────────────────────────────

/**
 * Fausse RPC : rend `n` profils au total, page par page, et compte ses appels.
 * `total_count` est porté par chaque ligne, comme le fait
 * `org_customer_profiles_page` (fenêtre `count(*) over ()`).
 */
function fausseRpc(total: number) {
  let appels = 0;
  const lirePage = async (offset: number, limit: number) => {
    appels += 1;
    const fin = Math.min(offset + limit, total);
    return Array.from({ length: Math.max(0, fin - offset) }, (_, i) => ({
      email: `client${offset + i}@test.local`,
      first_name: null,
      wins: 1,
      redeemed: 0,
      first_win: "2026-01-01T00:00:00.000Z",
      last_win: "2026-01-01T00:00:00.000Z",
      total_count: total,
    }));
  };
  return { lirePage, appels: () => appels };
}

describe("collecterProfilsExport", () => {
  it("borne la boucle au total réel, pas au plafond d'export", async () => {
    // 250 clients : trois appels. La boucle naïve en faisait CENT, chacun un
    // `group by` complet plus un `count` en fenêtre.
    const rpc = fausseRpc(250);
    const { rows, total, tronque } = await collecterProfilsExport(rpc.lirePage);
    expect(rows).toHaveLength(250);
    expect(total).toBe(250);
    expect(tronque).toBe(false);
    expect(rpc.appels()).toBe(3);
  });

  it("un seul appel quand tout tient dans la première page", async () => {
    const rpc = fausseRpc(12);
    const { rows, tronque } = await collecterProfilsExport(rpc.lirePage);
    expect(rows).toHaveLength(12);
    expect(tronque).toBe(false);
    expect(rpc.appels()).toBe(1);
  });

  it("liste vide : un appel, aucun total, aucune troncature", async () => {
    const rpc = fausseRpc(0);
    const { rows, total, tronque } = await collecterProfilsExport(rpc.lirePage);
    expect(rows).toEqual([]);
    expect(total).toBe(0);
    expect(tronque).toBe(false);
    expect(rpc.appels()).toBe(1);
  });

  it("signale la troncature au-delà du plafond, sans dépasser le nombre de pages", async () => {
    const rpc = fausseRpc(EXPORT_MAX_ROWS + 500);
    const { rows, total, tronque } = await collecterProfilsExport(rpc.lirePage);
    expect(rows).toHaveLength(EXPORT_MAX_ROWS);
    expect(total).toBe(EXPORT_MAX_ROWS + 500);
    expect(tronque).toBe(true);
    expect(rpc.appels()).toBe(EXPORT_MAX_ROWS / EXPORT_PAGE_SIZE);
  });
});

describe("csvClients", () => {
  const profil = {
    email: "momo@test.local",
    first_name: "Momo",
    wins: 3,
    redeemed: 2,
    first_win: "2026-01-01T00:00:00.000Z",
    last_win: "2026-06-01T00:00:00.000Z",
    total_count: 1,
  };

  it("porte le BOM, l'en-tête, et AUCUNE colonne de téléphone", () => {
    const csv = csvClients([profil], { total: 1, tronque: false }, csvCell);
    const lignes = csv.split("\n");
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(lignes[0]).toBe(
      "\ufeffemail;prenom;gains;recuperes;premier_gain;dernier_gain",
    );
    expect(lignes[1]).toBe(
      "momo@test.local;Momo;3;2;2026-01-01T00:00:00.000Z;2026-06-01T00:00:00.000Z",
    );
    expect(csv).not.toContain("telephone");
    expect(lignes).toHaveLength(2);
  });

  it("dit la troncature DANS le fichier — un CSV amputé en silence est pire qu'un refus", () => {
    const csv = csvClients([profil], { total: 12_345, tronque: true }, csvCell);
    const derniere = csv.split("\n").at(-1) ?? "";
    expect(derniere).toContain("Export tronqué à 1 lignes sur 12345");
    expect(derniere).toContain("affinez les filtres");
  });
});
