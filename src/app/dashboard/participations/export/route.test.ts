// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Export CSV du dashboard — volet NEWSLETTER.
 *
 * Ce fichier verrouille une seule chose, mais c'est la plus coûteuse à
 * perdre : un contact DÉSINSCRIT ne doit jamais ressortir du produit. La
 * désinscription n'efface pas la ligne, elle horodate `unsubscribed_at`
 * (cf. /api/newsletter/unsubscribe) — un export sans ce filtre rend donc un
 * fichier où l'abonné et le désabonné sont indiscernables, et ce fichier finit
 * importé tel quel dans un outil d'emailing. C'est un manquement RGPD que
 * personne ne voit passer : ni le commerçant, ni le contact, jusqu'à la plainte.
 *
 * Le faux client n'est pas un espion muet : il APPLIQUE les filtres qu'on lui
 * demande, comme PostgREST. C'est délibéré — un test qui se contenterait de
 * vérifier que `.is()` a été appelé passerait encore le jour où l'appel serait
 * fait sur la mauvaise colonne, et un test qui compare des appels ne dit rien
 * du contenu du fichier livré. Ici, on lit le CSV.
 */

const mocks = vi.hoisted(() => ({
  getUserAndOrg: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUserAndOrg: mocks.getUserAndOrg }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

import { GET } from "./route";

const ORG = "3f0c1d2e-1111-4222-8333-444455556666";
const AUTRE_ORG = "99999999-1111-4222-8333-444455556666";

/**
 * Ligne d'abonné, typée par SIGNATURE D'INDEX : le faux builder lit les
 * colonnes par leur nom, tel que la route les lui passe. Une interface à
 * champs nommés obligerait à forcer le typage à chaque accès — et un test qui
 * casse le typage pour s'écrire cesse de prouver que la route demande les
 * BONNES colonnes.
 */
type LigneAbonne = Record<string, string | null>;

const ABONNES: LigneAbonne[] = [
  {
    organization_id: ORG,
    created_at: "2026-08-10T09:00:00.000Z",
    email: "fidele@example.com",
    source: "wheel",
    unsubscribed_at: null,
  },
  {
    organization_id: ORG,
    created_at: "2026-08-09T09:00:00.000Z",
    email: "parti@example.com",
    source: "wheel",
    // A cliqué « se désinscrire » : la ligne reste, le consentement non.
    unsubscribed_at: "2026-08-11T12:00:00.000Z",
  },
  {
    organization_id: AUTRE_ORG,
    created_at: "2026-08-08T09:00:00.000Z",
    email: "voisin@example.com",
    source: "wheel",
    unsubscribed_at: null,
  },
];

type Predicat = (ligne: LigneAbonne) => boolean;

/**
 * Chaîne PostgREST minimale, mais qui FILTRE VRAIMENT : `eq` et `is`
 * accumulent des prédicats, `select` projette les colonnes demandées, et le
 * résultat n'est calculé qu'au `await`. Un maillon inconnu ferait échouer le
 * test au lieu de l'affaiblir.
 */
function requeteAbonnes(lignes: LigneAbonne[]) {
  const predicats: Predicat[] = [];
  let colonnes: string[] = [];
  const builder = {
    select(liste: string) {
      colonnes = liste.split(",").map((c) => c.trim());
      return builder;
    },
    eq(colonne: string, valeur: unknown) {
      predicats.push((l) => l[colonne] === valeur);
      return builder;
    },
    is(colonne: string, valeur: unknown) {
      predicats.push((l) => l[colonne] === valeur);
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    then<T1 = unknown, T2 = never>(
      onFulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
      onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      const data = lignes
        .filter((l) => predicats.every((p) => p(l)))
        .map((l) => Object.fromEntries(colonnes.map((c) => [c, l[c]])));
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function requete(type?: string) {
  const url = new URL("https://app.example.com/dashboard/participations/export");
  if (type) url.searchParams.set("type", type);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserAndOrg.mockResolvedValue({
    user: { id: "user-1" },
    organization: { id: ORG, timezone: "Europe/Paris" },
    role: "owner",
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === "newsletter_subscribers") return requeteAbonnes(ABONNES);
    throw new Error(`table inattendue dans ce test : ${table}`);
  });
});

describe("GET /dashboard/participations/export?type=newsletter", () => {
  it("n'exporte JAMAIS un contact désinscrit", async () => {
    const response = await GET(requete("newsletter"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    // Rougit sans `is("unsubscribed_at", null)` : `parti@example.com`
    // atterrissait dans le fichier, à côté des abonnés, sans aucune colonne
    // permettant de le distinguer — le CSV n'a que date / email / source.
    expect(csv).not.toContain("parti@example.com");
    expect(csv).toContain("fidele@example.com");
  });

  it("reste borné à l'organisation active", async () => {
    const response = await GET(requete("newsletter"));
    const csv = await response.text();

    expect(csv).not.toContain("voisin@example.com");
  });

  it("rend un CSV téléchargeable, en-tête compris", async () => {
    const response = await GET(requete("newsletter"));
    const csv = await response.text();
    const lignes = csv.replace(/^﻿/, "").split("\n");

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(lignes[0]).toBe("date;email;source");
    // Un seul contact exportable sur les trois de la fixture.
    expect(lignes).toHaveLength(2);
  });

  it("refuse un non-propriétaire sans toucher la base", async () => {
    mocks.getUserAndOrg.mockResolvedValue({
      user: { id: "user-2" },
      organization: { id: ORG, timezone: "Europe/Paris" },
      role: "member",
    });

    const response = await GET(requete("newsletter"));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
