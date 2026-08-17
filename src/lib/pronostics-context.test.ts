// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// pronostics-context — LA GARDE DE VISIBILITÉ DU PARCOURS JOUEUR.
//
// POURQUOI CE FICHIER : SD-5 a rendu le pass « Saison de pronostics » borné à
// UNE compétition. La moitié SQL a été livrée — l'octroi porte `resource_id`,
// `org_has_live_resource_grant` le lit, `assert_module_publish_allowed` laisse
// publier — et le chemin de LECTURE TypeScript n'avait pas reçu sa contrepartie.
// Le défaut n'était donc pas une capacité à moitié faite : c'était une capacité
// dont la moitié VISIBLE refusait ce que la moitié invisible accordait. Le
// commerçant payait 39 €, publiait son championnat, et son joueur lisait
// « Ce championnat est momentanément désactivé ».
//
// Ce fichier exerce le chargeur RÉEL et le vrai `moduleOuvertAuJoueur` : seuls
// le client admin et les deux chargeurs d'octrois sont simulés. C'est ce qui le
// rend falsifiable — retirer le troisième argument du site d'appel le fait
// rougir, alors qu'un test posé sur `module-acces-public` seul resterait vert.
// ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  chargerOctroisVivants: vi.fn(),
  octroiRessourceVivant: vi.fn(),
  /** La ligne que `contests` rend, ou `null` pour un slug inconnu. */
  ligne: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/module-grants-loader", () => ({
  chargerOctroisVivants: (...args: unknown[]) =>
    mocks.chargerOctroisVivants(...args),
  octroiRessourceVivant: (...args: unknown[]) =>
    mocks.octroiRessourceVivant(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.ligne, error: null }),
        }),
      }),
    }),
  }),
}));

const { loadContestContext } = await import("./pronostics-context");

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const CONTEST_ID = "22222222-2222-2222-2222-222222222222";

/**
 * Un championnat PUBLIÉ d'une organisation RÉSILIÉE, add-on éteint : refusée
 * par la branche abonnement de `droitEffectifModule`. Seul un octroi peut donc
 * l'ouvrir, ce qui est exactement la situation du porteur de pass.
 */
function ligneContest(over: Record<string, unknown> = {}) {
  return {
    id: CONTEST_ID,
    organization_id: ORG_ID,
    slug: "coupe-du-monde",
    name: "Coupe du monde",
    competition_key: "wc2026",
    status: "active",
    scoring: {},
    rewards: [],
    collect_email: false,
    collect_phone: false,
    tiebreaker_question: null,
    tiebreaker_answer: null,
    finalized_at: null,
    event_kind: "football",
    default_locks_at: null,
    theme: "neutre",
    created_at: "2026-06-01T00:00:00.000Z",
    organizations: {
      id: ORG_ID,
      name: "Chez Marcel",
      logo_url: null,
      subscription_status: "canceled",
      trial_ends_at: "2026-01-01T00:00:00.000Z",
      past_due_since: null,
      addon_pronostics: false,
      comp_access: false,
      comp_access_until: null,
      timezone: "Europe/Paris",
    },
    contest_matches: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chargerOctroisVivants.mockResolvedValue([]);
  mocks.octroiRessourceVivant.mockResolvedValue(false);
  mocks.ligne = ligneContest();
});

describe("loadContestContext — le pass borné à ce championnat (SD-5)", () => {
  it("un octroi borné à CE championnat laisse entrer le joueur", async () => {
    // LE TEST QUI ÉCHOUE SANS LE CORRECTIF. Sans le troisième argument passé à
    // `moduleOuvertAuJoueur`, ce chargeur ne peut pas savoir de quelle ressource
    // on parle : il refuse, et le joueur lit « momentanément désactivé » sur un
    // championnat payé.
    mocks.octroiRessourceVivant.mockResolvedValue(true);

    const ctx = await loadContestContext("coupe-du-monde");

    expect(ctx.ok).toBe(true);
    // L'identifiant transmis est celui du CHAMPIONNAT chargé, jamais son slug
    // ni rien qui vienne de l'URL : c'est la clé sur laquelle le webhook Stripe
    // a écrit `resource_id`.
    expect(mocks.octroiRessourceVivant).toHaveBeenCalledWith(
      ORG_ID,
      "pronostics",
      CONTEST_ID,
      expect.any(Date),
    );
  });

  it("sans octroi sur ce championnat, le joueur est refusé", async () => {
    const ctx = await loadContestContext("coupe-du-monde");
    expect(ctx).toEqual({
      ok: false,
      error: "Ce championnat est momentanément désactivé.",
    });
  });

  it("un octroi de MODULE ouvre le championnat sans lecture de ressource", async () => {
    // Un pass non borné, ou l'add-on d'un abonné : le module entier ouvre
    // toutes ses compétitions, donc la seconde lecture ne peut rien changer.
    mocks.chargerOctroisVivants.mockResolvedValue(["pronostics"]);

    const ctx = await loadContestContext("coupe-du-monde");

    expect(ctx.ok).toBe(true);
    expect(mocks.octroiRessourceVivant).not.toHaveBeenCalled();
  });

  it("un octroi borné n'ouvre PAS un brouillon : les deux gardes restent distinctes", async () => {
    // Le droit et la publication sont deux questions. Un pass payé sur un
    // championnat encore en brouillon ne doit pas l'exposer au joueur — sinon
    // l'ordre des deux gardes deviendrait porteur de sens sans le dire.
    mocks.octroiRessourceVivant.mockResolvedValue(true);
    mocks.ligne = ligneContest({ status: "draft" });

    const ctx = await loadContestContext("coupe-du-monde");
    expect(ctx).toEqual({
      ok: false,
      error: "Ce championnat n'est pas encore ouvert.",
    });
  });

  it("un slug inconnu ne consulte aucun octroi", async () => {
    mocks.ligne = null;
    const ctx = await loadContestContext("inexistant");
    expect(ctx).toEqual({ ok: false, error: "Ce championnat n'existe pas." });
    expect(mocks.chargerOctroisVivants).not.toHaveBeenCalled();
    expect(mocks.octroiRessourceVivant).not.toHaveBeenCalled();
  });

  it("une organisation incohérente est refusée AVANT toute question de droit", async () => {
    // Garde inter-tenant préexistante : l'embed PostgREST pourrait, sur une FK
    // cassée, rendre l'organisation d'un autre établissement. On ne va pas lui
    // chercher un octroi.
    mocks.ligne = ligneContest({
      organizations: {
        ...(ligneContest().organizations as Record<string, unknown>),
        id: "33333333-3333-3333-3333-333333333333",
      },
    });

    const ctx = await loadContestContext("coupe-du-monde");
    expect(ctx).toEqual({ ok: false, error: "Championnat indisponible." });
    expect(mocks.octroiRessourceVivant).not.toHaveBeenCalled();
  });
});
