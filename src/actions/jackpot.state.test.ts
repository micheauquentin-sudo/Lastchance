import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// getJackpotState — LA JAUGE SEULE, ET JAMAIS UNE EXCEPTION
//
// La page suivable d'un jackpot n'avait aucun repli de sondage : seule la
// jauge PARTAGÉE bouge d'un instant à l'autre, et rien ne la rafraîchissait
// sans rechargement complet. Cette action est le calque de `getCalendarState`.
//
// Ce que ce fichier mesure :
//   · la projection réelle (montant d'affichage, épuisement, tirage du cycle
//     courant) — la lecture `jackpot_wins` n'est pas simulée, elle est jouée ;
//   · le compteur d'observabilité part, sur clé PARTAGÉE, et ne refuse jamais
//     (ADR-032 : remplir la jauge vite est un OBJECTIF, et l'IP d'un lieu est
//     mutualisée entre tous ses clients) ;
//   · TOUTE panne rend `unavailable` — cette action est appelée en boucle
//     depuis un écran de salle, une exception y ferait un écran blanc.
// ────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "00000000-0000-4000-8000-000000000042";

const { etat } = vi.hoisted(() => ({
  etat: {
    /** Le contexte public résout-il ? (module fermé / campagne inactive = non) */
    contexteOk: true,
    /** Mode de tirage de la campagne. */
    drawMode: "threshold" as string,
    /** Ligne `jackpot_wins` du cycle courant, ou null. */
    gain: null as { drawn_at: string } | null,
    /** La lecture de `jackpot_wins` lève. */
    lectureLeve: false,
    /** Départs du compteur de pression observés. */
    pressions: 0,
  },
}));

const reportErrorMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined, set: vi.fn() })),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({ user: null, organization: null, role: null })),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: reportErrorMock,
  monitored: (_n: string, f: () => unknown) => f(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: () => ({}) })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/request-ip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-ip")>()),
  clientIpFromHeaders: vi.fn(() => "198.51.100.4"),
  observerPressionIp: vi.fn(() => {
    etat.pressions += 1;
    return Promise.resolve();
  }),
}));

/** Campagne publique minimale — les seules colonnes que la jauge projette. */
function campagne() {
  return {
    id: CAMPAIGN_ID,
    organization_id: "org-1",
    current_count: 7,
    threshold: 20,
    cycle: 2,
    draw_mode: etat.drawMode,
    validation_mode: "rotating_code",
    draw_at: "2026-09-01T18:00:00.000Z",
    display_base_cents: 500,
    display_increment_cents: 100,
    reward_stock: 3,
    reward_claimed_count: 1,
    min_participation_interval_seconds: 300,
  };
}

/**
 * Client service role servant la SEULE lecture de `loadJackpotGauge` :
 * `jackpot_wins` du cycle courant.
 */
function admin() {
  return {
    from: () => {
      const c: Record<string, unknown> = {};
      const self = () => c;
      for (const m of ["select", "eq", "order", "limit"]) c[m] = self;
      c.maybeSingle = () => {
        if (etat.lectureLeve) throw new Error("connexion perdue");
        return Promise.resolve({ data: etat.gain, error: null });
      };
      return c;
    },
  };
}

/**
 * Seul `loadJackpotActionContext` est simulé : c'est la garde (module,
 * abonnement, statut actif), déjà couverte ailleurs. La PROJECTION, elle, est
 * jouée pour de vrai — c'est ce que l'écran lit.
 */
vi.mock("@/lib/jackpot-context", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/jackpot-context")>();
  return {
    ...reel,
    loadJackpotActionContext: vi.fn(async () =>
      etat.contexteOk
        ? { ok: true, admin: admin(), campaign: campagne() }
        : { ok: false, error: "Ce jackpot n'est pas disponible." },
    ),
  };
});

const { getJackpotState } = await import("./jackpot");

beforeEach(() => {
  etat.contexteOk = true;
  etat.drawMode = "threshold";
  etat.gain = null;
  etat.lectureLeve = false;
  etat.pressions = 0;
  reportErrorMock.mockClear();
});

describe("getJackpotState — la jauge partagée", () => {
  it("projette le montant d'affichage et l'épuisement", async () => {
    const res = await getJackpotState({ campaignId: CAMPAIGN_ID });

    expect(res.state).toBe("ok");
    // 500 + 7 × 100 : le montant est COSMÉTIQUE et dérivé, jamais stocké.
    expect(res.gauge?.displayAmountCents).toBe(1_200);
    expect(res.gauge?.currentCount).toBe(7);
    expect(res.gauge?.threshold).toBe(20);
    expect(res.gauge?.cycle).toBe(2);
    expect(res.gauge?.soldOut).toBe(false);
  });

  it("rend le tirage du cycle courant en mode date_draw", async () => {
    etat.drawMode = "date_draw";
    etat.gain = { drawn_at: "2026-09-01T18:00:03.000Z" };

    const res = await getJackpotState({ campaignId: CAMPAIGN_ID });

    // La présence d'une ligne fige le cycle : participer n'a plus de sens, et
    // l'écran doit le montrer sans attendre un rechargement.
    expect(res.gauge?.drawDone).toBe(true);
    expect(res.gauge?.drawnAt).toBe("2026-09-01T18:00:03.000Z");
  });

  it("laisse partir le compteur d'observabilité, qui ne refuse jamais", async () => {
    const res = await getJackpotState({ campaignId: CAMPAIGN_ID });

    expect(etat.pressions).toBe(1);
    expect(res.state).toBe("ok");
  });
});

describe("getJackpotState — toute panne rend `unavailable`", () => {
  it("contexte refusé (module fermé, campagne inactive) : refus indistinct", async () => {
    etat.contexteOk = false;

    const res = await getJackpotState({ campaignId: CAMPAIGN_ID });

    expect(res).toEqual({ state: "unavailable", gauge: null });
    // Rien n'est mesuré sur une campagne qu'on ne sert pas.
    expect(etat.pressions).toBe(0);
  });

  it("identifiant invalide : refusé avant toute lecture", async () => {
    const res = await getJackpotState({ campaignId: "pas-un-uuid" });

    expect(res).toEqual({ state: "unavailable", gauge: null });
    expect(etat.pressions).toBe(0);
  });

  it("une exception en cours de lecture ne remonte JAMAIS", async () => {
    etat.drawMode = "date_draw";
    etat.lectureLeve = true;

    // Un écran de salle sonde en boucle : une exception y ferait un écran
    // blanc, là où `unavailable` dégrade proprement.
    const res = await getJackpotState({ campaignId: CAMPAIGN_ID });

    expect(res).toEqual({ state: "unavailable", gauge: null });
    expect(reportErrorMock).toHaveBeenCalledWith("jackpot.state", expect.any(Error));
  });
});
